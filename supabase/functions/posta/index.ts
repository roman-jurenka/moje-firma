import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import PostalMime from "npm:postal-mime@2.4.3";
import nodemailer from "npm:nodemailer@6.9.16";
import MailComposer from "npm:nodemailer@6.9.16/lib/mail-composer/index.js";
import { Imap, imapDatum } from "./imap.ts";

// posta — firemní schránka u WEDOSu v appce (modul Pošta).
// Volá ji přihlášený uživatel appky se záložkou Pošta nebo Faktury (JWT), akce (POST { akce, … }):
//   sync      { slozka?: "prijate"|"odeslane" } — stáhne nové zprávy (po dávkách, vrací { nove, zbyva })
//   odeslat   { komu, kopie?, skryta?, predmet, text, odpovedNaId?, prilohy?: [{cesta, nazev, typ}] }
//   precteno  { id, precteno } — příznak \Seen i na serveru
//   smazat    { id } — přesune zprávu na serveru do Koše a v appce ji skryje
// pg_cron každé 2 minuty (hlavička x-cron-secret = Vault hlaseni_cron_secret): stáhne doručenou
// poštu a na nové zprávy upozorní lidi z app_settings „posta“ → upozornit (oznámení + push).
// Nasazená s verify_jwt=false — přihlášení si ověřuje sama.
// IMAP přes vlastního klienta ./imap.ts (nativní TLS Deno) — imapflow v Edge Runtime zasekával stahování.
// Tajemství: SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, SMTP_FROM;
//   nepovinně IMAP_HOST (výchozí SMTP_HOST se „smtp“ → „imap“), IMAP_PORT (993), IMAP_USER / IMAP_PASS.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
const esc = (t: unknown) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const stejne = (a: string, b: string) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };

const DAVKA = 15;                     // zpráv na jedno volání (víc → limit výkonu funkce)
const PRVNI_SYNC_DNI = 60;            // při prvním stažení jen posledních 60 dní
const MAX_ZPRAVA = 8 * 1024 * 1024;   // větší zprávy jen s hlavičkou + odkaz na webmail
const MAX_PRILOHA = 15 * 1024 * 1024;
const MAX_HTML = 400_000;
const LIMIT_ZPRAVY_MS = 40_000;
const LIMIT_VOLANI_MS = 60_000;       // jedno volání skončí včas (limit 150 s i výkonu funkce)
const WEBMAIL = "https://webmail.wedos.net";

type Db = SupabaseClient;
type Nova = { id: number; od: string; predmet: string };

function nastaveni() {
  const smtpHost = Deno.env.get("SMTP_HOST") || "";
  return {
    imap: {
      host: Deno.env.get("IMAP_HOST") || smtpHost.replace("smtp", "imap"),
      port: Number(Deno.env.get("IMAP_PORT") || 993),
      user: Deno.env.get("IMAP_USER") || Deno.env.get("SMTP_USER") || "",
      pass: Deno.env.get("IMAP_PASS") || Deno.env.get("SMTP_PASS") || "",
    },
    smtp: {
      host: smtpHost, port: Number(Deno.env.get("SMTP_PORT") || 465),
      user: Deno.env.get("SMTP_USER") || "", pass: Deno.env.get("SMTP_PASS") || "",
      from: Deno.env.get("SMTP_FROM") || Deno.env.get("SMTP_USER") || "",
    },
  };
}

// Skutečné cesty složek (WEDOS: INBOX, Sent/Odeslané, Trash/Koš…) podle special-use nebo názvu.
async function slozky(k: Imap) {
  const list = await k.slozky();
  const najdi = (use: string, jmena: string[]) =>
    list.find((m) => m.atributy.some((a) => a.toLowerCase() === use.toLowerCase()))?.jmeno
    || list.find((m) => jmena.includes(m.jmeno.toLowerCase()) || jmena.includes(m.jmeno.toLowerCase().split(/[./]/).pop() || ""))?.jmeno;
  return {
    prijate: "INBOX",
    odeslane: najdi("\\Sent", ["sent", "sent items", "sent messages", "odeslané", "odeslana posta"]) || "Sent",
    kos: najdi("\\Trash", ["trash", "deleted items", "koš", "kos"]) || "Trash",
  };
}

const adresy = (a: unknown) => (Array.isArray(a) ? a : a ? [a] : [])
  .flatMap((x: any) => (x?.group ? x.group : [x]))
  .filter((x: any) => x?.address)
  .map((x: any) => ({ email: String(x.address).toLowerCase(), jmeno: x.name || "" }));

const bezpecneJmeno = (s: string) => (s || "priloha").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-120);

