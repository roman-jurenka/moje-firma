import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { ImapFlow } from "npm:imapflow@1.0.171";
import PostalMime from "npm:postal-mime@2.4.3";
import nodemailer from "npm:nodemailer@6.9.16";
import MailComposer from "npm:nodemailer@6.9.16/lib/mail-composer/index.js";

// posta
// Firemní schránka u WEDOSu v appce (modul Pošta). Volá ji přihlášený uživatel
// appky, který má záložku Pošta nebo Faktury. Akce (POST JSON { akce, … }):
//   sync      { slozka?: "prijate"|"odeslane" } — stáhne nové zprávy přes IMAP
//             (po dávkách, vrací { nove, zbyva }; appka volá znovu, dokud zbyva > 0)
//   odeslat   { komu, kopie?, skryta?, predmet, text, odpovedNaId?, prilohy?: [{cesta, nazev, typ}] }
//             — pošle přes SMTP a uloží kopii do Odeslaných na serveru
//   precteno  { id, precteno } — nastaví/zruší příznak \Seen i na serveru
//   smazat    { id } — přesune zprávu na serveru do Koše a v appce ji skryje
//   (pg_cron každé 2 min s hlavičkou x-cron-secret: stáhne doručenou poštu a upozorní — app_settings „posta“)
// Tajemství (Supabase → Edge Functions → Secrets), nastavuje majitel:
//   SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, SMTP_FROM — už existují (servisní zprávy)
//   IMAP_HOST (výchozí: SMTP_HOST s „smtp“ → „imap“, tj. wes1-imap.wedos.net), IMAP_PORT (993)
//   IMAP_USER / IMAP_PASS — nepovinné, výchozí jsou SMTP_USER / SMTP_PASS

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
const esc = (t: unknown) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const DAVKA = 25;                 // zpráv na jedno volání (limit času edge funkce)
const stejne = (a: string, b: string) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
const PRVNI_SYNC_DNI = 60;        // při prvním stažení jen posledních 60 dní
const MAX_PRILOHA = 15 * 1024 * 1024;
const MAX_HTML = 400_000;

type Db = SupabaseClient;

function nastaveni() {
  const smtpHost = Deno.env.get("SMTP_HOST") || "";
  const user = Deno.env.get("IMAP_USER") || Deno.env.get("SMTP_USER") || "";
  const pass = Deno.env.get("IMAP_PASS") || Deno.env.get("SMTP_PASS") || "";
  const imapHost = Deno.env.get("IMAP_HOST") || smtpHost.replace("smtp", "imap");
  return {
    imap: { host: imapHost, port: Number(Deno.env.get("IMAP_PORT") || 993), user, pass },
    smtp: {
      host: smtpHost, port: Number(Deno.env.get("SMTP_PORT") || 465),
      user: Deno.env.get("SMTP_USER") || "", pass: Deno.env.get("SMTP_PASS") || "",
      from: Deno.env.get("SMTP_FROM") || Deno.env.get("SMTP_USER") || "",
    },
  };
}

async function pripojit(imap: ReturnType<typeof nastaveni>["imap"]) {
  const client = new ImapFlow({ host: imap.host, port: imap.port, secure: true, auth: { user: imap.user, pass: imap.pass }, logger: false });
  await client.connect();
  return client;
}

// Najde skutečné cesty složek (WEDOS: INBOX, Sent/Odeslané, Trash/Koš…) podle special-use.
async function slozky(client: ImapFlow) {
  const list = await client.list();
  const najdi = (use: string, jmena: string[]) =>
    list.find((m) => m.specialUse === use)?.path
    || list.find((m) => jmena.includes(m.path.toLowerCase()) || jmena.includes(m.name.toLowerCase()))?.path;
  return {
    prijate: "INBOX",
    odeslane: najdi("\\Sent", ["sent", "sent items", "sent messages", "odeslané", "odeslana posta", "inbox.sent"]) || "Sent",
    kos: najdi("\\Trash", ["trash", "deleted items", "koš", "kos", "inbox.trash"]) || "Trash",
  };
}

