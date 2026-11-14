import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// instagram
// Přímé propojení firemního Instagramu (Instagram API s přihlášením přes
// Instagram, oprávnění instagram_business_basic + instagram_business_content_publish).
// Akce (POST { akce, ... }):
//   stav        — připojený účet (bez tokenu) + app_id pro přihlášení
//   pripojit    — { code, redirect_uri } z přihlášení → dlouhodobý token do instagram_ucet
//   odpojit     — smaže uložený token
//   zverejnit   — { id } instagram_prispevky → hned zveřejní
//   statistiky  — obnoví lajky / komentáře / dosah zveřejněných příspěvků
//   tick        — pg_cron každých 10 min: autopilot (příspěvky s automaticky = true,
//                 kterým nastal termín v českém čase), obnova tokenu, statistiky
// Volá přihlášený uživatel appky, tick cron s hlavičkou x-cron-secret.
// Tajemství (Supabase → Edge Functions → Secrets), nastavuje majitel:
//   INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET (Meta for Developers → aplikace →
//   Instagram → API setup with Instagram login).
// Nasazuje se s verify_jwt = false (cron nemá JWT), ověřuje se tady.

const GRAPH = "https://graph.instagram.com/v23.0";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const APP_ID = Deno.env.get("INSTAGRAM_APP_ID") ?? "";
const APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET") ?? "";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function overit(req: Request): Promise<{ kdo: "cron" | "uzivatel"; jmeno?: string } | null> {
  const secret = req.headers.get("x-cron-secret");
  if (secret) {
    const { data } = await db.rpc("hlaseni_cron_tajemstvi");
    return data && safeEqual(secret, String(data)) ? { kdo: "cron" } : null;
  }
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user } } = await db.auth.getUser(token);
  return user ? { kdo: "uzivatel", jmeno: user.email ?? undefined } : null;
}

// Chyba z Graph API → srozumitelná věta (Meta vrací { error: { message, code } })
async function ig(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) {
    const e = d.error ?? {};
    const msg = e.code === 190 ? "Platnost připojení k Instagramu vypršela — připojte účet znovu." : (e.error_user_msg || e.message || `Instagram vrátil chybu ${r.status}`);
    throw new Error(msg);
  }
  return d;
}
const post = (url: string, params: Record<string, string>) =>
  ig(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });

async function ucet() {
  const { data } = await db.from("instagram_ucet").select("*").eq("id", 1).maybeSingle();
  return data;
}

// ─── Připojení ───────────────────────────────────────────────────────────────