async function sync(db: Db, k: Imap, schranka: string, slozka: "prijate" | "odeslane", imapSlozka: string, start: number) {
  const noveZpravy: Nova[] = [];
  const { validity, exists } = await k.vybrat(imapSlozka, slozka === "odeslane");
  const { data: stav } = await db.from("posta_stav").select("*").eq("schranka", schranka).eq("imap_slozka", imapSlozka).maybeSingle();
  let posledni = Number(stav?.posledni_uid || 0);
  if (stav && Number(stav.uid_validity) !== validity) posledni = 0; // server složku přečísloval → stáhnout znovu
  // Upozorňovat jen na zprávy, které přišly po dokončení prvotního stažení (příznak v posta_stav).
  const upozornovat = slozka === "prijate" && !!stav?.synchronizovano_at && posledni > 0 && Number(stav.uid_validity) === validity;
  const ulozStav = async (hotovo: boolean) => {
    const { error } = await db.from("posta_stav").upsert({
      schranka, imap_slozka: imapSlozka, uid_validity: validity, posledni_uid: posledni, chyba: null,
      // synchronizovano_at = prvotní stažení je dokončené (do té doby se neupozorňuje)
      synchronizovano_at: hotovo || stav?.synchronizovano_at ? new Date().toISOString() : null,
    }, { onConflict: "schranka,imap_slozka" });
    if (error) throw new Error("Uložení stavu: " + error.message);
  };

  if (!exists) { await ulozStav(true); return { nove: 0, zbyva: 0, noveZpravy }; }
  const kriterium = posledni > 0 ? `UID ${posledni + 1}:*` : `SINCE ${imapDatum(new Date(Date.now() - PRVNI_SYNC_DNI * 864e5))}`;
  const uids = (await k.hledat(kriterium)).filter((u) => u > posledni).sort((a, b) => a - b);
  const davka = uids.slice(0, DAVKA);
  let zpracovano = 0;

  for (const uid of davka) {
    if (Date.now() - start > LIMIT_VOLANI_MS) break;
    const info = await k.info(uid);
    zpracovano++;
    if (!info) { posledni = uid; continue; }
    let e: any = null;
    let poznamka = "";
    try {
      const velka = info.velikost > MAX_ZPRAVA;
      const zdroj = await k.zdroj(uid, velka, LIMIT_ZPRAVY_MS);
      if (zdroj) e = await PostalMime.parse(zdroj);
      if (velka) poznamka = `Zpráva je velká (${Math.round(info.velikost / 1048576)} MB) — celou ji otevřete ve webmailu WEDOS (${WEBMAIL}).`;
    } catch (chyba) {
      poznamka = `Zprávu se nepodařilo stáhnout (${String((chyba as Error)?.message || chyba).slice(0, 80)}) — otevřete ji ve webmailu WEDOS (${WEBMAIL}).`;
      if (/timeout|ukončeno/i.test(String((chyba as Error)?.message))) {
        // spojení je v nejistém stavu — zprávu přeskočit (uložit s poznámkou) a dávku ukončit
        await ulozZpravu();
        posledni = uid; await ulozStav(false);
        return { nove: zpracovano, zbyva: uids.length - zpracovano, noveZpravy, zaseknuto: true };
      }
    }
    await ulozZpravu();
    posledni = uid;
    await ulozStav(false);

    async function ulozZpravu() {
      const prilohy: { nazev: string; typ: string; velikost: number; cesta: string | null; cid: string | null }[] = [];
      if (!poznamka) {
        for (const [i, a] of (e?.attachments || []).entries()) {
          const obsah = a.content as ArrayBuffer;
          const velikost = obsah?.byteLength || 0;
          const nazev = a.filename || (a.mimeType?.startsWith("image/") ? `obrazek-${i + 1}.${a.mimeType.split("/")[1]}` : `priloha-${i + 1}`);
          let cesta: string | null = null;
          if (velikost && velikost <= MAX_PRILOHA) {
            cesta = `prijate/${validity}-${uid}/${i}-${bezpecneJmeno(nazev)}`;
            const { error } = await db.storage.from("posta").upload(cesta, new Uint8Array(obsah), { contentType: a.mimeType || "application/octet-stream", upsert: true });
            if (error) cesta = null;
          }
          prilohy.push({ nazev, typ: a.mimeType || "", velikost, cesta, cid: a.contentId ? String(a.contentId).replace(/^<|>$/g, "") : null });
        }
      }
      const od = adresy(e?.from)[0] || { email: "", jmeno: "" };
      const text = poznamka ? poznamka : (e?.text || "").slice(0, 200_000);
      const html = !poznamka && e?.html && e.html.length <= MAX_HTML ? e.html : null;
      const nahled = (text || (e?.html || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 200);
      const { data: zak } = od.email
        ? await db.from("customers").select("id").ilike("email", od.email.replace(/[%_\\]/g, "\\$&")).limit(1)
        : { data: null };
      const predmet = e?.subject || "";
      const { data: radek, error } = await db.from("posta_zpravy").upsert({
        schranka, slozka, imap_slozka: imapSlozka, uid, uid_validity: validity,
        message_id: e?.messageId || null, in_reply_to: e?.inReplyTo || null, reference: e?.references || null,
        od_email: od.email, od_jmeno: od.jmeno, komu: adresy(e?.to), kopie: adresy(e?.cc),
        predmet, datum: new Date(e?.date || info!.datum || Date.now()).toISOString(),
        text, html, nahled, prilohy,
        precteno: slozka === "odeslane" || info!.flags.has("\\Seen"), oznaceno: info!.flags.has("\\Flagged"),
        customer_id: zak?.[0]?.id ?? null,
      }, { onConflict: "schranka,imap_slozka,uid_validity,uid" }).select("id").single();
      if (error) throw new Error("Uložení zprávy: " + error.message);
      if (upozornovat && !info!.flags.has("\\Seen")) noveZpravy.push({ id: radek.id, od: od.jmeno || od.email, predmet });
    }
  }
  const zbyva = uids.length - zpracovano;
  if (!zbyva) await ulozStav(true);
  return { nove: zpracovano, zbyva, noveZpravy, zaseknuto: false };
}

// Upozornění (oznámení v appce → push na telefon) jen lidem z app_settings „posta“ → upozornit.
async function upozornit(db: Db, nove: Nova[]) {
  if (!nove.length) return;
  const { data: nast } = await db.from("app_settings").select("value").eq("key", "posta").maybeSingle();
  const komu: string[] = Array.isArray(nast?.value?.upozornit) ? nast.value.upozornit : [];
  if (!komu.length) return;
  const radky = nove.length > 3
    ? komu.map((u) => ({ user_name: u, title: `📧 ${nove.length} nových e-mailů`, message: nove.slice(0, 3).map((n) => `${n.od}: ${n.predmet || "(bez předmětu)"}`).join(" · ") + " …", link_type: "posta", link_id: null }))
    : komu.flatMap((u) => nove.map((n) => ({ user_name: u, title: `📧 ${n.od}`, message: n.predmet || "(bez předmětu)", link_type: "posta", link_id: n.id })));
  await db.from("notifications").insert(radky);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const start = Date.now();
  const url = Deno.env.get("SUPABASE_URL")!;
  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const cronTajemstvi = req.headers.get("x-cron-secret");
  let jeCron = false;
  if (cronTajemstvi) {
    const { data: spravne } = await db.rpc("hlaseni_cron_tajemstvi");
    if (!spravne || !stejne(cronTajemstvi, String(spravne))) return json({ error: "unauthorized" }, 401);
    jeCron = true;
  } else {
    const auth = req.headers.get("Authorization") || "";
    const uzivatel = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u } = await uzivatel.auth.getUser();
    if (!u?.user) return json({ error: "unauthorized" }, 401);
    const { data: smi } = await uzivatel.rpc("app_ma", { p_tabs: ["posta", "invoices"] });
    if (!smi) return json({ error: "forbidden" }, 403);
  }
  const cfg = nastaveni();
  if (!cfg.imap.host || !cfg.imap.user || !cfg.imap.pass) return json({ error: "not_configured", detail: "Chybí nastavení schránky (SMTP_HOST / SMTP_USER / SMTP_PASS, případně IMAP_*)." }, 500);
  const schranka = cfg.imap.user.toLowerCase();

  let body: any = {};
  try { body = await req.json(); } catch { /* prázdné tělo */ }
  const akce = jeCron ? "cron" : body?.akce;

  let k: Imap | null = null;
  try {
    k = await Imap.pripojit(cfg.imap.host, cfg.imap.port, cfg.imap.user, cfg.imap.pass);
    const cesty = await slozky(k);

    if (akce === "cron") {
      let nove = 0, zbyva = 0;
      for (let i = 0; i < 2 && Date.now() - start < LIMIT_VOLANI_MS; i++) {
        const r = await sync(db, k, schranka, "prijate", cesty.prijate, start);
        nove += r.nove; zbyva = r.zbyva;
        await upozornit(db, r.noveZpravy);
        if (!r.zbyva || r.zaseknuto) break;
      }
      if (!zbyva && Date.now() - start < LIMIT_VOLANI_MS / 2) await sync(db, k, schranka, "odeslane", cesty.odeslane, start).catch(() => {});
      return json({ ok: true, nove, zbyva });
    }

    if (akce === "sync") {
      const slozka = body.slozka === "odeslane" ? "odeslane" : "prijate";
      const r = await sync(db, k, schranka, slozka, cesty[slozka], start);
      await upozornit(db, r.noveZpravy);
      return json({ ok: true, schranka, nove: r.nove, zbyva: r.zbyva });
    }

    if (akce === "precteno" || akce === "smazat") {
      const { data: z } = await db.from("posta_zpravy").select("id, imap_slozka, uid, uid_validity").eq("id", body.id).maybeSingle();
      if (!z) return json({ error: "not_found" }, 404);
      const { validity } = await k.vybrat(z.imap_slozka);
      const platne = validity === Number(z.uid_validity);
      if (akce === "precteno") {
        if (platne) await k.priznak(z.uid, "\\Seen", !!body.precteno);
        await db.from("posta_zpravy").update({ precteno: !!body.precteno }).eq("id", z.id);
      } else {
        if (platne) await k.presunout(z.uid, cesty.kos);
        await db.from("posta_zpravy").update({ smazano: true }).eq("id", z.id);
      }
      return json({ ok: true });
    }

    if (akce === "odeslat") {
      const komu = String(body.komu || "").trim();
      if (!komu) return json({ error: "bad_request", detail: "Chybí příjemce." }, 400);
      if (!cfg.smtp.host || !cfg.smtp.user || !cfg.smtp.pass) return json({ error: "not_configured", detail: "Chybí SMTP nastavení." }, 500);
      let puvodni: any = null;
      if (body.odpovedNaId) {
        const { data } = await db.from("posta_zpravy").select("message_id, reference").eq("id", body.odpovedNaId).maybeSingle();
        puvodni = data;
      }
      const attachments = [];
      for (const p of (Array.isArray(body.prilohy) ? body.prilohy : [])) {
        if (!p?.cesta || String(p.cesta).includes("..")) continue;
        const { data: blob, error } = await db.storage.from("posta").download(p.cesta);
        if (error || !blob) return json({ error: "attachment", detail: `Přílohu ${p.nazev || p.cesta} se nepodařilo načíst.` }, 400);
        attachments.push({ filename: p.nazev || p.cesta.split("/").pop(), content: new Uint8Array(await blob.arrayBuffer()), contentType: p.typ || undefined });
      }
      const text = String(body.text || "");
      const mail: Record<string, unknown> = {
        from: cfg.smtp.from, to: komu,
        cc: String(body.kopie || "").trim() || undefined,
        bcc: String(body.skryta || "").trim() || undefined,
        subject: String(body.predmet || ""),
        text,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px">${text.split("\n").map((r) => esc(r) || "&nbsp;").join("<br>")}</div>`,
        attachments,
      };
      if (puvodni?.message_id) {
        mail.inReplyTo = puvodni.message_id;
        mail.references = [puvodni.reference, puvodni.message_id].filter(Boolean).join(" ");
      }
      const raw: Uint8Array = await new Promise((ok, chyba) => new MailComposer(mail).compile().build((e: Error | null, m: Uint8Array) => (e ? chyba(e) : ok(m))));
      const t = nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.port === 465, auth: { user: cfg.smtp.user, pass: cfg.smtp.pass } });
      const prijemci = [komu, mail.cc, mail.bcc].filter(Boolean).join(",");
      await t.sendMail({ envelope: { from: cfg.smtp.user, to: prijemci }, raw });
      // kopie do Odeslaných na serveru (uvidí ji i webmail/Outlook) a hned stáhnout do appky
      let ulozeno = true;
      try {
        await k.pridat(cesty.odeslane, new Uint8Array(raw));
        await sync(db, k, schranka, "odeslane", cesty.odeslane, start);
      } catch { ulozeno = false; }
      if (body.odpovedNaId) await db.from("posta_zpravy").update({ precteno: true }).eq("id", body.odpovedNaId);
      return json({ ok: true, ulozenoDoOdeslanych: ulozeno });
    }

    return json({ error: "bad_request", detail: "Neznámá akce." }, 400);
  } catch (e) {
    const zprava = String((e as Error)?.message ?? e).slice(0, 300);
    await db.from("posta_stav").update({ chyba: zprava }).eq("schranka", schranka).eq("imap_slozka", "INBOX").then(() => {}, () => {});
    return json({ error: "failed", detail: zprava }, 502);
  } finally {
    if (k) await k.odhlasit();
  }
});
