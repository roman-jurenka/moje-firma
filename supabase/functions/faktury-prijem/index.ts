import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// faktury-prijem
// Called once daily (evening) by the Wedos-webmail -> ERP scheduled task.
// Writes ONE invoice (header + line items) into the review queue
// (invoice_queue / invoice_queue_items) and stores the PDF/EML in the
// private "faktury-fronta" bucket. Nothing here ever touches
// contract_cost_entries or warehouse_movements directly - those are only
// written later, when a person approves a line in the queue UI.
//
// Auth: a shared bearer token, NOT a Supabase user/session JWT. Set it
// once as a project secret (Supabase dashboard -> Edge Functions ->
// faktury-prijem -> Secrets, or `supabase secrets set FAKTURY_PRIJEM_TOKEN=...`)
// and send the same value as `Authorization: Bearer <token>` from the
// scheduled task. This function is deployed with verify_jwt=false because
// the caller is not a logged-in app user.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

interface IncomingItem {
  line_no?: number;
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  amount?: number;
  order_reference?: string; // "Vaše objednávka" field
}

interface IncomingInvoice {
  direction: "prijata" | "vydana";
  email_uid?: string;
  email_message_id?: string;
  supplier_name?: string;
  supplier_ico?: string;
  customer_name?: string;
  invoice_number?: string;
  variable_symbol?: string;
  issue_date?: string; // YYYY-MM-DD
  due_date?: string; // YYYY-MM-DD
  total_amount?: number;
  currency?: string;
  note?: string;
  pdf_base64?: string;
  pdf_filename?: string;
  eml_base64?: string;
  items?: IncomingItem[];
}

function normalizeRef(raw: string | undefined | null): string {
  return (raw ?? "").trim();
}

