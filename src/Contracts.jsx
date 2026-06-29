import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";

// ─── MINI KALENDÁŘ ───────────────────────────────────────────────────────────

const CZ_MONTHS = ["Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"];
const CZ_DAYS   = ["Po","Út","St","Čt","Pá","So","Ne"];

function MiniCalendar({ value, onChange, onClose }) {
  const today = new Date();
  const initD = value ? new Date(value + "T00:00:00") : today;
  const [view, setView] = useState({ year: initD.getFullYear(), month: initD.getMonth() });

  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const firstDay    = new Date(view.year, view.month, 1).getDay();
  const startOffset = (firstDay + 6) % 7;
  const cells = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const selD = value ? new Date(value + "T00:00:00") : null;

  const pick = (day) => {
    const m = String(view.month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    onChange(`${view.year}-${m}-${d}`);
    onClose?.();
  };

  const prev = () => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  const next = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0  } : { ...v, month: v.month + 1 });

  return (
    <div style={{ background: "#0f1623", border: "1px solid #252d45", borderRadius: 10, padding: 12, width: 232, userSelect: "none", boxShadow: "0 8px 32px #00000088" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={prev} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>‹</button>
        <span style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 13 }}>{CZ_MONTHS[view.month]} {view.year}</span>
        <button onClick={next} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {CZ_DAYS.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, color: "#475569", paddingBottom: 4, fontWeight: 600 }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const isToday = day === today.getDate() && view.month === today.getMonth() && view.year === today.getFullYear();
          const isSel   = selD && day === selD.getDate() && view.month === selD.getMonth() && view.year === selD.getFullYear();
          return (
            <div key={i} onClick={() => pick(day)}
              style={{ textAlign: "center", fontSize: 12, padding: "5px 2px", borderRadius: 6, cursor: "pointer",
                background: isSel ? "#6366f1" : isToday ? "#6366f122" : "transparent",
                color: isSel ? "#fff" : isToday ? "#818cf8" : "#cbd5e1",
                fontWeight: isSel || isToday ? 700 : 400 }}>
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DatePicker({ value, onChange, placeholder = "Vyberte datum", style = {} }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: "100%", padding: "9px 12px", background: "#0a0d14", border: "1px solid #252d45", borderRadius: 8,
          color: value ? "#e2e8f0" : "#475569", fontSize: 13, cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", gap: 8 }}>
        <span>📅</span>
        <span>{value || placeholder}</span>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 9999 }}>
          <MiniCalendar value={value} onChange={onChange} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}


// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmtKc = (v) => `${Number(v || 0).toLocaleString("cs-CZ")} Kč`;
const pad = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("cs-CZ") : "—";
const today = () => new Date().toISOString().slice(0, 10);

const COST_TYPES = ["práce", "materiál", "doprava"];
const UNITS = ["h", "ks", "km", "m", "m²", "m³", "t", "l", "den", "pauš."];

const STATUS_COLORS = {
  "Nová":        { bg: "#1a2035", color: "#60a5fa", border: "#60a5fa33" },
  "Probíhá":     { bg: "#1a2035", color: "#6366f1", border: "#6366f133" },
  "Dokončena":   { bg: "#1a2035", color: "#34d399", border: "#34d39933" },
  "Fakturována": { bg: "#1a2035", color: "#f59e0b", border: "#f59e0b33" },
};

// Barevný indikátor: zelená=ušetřili, oranžová=přesně, červená=přesáhli
function budgetColor(actual, budget) {
  if (budget <= 0) return null;
  if (actual < budget - 1) return "#34d399"; // zelená
  if (actual > budget + 1) return "#f87171"; // červená
  return "#f59e0b";                            // oranžová
}

