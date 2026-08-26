// ─── Veřejný ICS feed pro odebíraný kalendář (iPhone/Outlook/Google) ─────────
// Vercel serverless funkce (Node, ESM — viz "type":"module" v package.json).
// Přístup je řízen jen náhodným tokenem v URL (?token=...), ne přihlášením —
// kalendářové appky (iOS Kalendář apod.) se nepřihlašují, jen pravidelně
// stahují tuhle URL. Token identifikuje konkrétního zaměstnance a je uložený
// v tabulce ics_feed_tokens chráněné RLS (čte/zakládá jen vlastník), takže
// tahle funkce k němu nemá přímý přístup k cizím datům — všechno řeší
// SQL funkce get_ics_feed (SECURITY DEFINER), která vrátí data JEN pro
// zaměstnance, kterému token patří.
//
// Používá stejný veřejný anon klíč jako zbytek appky (viz src/supabase.js) —
// není to tajemství, je běžně součástí klientského JS balíčku appky.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rbnqulgmywtvuryabzjc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJibnF1bGdteXd0dnVyeWFiempjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3ODI3MTgsImV4cCI6MjA5MzM1ODcxOH0.Nl-CLAqRLQQNPSfauzBC0CyJ61Yd7JBrEuIdeK6Sudg";

function escapeICS(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// RFC5545 vyžaduje zalomení řádků na 75 oktetech (pokračovací řádek začíná mezerou).
function foldLine(line) {
  const bytes = Buffer.byteLength(line, "utf8");
  if (bytes <= 75) return line;
  let out = "";
  let chunk = "";
  let chunkBytes = 0;
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, "utf8");
    if (chunkBytes + chBytes > 74) {
      out += (out ? "\r\n " : "") + chunk;
      chunk = "";
      chunkBytes = 0;
    }
    chunk += ch;
    chunkBytes += chBytes;
  }
  if (chunk) out += (out ? "\r\n " : "") + chunk;
  return out;
}

function toICSDate(dateStr) {
  return String(dateStr).replace(/-/g, "");
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const token = req.query?.token;
  if (!token) {
    res.status(400).send("Chybí token.");
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.rpc("get_ics_feed", { p_token: token });

  if (error) {
    res.status(500).send("Chyba načtení kalendáře.");
    return;
  }

  const now = new Date();
  const dtstamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ProudOS//Kalendar//CS",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ProudOS kalendář",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const ev of data || []) {
    if (!ev.date) continue;
    const summaryBits = [ev.title, ev.customer_name].filter(Boolean);
    const summary = summaryBits.length ? summaryBits.join(" – ") : (ev.work_type || "Událost");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:calendar-event-${ev.id}@moje-firma.vercel.app`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${toICSDate(ev.date)}`);
    lines.push(`DTEND;VALUE=DATE:${toICSDate(addDays(ev.date, 1))}`);
    lines.push(foldLine(`SUMMARY:${escapeICS(summary)}`));
    if (ev.work_description) lines.push(foldLine(`DESCRIPTION:${escapeICS(ev.work_description)}`));
    if (ev.address) lines.push(foldLine(`LOCATION:${escapeICS(ev.address)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="proudos-kalendar.ics"');
  res.setHeader("Cache-Control", "public, max-age=1800");
  res.status(200).send(lines.join("\r\n"));
}
