import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// meta-leady
// Leady z facebookových reklam (Meta Lead Ads) → zákazník + poptávka v Průběhu
// + upozornění obchodníkovi.
//   GET                — ověření webhooku od Meta (hub.challenge)
//   POST od Meta       — webhook „leadgen“ (podpis X-Hub-Signature-256)
//   POST { akce }      — z appky (přihlášený uživatel) nebo cron:
//     stav             — připojené stránky + app_id pro přihlášení
//     pripojit         — { code, redirect_uri } z přihlášení Facebookem → tokeny
//                        stránek, zapnutí webhooku (jen administrátor)
//     odpojit          — smaže tokeny (jen administrátor)
//     dotahnout        — { dni } dotáhne leady za posledních N dní (max 90)
//     tick             — cron každých 15 min: dotáhne leady, které webhook nedoručil
// Tajemství (Supabase → Edge Functions → Secrets), nastavuje majitel:
//   META_APP_SECRET (Meta for Developers → aplikace → Nastavení → Základní);
//   META_APP_ID volitelně, jinak se použije ID aplikace ProudOS Leady.
// Nasazuje se s verify_jwt = false (Meta i cron nemají JWT), ověřuje se tady.

const GRAPH = "https://graph.facebook.com/v23.0";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
// Aplikace „ProudOS Leady“ v Meta for Developers (ID je veřejné, tajemství jen v Secrets).
const APP_ID = Deno.env.get("META_APP_ID") || "1297552155884729";
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const WEBHOOK_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-leady`;

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function overit(req: Request): Promise<{ kdo: "cron" | "uzivatel"; jmeno?: string; admin?: boolean } | null> {
  const secret = req.headers.get("x-cron-secret");
  if (secret) {
    const { data } = await db.rpc("hlaseni_cron_tajemstvi");
    return data && safeEqual(secret, String(data)) ? { kdo: "cron" } : null;
  }
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { kdo: "uzivatel", jmeno: user.email ?? undefined, admin: p?.role === "admin" };
}

// Chyba z Graph API → srozumitelná věta
async function fb(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) {
    const e = d.error ?? {};
    const msg = e.code === 190 ? "Platnost připojení k Facebooku vypršela — připojte stránku znovu." : (e.error_user_msg || e.message || `Facebook vrátil chybu ${r.status}`);
    throw new Error(msg);
  }
  return d;
}
const post = (url: string, params: Record<string, string>) =>
  fb(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
const enc = encodeURIComponent;

async function hmacHex(secret: string, data: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Zpracování leadu ────────────────────────────────────────────────────────

const bezDiakritiky = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Odpovědi z výběru chodí jako „rodinny_dum“ → „rodinny dum“
const hodnota = (v: unknown) => String(Array.isArray(v) ? v.join(", ") : v ?? "").replace(/_/g, " ").trim();
const telKlic = (t?: string | null) => String(t ?? "").replace(/\D/g, "").slice(-9);

type Pole = { name: string; values: string[] };
function rozebrat(pole: Pole[]) {
  const r: Record<string, string> = {};
  let krestni = "", prijmeni = "";
  const ostatni: { otazka: string; odpoved: string }[] = [];
  for (const p of pole) {
    const n = bezDiakritiky(p.name || "");
    const v = hodnota(p.values);
    if (!v) continue;
    if (n === "first_name") krestni = v;
    else if (n === "last_name") prijmeni = v;
    else if (!r.jmeno && (n === "full_name" || n.includes("jmeno") || n === "name")) r.jmeno = v;
    else if (!r.email && n.includes("email")) r.email = v;
    else if (!r.telefon && (n.includes("phone") || n.includes("telefon"))) r.telefon = v;
    else if (!r.mesto && (n === "city" || n.includes("mesto") || n.includes("obec"))) r.mesto = v;
    else if (!r.spotreba && (n.includes("spotreb") || n.includes("consum") || n.includes("kwh") || n.includes("mwh"))) r.spotreba = v;
    else if (!r.objekt && (n.includes("objekt") || n.includes("budov") || n.includes("nemovit") || n.includes("dum"))) r.objekt = v;
    else ostatni.push({ otazka: p.name.replace(/_/g, " ").replace(/\?$/, ""), odpoved: v });
  }
  if (!r.jmeno && (krestni || prijmeni)) r.jmeno = `${krestni} ${prijmeni}`.trim();
  return { ...r, ostatni };
}

const zitra = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Prague" }));
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("sv-SE");
};

async function nastaveni() {
  const { data } = await db.from("app_settings").select("value").eq("key", "meta_leady").maybeSingle();
  const v = (data?.value ?? {}) as Record<string, string>;
  return { obchodnik: v.obchodnik || "Roman Jurenka", typ: v.typ || "FVE" };
}

// Lead z Graph API → řádek meta_leady → zákazník, poptávka, poznámka, upozornění.
// Každý lead jen jednou (leadgen_id je unikátní).
async function zpracovat(lead: Record<string, unknown>, pageId: string, formNazev?: string) {
  const leadgenId = String(lead.id);
  const pole = (lead.field_data ?? []) as Pole[];
  const r = rozebrat(pole);
  const { data: radek, error: eIns } = await db.from("meta_leady").insert({
    leadgen_id: leadgenId, page_id: pageId, form_id: lead.form_id ? String(lead.form_id) : null, formular: formNazev ?? null,
    reklama: (lead.ad_name as string) ?? null, kampan: (lead.campaign_name as string) ?? null,
    vyplneno: lead.created_time ? new Date(String(lead.created_time)).toISOString() : null,
    jmeno: r.jmeno ?? null, email: r.email ?? null, telefon: r.telefon ?? null, mesto: r.mesto ?? null,
    spotreba: r.spotreba ?? null, objekt: r.objekt ?? null, pole,
  }).select().maybeSingle();
  if (eIns) {
    if (eIns.code === "23505") return null; // už zpracovaný
    throw new Error(eIns.message);
  }
  try {
    const { obchodnik, typ } = await nastaveni();
    const jmeno = r.jmeno || r.email || r.telefon || "Lead z Facebooku";

    // Zákazník: stávající podle telefonu nebo e-mailu, jinak nový
    const { data: zak } = await db.from("customers").select("id, name, phone, email").or("archived.is.null,archived.eq.false");
    const tk = telKlic(r.telefon);
    const em = (r.email || "").toLowerCase();
    const existujici = (zak ?? []).find((c) => (tk.length === 9 && telKlic(c.phone) === tk) || (em && String(c.email || "").toLowerCase() === em));
    let customerId = existujici?.id ?? null;
    if (!customerId) {
      const firma = r.objekt && /firm|provoz|hal|kancel|komer|sklad|vyrob/i.test(bezDiakritiky(r.objekt));
      const { data: c, error } = await db.from("customers").insert({
        name: jmeno, phone: r.telefon || null, email: r.email || null, address: r.mesto || "", tag: "Nový",
        customer_type: firma ? "Firma" : "Koncový zákazník",
      }).select("id").single();
      if (error) throw new Error("Zákazník: " + error.message);
      customerId = c.id;
    }

    const nazev = `${jmeno}${r.mesto ? ` (${r.mesto})` : ""} · ${typ}`;
    const { data: deal, error: eDeal } = await db.from("deals").insert({
      name: nazev, stage: "Nový", customer_id: customerId, assigned_to: obchodnik, type: typ, site_address: r.mesto || null,
      site_contact_name: jmeno, site_contact_phone: r.telefon || null,
    }).select("id").single();
    if (eDeal) throw new Error("Obchodní případ: " + eDeal.message);

    const { data: pr, error: ePr } = await db.from("zakazky_prubeh").insert({
      nazev, customer_id: customerId, typ, deal_id: deal.id, faze: "poptavka", stav: "otevrena",
      zdroj: String(lead.platform || "").toLowerCase() === "ig" ? "instagram" : "facebook", kampan: (lead.campaign_name as string) || formNazev || null,
      vlastnik_obchod: obchodnik, dalsi_krok: "Zavolat zákazníkovi (lead z Facebooku)", dalsi_krok_kdo: obchodnik, dalsi_krok_termin: zitra(),
      misto_adresa: r.mesto || null, misto_kontakt: jmeno, misto_telefon: r.telefon || null,
    }).select("id").single();
    if (ePr) throw new Error("Poptávka: " + ePr.message);

    const radky = [
      `Lead z Facebooku${lead.campaign_name ? ` — kampaň „${lead.campaign_name}“` : ""}${lead.ad_name ? `, reklama „${lead.ad_name}“` : ""}${formNazev ? `, formulář „${formNazev}“` : ""}.`,
      r.telefon ? `Telefon: ${r.telefon}` : "", r.email ? `E-mail: ${r.email}` : "", r.mesto ? `Město: ${r.mesto}` : "",
      r.spotreba ? `Roční spotřeba: ${r.spotreba}` : "", r.objekt ? `Objekt: ${r.objekt}` : "",
      ...r.ostatni.map((o) => `${o.otazka}: ${o.odpoved}`),
      existujici ? `Zákazník už v appce byl (${existujici.name}) — připojeno k němu.` : "",
    ].filter(Boolean);
    await db.from("zakazky_poznamky").insert({ prubeh_id: pr.id, kdo: "Facebook", system: true, text: radky.join("\n") });

    await db.from("notifications").insert({
      user_name: obchodnik, title: "📣 Nový lead z Facebooku",
      message: [jmeno, r.mesto, r.objekt, r.spotreba ? `spotřeba ${r.spotreba}` : "", r.telefon ? `tel. ${r.telefon}` : ""].filter(Boolean).join(" · "),
      link_type: "prubeh", link_id: pr.id,
    });
    await db.from("meta_leady").update({ customer_id: customerId, prubeh_id: pr.id, chyba: null }).eq("id", radek!.id);
    return pr.id;
  } catch (e) {
    await db.from("meta_leady").update({ chyba: String((e as Error).message || e) }).eq("id", radek!.id);
    throw e;
  }
}

const POLE_LEADU = "id,created_time,field_data,ad_id,ad_name,campaign_name,form_id,platform";
const POLE_ZAKLAD = "id,created_time,field_data,ad_id,form_id";
// Název reklamy a kampaně Meta vrací jen s oprávněním k reklamám — bez něj stačí základ.
async function nacistLead(cesta: string, token: string, extra = "") {
  try {
    return await fb(`${GRAPH}/${cesta}?fields=${POLE_LEADU}${extra}&access_token=${enc(token)}`);
  } catch {
    return await fb(`${GRAPH}/${cesta}?fields=${POLE_ZAKLAD}${extra}&access_token=${enc(token)}`);
  }
}

async function stranka(pageId: string) {
  const { data } = await db.from("meta_stranky").select("*").eq("page_id", pageId).maybeSingle();
  return data;
}

// Webhook: { entry: [{ id: page_id, changes: [{ field: "leadgen", value: { leadgen_id, page_id, form_id } }] }] }
async function webhook(telo: Record<string, unknown>) {
  const vysledky: string[] = [];
  for (const entry of (telo.entry ?? []) as Record<string, unknown>[]) {
    for (const ch of (entry.changes ?? []) as Record<string, unknown>[]) {
      if (ch.field !== "leadgen") continue;
      const v = ch.value as Record<string, string>;
      const s = await stranka(String(v.page_id ?? entry.id));
      if (!s) { vysledky.push(`stránka ${v.page_id} není připojená`); continue; }
      try {
        const lead = await nacistLead(String(v.leadgen_id), s.page_token);
        const formular = v.form_id ? await fb(`${GRAPH}/${v.form_id}?fields=name&access_token=${enc(s.page_token)}`).then((f) => f.name).catch(() => undefined) : undefined;
        await zpracovat(lead, s.page_id, formular);
        vysledky.push(`lead ${v.leadgen_id} ok`);
      } catch (e) {
        vysledky.push(`lead ${v.leadgen_id}: ${(e as Error).message}`);
      }
    }
  }
  return vysledky;
}

// Dotažení leadů ze všech formulářů stránky od daného času (pojistka k webhooku)
async function dotahnoutStranku(s: Record<string, string>, od: Date) {
  let novych = 0;
  const chyby: string[] = [];
  const formulare: { id: string; name: string }[] = [];
  let url: string | null = `${GRAPH}/${s.page_id}/leadgen_forms?fields=id,name&limit=100&access_token=${enc(s.page_token)}`;
  while (url) {
    const d = await fb(url);
    formulare.push(...(d.data ?? []));
    url = d.paging?.next ?? null;
  }
  const filtr = enc(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(od.getTime() / 1000) }]));
  for (const f of formulare) {
    let dalsi: string | null = null;
    let prvni = true;
    while (prvni || dalsi) {
      const d = prvni ? await nacistLead(`${f.id}/leads`, s.page_token, `&limit=100&filtering=${filtr}`) : await fb(dalsi!);
      prvni = false;
      for (const lead of d.data ?? []) {
        try { if (await zpracovat({ ...lead, form_id: lead.form_id ?? f.id }, s.page_id, f.name)) novych++; }
        catch (e) { chyby.push((e as Error).message); }
      }
      dalsi = d.paging?.next ?? null;
    }
  }
  return { novych, chyby };
}

async function dotahnout(od: Date | null) {
  const { data: stranky } = await db.from("meta_stranky").select("*");
  let novych = 0;
  const chyby: string[] = [];
  for (const s of stranky ?? []) {
    const zacatek = od ?? new Date(Math.min(Date.now() - 3 * 3600000, new Date(s.posledni_sync ?? Date.now()).getTime() - 3600000));
    const zacatekSync = new Date();
    try {
      const r = await dotahnoutStranku(s, zacatek);
      novych += r.novych;
      chyby.push(...r.chyby);
      await db.from("meta_stranky").update({ posledni_sync: zacatekSync.toISOString() }).eq("page_id", s.page_id);
    } catch (e) {
      chyby.push(`${s.nazev}: ${(e as Error).message}`);
    }
  }
  return { novych, chyby };
}

// ─── Připojení ───────────────────────────────────────────────────────────────

async function pripojit(code: string, redirectUri: string, kdo?: string) {
  if (!APP_ID || !APP_SECRET) throw new Error("Chybí tajemství META_APP_SECRET v Supabase.");
  const kratky = await fb(`${GRAPH}/oauth/access_token?client_id=${enc(APP_ID)}&client_secret=${enc(APP_SECRET)}&redirect_uri=${enc(redirectUri)}&code=${enc(code)}`);
  const dlouhy = await fb(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${enc(APP_ID)}&client_secret=${enc(APP_SECRET)}&fb_exchange_token=${enc(kratky.access_token)}`);
  // Tokeny stránek z dlouhodobého tokenu uživatele nevyprší.
  const ucty = await fb(`${GRAPH}/me/accounts?fields=id,name,access_token&limit=100&access_token=${enc(dlouhy.access_token)}`);
  const stranky = (ucty.data ?? []) as { id: string; name: string; access_token: string }[];
  if (!stranky.length) throw new Error("Účet nespravuje žádnou facebookovou stránku (nebo jste při přihlášení žádnou nevybrali).");

  const { data: u } = await db.from("meta_ucet").select("verify_token").eq("id", 1).maybeSingle();
  const verify = u?.verify_token ?? crypto.randomUUID();
  await db.from("meta_ucet").upsert({ id: 1, user_token: dlouhy.access_token, verify_token: verify, pripojil: kdo ?? null, updated_at: new Date().toISOString() });

  // Webhook aplikace pro stránky (pole leadgen) — Meta si adresu ověří GETem.
  await post(`${GRAPH}/${APP_ID}/subscriptions`, {
    object: "page", callback_url: WEBHOOK_URL, fields: "leadgen", verify_token: verify, include_values: "true",
    access_token: `${APP_ID}|${APP_SECRET}`,
  });

  const ted = new Date().toISOString();
  const vysledek: { nazev: string; odebira: boolean; chyba?: string }[] = [];
  for (const s of stranky) {
    let odebira = false, chyba: string | undefined;
    try {
      await post(`${GRAPH}/${s.id}/subscribed_apps`, { subscribed_fields: "leadgen", access_token: s.access_token });
      odebira = true;
    } catch (e) { chyba = (e as Error).message; }
    const puv = await stranka(s.id);
    await db.from("meta_stranky").upsert({ page_id: s.id, nazev: s.name, page_token: s.access_token, odebira, posledni_sync: puv?.posledni_sync ?? ted, updated_at: ted });
    vysledek.push({ nazev: s.name, odebira, chyba });
  }
  return { stranky: vysledek };
}