const adresy = (a: unknown) => (Array.isArray(a) ? a : a ? [a] : [])
  .flatMap((x: any) => (x?.group ? x.group : [x]))
  .filter((x: any) => x?.address)
  .map((x: any) => ({ email: String(x.address).toLowerCase(), jmeno: x.name || "" }));

const bezpecneJmeno = (s: string) => (s || "priloha").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-120);

const MAX_ZPRAVA = 8 * 1024 * 1024;   // větší zprávy se nestahují celé (jen hlavička + odkaz na webmail)
const LIMIT_ZPRAVY_MS = 25_000;       // stažení jedné zprávy déle → uloží se jen hlavička
const LIMIT_VOLANI_MS = 90_000;       // jedno volání funkce skončí včas před limitem 150 s

const sCasem = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, chyba) => setTimeout(() => chyba(new Error("timeout")), ms))]);

type Nova = { id: number; od: string; predmet: string };

async function sync(db: Db, client: ImapFlow, schranka: string, slozka: "prijate" | "odeslane", imapSlozka: string, start = Date.now()) {
  const lock = await client.getMailboxLock(imapSlozka);
  const noveZpravy: Nova[] = [];
  let zaseknuto = false;
  try {
    const mb = client.mailbox as { uidValidity: bigint | number; exists: number };
    const validity = Number(mb.uidValidity);
    const { data: stav } = await db.from("posta_stav").select("*").eq("schranka", schranka).eq("imap_slozka", imapSlozka).maybeSingle();
    let posledni = Number(stav?.posledni_uid || 0);
    if (stav && Number(stav.uid_validity) !== validity) posledni = 0; // server složku přečísloval → stáhnout znovu
    // upozorňovat jen na opravdu nové zprávy, ne na prvotní stažení posledních 60 dní
    const upozornovat = slozka === "prijate" && posledni > 0;
    const ulozStav = async () => {
      const { error } = await db.from("posta_stav").upsert({ schranka, imap_slozka: imapSlozka, uid_validity: validity, posledni_uid: posledni, synchronizovano_at: new Date().toISOString(), chyba: null }, { onConflict: "schranka,imap_slozka" });
      if (error) throw new Error("Uložení stavu: " + error.message);
    };

    if (!mb.exists) { await ulozStav(); return { nove: 0, zbyva: 0, noveZpravy }; }
    const kriterium = posledni > 0 ? { uid: `${posledni + 1}:*` } : { since: new Date(Date.now() - PRVNI_SYNC_DNI * 864e5) };
    const uids = ((await client.search(kriterium, { uid: true })) || []).filter((u) => u > posledni).sort((a, b) => a - b);
    const davka = uids.slice(0, DAVKA);
    if (!davka.length) { await ulozStav(); return { nove: 0, zbyva: 0, noveZpravy }; }

    let zpracovano = 0;
    for (const uid of davka) {
      if (Date.now() - start > LIMIT_VOLANI_MS) break;
      // hlavička a velikost po jedné zprávě (hromadný fetch před fetchOne na serveru zasekával další příkazy)
      let h: any = null;
      try { h = await sCasem(client.fetchOne(String(uid), { uid: true, flags: true, envelope: true, size: true, internalDate: true }, { uid: true }), LIMIT_ZPRAVY_MS); }
      catch { zaseknuto = true; zpracovano++; posledni = uid; await ulozStav(); break; } // zaseknutou zprávu přeskočit, ať se na ní příště nezastaví
      zpracovano++;
      if (!h) { posledni = uid; continue; }
      const flags: Set<string> = h.flags instanceof Set ? h.flags : new Set<string>();
      const env = h.envelope || {};
      let e: any = null;
      let poznamka = "";
      if ((h.size || 0) > MAX_ZPRAVA) {
        poznamka = `Zpráva je velká (${Math.round((h.size || 0) / 1048576)} MB) — celou ji otevřete ve webmailu WEDOS (https://webmail.wedos.net).`;
      } else {
        try {
          const msg = await sCasem(client.fetchOne(String(uid), { uid: true, source: true }, { uid: true }), LIMIT_ZPRAVY_MS);
          if (msg && (msg as any).source) e = await PostalMime.parse((msg as any).source);
        } catch (chyba) {
          poznamka = "Zprávu se nepodařilo stáhnout celou — otevřete ji ve webmailu WEDOS (https://webmail.wedos.net).";
          if (String((chyba as Error)?.message) === "timeout") zaseknuto = true; // spojení může viset → ukončit dávku
        }
      }

      const prilohy: { nazev: string; typ: string; velikost: number; cesta: string | null; cid: string | null }[] = [];
      for (const [i, a] of (e?.attachments || []).entries()) {
        const obsah = a.content as ArrayBuffer;
        const velikost = obsah?.byteLength || 0;
        const nazev = a.filename || (a.mimeType?.startsWith("image/") ? `obrazek-${i + 1}.${a.mimeType.split("/")[1]}` : `priloha-${i + 1}`);
        let cesta: string | null = null;
        if (velikost && velikost <= MAX_PRILOHA) {
          cesta = `prijate/${validity}-${uid}/${i}-${bezpecneJmeno(nazev)}`;
          try {
            const { error } = await sCasem(db.storage.from("posta").upload(cesta, new Uint8Array(obsah), { contentType: a.mimeType || "application/octet-stream", upsert: true }), 20_000);
            if (error) cesta = null;
          } catch { cesta = null; }
        }
        prilohy.push({ nazev, typ: a.mimeType || "", velikost, cesta, cid: a.contentId ? String(a.contentId).replace(/^<|>$/g, "") : null });
      }
      const od = adresy(e ? e.from : (env.from || []).map((x: any) => ({ address: x.address, name: x.name })))[0] || { email: "", jmeno: "" };
      const text = e ? (e.text || "").slice(0, 200_000) : poznamka;
      const html = e?.html && e.html.length <= MAX_HTML ? e.html : null;
      const nahled = (text || (e?.html || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 200);
      const { data: zak } = od.email
        ? await db.from("customers").select("id").ilike("email", od.email.replace(/[%_\\]/g, "\\$&")).limit(1)
        : { data: null };
      const predmet = (e ? e.subject : env.subject) || "";
      const { data: radek, error } = await db.from("posta_zpravy").upsert({
        schranka, slozka, imap_slozka: imapSlozka, uid, uid_validity: validity,
        message_id: (e ? e.messageId : env.messageId) || null, in_reply_to: (e ? e.inReplyTo : env.inReplyTo) || null, reference: e?.references || null,
        od_email: od.email, od_jmeno: od.jmeno,
        komu: adresy(e ? e.to : (env.to || []).map((x: any) => ({ address: x.address, name: x.name }))),
        kopie: adresy(e ? e.cc : (env.cc || []).map((x: any) => ({ address: x.address, name: x.name }))),
        predmet, datum: new Date(e?.date || env.date || h.internalDate || Date.now()).toISOString(),
        text, html, nahled, prilohy,
        precteno: slozka === "odeslane" || flags.has("\\Seen"), oznaceno: flags.has("\\Flagged"),
        customer_id: zak?.[0]?.id ?? null,
      }, { onConflict: "schranka,imap_slozka,uid_validity,uid" }).select("id").single();
      if (error) throw new Error("Uložení zprávy: " + error.message);
      if (upozornovat && !flags.has("\\Seen")) noveZpravy.push({ id: radek.id, od: od.jmeno || od.email, predmet });
      posledni = uid;
      await ulozStav(); // postup po každé zprávě — při přerušení se příště pokračuje dál
      if (zaseknuto) break;
    }
    return { nove: zpracovano, zbyva: uids.length - zpracovano, noveZpravy, zaseknuto };
  } finally {
    try { lock.release(); } catch { /* spojení mohlo spadnout */ }
  }
}

// Upozornění (oznámení v appce → push na telefon) jen vybraným lidem z app_settings „posta“.
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
  // Dvě cesty: pg_cron každé 2 minuty (hlavička x-cron-secret = tajemství hlaseni_cron_secret
  // z Vaultu) — jen stáhne poštu a upozorní; nebo přihlášený uživatel appky s Poštou/Fakturami.
  // Funkce je nasazená s verify_jwt=false, přihlášení si ověřuje sama.
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

  let client: ImapFlow | null = null;
  try {
    client = await pripojit(cfg.imap);
    const cesty = await slozky(client);

    if (akce === "cron") {
      let nove = 0, zbyva = 0;
      for (let i = 0; i < 10 && Date.now() - start < LIMIT_VOLANI_MS; i++) {
        const r = await sync(db, client, schranka, "prijate", cesty.prijate, start);
        nove += r.nove; zbyva = r.zbyva;
        await upozornit(db, r.noveZpravy);
        if (!r.zbyva || r.zaseknuto) break;
      }
      if (!zbyva && Date.now() - start < LIMIT_VOLANI_MS / 2) await sync(db, client, schranka, "odeslane", cesty.odeslane, start).catch(() => {});
      return json({ ok: true, nove, zbyva });
    }

    if (akce === "sync") {
      const slozka = body.slozka === "odeslane" ? "odeslane" : "prijate";
      const r = await sync(db, client, schranka, slozka, cesty[slozka], start);
      await upozornit(db, r.noveZpravy);
      return json({ ok: true, schranka, nove: r.nove, zbyva: r.zbyva });
    }

    if (akce === "precteno" || akce === "smazat") {
      const { data: z } = await db.from("posta_zpravy").select("id, imap_slozka, uid, uid_validity").eq("id", body.id).maybeSingle();
      if (!z) return json({ error: "not_found" }, 404);
      const lock = await client.getMailboxLock(z.imap_slozka);
      try {
        const platne = Number((client.mailbox as any).uidValidity) === Number(z.uid_validity);
        if (akce === "precteno") {
          if (platne) {
            if (body.precteno) await client.messageFlagsAdd(String(z.uid), ["\\Seen"], { uid: true });
            else await client.messageFlagsRemove(String(z.uid), ["\\Seen"], { uid: true });
          }
          await db.from("posta_zpravy").update({ precteno: !!body.precteno }).eq("id", z.id);
        } else {
          if (platne) await client.messageMove(String(z.uid), cesty.kos, { uid: true });
          await db.from("posta_zpravy").update({ smazano: true }).eq("id", z.id);
        }
      } finally { lock.release(); }
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
      // kopie do Odeslaných na serveru (pak ji uvidí i webmail/Outlook) a hned stáhnout do appky
      let ulozeno = true;
      try {
        await client.append(cesty.odeslane, raw, ["\\Seen"]);
        await sync(db, client, schranka, "odeslane", cesty.odeslane, start);
      } catch { ulozeno = false; }
      if (body.odpovedNaId) await db.from("posta_zpravy").update({ precteno: true }).eq("id", body.odpovedNaId);
      return json({ ok: true, ulozenoDoOdeslanych: ulozeno });
    }

    return json({ error: "bad_request", detail: "Neznámá akce." }, 400);
  } catch (e) {
    const zprava = String((e as Error)?.message ?? e).slice(0, 300);
    await db.from("posta_stav").upsert({ schranka, imap_slozka: "INBOX", chyba: zprava }, { onConflict: "schranka,imap_slozka", ignoreDuplicates: false }).then(() => {}, () => {});
    return json({ error: "failed", detail: zprava }, 502);
  } finally {
    try { if (client) await sCasem(client.logout(), 5000); } catch { try { client?.close(); } catch { /* nic */ } }
  }
});
