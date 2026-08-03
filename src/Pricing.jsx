import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";

const S = {
  app:      { fontFamily: "'DM Sans', sans-serif", background: "#080b12", minHeight: "100vh", color: "#e2e8f0", padding: "20px 28px" },
  card:     { background: "#0f1320", borderRadius: 12, padding: 22, border: "1px solid #1a2035", marginBottom: 16 },
  input:    { background: "#0a0d14", border: "1px solid #252d45", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" },
  select:   { background: "#0a0d14", border: "1px solid #252d45", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box" },
  label:    { fontSize: 11, color: "#64748b", marginBottom: 3, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" },
  btn:      (c = "#2E9BE0") => ({ background: c, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  btnGhost: { background: "transparent", color: "#2E9BE0", border: "1px solid #2E9BE0", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  th:       { textAlign: "left", padding: "7px 8px", fontSize: 11, color: "#64748b", borderBottom: "1px solid #1a2035", textTransform: "uppercase", letterSpacing: "0.05em" },
  td:       { padding: "5px 8px", fontSize: 13, color: "#e2e8f0" },
};

const fmtKc = (n) => (Number(n) || 0).toLocaleString("cs-CZ") + " Kč";
const uid = () => Date.now() + Math.random();

const PRAZDNA_NABIDKA = () => ({
  people: [],
  vehicles: [],
  accommodation: [],
  materials: [],
  notes: "",
});

// ─── Obecná editovatelná tabulka řádků ─────────────────────────────────────
function RowsTable({ columns, rows, setRows, addLabel }) {
  const update = (id, key, value) => setRows(rows.map(r => r.id === id ? { ...r, [key]: value } : r));
  const remove = (id) => setRows(rows.filter(r => r.id !== id));
  const add = () => setRows([...rows, { id: uid(), ...Object.fromEntries(columns.map(c => [c.key, c.type === "number" ? "" : ""])) }]);

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map(c => <th key={c.key} style={S.th}>{c.label}</th>)}
            <th style={S.th}>Náklad</th>
            <th style={S.th}>K fakturaci</th>
            <th style={S.th}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            return (
              <tr key={r.id}>
                {columns.map(c => (
                  <td key={c.key} style={S.td}>
                    <input
                      type={c.type || "text"}
                      style={{ ...S.input, marginBottom: 0, width: c.width || "100%" }}
                      placeholder={c.placeholder || ""}
                      value={r[c.key] ?? ""}
                      onChange={e => update(r.id, c.key, e.target.value)}
                    />
                  </td>
                ))}
                <td style={{ ...S.td, color: "#f87171", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtKc(columns.costCalc(r))}</td>
                <td style={{ ...S.td, color: "#34d399", fontWeight: 700, whiteSpace: "nowrap" }}>{fmtKc(columns.sellCalc(r))}</td>
                <td style={S.td}><button onClick={() => remove(r.id)} style={{ ...S.btn("#ef4444"), padding: "4px 9px", fontSize: 11 }}>✕</button></td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length + 3} style={{ ...S.td, color: "#334155", padding: "12px 8px" }}>Zatím žádné položky.</td></tr>
          )}
        </tbody>
      </table>
      <button onClick={add} style={{ ...S.btnGhost, marginTop: 10, padding: "6px 14px", fontSize: 12 }}>+ {addLabel}</button>
    </div>
  );
}

export default function Pricing({ customers, currentUser, onConvertToDeal }) {
  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState("Návrh");
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("quotes").select("*").order("updated_at", { ascending: false }).then(({ data: d }) => setQuotes(d || []));
  }, []);

  const openQuote = (q) => {
    setActiveId(q.id);
    setName(q.name);
    setCustomerId(q.customer_id ? String(q.customer_id) : "");
    setStatus(q.status || "Návrh");
    setData({ ...PRAZDNA_NABIDKA(), ...(q.data || {}) });
  };

  const newQuote = () => {
    setActiveId(null);
    setName("");
    setCustomerId("");
    setStatus("Návrh");
    setData(PRAZDNA_NABIDKA());
  };

  const closeQuote = () => { setActiveId(null); setData(null); };

  // ── Výpočty ──
  const peopleCost = (r) => (Number(r.days) || 0) * (Number(r.costPerDay) || 0);
  const peopleSell = (r) => (Number(r.days) || 0) * (Number(r.sellPerDay) || 0);
  const vehicleCost = (r) => (Number(r.km) || 0) * (Number(r.costPerKm) || 0);
  const vehicleSell = (r) => (Number(r.km) || 0) * (Number(r.sellPerKm) || 0);
  const accomCost = (r) => (Number(r.nights) || 0) * (Number(r.costPerNight) || 0) * (Number(r.people) || 1);
  const accomSell = (r) => (Number(r.nights) || 0) * (Number(r.sellPerNight) || 0) * (Number(r.people) || 1);
  const matCost = (r) => (Number(r.quantity) || 0) * (Number(r.costPerUnit) || 0);
  const matSell = (r) => (Number(r.quantity) || 0) * (Number(r.sellPerUnit) || 0);

  const sumOf = (rows, fn) => rows.reduce((s, r) => s + fn(r), 0);

  const laborCost = data ? sumOf(data.people, peopleCost) : 0;
  const laborSell = data ? sumOf(data.people, peopleSell) : 0;
  const travelCost = data ? sumOf(data.vehicles, vehicleCost) : 0;
  const travelSell = data ? sumOf(data.vehicles, vehicleSell) : 0;
  const accomTotalCost = data ? sumOf(data.accommodation, accomCost) : 0;
  const accomTotalSell = data ? sumOf(data.accommodation, accomSell) : 0;
  const materialCost = data ? sumOf(data.materials, matCost) : 0;
  const materialSell = data ? sumOf(data.materials, matSell) : 0;

  const totalCost = laborCost + travelCost + accomTotalCost + materialCost;
  const totalSell = laborSell + travelSell + accomTotalSell + materialSell;
  const margin = totalSell - totalCost;
  const marginPct = totalSell ? Math.round((margin / totalSell) * 1000) / 10 : 0;

  const save = async () => {
    if (!name.trim()) { alert("Zadejte název nabídky."); return; }
    setSaving(true);
    const row = {
      name: name.trim(),
      customer_id: customerId ? Number(customerId) : null,
      status,
      data,
      updated_at: new Date().toISOString(),
    };
    if (activeId) {
      await supabase.from("quotes").update(row).eq("id", activeId);
      setQuotes(quotes.map(q => q.id === activeId ? { ...q, ...row } : q));
    } else {
      const { data: inserted } = await supabase.from("quotes").insert(row).select().single();
      if (inserted) { setQuotes([inserted, ...quotes]); setActiveId(inserted.id); }
    }
    setSaving(false);
  };

  const deleteQuote = async (id) => {
    if (!confirm("Smazat tuto nabídku?")) return;
    await supabase.from("quotes").delete().eq("id", id);
    setQuotes(quotes.filter(q => q.id !== id));
    if (activeId === id) closeQuote();
  };

  const convertToDeal = async () => {
    if (!activeId) { alert("Nejdřív nabídku uložte."); return; }
    if (!onConvertToDeal) return;
    const cust = customers.find(c => c.id === Number(customerId));
    const { data: dealRow } = await supabase.from("deals").insert({
      name, value: Math.round(totalSell), stage: "Nový",
      customer_id: customerId ? Number(customerId) : null,
      assigned_to: currentUser?.name || "",
    }).select().single();
    if (dealRow) {
      await supabase.from("quotes").update({ deal_id: dealRow.id, status: "Odesláno" }).eq("id", activeId);
      setQuotes(quotes.map(q => q.id === activeId ? { ...q, deal_id: dealRow.id, status: "Odesláno" } : q));
      onConvertToDeal(dealRow, cust);
    }
  };

  const printQuote = () => {
    const cust = customers.find(c => c.id === Number(customerId));
    const rowsHtml = (title, rows, costFn, sellFn, cols) => rows.length === 0 ? "" : `
      <h3>${title}</h3>
      <table><thead><tr>${cols.map(c => `<th>${c.label}</th>`).join("")}<th>Cena</th></tr></thead><tbody>
      ${rows.map(r => `<tr>${cols.map(c => `<td>${r[c.key] ?? ""}</td>`).join("")}<td>${fmtKc(sellFn(r))}</td></tr>`).join("")}
      </tbody></table>`;
    const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Nabídka – " + name + "</title>" +
      "<style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:22px;margin-bottom:2px}h2{font-size:13px;color:#555;font-weight:normal;margin-bottom:20px}h3{font-size:14px;margin:18px 0 6px}table{width:100%;border-collapse:collapse;margin-bottom:10px}th{background:#0E3B5E;color:#fff;padding:6px 10px;text-align:left;font-size:12px}td{padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px}.total{font-size:18px;font-weight:bold;margin-top:16px;text-align:right}@media print{body{padding:16px}}</style>" +
      "</head><body>" +
      "<h1>Nabídka – " + name + "</h1>" +
      "<h2>" + (cust ? cust.name : "") + " · " + new Date().toLocaleDateString("cs-CZ") + "</h2>" +
      rowsHtml("Práce", data.people, peopleCost, peopleSell, [{ key: "name", label: "Osoba" }, { key: "days", label: "Počet dní" }]) +
      rowsHtml("Doprava", data.vehicles, vehicleCost, vehicleSell, [{ key: "name", label: "Vozidlo / jízda" }, { key: "km", label: "Km" }]) +
      rowsHtml("Ubytování", data.accommodation, accomCost, accomSell, [{ key: "name", label: "Místo" }, { key: "nights", label: "Nocí" }, { key: "people", label: "Osob" }]) +
      rowsHtml("Materiál", data.materials, matCost, matSell, [{ key: "name", label: "Položka" }, { key: "quantity", label: "Množství" }, { key: "unit", label: "Jednotka" }]) +
      "<div class='total'>Celkem k fakturaci: " + fmtKc(totalSell) + "</div>" +
      (data.notes ? "<p style='margin-top:20px;white-space:pre-wrap;font-size:13px'>" + data.notes + "</p>" : "") +
      "<script>window.onload=function(){window.print();}</script></body></html>";
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  };

  const filtered = quotes.filter(q => !search || (q.name || "").toLowerCase().includes(search.toLowerCase()));

  // ─── SEZNAM NABÍDEK ──────────────────────────────────────────────────────
  if (!data) {
    return (
      <div style={S.app}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0 }}>💰 Nacenění</h1>
          <button style={S.btn()} onClick={newQuote}>+ Nová nabídka</button>
        </div>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 18 }}>Sestav nabídku po dnech (lidé, doprava, ubytování, materiál) a následně ji překlop na obchodní případ.</p>
        <input style={{ ...S.input, marginBottom: 16, maxWidth: 340 }} placeholder="Hledat nabídku..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && <div style={{ color: "#334155", fontSize: 13 }}>Zatím žádné nabídky.</div>}
          {filtered.map(q => {
            const cust = customers.find(c => c.id === q.customer_id);
            return (
              <div key={q.id} onClick={() => openQuote(q)}
                style={{ ...S.card, marginBottom: 0, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{q.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{cust ? cust.name : "bez zákazníka"} · {q.status}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteQuote(q.id); }} style={{ ...S.btn("#ef4444"), padding: "5px 12px", fontSize: 11 }}>✕</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── EDITOR NABÍDKY ──────────────────────────────────────────────────────
  return (
    <div style={S.app}>
      <button onClick={closeQuote} style={{ ...S.btnGhost, padding: "6px 14px", marginBottom: 14 }}>← Zpět na seznam</button>

      <div style={{ ...S.card, display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
        <div><label style={S.label}>Název nabídky</label><input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="např. FVE Novák 9kWp" /></div>
        <div>
          <label style={S.label}>Zákazník</label>
          <select style={S.select} value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">— bez zákazníka —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Stav</label>
          <select style={S.select} value={status} onChange={e => setStatus(e.target.value)}>
            {["Návrh", "Odesláno", "Schváleno", "Zamítnuto"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 10 }}>👷 Lidé — cena za den</div>
        <RowsTable
          addLabel="Přidat osobu"
          rows={data.people}
          setRows={rows => setData({ ...data, people: rows })}
          columns={Object.assign(
            [
              { key: "name", label: "Osoba", width: "100%" },
              { key: "days", label: "Počet dní", type: "number", width: 80 },
              { key: "costPerDay", label: "Cena/den náklad", type: "number", width: 110 },
              { key: "sellPerDay", label: "Cena/den klient", type: "number", width: 110 },
            ],
            { costCalc: peopleCost, sellCalc: peopleSell }
          )}
        />
      </div>

      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 10 }}>🚗 Doprava — km na vozidlo/jízdu <span style={{ color: "#64748b", fontWeight: 400, fontSize: 12 }}>(pokud jede víc lidí jedním autem, stačí jeden řádek)</span></div>
        <RowsTable
          addLabel="Přidat jízdu"
          rows={data.vehicles}
          setRows={rows => setData({ ...data, vehicles: rows })}
          columns={Object.assign(
            [
              { key: "name", label: "Vozidlo / jízda", width: "100%" },
              { key: "km", label: "Km", type: "number", width: 80 },
              { key: "costPerKm", label: "Kč/km náklad", type: "number", width: 100 },
              { key: "sellPerKm", label: "Kč/km klient", type: "number", width: 100 },
            ],
            { costCalc: vehicleCost, sellCalc: vehicleSell }
          )}
        />
      </div>

      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 10 }}>🏨 Ubytování</div>
        <RowsTable
          addLabel="Přidat ubytování"
          rows={data.accommodation}
          setRows={rows => setData({ ...data, accommodation: rows })}
          columns={Object.assign(
            [
              { key: "name", label: "Místo", width: "100%" },
              { key: "nights", label: "Nocí", type: "number", width: 70 },
              { key: "people", label: "Osob", type: "number", width: 70 },
              { key: "costPerNight", label: "Cena/noc náklad", type: "number", width: 110 },
              { key: "sellPerNight", label: "Cena/noc klient", type: "number", width: 110 },
            ],
            { costCalc: accomCost, sellCalc: accomSell }
          )}
        />
      </div>

      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 10 }}>📦 Materiál</div>
        <RowsTable
          addLabel="Přidat materiál"
          rows={data.materials}
          setRows={rows => setData({ ...data, materials: rows })}
          columns={Object.assign(
            [
              { key: "name", label: "Položka", width: "100%" },
              { key: "quantity", label: "Množství", type: "number", width: 80 },
              { key: "unit", label: "Jednotka", width: 70 },
              { key: "costPerUnit", label: "Cena/j náklad", type: "number", width: 100 },
              { key: "sellPerUnit", label: "Cena/j klient", type: "number", width: 100 },
            ],
            { costCalc: matCost, sellCalc: matSell }
          )}
        />
      </div>

      <div style={S.card}>
        <label style={S.label}>Poznámka k nabídce</label>
        <textarea style={{ ...S.input, minHeight: 70, resize: "vertical" }} value={data.notes} onChange={e => setData({ ...data, notes: e.target.value })} />
      </div>

      <div style={{ ...S.card, background: "#0a0d14" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div><div style={S.label}>Celkem náklad</div><div style={{ fontSize: 20, fontWeight: 800, color: "#f87171" }}>{fmtKc(totalCost)}</div></div>
          <div><div style={S.label}>Celkem k fakturaci</div><div style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>{fmtKc(totalSell)}</div></div>
          <div><div style={S.label}>Marže</div><div style={{ fontSize: 20, fontWeight: 800, color: margin >= 0 ? "#34d399" : "#f87171" }}>{fmtKc(margin)}</div></div>
          <div><div style={S.label}>Marže %</div><div style={{ fontSize: 20, fontWeight: 800, color: margin >= 0 ? "#34d399" : "#f87171" }}>{marginPct} %</div></div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={S.btn("#34d399")} onClick={save} disabled={saving}>{saving ? "Ukládám…" : "💾 Uložit nabídku"}</button>
          <button style={S.btnGhost} onClick={printQuote}>🖨️ Vygenerovat nabídku</button>
          {activeId && <button style={S.btn("#F5C518")} onClick={convertToDeal}>➡️ Převést na obchodní případ</button>}
        </div>
      </div>
    </div>
  );
}
