import { useState, useEffect, useRef } from "react";
import { computeInvoiceTotals, fmtKc2, buildInvoicePreview, downloadInvoicePDF, getDiscountedTotal } from "./invoicingUtils.js";

const VAT_RATES = [0, 12, 21];
const ITEM_UNITS = ["ks", "kpl.", "h", "m", "m²", "m³", "kg", "km", "den"];

// ─── Malý vyhledávací výběr zakázky (bez závislosti na App.jsx) ─────────────
function ContractPicker({ options, value, onChange, placeholder = "— vyberte zakázku — (piš pro hledání)" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const selected = options.find(o => String(o.id) === String(value));
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filtered = words.length === 0 ? options : options.filter(o => words.every(w => (o.label || "").toLowerCase().includes(w)));
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input style={inputStyle} value={open ? q : (selected?.label || "")} placeholder={placeholder}
        onFocus={() => { setOpen(true); setQ(""); }} onChange={e => { setQ(e.target.value); setOpen(true); }} />
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 999, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 220, overflowY: "auto", boxShadow: "0 6px 16px #00000022" }}>
          {filtered.length === 0 && <div style={{ padding: "10px 12px", fontSize: 13, color: "#94a3b8" }}>Nic nenalezeno.</div>}
          {filtered.map(o => (
            <div key={o.id} onMouseDown={e => e.preventDefault()} onClick={() => { onChange(o.id); setQ(""); setOpen(false); }}
              style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", background: String(o.id) === String(value) ? "#eff6ff" : "transparent" }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 12, color: "#64748b", fontWeight: 600, margin: "10px 0 4px" };
const inputStyle = { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, boxSizing: "border-box" };

// ─── Vystavení faktury — nejdřív se zeptá ručně/ze zakázky, pak editor položek.
// Stejná komponenta se používá i pro úpravu existující faktury (editInvoice) —
// stejný vzor jako u dodacích listů (jedna modálka pro přidání i editaci).
export default function InvoiceCreateFlow({ customers, contracts, costEntries, onSave, onClose, editInvoice, defaultConstantSymbol }) {
  const isEdit = !!editInvoice;
  const [step, setStep] = useState(isEdit ? "form" : "choose"); // "choose" | "pickContract" | "form"
  const [fromContractId, setFromContractId] = useState(editInvoice?.contract_id ? String(editInvoice.contract_id) : "");
  const [f, setF] = useState(() => editInvoice ? {
    customerId: editInvoice.customerId ? String(editInvoice.customerId) : "",
    invoiceType: editInvoice.invoice_type || "vydaná",
    isDeposit: !!editInvoice.is_deposit,
    orderRef: editInvoice.order_ref || "",
    issued: editInvoice.issued || new Date().toISOString().slice(0, 10),
    due: editInvoice.due || new Date().toISOString().slice(0, 10),
    status: editInvoice.status || "Čeká",
    customerIco: editInvoice.customer_ico || "", customerDic: editInvoice.customer_dic || "",
    discountPercent: editInvoice.discount_percent || 0,
    constantSymbol: editInvoice.constant_symbol || "", specificSymbol: editInvoice.specific_symbol || "",
    variableSymbol: editInvoice.variable_symbol || (editInvoice.number || "").replace(/\D/g, ""),
    items: (editInvoice.items && editInvoice.items.length) ? editInvoice.items : [{ desc: "", qty: 1, unit: "ks", price: "", vatRate: 21 }],
  } : {
    customerId: "", invoiceType: "vydaná", isDeposit: false, orderRef: "",
    issued: new Date().toISOString().slice(0, 10),
    due: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    status: "Čeká", customerIco: "", customerDic: "", discountPercent: 0,
    constantSymbol: defaultConstantSymbol || "", specificSymbol: "", variableSymbol: "",
    items: [{ desc: "", qty: 1, unit: "ks", price: "", vatRate: 21 }],
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const startManual = () => setStep("form");
  const startFromContract = () => setStep("pickContract");

  const applyContract = (cid) => {
    setFromContractId(cid);
    const contract = contracts.find(c => c.id === Number(cid));
    if (!contract) return;
    const rows = ["práce", "materiál", "doprava"].map(type => {
      const sum = (costEntries || []).filter(e => e.contract_id === contract.id && e.cost_type === type).reduce((s, e) => s + (Number(e.amount_client) || 0), 0);
      return sum > 0 ? { desc: `${type[0].toUpperCase() + type.slice(1)} — ${contract.name}`, qty: 1, unit: "kpl.", price: sum, vatRate: 21 } : null;
    }).filter(Boolean);
    setF(p => ({
      ...p,
      customerId: contract.customer_id ? String(contract.customer_id) : p.customerId,
      orderRef: contract.code || p.orderRef,
      items: rows.length ? rows : p.items,
    }));
    setStep("form");
  };

  const setItem = (i, patch) => setF(p => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, ...patch } : it) }));
  const addItem = () => setF(p => ({ ...p, items: [...p.items, { desc: "", qty: 1, unit: "ks", price: "", vatRate: 21 }] }));
  const removeItem = (i) => setF(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

  const { lines, total, totalTax } = computeInvoiceTotals(f.items);

  const submit = () => {
    if (!f.customerId || lines.length === 0) { alert("Vyber zákazníka a přidej aspoň jednu položku."); return; }
    onSave({
      ...(isEdit ? { id: editInvoice.id } : {}),
      customerId: f.customerId, invoiceType: f.invoiceType, isDeposit: f.isDeposit,
      orderRef: f.orderRef, issued: f.issued, due: f.due, status: f.status,
      customerIco: f.customerIco, customerDic: f.customerDic, discountPercent: Number(f.discountPercent) || 0,
      constantSymbol: f.constantSymbol, specificSymbol: f.specificSymbol, variableSymbol: f.variableSymbol,
      items: lines.map(({ desc, qty, unit, price, vatRate }) => ({ desc, qty, unit, price, vatRate })),
      amount: total - totalTax, tax: totalTax,
      contractId: fromContractId ? Number(fromContractId) : null,
    });
  };

  if (step === "choose") {
    return (
      <div style={overlayStyle}>
        <div style={{ ...boxStyle, width: 420 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Vystavit fakturu</div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Odkud se mají vzít položky faktury?</div>
          <button onClick={startManual} style={{ ...btnGhost, width: "100%", marginBottom: 10, padding: "12px 16px", textAlign: "left" }}>
            ✍️ Ručně — přidám položky sám
          </button>
          <button onClick={startFromContract} style={{ ...btnGhost, width: "100%", padding: "12px 16px", textAlign: "left" }}>
            📋 Ze zakázky — předvyplní se z nákladů zakázky
          </button>
          <button onClick={onClose} style={{ ...btnGhost, width: "100%", marginTop: 16, borderColor: "transparent", color: "#94a3b8" }}>Zrušit</button>
        </div>
      </div>
    );
  }

  if (step === "pickContract") {
    return (
      <div style={overlayStyle}>
        <div style={{ ...boxStyle, width: 420 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Vyber zakázku</div>
          <ContractPicker options={(contracts || []).map(c => ({ id: c.id, label: c.code ? `${c.name} (${c.code})` : c.name }))}
            value={fromContractId} onChange={applyContract} />
          <button onClick={() => setStep("choose")} style={{ ...btnGhost, width: "100%", marginTop: 16 }}>← Zpět</button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...boxStyle, width: 720 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>{isEdit ? `Upravit fakturu ${editInvoice.number}` : "Nová faktura"}</div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Zákazník</label>
            <select style={inputStyle} value={f.customerId} onChange={e => set("customerId", e.target.value)}>
              <option value="">— vyberte —</option>
              {(customers || []).map(c => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Typ</label>
            <select style={inputStyle} value={f.invoiceType} onChange={e => set("invoiceType", e.target.value)}>
              <option value="vydaná">📤 Vydaná</option>
              <option value="přijatá">📥 Přijatá</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>IČ zákazníka (volitelné)</label><input style={inputStyle} value={f.customerIco} onChange={e => set("customerIco", e.target.value)} /></div>
          <div><label style={labelStyle}>DIČ zákazníka (volitelné)</label><input style={inputStyle} value={f.customerDic} onChange={e => set("customerDic", e.target.value)} /></div>
          <div><label style={labelStyle}>Objednávka (volitelné)</label><input style={inputStyle} value={f.orderRef} onChange={e => set("orderRef", e.target.value)} /></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>Datum vystavení</label><input type="date" style={inputStyle} value={f.issued} onChange={e => set("issued", e.target.value)} /></div>
          <div><label style={labelStyle}>Datum splatnosti</label><input type="date" style={inputStyle} value={f.due} onChange={e => set("due", e.target.value)} /></div>
          <div><label style={labelStyle}>Stav</label>
            <select style={inputStyle} value={f.status} onChange={e => set("status", e.target.value)}>
              {["Čeká", "Zaplacena", "Po splatnosti"].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={f.isDeposit} onChange={e => set("isDeposit", e.target.checked)} />
            Zálohová faktura
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            Sleva v %:
            <input type="number" min="0" max="100" style={{ ...inputStyle, width: 80 }} value={f.discountPercent} onChange={e => set("discountPercent", e.target.value)} />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label style={labelStyle}>Variabilní symbol{isEdit ? "" : " (nepovinné — jinak číslo faktury)"}</label>
            <input style={inputStyle} value={f.variableSymbol} onChange={e => set("variableSymbol", e.target.value)}
              placeholder={isEdit ? "" : "doplní se automaticky"} />
          </div>
          <div><label style={labelStyle}>Konstantní symbol</label><input style={inputStyle} value={f.constantSymbol} onChange={e => set("constantSymbol", e.target.value)} /></div>
          <div><label style={labelStyle}>Specifický symbol</label><input style={inputStyle} value={f.specificSymbol} onChange={e => set("specificSymbol", e.target.value)} /></div>
        </div>

        <div style={{ fontWeight: 700, fontSize: 12, color: "#64748b", marginTop: 16, marginBottom: 6 }}>POLOŽKY</div>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Popis", "Počet", "M.j.", "Cena/m.j.", "DPH", "Celkem", ""].map(h => <th key={h} style={{ padding: "6px 8px", fontSize: 10, color: "#64748b", textAlign: "left" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: 4 }}><input style={{ ...inputStyle, padding: "5px 8px" }} value={f.items[i].desc} onChange={e => setItem(i, { desc: e.target.value })} /></td>
                  <td style={{ padding: 4, width: 60 }}><input type="number" style={{ ...inputStyle, padding: "5px 8px" }} value={f.items[i].qty} onChange={e => setItem(i, { qty: e.target.value })} /></td>
                  <td style={{ padding: 4, width: 70 }}>
                    <select style={{ ...inputStyle, padding: "5px 8px" }} value={f.items[i].unit} onChange={e => setItem(i, { unit: e.target.value })}>
                      {ITEM_UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 4, width: 90 }}><input type="number" style={{ ...inputStyle, padding: "5px 8px" }} value={f.items[i].price} onChange={e => setItem(i, { price: e.target.value })} /></td>
                  <td style={{ padding: 4, width: 70 }}>
                    <select style={{ ...inputStyle, padding: "5px 8px" }} value={f.items[i].vatRate} onChange={e => setItem(i, { vatRate: Number(e.target.value) })}>
                      {VAT_RATES.map(r => <option key={r} value={r}>{r} %</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "4px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtKc2(l.celkem)} Kč</td>
                  <td style={{ padding: 4 }}><button onClick={() => removeItem(i)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 15 }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addItem} style={{ ...btnGhost, marginTop: 8, padding: "6px 14px", fontSize: 12 }}>+ Přidat řádek</button>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14, gap: 24, alignItems: "baseline" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>DPH celkem: {fmtKc2(totalTax)} Kč</span>
          <span style={{ fontSize: 18, fontWeight: 800 }}>Celkem k úhradě: {fmtKc2(getDiscountedTotal(total, f.discountPercent))} Kč</span>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={submit} style={btnPrimary}>{isEdit ? "Uložit změny" : "Vystavit fakturu"}</button>
          <button onClick={onClose} style={btnGhost}>Zrušit</button>
        </div>
      </div>
    </div>
  );
}

// ─── Náhled faktury — vykreslí přesně to, co jde do PDF, přímo na obrazovce
export function InvoicePreviewModal({ invoice, customer, onClose }) {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    buildInvoicePreview(invoice, customer)
      .then(h => { if (!cancelled) setHtml(h); })
      .catch(e => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [invoice, customer]);

  const handleDownload = async () => {
    setBusy(true);
    try { await downloadInvoicePDF(invoice, customer); }
    catch (e) { alert("Nepodařilo se vygenerovat PDF: " + (e?.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={overlayStyle}>
      <div style={{ ...boxStyle, width: 860, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 700 }}>Náhled faktury {invoice.number}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleDownload} disabled={busy || !html} style={btnPrimary}>{busy ? "…" : "⬇ Stáhnout PDF"}</button>
            <button onClick={onClose} style={btnGhost}>Zavřít</button>
          </div>
        </div>
        <div style={{ maxHeight: "80vh", overflowY: "auto", background: "#94a3b8", padding: 20 }}>
          {error && <div style={{ color: "#fff", background: "#ef4444", padding: 12, borderRadius: 8 }}>Náhled se nepodařilo vytvořit: {error}</div>}
          {!html && !error && <div style={{ color: "#fff", textAlign: "center", padding: 40 }}>Načítám náhled…</div>}
          {html && (
            <div style={{ width: 595.27 * 4 / 3, margin: "0 auto", background: "#fff", boxSizing: "border-box", boxShadow: "0 4px 24px #00000033" }}
              dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle = { position: "fixed", inset: 0, background: "#00000066", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 };
const boxStyle = { background: "#fff", borderRadius: 14, padding: 24, maxWidth: "92vw", maxHeight: "88vh", overflowY: "auto", boxSizing: "border-box" };
const btnPrimary = { background: "#F5C518", color: "#1A1A1A", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhost = { background: "transparent", color: "#2E9BE0", border: "1px solid #2E9BE0", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