function budgetLabel(actual, budget) {
  if (budget <= 0) return null;
  const diff = budget - actual;
  if (diff > 1)  return `Ušetřeno ${fmtKc(diff)}`;
  if (diff < -1) return `Překročeno o ${fmtKc(Math.abs(diff))}`;
  return "Přesně dle zadání";
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const S = {
  card:     { background: "#0f1320", borderRadius: 12, padding: 22, border: "1px solid #1a2035" },
  input:    { background: "#0a0d14", border: "1px solid #252d45", borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box", marginBottom: 10 },
  select:   { background: "#0a0d14", border: "1px solid #252d45", borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box", marginBottom: 10 },
  label:    { fontSize: 11, color: "#475569", marginBottom: 3, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" },
  btn:      (c = "#6366f1") => ({ background: c, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  btnGhost: { background: "transparent", color: "#6366f1", border: "1px solid #6366f1", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  modal:    { position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  modalBox: { background: "#0f1320", borderRadius: 16, padding: 28, width: 500, border: "1px solid #252d45", maxHeight: "90vh", overflowY: "auto" },
  th:       { textAlign: "left", padding: "8px 10px", fontSize: 11, color: "#475569", borderBottom: "1px solid #1a2035", textTransform: "uppercase", letterSpacing: "0.06em" },
  td:       { padding: "10px 10px", fontSize: 13, borderBottom: "1px solid #1a2035", color: "#94a3b8" },
  tag:      (c) => ({ background: c + "22", color: c, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700, display: "inline-block" }),
  badge:    (c) => ({ background: c + "22", color: c, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }),
  statCard: (c) => ({ background: "#0f1320", borderRadius: 12, padding: "16px 20px", border: `1px solid ${c}33` }),
  statLabel: { fontSize: 11, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" },
  statValue: (c) => ({ fontSize: 22, fontWeight: 800, color: c }),
};

// ─── HLAVNÍ KOMPONENTA ────────────────────────────────────────────────────────
export default function Contracts({ customers, employees, currentUser, initialDeal }) {
  const [contracts, setContracts] = useState([]);
  const [entries, setEntries] = useState([]);       // contract_cost_entries
  const [billingSummaries, setBillingSummaries] = useState([]);
  const [contractMessages, setContractMessages] = useState([]);
  const [globalTasks, setGlobalTasks] = useState([]);
  const [newCMsg, setNewCMsg] = useState("");
  const [photos, setPhotos] = useState([]);
  const [ctasks, setCtasks] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [activeTab, setActiveTab] = useState({});       // {contractId: tab}
  const [detailView, setDetailView] = useState({});     // {contractId: "prehled"|"popis"}
  const [modal, setModal] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("vše");
  const closeModal = () => setModal(null);

  // ── Load ──
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [c, e, p, t, att, bs, msgs, globalTasksData] = await Promise.all([
        supabase.from("contracts").select("*").order("id"),
        supabase.from("contract_cost_entries").select("*").order("date"),
        supabase.from("contract_photos").select("*").order("date"),
        supabase.from("contract_tasks").select("*").order("id"),
        supabase.from("attendance").select("*").order("date"),
        supabase.from("contract_billing_summaries").select("*").order("period_year,period_month"),
        supabase.from("contract_messages").select("*").order("created_at"),
        supabase.from("tasks").select("*").order("id"),
      ]);
      setContracts(c.data || []);
      setEntries(e.data || []);
      setPhotos(p.data || []);
      setCtasks(t.data || []);
      setAttendance((att.data || []).map(x => ({ ...x, employeeId: x.employee_id, contractId: x.contract_id })));
      setBillingSummaries(bs.data || []);
      setContractMessages(msgs.data || []);
      setGlobalTasks(globalTasksData.data || []);
      setLoading(false);
      // Pokud přicházíme z Dealu — rovnou otevřeme modal pro novou zakázku
      if (initialDeal) setModal({ type: "newContract", deal: initialDeal });
    };
    load();
  }, []);

  // ── Výpočty pro zakázku ──
  function contractSums(cid) {
    const e = entries.filter(x => x.contract_id === cid);
    const sum = (type, isExtra) =>
      e.filter(x => x.cost_type === type && x.is_extra === isExtra)
       .reduce((s, x) => s + Number(x.amount_cost || 0), 0);
    const sumClient = (type, isExtra) =>
      e.filter(x => x.cost_type === type && x.is_extra === isExtra)
       .reduce((s, x) => s + Number(x.amount_client || 0), 0);
    return {
      prace:         sum("práce", false),
      material:      sum("materiál", false),
      doprava:       sum("doprava", false),
      vicePrace:     sum("práce", true),
      viceMaterial:  sum("materiál", true),
      viceDoprava:   sum("doprava", true),
      praceClient:   sumClient("práce", false),
      viceClient:    sumClient("práce", true) + sumClient("materiál", true) + sumClient("doprava", true),
    };
  }

  function contractProfit(contract) {
    const s = contractSums(contract.id);
    const totalCost = s.prace + s.material + s.doprava + s.vicePrace + s.viceMaterial + s.viceDoprava;
    const totalRevenue = Number(contract.price || 0) + s.viceClient;
    return { totalCost, totalRevenue, profit: totalRevenue - totalCost };
  }

  // ── Nová zakázka ──
  async function saveNewContract(form) {
    const { data: row, error } = await supabase.from("contracts").insert({
      deal_id:     form.dealId || null,
      customer_id: Number(form.customerId) || null,
      code:        form.code || "",
      name:        form.name,
      status:      form.status,
      price:       Number(form.price) || 0,
      notes:       form.notes,
      address:     form.address || "",
      budget_prace:    Number(form.budgetPrace) || 0,
      budget_material: Number(form.budgetMaterial) || 0,
      budget_doprava:  Number(form.budgetDoprava) || 0,
      budget_vice_prace:    Number(form.budgetVicePrace) || 0,
      budget_vice_material: Number(form.budgetViceMaterial) || 0,
      budget_vice_doprava:  Number(form.budgetViceDoprava) || 0,
    }).select().single();
    if (error) { alert("Chyba při ukládání zakázky: " + error.message); return; }
    if (row) setContracts([...contracts, row]);
    closeModal();
  }

  // ── Nová nákladová položka ──
  async function saveCostEntry(form) {
    const { data: row } = await supabase.from("contract_cost_entries").insert({
      contract_id:      form.contractId,
      cost_type:        form.costType,
      is_extra:         form.isExtra,
      date:             form.date,
      description:      form.description,
      quantity:         Number(form.quantity) || 1,
      unit:             form.unit,
      unit_price_cost:  Number(form.unitPriceCost) || 0,
      unit_price_client: Number(form.unitPriceClient) || 0,
      employee_id:      form.employeeId ? Number(form.employeeId) : null,
    }).select().single();
    if (row) setEntries([...entries, row]);
    closeModal();
  }

  // ── Smazat nákladovou položku ──
  async function deleteEntry(id) {
    await supabase.from("contract_cost_entries").delete().eq("id", id);
    setEntries(entries.filter(e => e.id !== id));
  }

  // ── Schválit / odschválit položku (zaškrtnutí k fakturaci) ──
  async function toggleApproved(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    const newVal = !entry.approved;
    await supabase.from("contract_cost_entries").update({
      approved: newVal,
      approved_at: newVal ? new Date().toISOString() : null,
    }).eq("id", id);
    setEntries(entries.map(e => e.id === id ? { ...e, approved: newVal, approved_at: newVal ? new Date().toISOString() : null } : e));
  }

  // ── Označit celou skupinu jako fakturovanou ──
  async function markMonthBilled(contractId, year, month) {
    const monthEntries = entries.filter(e =>
      e.contract_id === contractId &&
      e.approved &&
      !e.billed &&
      e.date?.startsWith(`${year}-${String(month).padStart(2, "0")}`)
    );
    if (monthEntries.length === 0) return;
    const ids = monthEntries.map(e => e.id);
    await supabase.from("contract_cost_entries")
      .update({ billed: true, billed_at: new Date().toISOString() })
      .in("id", ids);
    const totalCost = monthEntries.reduce((s, e) => s + Number(e.amount_cost || 0), 0);
    const totalClient = monthEntries.reduce((s, e) => s + Number(e.amount_client || 0), 0);
    await supabase.from("contract_billing_summaries").upsert({
      contract_id: contractId, period_year: year, period_month: month,
      total_cost: totalCost, total_client: totalClient,
    }, { onConflict: "contract_id,period_year,period_month" });
    setEntries(entries.map(e => ids.includes(e.id) ? { ...e, billed: true } : e));
    // Reload summaries
    const { data } = await supabase.from("contract_billing_summaries").select("*").order("period_year,period_month");
    setBillingSummaries(data || []);
  }

  // ── Update budget zakázky ──
  async function updateBudget(contractId, field, newVal, oldVal) {
    await supabase.from("contracts").update({ [field]: Number(newVal) }).eq("id", contractId);
    await supabase.from("contract_budget_history").insert({
      contract_id: contractId, section: field,
      old_value: oldVal, new_value: Number(newVal), note: "",
    });
    setContracts(contracts.map(c => c.id === contractId ? { ...c, [field]: Number(newVal) } : c));
  }

  // ── Update status zakázky ──
  async function updateStatus(contractId, status) {
    await supabase.from("contracts").update({ status }).eq("id", contractId);
    setContracts(contracts.map(c => c.id === contractId ? { ...c, status } : c));
  }

  // ── Úkoly zakázky ──
  async function saveTask(form) {
    const { data: row } = await supabase.from("contract_tasks").insert({
      contract_id:      form.contractId,
      title:            form.title,
      done:             false,
      due:              form.due || null,
      assignee_id:      form.assigneeId ? Number(form.assigneeId) : null,
      assigned_to_name: form.assigned_to_name || "",
      created_by:       form.created_by || "",
      photo_url:        form.photo_url || "",
    }).select().single();
    if (row) setCtasks([...ctasks, row]);
    closeModal();
  }

  async function toggleTask(id) {
    const t = ctasks.find(x => x.id === id);
    if (!t) return;
    await supabase.from("contract_tasks").update({ done: !t.done }).eq("id", id);
    setCtasks(ctasks.map(x => x.id === id ? { ...x, done: !x.done } : x));
  }

  // ── Upload fotky ──
  const fileRef = useRef();
  async function uploadPhoto(contractId, file, description) {
    const ext = file.name.split(".").pop();
    const path = `${contractId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("zakazky-fotky").upload(path, file);
    if (error) { alert("Chyba uploadu: " + error.message); return; }
    const { data: urlData } = supabase.storage.from("zakazky-fotky").getPublicUrl(path);
    const { data: row } = await supabase.from("contract_photos").insert({
      contract_id: contractId, date: today(),
      storage_path: path, url: urlData.publicUrl,
      description, uploaded_by: currentUser?.employeeId || null,
    }).select().single();
    if (row) setPhotos([...photos, row]);
    closeModal();
  }

  if (loading) return <div style={{ color: "#475569", padding: 32 }}>Načítám zakázky...</div>;

  const getTab = (cid) => activeTab[cid] || "naklady";
  const setTab = (cid, tab) => setActiveTab({ ...activeTab, [cid]: tab });
  const getView = (cid) => detailView[cid] || "prehled";
  const setView = (cid, v) => setDetailView(prev => ({ ...prev, [cid]: v }));

  return (
    <>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: 0 }}>Zakázky</h1>
        <button style={S.btn()} onClick={() => setModal({ type: "newContract" })}>+ Nová zakázka</button>
      </div>

      {/* STATS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Celkem zakázek", value: contracts.length, color: "#6366f1" },
          { label: "Probíhá", value: contracts.filter(c => c.status === "Probíhá").length, color: "#60a5fa" },
          { label: "Celkový obrat", value: fmtKc(contracts.reduce((s, c) => s + Number(c.price || 0), 0)), color: "#34d399" },
          { label: "Celkový zisk", value: fmtKc(contracts.reduce((s, c) => s + contractProfit(c).profit, 0)), color: "#f59e0b" },
        ].map(st => (
          <div key={st.label} style={S.statCard(st.color)}>
            <div style={S.statLabel}>{st.label}</div>
            <div style={S.statValue(st.color)}>{st.value}</div>
          </div>
        ))}
      </div>

      {/* FILTR */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <input
          style={{ ...S.input, marginBottom: 0, flex: 1, fontSize: 13 }}
          placeholder="🔍 Hledat zakázku..."
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)} />
        {["vše","Nová","Probíhá","Dokončena","Fakturována"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid", fontSize: 12, cursor: "pointer", fontWeight: filterStatus === s ? 700 : 400,
              background: filterStatus === s ? "#6366f1" : "#1a2035",
              color: filterStatus === s ? "#fff" : "#94a3b8",
              borderColor: filterStatus === s ? "#6366f1" : "#252d45" }}>
            {s === "vše" ? "Vše" : s}
          </button>
        ))}
      </div>

      {/* SEZNAM ZAKÁZEK */}
      {contracts.length === 0 && (
        <div style={{ ...S.card, color: "#475569", textAlign: "center", padding: 40 }}>
          Žádné zakázky. Klikněte "+ Nová zakázka" nebo převeďte obchodní případ.
        </div>
      )}

      {contracts.filter(c => {
        const q = searchQ.toLowerCase();
        const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q) || c.address?.toLowerCase().includes(q);
        const matchStatus = filterStatus === "vše" || c.status === filterStatus;
        return matchSearch && matchStatus;
      }).map(contract => {
        const cust = customers.find(c => c.id === contract.customer_id);
        const sums = contractSums(contract.id);
        const { totalCost, totalRevenue, profit } = contractProfit(contract);
        const profitPct = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0;
        const isExpanded = expandedId === contract.id;
        const tab = getTab(contract.id);
        const contEntries = entries.filter(e => e.contract_id === contract.id);
        const contPhotos = photos.filter(p => p.contract_id === contract.id);
        const contTasks = [
          ...ctasks.filter(t => t.contract_id === contract.id),
          ...globalTasks.filter(t => t.contract_id === contract.id),
        ];
        const contAttendance = attendance.filter(a => a.contractId === contract.id);
        const sc = STATUS_COLORS[contract.status] || STATUS_COLORS["Nová"];

        return (
          <div key={contract.id} style={{ ...S.card, marginBottom: 14, border: isExpanded ? "1px solid #6366f155" : "1px solid #1a2035" }}>

            {/* HLAVIČKA ZAKÁZKY */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: isExpanded ? 20 : 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {contract.code && <span style={{ background: "#6366f122", color: "#818cf8", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em" }}>{contract.code}</span>}
                  <span style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{contract.name}</span>
                </div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
                  {cust?.name || "—"} · {cust?.company || ""}
                </div>
              </div>
              <select
                value={contract.status}
                onChange={e => updateStatus(contract.id, e.target.value)}
                style={{ ...S.select, marginBottom: 0, width: 140, padding: "5px 8px", fontSize: 12, color: sc.color, borderColor: sc.border }}>
                {["Nová","Probíhá","Dokončena","Fakturována"].map(s => <option key={s}>{s}</option>)}
              </select>
              <div style={{ textAlign: "right", minWidth: 110 }}>
                <div style={{ fontSize: 13, color: "#fff", fontWeight: 700 }}>{fmtKc(totalRevenue)}</div>
                <div style={{ fontSize: 12, color: profit >= 0 ? "#34d399" : "#f87171", fontWeight: 700 }}>
                  Zisk: {fmtKc(profit)} ({profitPct}%)
                </div>
              </div>
              <button
                onClick={() => setExpandedId(isExpanded ? null : contract.id)}
                style={{ background: "#1a2035", border: "1px solid #252d45", borderRadius: 8, padding: "6px 14px", color: "#94a3b8", cursor: "pointer", fontSize: 12, flexShrink: 0 }}>
                {isExpanded ? "▲ Sbalit" : "▼ Detail"}
              </button>
            </div>

            {/* DETAIL */}
            {isExpanded && (() => {
              const view = getView(contract.id);
              return (
              <>
                {/* TOP LIŠTA: Přehled / Popis */}
                <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid #e2e8f0", paddingBottom: 0 }}>
                  {[["prehled", "📋 Přehled"], ["popis", "📝 Popis zakázky"]].map(([v, label]) => (
                    <button key={v} onClick={() => setView(contract.id, v)}
                      style={{ background: view === v ? "#2563eb" : "transparent", color: view === v ? "#fff" : "#64748b", border: "none", borderRadius: "8px 8px 0 0", padding: "8px 20px", fontSize: 13, fontWeight: view === v ? 700 : 500, cursor: "pointer", transition: "all 0.15s" }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* VIEW: POPIS */}
                {view === "popis" && (
                  <PopisTab contract={contract} setContracts={setContracts} />
                )}

                {/* VIEW: PŘEHLED — existing tabs */}
                {view === "prehled" && (<>
                {/* TABS */}
                <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1a2035", marginBottom: 20 }}>
                  {[["naklady","💰 Náklady"], ["financni","📊 Finance"], ["fakturace","🧾 K fakturaci"], ["zamestnanci",`👷 Zaměstnanci (${contAttendance.length})`], ["ukoly",`✅ Úkoly (${contTasks.length})`], ["fotky",`📷 Fotky (${contPhotos.length})`], ["komunikace","💬 Komunikace"], ["priprava","📋 Příprava"], ["dokumenty","📁 Dokumenty"]].map(([t, label]) => (
                    <button key={t} onClick={() => setTab(contract.id, t)}
                      style={{ background: "none", border: "none", borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent", color: tab === t ? "#fff" : "#475569", padding: "8px 16px", fontSize: 13, cursor: "pointer", fontWeight: tab === t ? 600 : 400 }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* TAB: NÁKLADY */}
                {tab === "naklady" && (
                  <div>
                    {/* Základní náklady */}
                    <div style={{ fontWeight: 700, color: "#fff", marginBottom: 12, fontSize: 13 }}>Základní náklady</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                      {[
                        { type: "práce", actual: sums.prace, budget: contract.budget_prace, field: "budget_prace" },
                        { type: "materiál", actual: sums.material, budget: contract.budget_material, field: "budget_material" },
                        { type: "doprava", actual: sums.doprava, budget: contract.budget_doprava, field: "budget_doprava" },
                      ].map(sec => (
                        <CostSection key={sec.type}
                          label={sec.type} actual={sec.actual} budget={sec.budget}
                          entries={contEntries.filter(e => e.cost_type === sec.type && !e.is_extra)}
                          employees={employees}
                          contractId={contract.id}
                          budgetField={sec.field}
                          onUpdateBudget={(nv) => updateBudget(contract.id, sec.field, nv, sec.budget)}
                          onAddEntry={() => setModal({ type: "addEntry", contractId: contract.id, costType: sec.type, isExtra: false })}
                          onDeleteEntry={deleteEntry}
                          onToggleApproved={toggleApproved}
                        />
                      ))}
                    </div>

                    {/* Vícepráce */}
                    <div style={{ fontWeight: 700, color: "#fff", marginBottom: 12, fontSize: 13 }}>Vícepráce</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                      {[
                        { type: "práce", actual: sums.vicePrace, budget: contract.budget_vice_prace, field: "budget_vice_prace" },
                        { type: "materiál", actual: sums.viceMaterial, budget: contract.budget_vice_material, field: "budget_vice_material" },
                        { type: "doprava", actual: sums.viceDoprava, budget: contract.budget_vice_doprava, field: "budget_vice_doprava" },
                      ].map(sec => (
                        <CostSection key={"vice_"+sec.type}
                          label={"Více – " + sec.type} actual={sec.actual} budget={sec.budget}
                          entries={contEntries.filter(e => e.cost_type === sec.type && e.is_extra)}
                          employees={employees}
                          contractId={contract.id}
                          budgetField={sec.field}
                          onUpdateBudget={(nv) => updateBudget(contract.id, sec.field, nv, sec.budget)}
                          onAddEntry={() => setModal({ type: "addEntry", contractId: contract.id, costType: sec.type, isExtra: true })}
                          onDeleteEntry={deleteEntry}
                          onToggleApproved={toggleApproved}
                          isExtra
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB: FINANCE */}
                {tab === "financni" && (
                  <FinanceTab contract={contract} sums={sums} totalCost={totalCost} totalRevenue={totalRevenue} profit={profit} profitPct={profitPct} />
                )}

                {/* TAB: K FAKTURACI */}
                {tab === "fakturace" && (
                  <BillingTab
                    contractId={contract.id}
                    entries={contEntries}
                    summaries={billingSummaries.filter(s => s.contract_id === contract.id)}
                    employees={employees}
                    onMarkBilled={markMonthBilled}
                    onToggleApproved={toggleApproved}
                  />
                )}

                {/* TAB: ZAMĚSTNANCI */}
                {tab === "zamestnanci" && (
                  <EmployeesTab attendance={contAttendance} employees={employees} contracts={contracts} contractId={contract.id} />
                )}

                {/* TAB: ÚKOLY */}
                {tab === "ukoly" && (
                  <TasksTab
                    tasks={contTasks} employees={employees}
                    onAdd={() => setModal({ type: "addTask", contractId: contract.id, photos: contPhotos })}
                    onToggle={toggleTask}
                  />
                )}

                {/* TAB: FOTKY */}
                {tab === "fotky" && (
                  <PhotosTab
                    photos={contPhotos} contractId={contract.id}
                    currentUser={currentUser}
                    onUpload={(file, desc) => uploadPhoto(contract.id, file, desc)}
                  />
                )}

                {/* TAB: KOMUNIKACE */}
                {tab === "komunikace" && (() => {
                  const msgs = contractMessages.filter(m => m.contract_id === contract.id);
                  return (
                    <div>
                      <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                        {msgs.length === 0 && <div style={{ color: "#475569", fontSize: 13, padding: "16px 0" }}>Zatím žádné zprávy v této zakázce</div>}
                        {msgs.map(m => (
                          <div key={m.id} style={{ background: "#1e293b", borderRadius: 10, padding: "9px 13px" }}>
                            <div style={{ fontSize: 11, color: "#34d399", fontWeight: 600, marginBottom: 3 }}>
                              {m.user_name} · {new Date(m.created_at).toLocaleString("cs")}
                            </div>
                            <div style={{ color: "#e2e8f0", fontSize: 13 }}>{m.message}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          style={{ ...S.input, marginBottom: 0, flex: 1 }}
                          placeholder="Napište zprávu ke zakázce..."
                          value={newCMsg}
                          onChange={e => setNewCMsg(e.target.value)}
                          onKeyDown={async e => {
                            if (e.key !== "Enter" || !newCMsg.trim()) return;
                            const { data: row } = await supabase.from("contract_messages").insert({
                              contract_id: contract.id,
                              user_name: currentUser?.name || "?",
                              message: newCMsg.trim(),
                            }).select().single();
                            if (row) setContractMessages(prev => [...prev, row]);
                            setNewCMsg("");
                          }}
                        />
                        <button style={{ ...S.btn(), padding: "0 16px", whiteSpace: "nowrap" }} onClick={async () => {
                          if (!newCMsg.trim()) return;
                          const { data: row } = await supabase.from("contract_messages").insert({
                            contract_id: contract.id,
                            user_name: currentUser?.name || "?",
                            message: newCMsg.trim(),
                          }).select().single();
                          if (row) setContractMessages(prev => [...prev, row]);
                          setNewCMsg("");
                        }}>Odeslat</button>
                      </div>
                    </div>
                  );
                })()}

                {/* TAB: PŘÍPRAVA ZAKÁZKY */}
                {tab === "priprava" && (
                  <PripravaTab contractId={contract.id} />
                )}

                {/* TAB: DOKUMENTY */}
                {tab === "dokumenty" && (
                  <DokumentyTab contractId={contract.id} currentUser={currentUser} />
                )}
                </>)}
              </>
              );
            })()}
          </div>
        );
      })}

      {/* ── MODÁLY ── */}
      {modal?.type === "newContract" && (
        <NewContractModal
          customers={customers} deal={modal.deal}
          onSave={saveNewContract} onClose={closeModal}
        />
      )}
      {modal?.type === "addEntry" && (
        <AddEntryModal
          contractId={modal.contractId} costType={modal.costType} isExtra={modal.isExtra}
          employees={employees}
          onSave={saveCostEntry} onClose={closeModal}
        />
      )}
      {modal?.type === "addTask" && (
        <AddTaskModal
          contractId={modal.contractId} employees={employees}
          photos={modal.photos || []} currentUser={currentUser}
          onSave={saveTask} onClose={closeModal}
        />
      )}
    </>
  );
}

// ─── SEKCE NÁKLADŮ ───────────────────────────────────────────────────────────
function CostSection({ label, actual, budget, entries, employees, onUpdateBudget, onAddEntry, onDeleteEntry, onToggleApproved, isExtra }) {
  const [expanded, setExpanded] = useState(false);
  const [editBudget, setEditBudget] = useState(false);
  const [budgetVal, setBudgetVal] = useState(budget);
  const color = budgetColor(actual, budget);
  const lbl = budgetLabel(actual, budget);
  const icons = { "práce": "🔨", "materiál": "📦", "doprava": "🚛" };
  const baseType = label.replace("Více – ", "");

  return (
    <div style={{ background: "#0a0d14", borderRadius: 10, border: color ? `1px solid ${color}44` : "1px solid #1a2035", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>{icons[baseType]} {label.toUpperCase()}</div>
          {color && <span style={{ fontSize: 10, background: color + "22", color, borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>{color === "#34d399" ? "✓" : color === "#f87171" ? "!" : "="}</span>}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: color || "#fff" }}>{fmtKc(actual)}</div>

        {/* Budget řádek */}
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
          {editBudget ? (
            <>
              <input
                style={{ ...S.input, marginBottom: 0, flex: 1, fontSize: 12, padding: "4px 8px" }}
                type="number" value={budgetVal}
                onChange={e => setBudgetVal(e.target.value)}
              />
              <button style={{ ...S.btn(), padding: "4px 10px", fontSize: 11 }} onClick={() => { onUpdateBudget(budgetVal); setEditBudget(false); }}>✓</button>
              <button style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14 }} onClick={() => setEditBudget(false)}>✕</button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 11, color: "#475569" }}>Budget: {fmtKc(budget)}</span>
              {lbl && <span style={{ fontSize: 10, color }}>{lbl}</span>}
              <button style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 11, marginLeft: "auto" }} onClick={() => { setBudgetVal(budget); setEditBudget(true); }}>✏️</button>
            </>
          )}
        </div>
      </div>

      {/* Tlačítko rozbalit */}
      <div style={{ borderTop: "1px solid #1a2035", display: "flex" }}>
        <button onClick={() => setExpanded(!expanded)}
          style={{ flex: 1, background: "none", border: "none", color: "#475569", cursor: "pointer", padding: "7px", fontSize: 11 }}>
          {expanded ? "▲ Sbalit" : `▼ ${entries.length} záznamů`}
        </button>
        <button onClick={onAddEntry}
          style={{ background: "none", border: "none", borderLeft: "1px solid #1a2035", color: "#6366f1", cursor: "pointer", padding: "7px 12px", fontSize: 11, fontWeight: 700 }}>
          + Přidat
        </button>
      </div>

      {/* Rozbalený seznam */}
      {expanded && (
        <div style={{ borderTop: "1px solid #1a2035" }}>
          {entries.length === 0 ? (
            <div style={{ padding: "10px 14px", fontSize: 12, color: "#334155" }}>Žádné záznamy</div>
          ) : entries.map(e => {
            const emp = employees.find(em => em.id === e.employee_id);
            const isApproved = !!e.approved;
            const isBilled = !!e.billed;
            return (
              <div key={e.id} style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: "1px solid #0a0d14", alignItems: "flex-start", opacity: isBilled ? 0.55 : 1, background: isApproved && !isBilled ? "#34d39908" : "transparent" }}>
                <input
                  type="checkbox"
                  checked={isApproved}
                  disabled={isBilled}
                  title={isBilled ? "Již fakturováno" : isApproved ? "Schváleno — kliknutím zrušit" : "Schválit k fakturaci"}
                  onChange={() => !isBilled && onToggleApproved && onToggleApproved(e.id)}
                  style={{ accentColor: "#34d399", cursor: isBilled ? "default" : "pointer", flexShrink: 0, marginTop: 3 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#475569" }}>
                    {e.date} {emp ? `· ${emp.name}` : ""}
                    {isBilled && <span style={{ marginLeft: 6, background: "#f59e0b22", color: "#f59e0b", borderRadius: 4, padding: "1px 5px", fontSize: 10 }}>Fakturováno</span>}
                    {isApproved && !isBilled && <span style={{ marginLeft: 6, background: "#34d39922", color: "#34d399", borderRadius: 4, padding: "1px 5px", fontSize: 10 }}>✓ Schváleno</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 2, textDecoration: isBilled ? "line-through" : "none" }}>{e.description}</div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{e.quantity} {e.unit} × {fmtKc(e.unit_price_cost)}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmtKc(e.amount_cost)}</div>
                  {e.unit_price_client > 0 && <div style={{ fontSize: 10, color: "#34d399" }}>↑ {fmtKc(e.amount_client)}</div>}
                </div>
                {!isBilled && <button onClick={() => onDeleteEntry(e.id)}
                  style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 15, padding: "0 2px" }}>×</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── TAB: FINANČNÍ PŘEHLED ────────────────────────────────────────────────────
function FinanceTab({ contract, sums, totalCost, totalRevenue, profit, profitPct }) {
  const Row = ({ label, value, color, bold, divider }) => (
    <>
      {divider && <div style={{ borderTop: "1px solid #1a2035", margin: "6px 0" }} />}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
        <span style={{ fontSize: 13, color: bold ? "#fff" : "#94a3b8", fontWeight: bold ? 700 : 400 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: bold ? 800 : 400, color: color || (bold ? "#fff" : "#94a3b8") }}>{value}</span>
      </div>
    </>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div style={{ background: "#0a0d14", borderRadius: 10, padding: 18, border: "1px solid #1a2035" }}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, fontSize: 13 }}>Příjmy</div>
        <Row label="Cena zakázky" value={fmtKc(contract.price)} />
        <Row label="Vícepráce – práce" value={fmtKc(sums.vicePrace)} />
        <Row label="Vícepráce – materiál" value={fmtKc(sums.viceMaterial)} />
        <Row label="Vícepráce – doprava" value={fmtKc(sums.viceDoprava)} />
        <Row label="Celkem příjmy" value={fmtKc(totalRevenue)} bold divider />
      </div>
      <div style={{ background: "#0a0d14", borderRadius: 10, padding: 18, border: "1px solid #1a2035" }}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, fontSize: 13 }}>Náklady</div>
        <Row label="Práce" value={fmtKc(sums.prace)} />
        <Row label="Materiál" value={fmtKc(sums.material)} />
        <Row label="Doprava" value={fmtKc(sums.doprava)} />
        <Row label="Více – práce" value={fmtKc(sums.vicePrace)} />
        <Row label="Více – materiál" value={fmtKc(sums.viceMaterial)} />
        <Row label="Více – doprava" value={fmtKc(sums.viceDoprava)} />
        <Row label="Celkem náklady" value={fmtKc(totalCost)} bold divider />
      </div>
      <div style={{ gridColumn: "1 / -1", background: profit >= 0 ? "#34d39911" : "#f8717111", borderRadius: 10, padding: 18, border: `1px solid ${profit >= 0 ? "#34d39944" : "#f8717144"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>CELKOVÝ ZISK</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: profit >= 0 ? "#34d399" : "#f87171" }}>{fmtKc(profit)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>MARŽE</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: profit >= 0 ? "#34d399" : "#f87171" }}>{profitPct}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAB: ZAMĚSTNANCI / DOCHÁZKA ─────────────────────────────────────────────
function EmployeesTab({ attendance, employees, contracts, contractId }) {
  const calcH = (ci, co) => {
    if (!ci || !co) return 0;
    const [h1, m1] = ci.split(":").map(Number);
    const [h2, m2] = co.split(":").map(Number);
    return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
  };
  const fmtH = (h) => `${Math.floor(h)}h ${pad(Math.round((h - Math.floor(h)) * 60))}m`;

  const sorted = [...attendance].sort((a, b) => b.date?.localeCompare(a.date));
  const totalH = attendance.reduce((s, a) => s + calcH(a.checkin, a.checkout), 0);

  return (
    <div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>
        Celkem odpracováno na zakázce: <strong style={{ color: "#fff" }}>{fmtH(totalH)}</strong>
      </div>
      {sorted.length === 0 ? (
        <div style={{ color: "#334155", fontSize: 13 }}>Žádné záznamy docházky pro tuto zakázku.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Datum","Zaměstnanec","Příchod","Odchod","Hod.","Činnost"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const emp = employees.find(e => e.id === r.employeeId || e.id === r.employee_id);
              const h = calcH(r.checkin, r.checkout);
              return (
                <tr key={r.id}>
                  <td style={S.td}>{r.date}</td>
                  <td style={{ ...S.td, color: "#fff", fontWeight: 600 }}>{emp?.name || "—"}</td>
                  <td style={{ ...S.td, color: "#34d399" }}>{r.checkin || "—"}</td>
                  <td style={{ ...S.td, color: "#f59e0b" }}>{r.checkout || <span style={{ color: "#334155" }}>probíhá</span>}</td>
                  <td style={{ ...S.td, color: "#fff", fontWeight: 700 }}>{h > 0 ? fmtH(h) : "—"}</td>
                  <td style={{ ...S.td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.activity || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── TAB: ÚKOLY ──────────────────────────────────────────────────────────────
// ─── MODAL: PŘIDAT ÚKOL ──────────────────────────────────────────────────────
function AddTaskModal({ contractId, employees, photos, currentUser, onSave, onClose }) {
  const [form, setForm] = useState({
    title: "", due: "", assigneeId: "", priority: "Střední",
    photo_url: "", created_by: currentUser?.name || "",
    assigned_to_name: "",
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div style={S.modal}>
      <div style={S.modalBox}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#fff" }}>Přidat úkol</div>
          <button style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }} onClick={onClose}>✕</button>
        </div>

        <label style={S.label}>Název úkolu *</label>
        <input style={S.input} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Co je potřeba udělat..." />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={S.label}>Termín</label>
            <DatePicker value={form.due} onChange={v => set("due", v)} />
          </div>
          <div>
            <label style={S.label}>Priorita</label>
            <select style={S.select} value={form.priority} onChange={e => set("priority", e.target.value)}>
              {["Vysoká", "Střední", "Nízká"].map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <label style={S.label}>Přiřadit zaměstnanci</label>
        <select style={S.select} value={form.assigneeId} onChange={e => {
          const emp = employees.find(em => em.id === Number(e.target.value));
          set("assigneeId", e.target.value);
          if (emp) set("assigned_to_name", emp.name);
        }}>
          <option value="">— nevybráno —</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>

        {photos.length > 0 && (<>
          <label style={S.label}>Připojit fotku ze zakázky</label>
          <select style={S.select} value={form.photo_url} onChange={e => set("photo_url", e.target.value)}>
            <option value="">— žádná —</option>
            {photos.map(p => <option key={p.id} value={p.url}>{p.description || p.date || p.id}</option>)}
          </select>
        </>)}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button style={S.btn()} onClick={() => { if (form.title.trim()) { onSave({ ...form, contractId }); } }}>Uložit úkol</button>
          <button style={S.btnGhost} onClick={onClose}>Zrušit</button>
        </div>
      </div>
    </div>
  );
}

function TasksTab({ tasks, employees, onAdd, onToggle }) {
  const [expandedPhoto, setExpandedPhoto] = useState(null);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button style={S.btn()} onClick={onAdd}>+ Přidat úkol</button>
      </div>
      {tasks.length === 0 ? (
        <div style={{ color: "#334155", fontSize: 13 }}>Žádné úkoly.</div>
      ) : tasks.map(t => {
        const emp = employees.find(e => e.id === t.assignee_id);
        const assignedName = t.assigned_to_name || t.assigned_to || emp?.name || "";
        const createdBy = t.created_by || "";
        const PRIO = { "Vysoká": "#f87171", "Střední": "#f59e0b", "Nízká": "#34d399" };
        return (
          <div key={t.id} style={{ borderBottom: "1px solid #1a2035", opacity: t.done ? 0.5 : 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0" }}>
              <input type="checkbox" checked={t.done} onChange={() => onToggle(t.id)}
                style={{ accentColor: "#6366f1", flexShrink: 0, marginTop: 3 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "#e2e8f0", fontWeight: 600, textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
                  {t.priority && <span style={{ background: (PRIO[t.priority] || "#64748b") + "22", color: PRIO[t.priority] || "#64748b", borderRadius: 5, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{t.priority}</span>}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                  {createdBy && <span style={{ fontSize: 11, color: "#475569" }}>Zadal: <span style={{ color: "#6366f1" }}>{createdBy}</span></span>}
                  {assignedName && <span style={{ fontSize: 11, color: "#475569" }}>Pro: <span style={{ color: "#34d399", fontWeight: 600 }}>{assignedName}</span></span>}
                  {t.due && <span style={{ fontSize: 11, color: "#475569" }}>📅 {t.due}</span>}
                </div>
              </div>
              {t.photo_url && (
                <img src={t.photo_url} alt="" onClick={() => setExpandedPhoto(expandedPhoto === t.id ? null : t.id)}
                  style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: "2px solid #334155", flexShrink: 0 }} />
              )}
            </div>
            {expandedPhoto === t.id && t.photo_url && (
              <div style={{ paddingBottom: 10 }}>
                <img src={t.photo_url} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 8 }} onClick={() => setExpandedPhoto(null)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── TAB: FOTKY ──────────────────────────────────────────────────────────────
function PhotosTab({ photos, contractId, currentUser, onUpload }) {
  const [desc, setDesc] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of files) {
      await onUpload(file, desc);
    }
    setDesc("");
    setUploading(false);
  };

  const byDate = photos.reduce((acc, p) => {
    const d = p.date || "Bez data";
    if (!acc[d]) acc[d] = [];
    acc[d].push(p);
    return acc;
  }, {});

  return (
    <div>
      {/* Upload oblast */}
      <div style={{ background: "#0a0d14", border: "2px dashed #252d45", borderRadius: 10, padding: 20, marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#475569", marginBottom: 10 }}>Přetáhni fotky sem nebo klikni pro výběr</div>
        <input style={{ ...S.input, marginBottom: 8 }} placeholder="Popis fotek (volitelné)" value={desc} onChange={e => setDesc(e.target.value)} />
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
        <button style={S.btn()} onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? "Nahrávám..." : "📷 Vybrat fotky"}
        </button>
      </div>

      {/* Galerie */}
      {Object.keys(byDate).sort((a, b) => b.localeCompare(a)).map(date => (
        <div key={date} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "#475569", marginBottom: 8, fontWeight: 700 }}>{date}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {byDate[date].map(p => (
              <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", width: 120, height: 90, borderRadius: 8, overflow: "hidden", border: "1px solid #1a2035", flexShrink: 0 }}>
                <img src={p.url} alt={p.description} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </a>
            ))}
          </div>
        </div>
      ))}
      {photos.length === 0 && <div style={{ color: "#334155", fontSize: 13 }}>Žádné fotky.</div>}
    </div>
  );
}

// ─── MODAL: NOVÁ ZAKÁZKA ─────────────────────────────────────────────────────
// ─── POPIS ZAKÁZKY ───────────────────────────────────────────────────────────
function PopisTab({ contract, setContracts }) {
  const [address, setAddress] = useState(contract.address || "");
  const [dueDate, setDueDate] = useState(contract.due_date || "");
  const [milestones, setMilestones] = useState(
    Array.isArray(contract.milestones) ? contract.milestones : (contract.milestones ? JSON.parse(contract.milestones) : [])
  );
  const [contacts, setContacts] = useState(
    Array.isArray(contract.contacts_info) ? contract.contacts_info : (contract.contacts_info ? JSON.parse(contract.contacts_info) : [])
  );
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const upd = { address, due_date: dueDate || null, milestones: JSON.stringify(milestones), contacts_info: JSON.stringify(contacts) };
    await supabase.from("contracts").update(upd).eq("id", contract.id);
    setContracts(prev => prev.map(c => c.id === contract.id ? { ...c, ...upd } : c));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addMilestone = () => setMilestones(ms => [...ms, { title: "", date: "", done: false }]);
  const updMilestone = (i, key, val) => setMilestones(ms => ms.map((m, idx) => idx === i ? { ...m, [key]: val } : m));
  const delMilestone = (i) => setMilestones(ms => ms.filter((_, idx) => idx !== i));

  const addContact = () => setContacts(cs => [...cs, { name: "", role: "", phone: "" }]);
  const updContact = (i, key, val) => setContacts(cs => cs.map((c, idx) => idx === i ? { ...c, [key]: val } : c));
  const delContact = (i) => setContacts(cs => cs.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      {/* LEVÝ SLOUPEC */}
      <div>
        <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          📍 Základní info
        </div>

        <label style={S.label}>Adresa místa výkonu</label>
        <input style={S.input} value={address} onChange={e => setAddress(e.target.value)} placeholder="Ulice 123, Praha" />

        <label style={S.label}>Datum dokončení</label>
        <input type="date" style={S.input} value={dueDate} onChange={e => setDueDate(e.target.value)} />

        <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 14, margin: "20px 0 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          🗓 Průběžné termíny
          <button onClick={addMilestone} style={{ ...S.btn(), padding: "4px 12px", fontSize: 12 }}>+ Přidat</button>
        </div>

        {milestones.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>Žádné termíny.</div>}
        {milestones.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, background: "#f8fafc", borderRadius: 8, padding: "8px 10px", border: "1px solid #e2e8f0" }}>
            <input
              type="checkbox" checked={m.done}
              onChange={e => updMilestone(i, "done", e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#2563eb", flexShrink: 0 }} />
            <input
              style={{ ...S.input, marginBottom: 0, flex: 1, fontSize: 13, textDecoration: m.done ? "line-through" : "none", color: m.done ? "#94a3b8" : "#1e293b" }}
              value={m.title} onChange={e => updMilestone(i, "title", e.target.value)} placeholder="Popis termínu..." />
            <input
              type="date" style={{ ...S.input, marginBottom: 0, width: 140, fontSize: 12 }}
              value={m.date} onChange={e => updMilestone(i, "date", e.target.value)} />
            <button onClick={() => delMilestone(i)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>

      {/* PRAVÝ SLOUPEC */}
      <div>
        <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          👤 Kontaktní osoby
          <button onClick={addContact} style={{ ...S.btn(), padding: "4px 12px", fontSize: 12 }}>+ Přidat</button>
        </div>

        {contacts.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>Žádné kontakty.</div>}
        {contacts.map((c, i) => (
          <div key={i} style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", marginBottom: 10, border: "1px solid #e2e8f0", position: "relative" }}>
            <button onClick={() => delContact(i)} style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14 }}>✕</button>
            <label style={S.label}>Jméno</label>
            <input style={S.input} value={c.name} onChange={e => updContact(i, "name", e.target.value)} placeholder="Jan Novák" />
            <label style={S.label}>Co má na starosti</label>
            <input style={S.input} value={c.role} onChange={e => updContact(i, "role", e.target.value)} placeholder="Vedoucí projektu, elektro..." />
            <label style={S.label}>Telefon</label>
            <input style={S.input} value={c.phone} onChange={e => updContact(i, "phone", e.target.value)} placeholder="+420 ..." />
          </div>
        ))}
      </div>

      {/* SAVE */}
      <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
        <button onClick={save} style={{ ...S.btn(), padding: "10px 28px" }}>💾 Uložit popis</button>
        {saved && <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 600 }}>✓ Uloženo</span>}
        {address && (
          <a href={`https://mapy.cz/zakladni?q=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer"
            style={{ background: "#dbeafe", color: "#2563eb", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            🗺 Otevřít v Mapy.cz
          </a>
        )}
      </div>
    </div>
  );
}

function NewContractModal({ customers, deal, onSave, onClose }) {
  const [f, setF] = useState({
    code: "", name: deal?.name || "", customerId: deal?.customerId || deal?.customer_id || "",
    status: "Nová", price: deal?.value || "", notes: "", address: "",
    budgetPrace: "", budgetMaterial: "", budgetDoprava: "",
    budgetVicePrace: "", budgetViceMaterial: "", budgetViceDoprava: "",
    dealId: deal?.id || null,
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <div style={S.modal}>
      <div style={S.modalBox}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#fff" }}>Nová zakázka</div>
          <button style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }} onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10 }}>
          <div>
            <label style={S.label}>Kód zakázky</label>
            <input style={S.input} value={f.code} onChange={e => set("code", e.target.value)} placeholder="např. ZAK-2026-001" />
          </div>
          <div>
            <label style={S.label}>Název zakázky</label>
            <input style={S.input} value={f.name} onChange={e => set("name", e.target.value)} />
          </div>
        </div>

        <label style={S.label}>Zákazník</label>
        <select style={S.select} value={f.customerId} onChange={e => set("customerId", e.target.value)}>
          <option value="">— vyberte —</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name} – {c.company}</option>)}
        </select>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={S.label}>Cena zakázky (Kč)</label>
            <input style={S.input} type="number" value={f.price} onChange={e => set("price", e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Stav</label>
            <select style={S.select} value={f.status} onChange={e => set("status", e.target.value)}>
              {["Nová","Probíhá","Dokončena","Fakturována"].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, marginBottom: 8, marginTop: 4 }}>BUDGET — ZÁKLADNÍ NÁKLADY</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[["budgetPrace","Práce (Kč)"],["budgetMaterial","Materiál (Kč)"],["budgetDoprava","Doprava (Kč)"]].map(([k,l]) => (
            <div key={k}><label style={S.label}>{l}</label><input style={S.input} type="number" value={f[k]} onChange={e => set(k, e.target.value)} /></div>
          ))}
        </div>

        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 12, marginBottom: 8 }}>BUDGET — VÍCEPRÁCE</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[["budgetVicePrace","Více-Práce"],["budgetViceMaterial","Více-Materiál"],["budgetViceDoprava","Více-Doprava"]].map(([k,l]) => (
            <div key={k}><label style={S.label}>{l}</label><input style={S.input} type="number" value={f[k]} onChange={e => set(k, e.target.value)} /></div>
          ))}
        </div>

        <label style={S.label}>Adresa místa výkonu</label>
        <input style={S.input} value={f.address} onChange={e => set("address", e.target.value)} placeholder="Ulice 123, Praha" />

        <label style={S.label}>Poznámky</label>
        <textarea style={{ ...S.input, height: 70, resize: "vertical" }} value={f.notes} onChange={e => set("notes", e.target.value)} />

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button style={S.btn()} onClick={() => { if (f.name) onSave(f); }}>Uložit zakázku</button>
          <button style={S.btnGhost} onClick={onClose}>Zrušit</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: PŘIDAT NÁKLADOVOU POLOŽKU ────────────────────────────────────────
function AddEntryModal({ contractId, costType, isExtra, employees, onSave, onClose }) {
  const [f, setF] = useState({
    date: today(), description: "", quantity: "1", unit: costType === "práce" ? "h" : "ks",
    unitPriceCost: "", unitPriceClient: "", employeeId: "",
    contractId, costType, isExtra,
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const isPrace = costType === "práce";
  const totalCost = (Number(f.quantity) || 0) * (Number(f.unitPriceCost) || 0);
  const totalClient = (Number(f.quantity) || 0) * (Number(f.unitPriceClient) || 0);

  return (
    <div style={S.modal}>
      <div style={S.modalBox}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#fff" }}>
            Přidat {isExtra ? "vícepráce – " : ""}{costType}
          </div>
          <button style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }} onClick={onClose}>✕</button>
        </div>

        {isPrace && (
          <>
            <label style={S.label}>Zaměstnanec</label>
            <select style={S.select} value={f.employeeId} onChange={e => {
              const emp = employees.find(em => em.id === Number(e.target.value));
              set("employeeId", e.target.value);
              if (emp) {
                set("unitPriceCost", emp.hourly_rate_cost || "");
                set("unitPriceClient", emp.hourly_rate_client || "");
              }
            }}>
              <option value="">— vyberte —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.position})</option>)}
            </select>
          </>
        )}

        <label style={S.label}>Datum</label>
        <DatePicker value={f.date} onChange={v => set("date", v)} />

        <label style={S.label}>Popis</label>
        <input style={S.input} value={f.description} onChange={e => set("description", e.target.value)} placeholder={isPrace ? "Druh práce..." : costType === "materiál" ? "Název materiálu..." : "Trasa..."} />

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <div>
            <label style={S.label}>Množství</label>
            <input style={S.input} type="number" step="0.5" value={f.quantity} onChange={e => set("quantity", e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Jednotka</label>
            <select style={S.select} value={f.unit} onChange={e => set("unit", e.target.value)}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={S.label}>Cena/{f.unit} (nákladová)</label>
            <input style={S.input} type="number" value={f.unitPriceCost} onChange={e => set("unitPriceCost", e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Cena/{f.unit} (fakturační)</label>
            <input style={S.input} type="number" value={f.unitPriceClient} onChange={e => set("unitPriceClient", e.target.value)} />
          </div>
        </div>

        {(totalCost > 0 || totalClient > 0) && (
          <div style={{ background: "#0a0d14", borderRadius: 8, padding: 12, marginBottom: 10, border: "1px solid #252d45" }}>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>Náhled celkem:</div>
            <div style={{ display: "flex", gap: 20 }}>
              <div><span style={{ color: "#475569", fontSize: 12 }}>Náklad: </span><span style={{ color: "#f87171", fontWeight: 700 }}>{fmtKc(totalCost)}</span></div>
              <div><span style={{ color: "#475569", fontSize: 12 }}>Fakturace: </span><span style={{ color: "#34d399", fontWeight: 700 }}>{fmtKc(totalClient)}</span></div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button style={S.btn()} onClick={() => { if (f.description || f.quantity) onSave(f); }}>Uložit</button>
          <button style={S.btnGhost} onClick={onClose}>Zrušit</button>
        </div>
      </div>
    </div>
  );
}

// ─── TAB: PŘÍPRAVA ZAKÁZKY ───────────────────────────────────────────────────
function PripravaTab({ contractId }) {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const todayStr = () => new Date().toISOString().slice(0, 10);

  useEffect(() => {
    supabase.from("contract_prep_tasks").select("*").eq("contract_id", contractId).order("position")
      .then(({ data }) => { setTasks(data || []); setLoaded(true); });
  }, [contractId]);

  const addTask = async () => {
    if (!newTitle.trim()) return;
    const { data: row } = await supabase.from("contract_prep_tasks").insert({
      contract_id: contractId, title: newTitle.trim(), done: false,
      done_date: null, subtasks: [], position: tasks.length,
    }).select().single();
    if (row) setTasks(t => [...t, row]);
    setNewTitle("");
  };

  const toggleTask = async (id) => {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    const done = !t.done;
    const done_date = done ? todayStr() : null;
    await supabase.from("contract_prep_tasks").update({ done, done_date }).eq("id", id);
    setTasks(ts => ts.map(x => x.id === id ? { ...x, done, done_date } : x));
  };

  const deleteTask = async (id) => {
    await supabase.from("contract_prep_tasks").delete().eq("id", id);
    setTasks(ts => ts.filter(x => x.id !== id));
  };

  const addSubtask = async (taskId, title) => {
    if (!title.trim()) return;
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
    const newSub = { id: Date.now(), title: title.trim(), done: false, done_date: null };
    const updated = [...subs, newSub];
    await supabase.from("contract_prep_tasks").update({ subtasks: updated }).eq("id", taskId);
    setTasks(ts => ts.map(x => x.id === taskId ? { ...x, subtasks: updated } : x));
  };

  const toggleSubtask = async (taskId, subId) => {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    const subs = (t.subtasks || []).map(s =>
      s.id === subId ? { ...s, done: !s.done, done_date: !s.done ? todayStr() : null } : s
    );
    await supabase.from("contract_prep_tasks").update({ subtasks: subs }).eq("id", taskId);
    setTasks(ts => ts.map(x => x.id === taskId ? { ...x, subtasks: subs } : x));
  };

  const deleteSubtask = async (taskId, subId) => {
    const t = tasks.find(x => x.id === taskId);
    if (!t) return;
    const subs = (t.subtasks || []).filter(s => s.id !== subId);
    await supabase.from("contract_prep_tasks").update({ subtasks: subs }).eq("id", taskId);
    setTasks(ts => ts.map(x => x.id === taskId ? { ...x, subtasks: subs } : x));
  };

  if (!loaded) return <div style={{ color: "#94a3b8", fontSize: 13 }}>Načítám...</div>;

  const done = tasks.filter(t => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div>
      {/* Progress */}
      {tasks.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", marginBottom: 6 }}>
            <span>Připraveno {done} / {tasks.length} úkolů</span>
            <span style={{ fontWeight: 700, color: pct === 100 ? "#16a34a" : "#2563eb" }}>{pct}%</span>
          </div>
          <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#16a34a" : "#2563eb", borderRadius: 3, transition: "width 0.4s" }} />
          </div>
        </div>
      )}

      {/* Úkoly */}
      {tasks.map(task => (
        <TaskRow key={task.id} task={task}
          onToggle={() => toggleTask(task.id)}
          onDelete={() => deleteTask(task.id)}
          onAddSub={(title) => addSubtask(task.id, title)}
          onToggleSub={(sid) => toggleSubtask(task.id, sid)}
          onDeleteSub={(sid) => deleteSubtask(task.id, sid)}
        />
      ))}

      {/* Přidat úkol */}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          style={{ ...S.input, marginBottom: 0, flex: 1 }}
          placeholder="Nový úkol přípravy..."
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTask()}
        />
        <button style={{ ...S.btn(), padding: "0 18px", flexShrink: 0 }} onClick={addTask}>+ Přidat</button>
      </div>
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete, onAddSub, onToggleSub, onDeleteSub }) {
  const [showSubs, setShowSubs] = useState(true);
  const [newSub, setNewSub] = useState("");
  const subs = Array.isArray(task.subtasks) ? task.subtasks : [];
  const subDone = subs.filter(s => s.done).length;

  return (
    <div style={{ background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 8, overflow: "hidden" }}>
      {/* Hlavní úkol */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
        <input type="checkbox" checked={task.done} onChange={onToggle}
          style={{ width: 17, height: 17, accentColor: "#2563eb", cursor: "pointer", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: task.done ? "#94a3b8" : "#1e293b", textDecoration: task.done ? "line-through" : "none" }}>
          {task.title}
        </span>
        {task.done_date && (
          <span style={{ fontSize: 11, color: "#16a34a", background: "#dcfce7", borderRadius: 5, padding: "2px 7px", fontWeight: 600 }}>✓ {task.done_date}</span>
        )}
        {subs.length > 0 && (
          <span onClick={() => setShowSubs(s => !s)} style={{ cursor: "pointer", fontSize: 11, color: "#64748b" }}>
            {subDone}/{subs.length} {showSubs ? "▲" : "▼"}
          </span>
        )}
        <button onClick={onDelete} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 15, padding: "0 4px" }}>✕</button>
      </div>

      {/* Podúkoly */}
      {showSubs && subs.map(s => (
        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px 7px 34px", borderTop: "1px solid #f1f5f9", background: "#ffffff" }}>
          <input type="checkbox" checked={s.done} onChange={() => onToggleSub(s.id)}
            style={{ width: 15, height: 15, accentColor: "#f97316", cursor: "pointer", flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: s.done ? "#94a3b8" : "#475569", textDecoration: s.done ? "line-through" : "none" }}>{s.title}</span>
          {s.done_date && <span style={{ fontSize: 11, color: "#16a34a", background: "#dcfce7", borderRadius: 5, padding: "2px 7px", fontWeight: 600 }}>✓ {s.done_date}</span>}
          <button onClick={() => onDeleteSub(s.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 13, padding: "0 4px" }}>✕</button>
        </div>
      ))}

      {/* Přidat podúkol */}
      {showSubs && (
        <div style={{ display: "flex", gap: 6, padding: "6px 12px 8px 34px", borderTop: "1px solid #f1f5f9" }}>
          <input
            style={{ ...S.input, marginBottom: 0, flex: 1, fontSize: 12, padding: "5px 10px" }}
            placeholder="Přidat podúkol..."
            value={newSub}
            onChange={e => setNewSub(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newSub.trim()) { onAddSub(newSub); setNewSub(""); } }}
          />
          <button
            style={{ ...S.btn(), padding: "4px 12px", fontSize: 12, flexShrink: 0 }}
            onClick={() => { if (newSub.trim()) { onAddSub(newSub); setNewSub(""); } }}>
            +
          </button>
        </div>
      )}
    </div>
  );
}

// ─── TAB: DOKUMENTY ──────────────────────────────────────────────────────────
function DokumentyTab({ contractId, currentUser }) {
  const [docs, setDocs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [desc, setDesc] = useState("");
  const fileRef = useRef();

  useEffect(() => {
    supabase.from("contract_documents").select("*").eq("contract_id", contractId).order("created_at", { ascending: false })
      .then(({ data }) => { setDocs(data || []); setLoaded(true); });
  }, [contractId]);

  const upload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of files) {
      const path = `${contractId}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("zakazky-dokumenty").upload(path, file);
      if (error) { alert("Chyba: " + error.message); continue; }
      const { data: urlData } = supabase.storage.from("zakazky-dokumenty").getPublicUrl(path);
      const ext = file.name.split(".").pop().toLowerCase();
      const { data: row } = await supabase.from("contract_documents").insert({
        contract_id: contractId, name: file.name, description: desc || "",
        url: urlData.publicUrl, storage_path: path, file_type: ext,
        uploaded_by: currentUser?.name || "",
      }).select().single();
      if (row) setDocs(d => [row, ...d]);
    }
    setDesc("");
    setUploading(false);
  };

  const deleteDoc = async (id, path) => {
    if (!window.confirm("Smazat dokument?")) return;
    await supabase.storage.from("zakazky-dokumenty").remove([path]);
    await supabase.from("contract_documents").delete().eq("id", id);
    setDocs(d => d.filter(x => x.id !== id));
  };

  const ICONS = { pdf: "📄", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊", jpg: "🖼", jpeg: "🖼", png: "🖼", zip: "🗜" };
  if (!loaded) return <div style={{ color: "#94a3b8", fontSize: 13 }}>Načítám...</div>;

  return (
    <div>
      <div style={{ background: "#f8fafc", border: "2px dashed #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 10 }}>Přetáhni dokumenty sem nebo klikni pro výběr</div>
        <input style={{ ...S.input, marginBottom: 8 }} placeholder="Popis (volitelné)" value={desc} onChange={e => setDesc(e.target.value)} />
        <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={e => upload(e.target.files)} />
        <button style={{ ...S.btn(), padding: "9px 24px" }} onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? "Nahrávám..." : "📎 Nahrát dokumenty"}
        </button>
      </div>
      {docs.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13 }}>Žádné dokumenty.</div>}
      {docs.map(doc => (
        <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 8 }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>{ICONS[doc.file_type] || "📎"}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <a href={doc.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: "#2563eb", fontSize: 14, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {doc.name}
            </a>
            {doc.description && <div style={{ fontSize: 12, color: "#64748b" }}>{doc.description}</div>}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0, textAlign: "right" }}>
            <div>{doc.uploaded_by}</div>
            <div>{doc.created_at ? new Date(doc.created_at).toLocaleDateString("cs") : ""}</div>
          </div>
          <button onClick={() => deleteDoc(doc.id, doc.storage_path)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ─── TAB: K FAKTURACI ────────────────────────────────────────────────────────
function BillingTab({ contractId, entries, summaries, employees, onMarkBilled, onToggleApproved }) {
  const S_th = S.th;
  const S_td = S.td;
  const MONTHS_CS = ["", "Leden", "Únor", "Březen", "Duben", "Květen", "Červen",
    "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

  const byMonth = {};
  entries.forEach(e => {
    if (!e.date) return;
    const [y, m] = e.date.split("-");
    const key = `${y}-${m}`;
    if (!byMonth[key]) byMonth[key] = { year: Number(y), month: Number(m), items: [] };
    byMonth[key].items.push(e);
  });
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

  return (
    <div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 20 }}>
        Zaškrtněte položky v sekci Náklady jako schválené (✓), poté je zde označte jako vyfakturované.
        Každý měsíc je zobrazen zvlášť pro přehledné doložení k faktuře.
      </div>
      {months.length === 0 && <div style={{ color: "#334155", fontSize: 13 }}>Žádné záznamy k fakturaci.</div>}
      {months.map(key => {
        const { year, month, items } = byMonth[key];
        const approved = items.filter(e => e.approved && !e.billed);
        const billed = items.filter(e => e.billed);
        const pending = items.filter(e => !e.approved && !e.billed);
        const summary = summaries.find(s => s.period_year === year && s.period_month === month);
        const approvedClient = approved.reduce((s, e) => s + Number(e.amount_client || 0), 0);
        const billedClient = billed.reduce((s, e) => s + Number(e.amount_client || 0), 0);
        return (
          <div key={key} style={{ background: "#0a0d14", borderRadius: 10, border: "1px solid #1a2035", marginBottom: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #1a2035" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{MONTHS_CS[month]} {year}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
                  {pending.length > 0 && <span style={{ marginRight: 10, color: "#475569" }}>{pending.length}× čeká</span>}
                  {approved.length > 0 && <span style={{ marginRight: 10, color: "#34d399" }}>✓ {approved.length}× schváleno ({fmtKc(approvedClient)})</span>}
                  {billed.length > 0 && <span style={{ color: "#f59e0b" }}>🧾 {billed.length}× fakturováno ({fmtKc(billedClient)})</span>}
                </div>
              </div>
              {approved.length > 0 && (
                <button style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  onClick={() => onMarkBilled(contractId, year, month)}>🧾 Označit jako fakturováno</button>
              )}
              {approved.length === 0 && billed.length > 0 && summary && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#475569" }}>Fakturováno celkem</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#f59e0b" }}>{fmtKc(summary.total_client)}</div>
                </div>
              )}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={{ ...S_th, width: 28 }}>✓</th>
                {["Datum", "Popis", "Zaměstnanec", "Množství", "Náklad", "Fakturace", "Stav"].map(h => <th key={h} style={S_th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(e => {
                  const emp = employees.find(em => em.id === e.employee_id);
                  const isApproved = !!e.approved;
                  const isBilled = !!e.billed;
                  return (
                    <tr key={e.id} style={{ opacity: isBilled ? 0.6 : 1, background: isApproved && !isBilled ? "#34d39906" : "transparent" }}>
                      <td style={S_td}><input type="checkbox" checked={isApproved} disabled={isBilled} onChange={() => onToggleApproved(e.id, !isApproved)} style={{ accentColor: "#34d399" }} /></td>
                      <td style={S_td}>{e.date}</td>
                      <td style={{ ...S_td, color: "#cbd5e1" }}>{e.description}</td>
                      <td style={S_td}>{emp?.name || "—"}</td>
                      <td style={S_td}>{e.quantity} {e.unit}</td>
                      <td style={{ ...S_td, color: "#f87171" }}>{fmtKc(Number(e.amount_cost || 0))}</td>
                      <td style={{ ...S_td, color: "#34d399" }}>{fmtKc(Number(e.amount_client || 0))}</td>
                      <td style={S_td}>
                        {isBilled ? <span style={{ background: "#f59e0b22", color: "#f59e0b", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>🧾 Fakturováno</span>
                          : isApproved ? <span style={{ background: "#34d39922", color: "#34d399", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>✓ Schváleno</span>
                          : <span style={{ background: "#47556922", color: "#475569", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>Čeká</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