async function odpojit() {
  const { data: stranky } = await db.from("meta_stranky").select("page_id, page_token");
  for (const s of stranky ?? []) {
    await fb(`${GRAPH}/${s.page_id}/subscribed_apps?access_token=${enc(s.page_token)}`, { method: "DELETE" }).catch(() => null);
  }
  await db.from("meta_stranky").delete().neq("page_id", "");
  await db.from("meta_ucet").update({ user_token: null, updated_at: new Date().toISOString() }).eq("id", 1);
}

// ─── Vstup ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Ověření webhooku od Meta
  if (req.method === "GET") {
    const q = new URL(req.url).searchParams;
    const { data: u } = await db.from("meta_ucet").select("verify_token").eq("id", 1).maybeSingle();
    if (q.get("hub.mode") === "subscribe" && u?.verify_token && safeEqual(q.get("hub.verify_token") ?? "", u.verify_token)) {
      return new Response(q.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return json({ error: "Metoda není povolená." }, 405);

  // Webhook od Meta (podepsaný tajemstvím aplikace)
  const podpis = req.headers.get("x-hub-signature-256");
  if (podpis) {
    const raw = new Uint8Array(await req.arrayBuffer());
    if (!APP_SECRET || !safeEqual(podpis, "sha256=" + await hmacHex(APP_SECRET, raw))) return new Response("bad signature", { status: 401 });
    const telo = JSON.parse(new TextDecoder().decode(raw));
    const vysledky = await webhook(telo).catch((e) => [String(e?.message || e)]);
    console.log("meta-leady webhook:", vysledky.join("; "));
    return new Response("ok", { status: 200 }); // Meta jinak posílá znovu; chybějící dotáhne tick
  }

  const kdo = await overit(req);
  if (!kdo) return json({ error: "Nepřihlášený požadavek." }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    switch (body.akce) {
      case "stav": {
        const [{ data: u }, { data: stranky }] = await Promise.all([
          db.from("meta_ucet").select("user_token, pripojil, updated_at").eq("id", 1).maybeSingle(),
          db.from("meta_stranky").select("page_id, nazev, odebira, posledni_sync").order("nazev"),
        ]);
        return json({
          nastaveno: !!(APP_ID && APP_SECRET), app_id: APP_ID || null, pripojeno: !!(u?.user_token && stranky?.length),
          pripojil: u?.pripojil ?? null, stranky: stranky ?? [], nastaveni: await nastaveni(),
        });
      }
      case "pripojit":
        if (!kdo.admin) return json({ error: "Facebook může připojit jen administrátor." }, 403);
        if (!body.code || !body.redirect_uri) return json({ error: "Chybí kód z přihlášení." }, 400);
        return json(await pripojit(String(body.code), String(body.redirect_uri), kdo.jmeno));
      case "odpojit":
        if (!kdo.admin) return json({ error: "Facebook může odpojit jen administrátor." }, 403);
        await odpojit();
        return json({ ok: true });
      case "dotahnout": {
        const dni = Math.min(90, Math.max(1, Number(body.dni) || 7));
        return json(await dotahnout(new Date(Date.now() - dni * 86400000)));
      }
      case "tick":
        return json(await dotahnout(null));
      default:
        return json({ error: "Neznámá akce." }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
