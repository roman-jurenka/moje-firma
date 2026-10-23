import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// faktury-radky
// Doplňování řádků k fakturám ve Frontě k přiřazení, které přišly bez řádků
// (e-mailová úloha je z PDF nepřečetla). Volá ho naplánovaný agent
// „Doplnění řádků faktur“ každé 2 dny:
//   { action: "seznam", limit }            → faktury bez řádků + dočasný odkaz na PDF
//   { action: "doplnit", id, items: [...], hlavicka? } → zapíše řádky (jen když faktura
//                                             žádné nemá) a doplní prázdnou hlavičku
//                                             (dodavatel, číslo, datum, částka…)
// Doklady vyfocené v terénu (source "foto") mají víc stránek (fotky) a návrh,
// kam patří (navrh_cil) — ten se použije jako návrh přiřazení řádků.
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

interface Hlavicka {
  supplier_name?: string; supplier_ico?: string; invoice_number?: string; variable_symbol?: string;
  issue_date?: string; due_date?: string; total_amount?: number; currency?: string;
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

  let body: { action?: string; limit?: number; id?: number; items?: Polozka[]; duvod?: string; hlavicka?: Hlavicka };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  if (body.action === "seznam") {
    const limit = Math.min(Math.max(Number(body.limit) || 15, 1), 40);
    const { data: fronta, error } = await db.from("invoice_queue")
      .select("id, supplier_name, supplier_ico, invoice_number, issue_date, total_amount, currency, pdf_storage_path, note, status, doc_type, source, fotky, nahral, navrh_cil, navrh_typ")
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
      const cesty: string[] = Array.isArray(f.fotky) && f.fotky.length ? f.fotky : [f.pdf_storage_path];
      const stranky: string[] = [];
      for (const c of cesty) {
        const { data: url } = await db.storage.from(BUCKET).createSignedUrl(c, 1800);
        if (url?.signedUrl) stranky.push(url.signedUrl);
      }
      out.push({
        id: f.id, zdroj: f.source === "foto" ? "foto z terénu" : "e-mail", druh: f.doc_type,
        dodavatel: f.supplier_name, ico: f.supplier_ico, cislo: f.invoice_number, datum: f.issue_date, celkem: f.total_amount, mena: f.currency,
        poznamka: f.note, nahral: f.nahral, navrh: f.navrh_cil ? { cil: f.navrh_cil, typ_auta: f.navrh_typ } : null,
        chybi_hlavicka: !f.supplier_name || f.total_amount == null,
        pdf_url: stranky[0] ?? null, stranky,
      });
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
    const { data: doklad } = await db.from("invoice_queue").select("source, navrh_cil, note, supplier_name, supplier_ico, invoice_number, variable_symbol, issue_date, due_date, total_amount, currency").eq("id", id).maybeSingle();
    const navrhZ = String(doklad?.navrh_cil ?? "").startsWith("z:") ? Number(String(doklad?.navrh_cil).slice(2)) : null;
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
      if (navrhZ && kandidati.length === 0) kandidati.push({ id: navrhZ, name: "", code: "" }); // návrh z terénu
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
    // hlavička: doplnit jen prázdná pole (u fotek z terénu i datum — to je jen den focení)
    const h = body.hlavicka ?? {};
    const zmeny: Record<string, unknown> = {};
    const prazdne = (v: unknown) => v == null || String(v).trim() === "";
    const datum = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null;
    if (h.supplier_name && prazdne(doklad?.supplier_name)) zmeny.supplier_name = String(h.supplier_name).slice(0, 200);
    if (h.supplier_ico && prazdne(doklad?.supplier_ico)) zmeny.supplier_ico = String(h.supplier_ico).replace(/\s/g, "").slice(0, 20);
    if (h.invoice_number && prazdne(doklad?.invoice_number)) zmeny.invoice_number = String(h.invoice_number).slice(0, 60);
    if (h.variable_symbol && prazdne(doklad?.variable_symbol)) zmeny.variable_symbol = String(h.variable_symbol).replace(/\D/g, "").slice(0, 20) || null;
    if (datum(h.issue_date) && (prazdne(doklad?.issue_date) || doklad?.source === "foto")) zmeny.issue_date = datum(h.issue_date);
    if (datum(h.due_date) && prazdne(doklad?.due_date)) zmeny.due_date = datum(h.due_date);
    if (cislo(h.total_amount) != null && doklad?.total_amount == null) zmeny.total_amount = cislo(h.total_amount);
    if (h.currency && prazdne(doklad?.currency)) zmeny.currency = String(h.currency).slice(0, 3).toUpperCase();
    const poznamka = [doklad?.note, `[řádky doplnil agent ${new Date().toISOString().slice(0, 10)}]`].filter(Boolean).join(" ");
    await db.from("invoice_queue").update({ ...zmeny, note: poznamka, updated_at: new Date().toISOString() }).eq("id", id);
    return json({ ok: true, vlozeno: radky.length, hlavicka: Object.keys(zmeny) });
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
