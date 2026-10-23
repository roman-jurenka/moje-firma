import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// faktury-radky
// Doplňování řádků k fakturám ve Frontě k přiřazení, které přišly bez řádků
// (e-mailová úloha je z PDF nepřečetla). Volá ho naplánovaný agent
// „Doplnění řádků faktur“ každé 2 dny:
//   { action: "seznam", limit }            → faktury bez řádků + dočasný odkaz na PDF
//   { action: "doplnit", id, items: [...] } → zapíše řádky (jen když faktura žádné nemá)
//   { action: "neprecteno", id, duvod }      → označí, že řádky z PDF přečíst nejdou
//                                             (příště se faktura přeskočí)
// Nic se tu neschvaluje ani nepíše do nákladů/skladu — řádky vzniknou jako
// návrh (status "navrh") a potvrzuje je člověk ve Frontě.
// Auth: stejný sdílený token jako faktury-prijem (FAKTURY_PRIJEM_TOKEN).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BUCKET = "faktury-fronta";
const ZNACKA = "[řádky z PDF nejdou přečíst]";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

interface Polozka {
  line_no?: number;
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  amount?: number;
  order_reference?: string;
}

const cislo = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = Deno.env.get("FAKTURY_PRIJEM_TOKEN");
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || got !== token) return json({ error: "unauthorized" }, 401);

  let body: { action?: string; limit?: number; id?: number; items?: Polozka[]; duvod?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  if (body.action === "seznam") {
    const limit = Math.min(Math.max(Number(body.limit) || 15, 1), 40);
    const { data: fronta, error } = await db.from("invoice_queue")
      .select("id, supplier_name, supplier_ico, invoice_number, issue_date, total_amount, currency, pdf_storage_path, note, status, doc_type")
      .not("pdf_storage_path", "is", null).neq("status", "zamitnuta").order("created_at", { ascending: false }).limit(500);
    if (error) return json({ error: "queue_lookup_failed", detail: error.message }, 500);
    const ids = (fronta ?? []).map((f) => f.id);
    const sRadky = new Set<number>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("invoice_queue_items").select("invoice_queue_id").in("invoice_queue_id", ids.slice(i, i + 200));
      (data ?? []).forEach((r) => sRadky.add(r.invoice_queue_id));
    }
    const bez = (fronta ?? []).filter((f) => !sRadky.has(f.id) && !String(f.note ?? "").includes(ZNACKA));
    const vyber = bez.slice(0, limit);
    const out = [];
    for (const f of vyber) {
      const { data: url } = await db.storage.from(BUCKET).createSignedUrl(f.pdf_storage_path, 1800);
      out.push({ id: f.id, dodavatel: f.supplier_name, ico: f.supplier_ico, cislo: f.invoice_number, datum: f.issue_date, celkem: f.total_amount, mena: f.currency, pdf_url: url?.signedUrl ?? null });
    }
    return json({ celkem_bez_radku: bez.length, faktury: out });
  }

  if (body.action === "doplnit") {
    const id = Number(body.id);
    const items = Array.isArray(body.items) ? body.items.filter((it) => String(it.description ?? "").trim() || cislo(it.amount) != null) : [];
    if (!id || items.length === 0) return json({ error: "missing_id_or_items" }, 400);
    const { count } = await db.from("invoice_queue_items").select("id", { count: "exact", head: true }).eq("invoice_queue_id", id);
    if ((count ?? 0) > 0) return json({ ok: true, preskoceno: "faktura už řádky má" });

    // stejné navržení zakázky jako faktury-prijem: podle „Vaše objednávka“
    const { data: zakazky } = await db.from("contracts").select("id, name, code");
    const najdi = (ref: string) => {
      const r = ref.toLowerCase();
      return (zakazky ?? []).filter((c) => {
        const n = (c.name ?? "").toLowerCase(), k = (c.code ?? "").toLowerCase();
        if (!n && !k) return false;
        return (n && (r.includes(n) || n.includes(r))) || (k && r.includes(k));
      });
    };
    const radky = items.map((it, i) => {
      const ref = String(it.order_reference ?? "").trim();
      const nepouzitelna = !ref || /^\d+$/.test(ref) || ref.toLowerCase() === "roman";
      const kandidati = nepouzitelna ? [] : najdi(ref);
      return {
        invoice_queue_id: id, line_no: it.line_no ?? i + 1,
        description: String(it.description ?? "").trim() || null,
        quantity: cislo(it.quantity), unit: it.unit ? String(it.unit) : null,
        unit_price: cislo(it.unit_price), amount: cislo(it.amount), order_reference: ref || null,
        suggested_match_type: kandidati.length === 1 ? "zakazka" : kandidati.length > 1 ? "ambiguous" : "sklad",
        suggested_contract_id: kandidati.length === 1 ? kandidati[0].id : null,
        suggested_candidates: kandidati.length > 1 ? kandidati.map((c) => ({ contract_id: c.id, name: c.name })) : null,
        status: "navrh",
      };
    });
    const { error } = await db.from("invoice_queue_items").insert(radky);
    if (error) return json({ error: "insert_failed", detail: error.message }, 500);
    const { data: f } = await db.from("invoice_queue").select("note").eq("id", id).maybeSingle();
    const poznamka = [f?.note, `[řádky doplnil agent ${new Date().toISOString().slice(0, 10)}]`].filter(Boolean).join(" ");
    await db.from("invoice_queue").update({ note: poznamka, updated_at: new Date().toISOString() }).eq("id", id);
    return json({ ok: true, vlozeno: radky.length });
  }

  if (body.action === "neprecteno") {
    const id = Number(body.id);
    if (!id) return json({ error: "missing_id" }, 400);
    const { data: f } = await db.from("invoice_queue").select("note").eq("id", id).maybeSingle();
    const duvod = String(body.duvod ?? "").slice(0, 200);
    const poznamka = [f?.note, `${ZNACKA}${duvod ? " " + duvod : ""}`].filter(Boolean).join(" ");
    await db.from("invoice_queue").update({ note: poznamka, updated_at: new Date().toISOString() }).eq("id", id);
    return json({ ok: true });
  }

  return json({ error: "unknown_action" }, 400);
});