// A reference that carries no usable zakázka info: empty, a bare
// number/code, or EMAS's own "Roman" placeholder for "nobody told us
// which zakázka". All of these route the line to sklad.
function isUnusableReference(ref: string): boolean {
  if (!ref) return true;
  if (/^\d+$/.test(ref)) return true; // bare numeric order/code
  if (ref.toLowerCase() === "roman") return true;
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expectedToken = Deno.env.get("FAKTURY_PRIJEM_TOKEN");
  const authHeader = req.headers.get("authorization") ?? "";
  const gotToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!expectedToken || gotToken !== expectedToken) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: IncomingInvoice;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!payload.direction || !["prijata", "vydana"].includes(payload.direction)) {
    return json({ error: "invalid_direction" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // --- dedupe: same direction + (email_uid or invoice_number) already queued? ---
  if (payload.email_uid || payload.invoice_number) {
    let dupQuery = supabase
      .from("invoice_queue")
      .select("id")
      .eq("direction", payload.direction)
      .limit(1);
    if (payload.email_uid) {
      dupQuery = dupQuery.eq("email_uid", payload.email_uid);
    } else if (payload.invoice_number) {
      dupQuery = dupQuery.eq("invoice_number", payload.invoice_number);
    }
    const { data: dup, error: dupErr } = await dupQuery;
    if (dupErr) return json({ error: "dedupe_check_failed", detail: dupErr.message }, 500);
    if (dup && dup.length > 0) {
      return json({ ok: true, skipped: "duplicate", invoice_queue_id: dup[0].id });
    }
  }

  // --- load contracts once for matching ---
  const { data: contracts, error: contractsErr } = await supabase
    .from("contracts")
    .select("id, name, code");
  if (contractsErr) {
    return json({ error: "contracts_lookup_failed", detail: contractsErr.message }, 500);
  }

  function matchContract(ref: string) {
    const refLower = ref.toLowerCase();
    const candidates = (contracts ?? []).filter((c: { id: number; name: string; code: string | null }) => {
      const name = (c.name ?? "").toLowerCase();
      const code = (c.code ?? "").toLowerCase();
      if (!name && !code) return false;
      return (
        (name && (refLower.includes(name) || name.includes(refLower))) ||
        (code && refLower.includes(code) && code.length > 0)
      );
    });
    return candidates;
  }

  // --- insert invoice_queue header ---
  const { data: inv, error: invErr } = await supabase
    .from("invoice_queue")
    .insert({
      direction: payload.direction,
      status: "nova",
      source: "email",
      email_uid: payload.email_uid ?? null,
      email_message_id: payload.email_message_id ?? null,
      supplier_name: payload.supplier_name ?? null,
      supplier_ico: payload.supplier_ico ?? null,
      customer_name: payload.customer_name ?? null,
      invoice_number: payload.invoice_number ?? null,
      variable_symbol: payload.variable_symbol ?? null,
      issue_date: payload.issue_date ?? null,
      due_date: payload.due_date ?? null,
      total_amount: payload.total_amount ?? null,
      currency: payload.currency ?? "CZK",
      note: payload.note ?? null,
    })
    .select("id")
    .single();

  if (invErr || !inv) {
    return json({ error: "insert_invoice_failed", detail: invErr?.message }, 500);
  }
  const invoiceQueueId = inv.id;

  // --- upload PDF / EML into private bucket ---
  const storagePaths: { pdf_storage_path?: string; eml_storage_path?: string } = {};
  try {
    if (payload.pdf_base64) {
      const pdfBytes = Uint8Array.from(atob(payload.pdf_base64), (c) => c.charCodeAt(0));
      const pdfPath = `${payload.direction}/${invoiceQueueId}/${payload.pdf_filename || "faktura.pdf"}`;
      const { error: upErr } = await supabase.storage
        .from("faktury-fronta")
        .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
      if (!upErr) storagePaths.pdf_storage_path = pdfPath;
    }
    if (payload.eml_base64) {
      const emlBytes = Uint8Array.from(atob(payload.eml_base64), (c) => c.charCodeAt(0));
      const emlPath = `${payload.direction}/${invoiceQueueId}/email.eml`;
      const { error: upErr2 } = await supabase.storage
        .from("faktury-fronta")
        .upload(emlPath, emlBytes, { contentType: "message/rfc822", upsert: true });
      if (!upErr2) storagePaths.eml_storage_path = emlPath;
    }
    if (storagePaths.pdf_storage_path || storagePaths.eml_storage_path) {
      await supabase.from("invoice_queue").update(storagePaths).eq("id", invoiceQueueId);
    }
  } catch (e) {
    // Storage failure should not block the queue entry from existing -
    // it's still reviewable without the file, and the error is reported back.
    console.error("storage upload failed", e);
  }

  // --- insert line items with suggested assignment ---
  const items = payload.items ?? [];
  const itemRows = items.map((it, idx) => {
    const ref = normalizeRef(it.order_reference);
    let suggested_match_type: string;
    let suggested_contract_id: number | null = null;
    let suggested_candidates: unknown = null;

    if (isUnusableReference(ref)) {
      suggested_match_type = "sklad";
    } else {
      const candidates = matchContract(ref);
      if (candidates.length === 1) {
        suggested_match_type = "zakazka";
        suggested_contract_id = candidates[0].id;
      } else if (candidates.length > 1) {
        suggested_match_type = "ambiguous";
        suggested_candidates = candidates.map((c: { id: number; name: string }) => ({
          contract_id: c.id,
          name: c.name,
        }));
      } else {
        // non-matching free text also routes to sklad, per rule
        suggested_match_type = "sklad";
      }
    }

    return {
      invoice_queue_id: invoiceQueueId,
      line_no: it.line_no ?? idx + 1,
      description: it.description ?? null,
      quantity: it.quantity ?? null,
      unit: it.unit ?? null,
      unit_price: it.unit_price ?? null,
      amount: it.amount ?? null,
      order_reference: ref || null,
      suggested_contract_id,
      suggested_match_type,
      suggested_candidates,
      status: "navrh",
    };
  });

  if (itemRows.length > 0) {
    const { error: itemsErr } = await supabase.from("invoice_queue_items").insert(itemRows);
    if (itemsErr) {
      return json(
        { error: "insert_items_failed", detail: itemsErr.message, invoice_queue_id: invoiceQueueId },
        500,
      );
    }
  }

  return json({ ok: true, invoice_queue_id: invoiceQueueId, items_count: itemRows.length });
});
