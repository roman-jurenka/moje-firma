import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

// servis-zprava-odeslat
// Pošle podepsanou servisní zprávu (PDF z bucketu servisni-zpravy) zákazníkovi
// e-mailem z firemní schránky (Wedos SMTP) a kopii do firmy. Volá ji
// přihlášený uživatel appky: { id } = servisni_zpravy.id.
// Tajemství (Supabase → Edge Functions → Secrets), nastavuje majitel:
//   SMTP_HOST (např. wes1-smtp.wedos.net), SMTP_PORT (465), SMTP_USER, SMTP_PASS,
//   SMTP_FROM (např. "Jurenka elektro <servis@…>"), SMTP_KOPIE (kopie do firmy, nepovinné).
// Porty 25 a 587 jsou z edge funkcí blokované — používá se 465 (SSL).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
const esc = (t: unknown) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  // ověřit přihlášeného uživatele appky
  const auth = req.headers.get("authorization") ?? "";
  const uzivatel = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u } = await uzivatel.auth.getUser();
  if (!u?.user) return json({ error: "unauthorized" }, 401);

  let id = 0;
  try { id = Number((await req.json()).id); } catch { /* níže */ }
  if (!id) return json({ error: "missing_id" }, 400);

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: z, error } = await db.from("servisni_zpravy").select("*").eq("id", id).maybeSingle();
  if (error || !z) return json({ error: "not_found" }, 404);
  if (!z.email_komu || !z.pdf_path) return json({ error: "missing_email_or_pdf" }, 400);

  const host = Deno.env.get("SMTP_HOST"), user = Deno.env.get("SMTP_USER"), pass = Deno.env.get("SMTP_PASS");
  if (!host || !user || !pass) {
    await db.from("servisni_zpravy").update({ chyba: "Odesílání e-mailů není nastavené (chybí SMTP tajemství)." }).eq("id", id);
    return json({ error: "smtp_not_configured" }, 500);
  }

  const { data: soubor, error: dErr } = await db.storage.from("servisni-zpravy").download(z.pdf_path);
  if (dErr || !soubor) return json({ error: "pdf_download_failed", detail: dErr?.message }, 500);
  const pdf = new Uint8Array(await soubor.arrayBuffer());

  const o = z.obsah ?? {};
  const firma = o.firma ?? "Jurenka elektro s.r.o.";
  const predmet = `Servisní zpráva ${z.cislo ?? ""} – ${o.nazev ?? "servisní výjezd"}`.trim();
  const text = [
    "Dobrý den,",
    "",
    `v příloze posíláme servisní zprávu ${z.cislo ?? ""} z výjezdu ${o.datum ?? ""}${o.adresa ? ` (${o.adresa})` : ""}, kterou jste podepsal(a) na místě.`,
    o.reseni ? `\nProvedené práce: ${o.reseni}` : "",
    o.doporuceni ? `\nDoporučení: ${o.doporuceni}` : "",
    "",
    "V případě dotazů nám odpovězte na tento e-mail.",
    "",
    "S pozdravem",
    o.technik ? `${o.technik}, ${firma}` : firma,
  ].join("\n");

  try {
    const port = Number(Deno.env.get("SMTP_PORT") || 465);
    const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    await t.sendMail({
      from: Deno.env.get("SMTP_FROM") || user,
      to: z.email_komu,
      bcc: Deno.env.get("SMTP_KOPIE") || undefined,
      replyTo: Deno.env.get("SMTP_FROM") || user,
      subject: predmet,
      text,
      html: text.split("\n").map((r) => esc(r) || "&nbsp;").join("<br>"),
      attachments: [{ filename: `Servisni-zprava-${String(z.cislo ?? id).replace(/[^\w.-]+/g, "-")}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
  } catch (e) {
    const zprava = String((e as Error)?.message ?? e).slice(0, 300);
    await db.from("servisni_zpravy").update({ chyba: zprava }).eq("id", id);
    return json({ error: "send_failed", detail: zprava }, 502);
  }

  await db.from("servisni_zpravy").update({ odeslano_at: new Date().toISOString(), chyba: null }).eq("id", id);
  return json({ ok: true });
});