async function pripojit(code: string, redirectUri: string, kdo?: string) {
  if (!APP_ID || !APP_SECRET) throw new Error("Chybí tajemství INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET v Supabase.");
  const kratky = await post("https://api.instagram.com/oauth/access_token", {
    client_id: APP_ID, client_secret: APP_SECRET, grant_type: "authorization_code", redirect_uri: redirectUri, code: code.replace(/#_$/, ""),
  });
  const dlouhy = await ig(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(APP_SECRET)}&access_token=${encodeURIComponent(kratky.access_token)}`);
  const ja = await ig(`${GRAPH}/me?fields=user_id,username&access_token=${encodeURIComponent(dlouhy.access_token)}`);
  const radek = {
    id: 1, ig_user_id: String(ja.user_id ?? kratky.user_id), username: ja.username ?? null, access_token: dlouhy.access_token,
    token_expires_at: new Date(Date.now() + Number(dlouhy.expires_in || 5184000) * 1000).toISOString(), pripojil: kdo ?? null, updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("instagram_ucet").upsert(radek);
  if (error) throw new Error(error.message);
  return { username: radek.username };
}

// Dlouhodobý token platí 60 dní; obnoví se, když zbývá méně než 10 dní.
async function obnovitToken(u: Record<string, string>) {
  const zbyva = new Date(u.token_expires_at).getTime() - Date.now();
  if (zbyva > 10 * 86400000) return;
  const d = await ig(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(u.access_token)}`);
  await db.from("instagram_ucet").update({
    access_token: d.access_token, token_expires_at: new Date(Date.now() + Number(d.expires_in || 5184000) * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", 1);
}

// ─── Zveřejnění ──────────────────────────────────────────────────────────────

async function pockat(kontejner: string, token: string) {
  for (let i = 0; i < 15; i++) {
    const s = await ig(`${GRAPH}/${kontejner}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("Instagram fotku nepřijal (zkontrolujte formát a velikost).");
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Instagram fotky nezpracoval včas, zkuste to za chvíli znovu.");
}

async function zverejnit(id: number) {
  const u = await ucet();
  if (!u) throw new Error("Instagram není připojený.");
  // zámek proti dvojímu zveřejnění (tlačítko + autopilot současně)
  const { data: p } = await db.from("instagram_prispevky").update({ stav: "odesilani", chyba: null })
    .eq("id", id).eq("stav", "planovano").select().maybeSingle();
  if (!p) throw new Error("Příspěvek už je zveřejněný nebo se právě odesílá.");
  try {
    const soubory: string[] = p.soubory ?? [];
    if (!soubory.length) throw new Error("Příspěvek nemá připravené fotky.");
    if (soubory.length > 10) throw new Error("Instagram bere max. 10 fotek v karuselu.");
    const { data: podepsane, error } = await db.storage.from("instagram").createSignedUrls(soubory, 3600);
    if (error || !podepsane?.length) throw new Error("Fotky se nepodařilo načíst z úložiště.");
    const urls = podepsane.map((x) => x.signedUrl).filter(Boolean) as string[];
    const t = u.access_token;
    const caption = [p.popisek, p.hashtagy].filter(Boolean).join("\n\n").slice(0, 2200);
    let kontejner: string;
    if (urls.length === 1) {
      kontejner = (await post(`${GRAPH}/${u.ig_user_id}/media`, { image_url: urls[0], caption, access_token: t })).id;
    } else {
      const deti: string[] = [];
      for (const url of urls) {
        const c = (await post(`${GRAPH}/${u.ig_user_id}/media`, { image_url: url, is_carousel_item: "true", access_token: t })).id;
        await pockat(c, t);
        deti.push(c);
      }
      kontejner = (await post(`${GRAPH}/${u.ig_user_id}/media`, { media_type: "CAROUSEL", children: deti.join(","), caption, access_token: t })).id;
    }
    await pockat(kontejner, t);
    const media = await post(`${GRAPH}/${u.ig_user_id}/media_publish`, { creation_id: kontejner, access_token: t });
    const detail = await ig(`${GRAPH}/${media.id}?fields=permalink&access_token=${encodeURIComponent(t)}`).catch(() => ({}));
    const hotovo = { stav: "zverejneno", automaticky: false, ig_media_id: media.id, ig_permalink: detail.permalink ?? null, zverejneno_at: new Date().toISOString(), chyba: null };
    await db.from("instagram_prispevky").update(hotovo).eq("id", id);
    return hotovo;
  } catch (e) {
    const chyba = (e as Error).message;
    await db.from("instagram_prispevky").update({ stav: "planovano", chyba }).eq("id", id);
    throw e;
  }
}

// ─── Statistiky ──────────────────────────────────────────────────────────────

async function statistiky(jenStare: boolean) {
  const u = await ucet();
  if (!u) return 0;
  const od = new Date(Date.now() - 60 * 86400000).toISOString();
  let q = db.from("instagram_prispevky").select("id, ig_media_id, statistiky_at").not("ig_media_id", "is", null).gte("zverejneno_at", od);
  if (jenStare) q = q.or(`statistiky_at.is.null,statistiky_at.lt.${new Date(Date.now() - 6 * 3600000).toISOString()}`);
  const { data } = await q.limit(30);
  let n = 0;
  for (const p of data ?? []) {
    try {
      const t = encodeURIComponent(u.access_token);
      const m = await ig(`${GRAPH}/${p.ig_media_id}?fields=like_count,comments_count&access_token=${t}`);
      const ins = await ig(`${GRAPH}/${p.ig_media_id}/insights?metric=reach&access_token=${t}`).catch(() => null);
      const dosah = ins?.data?.find((x: { name: string }) => x.name === "reach")?.values?.[0]?.value ?? null;
      await db.from("instagram_prispevky").update({ lajky: m.like_count ?? null, komentare: m.comments_count ?? null, dosah, statistiky_at: new Date().toISOString() }).eq("id", p.id);
      n++;
    } catch { /* smazaný příspěvek apod. — přeskočit */ }
  }
  return n;
}

// ─── Autopilot ───────────────────────────────────────────────────────────────

const tedPraha = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

async function tick() {
  const u = await ucet();
  if (!u) return { pripojeno: false };
  try { await obnovitToken(u); } catch (e) { console.error("obnova tokenu:", (e as Error).message); }
  const ted = tedPraha(); // „2026-11-01 18:30“
  const { data } = await db.from("instagram_prispevky").select("id, datum, cas").eq("stav", "planovano").eq("automaticky", true)
    .is("chyba", null).lte("datum", ted.slice(0, 10)).order("datum").limit(5);
  const vysledky = [];
  for (const p of data ?? []) {
    if (`${p.datum} ${p.cas || "00:00"}` > ted) continue;
    try { await zverejnit(p.id); vysledky.push({ id: p.id, ok: true }); }
    catch (e) { vysledky.push({ id: p.id, ok: false, chyba: (e as Error).message }); }
  }
  const stat = await statistiky(true);
  return { pripojeno: true, zverejneno: vysledky, statistiky: stat };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const kdo = await overit(req);
  if (!kdo) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  try {
    if (kdo.kdo === "cron") return json(await tick());
    switch (body.akce) {
      case "stav": {
        const u = await ucet();
        return json({ nastaveno: !!(APP_ID && APP_SECRET), app_id: APP_ID || null, pripojeno: !!u, username: u?.username ?? null, token_expires_at: u?.token_expires_at ?? null });
      }
      case "pripojit":
        if (!body.code || !body.redirect_uri) return json({ error: "Chybí kód z přihlášení." }, 400);
        return json(await pripojit(String(body.code), String(body.redirect_uri), kdo.jmeno));
      case "odpojit":
        await db.from("instagram_ucet").delete().eq("id", 1);
        return json({ ok: true });
      case "zverejnit":
        return json(await zverejnit(Number(body.id)));
      case "statistiky":
        return json({ obnoveno: await statistiky(false) });
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
