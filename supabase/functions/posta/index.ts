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

async function sync(db: Db, client: ImapFlow, schranka: string, slozka: "prijate" | "odeslane", imapSlozka: string) {
  const lock = await client.getMailboxLock(imapSlozka);
  try {
    const mb = client.mailbox as { uidValidity: bigint | number; exists: number };
    const validity = Number(mb.uidValidity);
    const { data: stav } = await db.from("posta_stav").select("*").eq("schranka", schranka).eq("imap_slozka", imapSlozka).maybeSingle();
    let posledni = Number(stav?.posledni_uid || 0);
    if (stav && Number(stav.uid_validity) !== validity) posledni = 0; // server složku přečísloval → stáhnout znovu

    if (!mb.exists) {
      await db.from("posta_stav").upsert({ schranka, imap_slozka: imapSlozka, uid_validity: validity, posledni_uid: posledni, synchronizovano_at: new Date().toISOString(), chyba: null });
      return { nove: 0, zbyva: 0 };
    }
    const kriterium = posledni > 0 ? { uid: `${posledni + 1}:*` } : { since: new Date(Date.now() - PRVNI_SYNC_DNI * 864e5) };
    const uids = ((await client.search(kriterium, { uid: true })) || []).filter((u) => u > posledni).sort((a, b) => a - b);
    const davka = uids.slice(0, DAVKA);
    let nove = 0;

    for (const uid of davka) {
      const msg = await client.fetchOne(String(uid), { uid: true, flags: true, source: true, internalDate: true }, { uid: true });
      if (!msg || !msg.source) { posledni = uid; continue; }
      const e = await PostalMime.parse(msg.source);
      const prilohy: { nazev: string; typ: string; velikost: number; cesta: string | null; cid: string | null }[] = [];
      for (const [i, a] of (e.attachments || []).entries()) {
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
      const od = adresy(e.from)[0] || { email: "", jmeno: "" };
      const text = (e.text || "").slice(0, 200_000);
      const html = e.html && e.html.length <= MAX_HTML ? e.html : null;
      const nahled = (text || (e.html || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 200);
      const { data: zak } = od.email
        ? await db.from("customers").select("id").ilike("email", od.email).limit(1)
        : { data: null };
      const flags = msg.flags instanceof Set ? msg.flags : new Set<string>();
      const { error } = await db.from("posta_zpravy").upsert({
        schranka, slozka, imap_slozka: imapSlozka, uid, uid_validity: validity,
        message_id: e.messageId || null, in_reply_to: e.inReplyTo || null, reference: e.references || null,
        od_email: od.email, od_jmeno: od.jmeno, komu: adresy(e.to), kopie: adresy(e.cc),
        predmet: e.subject || "", datum: (e.date ? new Date(e.date) : msg.internalDate || new Date()).toISOString(),
        text, html, nahled, prilohy,
        precteno: slozka === "odeslane" || flags.has("\\Seen"), oznaceno: flags.has("\\Flagged"),
        customer_id: zak?.[0]?.id ?? null,
      }, { onConflict: "schranka,imap_slozka,uid_validity,uid" });
      if (error) throw new Error("Uložení zprávy: " + error.message);
      posledni = uid;
      nove++;
    }
    await db.from("posta_stav").upsert({ schranka, imap_slozka: imapSlozka, uid_validity: validity, posledni_uid: posledni, synchronizovano_at: new Date().toISOString(), chyba: null });
    return { nove, zbyva: uids.length - davka.length };
  } finally {
    lock.release();
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") || "";
  const uzivatel = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await uzivatel.auth.getUser();
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: smi } = await uzivatel.rpc("app_ma", { p_tabs: ["posta", "invoices"] });
  if (!smi) return json({ error: "forbidden" }, 403);

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const cfg = nastaveni();
  if (!cfg.imap.host || !cfg.imap.user || !cfg.imap.pass) return json({ error: "not_configured", detail: "Chybí nastavení schránky (SMTP_HOST / SMTP_USER / SMTP_PASS, případně IMAP_*)." }, 500);
  const schranka = cfg.imap.user.toLowerCase();

  let body: any = {};
  try { body = await req.json(); } catch { /* prázdné tělo */ }
  const akce = body?.akce;

  let client: ImapFlow | null = null;
  try {
    client = await pripojit(cfg.imap);
    const cesty = await slozky(client);

    if (akce === "sync") {
      const slozka = body.slozka === "odeslane" ? "odeslane" : "prijate";
      const r = await sync(db, client, schranka, slozka, cesty[slozka]);
      return json({ ok: true, schranka, ...r });
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
        await sync(db, client, schranka, "odeslane", cesty.odeslane);
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
    try { await client?.logout(); } catch { /* nic */ }
  }
});
