import { isConnected, uploadFileObject, getDirectDownloadUrl } from "./onedrive.js";
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";

// Čitelné zobrazení data pro uživatele — den v týdnu, den, měsíc slovem, rok (bez pomlček).
const DNY_ZKR = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
const MESICE_2P = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const fmtDateCz = (v) => {
  if (!v) return "";
  const d = new Date(v.length === 10 ? v + "T00:00:00" : v);
  if (isNaN(d.getTime())) return v;
  return `${DNY_ZKR[d.getDay()]} ${d.getDate()}. ${MESICE_2P[d.getMonth()]} ${d.getFullYear()}`;
};

// Kód zakázky ve tvaru TYP-YYM-INICIÁLY-0001, např. FVE-268-RJ-0001.
// Sekvenční číslo na konci se počítá zvlášť pro každý typ a měsíc (atomicky
// přes RPC next_contract_code_number, takže se dvě zakázky nikdy netrefí do
// stejného čísla, i kdyby je zakládali dva lidé současně).
const TYPY_ZAKAZEK = [
  { id: "FVE", label: "FVE — Fotovoltaika" },
  { id: "HRM", label: "HRM — Hromosvody" },
  { id: "ELK", label: "ELK — Elektroinstalace" },
  { id: "SRV", label: "SRV — Servis" },
];
const initialsFromName = (name) => (name || "").trim().split(/\s+/).filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 3);

async function generateContractCode(type, currentUser) {
  if (!type) return "";
  try {
    const now = new Date();
    const year = now.getFullYear() % 100;
    const month = now.getMonth() + 1;
    const { data: counter, error } = await supabase.rpc("next_contract_code_number", { p_type: type, p_year: year, p_month: month });
    if (error || counter == null) return "";
    const initials = initialsFromName(currentUser?.name) || "XX";
    return `${type}-${year}${month}-${initials}-${String(counter).padStart(4, "0")}`;
  } catch (e) {
    // Generování kódu je jen pomůcka — když selže (výpadek sítě apod.),
    // zbytek formuláře musí jít vyplnit dál, kód si uživatel doplní ručně.
    console.warn("Nepodařilo se vygenerovat kód zakázky:", e);
    return "";
  }
}

// Spočítá celkový počet MD z interního nacenění uložené nabídky (stejná
// logika jako radekVypocet v Pricing.jsx) — používá se při zakládání
// projektu ze zakázky, ať se plán MD nemusí přepisovat ručně.
function mdZeStareInterniho(interni) {
  if (!interni) return 0;
  const zRadku = (interni.radky || []).reduce((sum, r) => {
    const dny = Number(r.pocetMd) || 0;
    const lide = Number(r.pocetLidi) || 1;
    return sum + dny * lide;
  }, 0);
  const zPolozek = (interni.polozky || []).reduce((sum, p) => sum + (Number(p.md) || 0), 0);
  return zRadku + zPolozek;
}

// Náhled fotky z OneDrive — natáhne čerstvý přímý odkaz přes item_id, se
// spolehlivým fallbackem na uložený sdílený odkaz (starší fotky bez item_id).
function OneDriveThumb({ itemId, fallbackUrl, alt, style }) {
  const [src, setSrc] = useState(fallbackUrl);
  useEffect(() => {
    let zrusen = false;
    if (itemId) getDirectDownloadUrl(itemId).then(url => { if (!zrusen && url) setSrc(url); });
    return () => { zrusen = true; };
  }, [itemId]);
  return <img src={src} alt={alt} style={style} onError={() => { if (src !== fallbackUrl) setSrc(fallbackUrl); }} />;
}

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
        <span>{value ? fmtDateCz(value) : placeholder}</span>
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
const UNITS = ["h", "ks", "km", "m", "m²", "m³", "kg", "t", "l", "den", "pauš."];

const STATUS_COLORS = {
  "Nová":        { bg: "#1a2035", color: "#2E9BE0", border: "#2E9BE033" },
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
  modalBox: { background: "#0f1320", borderRadius: 16, padding: 28, width: 500, maxWidth: "92vw", boxSizing: "border-box", border: "1px solid #252d45", maxHeight: "90vh", overflowY: "auto" },
  th:       { textAlign: "left", padding: "8px 10px", fontSize: 11, color: "#475569", borderBottom: "1px solid #1a2035", textTransform: "uppercase", letterSpacing: "0.06em" },
  td:       { padding: "10px 10px", fontSize: 13, borderBottom: "1px solid #1a2035", color: "#94a3b8" },
  tag:      (c) => ({ background: c + "22", color: c, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700, display: "inline-block" }),
  badge:    (c) => ({ background: c + "22", color: c, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }),
  statCard: (c) => ({ background: "#0f1320", borderRadius: 12, padding: "16px 20px", border: `1px solid ${c}33` }),
  statLabel: { fontSize: 11, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" },
  statValue: (c) => ({ fontSize: 22, fontWeight: 800, color: c }),
};

// ─── HLAVNÍ KOMPONENTA ────────────────────────────────────────────────────────

function ContractKalendarWidget({ attendance, employees }) {
  const calcH2 = (ci, co) => {
    if (!ci || !co) return 0;
    const [h1, m1] = ci.split(":").map(Number);
    const [h2, m2] = co.split(":").map(Number);
    return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
  };
  const fmtH2 = h => h <= 0 ? "—" : `${Math.floor(h)}h ${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, "0")}m`;
  const allDates = attendance.map(a => a.date).filter(Boolean).sort();
  const defaultMon = allDates.length > 0 ? allDates[allDates.length - 1].slice(0, 7) : new Date().toISOString().slice(0, 7);
  const [calMon, setCalMon] = useState(defaultMon);
  const [selDay, setSelDay] = useState(null);
  const [calYear, calMonNum] = calMon.split("-").map(Number);
  const daysInMonth = new Date(calYear, calMonNum, 0).getDate();
  const startDow = (new Date(calYear, calMonNum - 1, 1).getDay() + 6) % 7;
  const monthAtt = attendance.filter(a => a.date && a.date.startsWith(calMon));
  const empColors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6"];
  const empColorMap = {};
  employees.forEach((e, i) => { empColorMap[e.id] = empColors[i % empColors.length]; });
  const availMonths = [...new Set(attendance.map(a => a.date?.slice(0, 7)).filter(Boolean))].sort().reverse();

  return (
    <div style={{ background: "#0a0d14", borderRadius: 10, border: "1px solid #1a2035", padding: "14px 16px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>📆 Kalendář práce</div>
        {availMonths.length > 0 && (
          <select value={calMon} onChange={e => { setCalMon(e.target.value); setSelDay(null); }}
            style={{ ...S.select, marginBottom: 0, width: 160, fontSize: 12, padding: "4px 8px" }}>
            {availMonths.map(m => (
              <option key={m} value={m}>{new Date(m + "-01").toLocaleString("cs-CZ", { month: "long", year: "numeric" })}</option>
            ))}
          </select>
        )}
      </div>
      {/* Legend */}
      {employees.filter(e => monthAtt.some(a => a.employee_id === e.id || a.employeeId === e.id)).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {employees.filter(e => monthAtt.some(a => a.employee_id === e.id || a.employeeId === e.id)).map(e => (
            <span key={e.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: empColorMap[e.id], display: "inline-block" }} />
              {e.name}
            </span>
          ))}
        </div>
      )}
      {attendance.length === 0 && (
        <div style={{ color: "#334155", fontSize: 12 }}>Žádné záznamy práce pro tuto zakázku.</div>
      )}
      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 3 }}>
        {["Po", "Út", "St", "Čt", "Pá", "So", "Ne"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#334155" }}>{d}</div>
        ))}
      </div>
      {/* Calendar cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {Array.from({ length: startDow }).map((_, i) => <div key={"e" + i} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = calMon + "-" + String(day).padStart(2, "0");
          const dayRecs = monthAtt.filter(a => a.date === dateStr);
          const isToday = dateStr === new Date().toISOString().slice(0, 10);
          const isSel = selDay === dateStr;
          const dow = (new Date(dateStr).getDay() + 6) % 7;
          return (
            <div key={day}
              onClick={() => dayRecs.length > 0 && setSelDay(isSel ? null : dateStr)}
              style={{
                background: isSel ? "#1e3a5f" : isToday ? "#0f2d47" : "#0f172a",
                border: isSel ? "1.5px solid #3b82f6" : isToday ? "1.5px solid #2E9BE055" : "1px solid #e2e8f0",
                borderRadius: 6, padding: "3px 2px", minHeight: 44,
                cursor: dayRecs.length > 0 ? "pointer" : "default",
              }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: dow >= 5 ? "#334155" : "#64748b", textAlign: "right", marginBottom: 2 }}>{day}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center" }}>
                {dayRecs.map(r => {
                  const emp = employees.find(e => e.id === (r.employee_id || r.employeeId));
                  if (!emp) return null;
                  const h = calcH2(r.checkin, r.checkout);
                  return (
                    <span key={r.id} title={`${emp.name} — ${fmtH2(h)}`} style={{
                      width: 14, height: 14, borderRadius: "50%",
                      background: empColorMap[emp.id] || "#475569",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 6, fontWeight: 700, color: "#fff",
                    }}>{emp.name.charAt(0)}</span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {/* Day detail */}
      {selDay && (() => {
        const dayRecs = monthAtt.filter(a => a.date === selDay);
        const dayTotal = dayRecs.reduce((s, r) => s + calcH2(r.checkin, r.checkout), 0);
        return (
          <div style={{ marginTop: 10, background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#93c5fd", marginBottom: 8 }}>
              {new Date(selDay).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })}
              {" · "}<span style={{ color: "#475569", fontWeight: 400 }}>{fmtH2(dayTotal)}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>{["Zaměstnanec", "Příchod", "Odchod", "Hodin", "Činnost"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 8px", fontSize: 10, color: "#334155", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {dayRecs.map(r => {
                  const emp = employees.find(e => e.id === (r.employee_id || r.employeeId));
                  const h = calcH2(r.checkin, r.checkout);
                  return (
                    <tr key={r.id}>
                      <td style={{ padding: "4px 8px", fontSize: 12, color: "#fff", fontWeight: 600 }}>
                        <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: empColorMap[emp?.id] || "#475569", marginRight: 5 }} />
                        {emp?.name || "—"}
                      </td>
                      <td style={{ padding: "4px 8px", fontSize: 12, color: "#34d399" }}>{r.checkin || "—"}</td>
                      <td style={{ padding: "4px 8px", fontSize: 12, color: "#f59e0b" }}>{r.checkout || <span style={{ color: "#475569" }}>probíhá</span>}</td>
                      <td style={{ padding: "4px 8px", fontSize: 12, color: "#fff", fontWeight: 700 }}>{fmtH2(h)}</td>
                      <td style={{ padding: "4px 8px", fontSize: 11, color: "#64748b", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.activity || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}

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
  // Výchozí pohled skryje dokončené/fakturované zakázky, ať se v seznamu neztrácí
  // rozpracovaná práce — přes filtr "Vše" jdou samozřejmě zobrazit i ty.
  const [filterStatus, setFilterStatus] = useState("aktivní");
  const closeModal = () => setModal(null);
  const [deliveryNotes, setDeliveryNotes] = useState([]);
  const [deliveryNoteItems, setDeliveryNoteItems] = useState([]);
  const [nakCostFilter, setNakCostFilter] = useState({});
  const [vehicleLog, setVehicleLog] = useState([]);
  const [dayPlan, setDayPlan] = useState([]);
  const [projects, setProjects] = useState([]);

  // ── Load ──
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [c, e, p, t, att, bs, msgs, globalTasksData, dn, dni, vl, dp, proj] = await Promise.all([
        supabase.from("contracts").select("*").order("id"),
        supabase.from("contract_cost_entries").select("*").order("date"),
        supabase.from("contract_photos").select("*").order("date"),
        supabase.from("contract_tasks").select("*").order("id"),
        supabase.from("attendance").select("*").order("date"),
        supabase.from("contract_billing_summaries").select("*").order("period_year,period_month"),
        supabase.from("contract_messages").select("*").order("created_at"),
        supabase.from("tasks").select("*").order("id"),
        supabase.from("delivery_notes").select("*").order("id"),
        supabase.from("delivery_note_items").select("*").order("id"),
        supabase.from("vehicle_log").select("*").order("date"),
        supabase.from("project_day_plan").select("*").order("date"),
        supabase.from("projects").select("*").order("id"),
      ]);
      setContracts(c.data || []);
      setEntries(e.data || []);
      setPhotos(p.data || []);
      setCtasks(t.data || []);
      setAttendance((att.data || []).map(x => ({ ...x, employeeId: x.employee_id, contractId: x.contract_id })));
      setBillingSummaries(bs.data || []);
      setContractMessages(msgs.data || []);
      setGlobalTasks(globalTasksData.data || []);
      setDeliveryNotes(dn.data || []);
      setDeliveryNoteItems(dni.data || []);
      setVehicleLog(vl.data || []);
      setDayPlan(dp.data || []);
      setProjects(proj.data || []);
      setLoading(false);
      // Pokud přicházíme z Dealu — rovnou otevřeme modal pro novou zakázku
      if (initialDeal) setModal({ type: "newContract", deal: initialDeal });
    };
    load();
  }, []);

  // ── Výpočty pro zakázku ──
  // Sečítáme přímo z uložených záznamů (contract_cost_entries) — včetně attendance_id.
  // Tím zajistíme konzistenci s tím, co je zobrazeno v řádcích.
  function contractSums(cid) {
    const allE = entries.filter(x => x.contract_id === cid);
    const costOf = (x) => x.amount_cost != null ? Number(x.amount_cost) : Number(x.quantity||1) * Number(x.unit_price_cost||0);
    const clientOf = (x) => x.amount_client != null ? Number(x.amount_client) : Number(x.quantity||1) * Number(x.unit_price_client||0);
    const sum = (type, isExtra) =>
      allE.filter(x => x.cost_type === type && !!x.is_extra === !!isExtra)
        .reduce((s, x) => s + costOf(x), 0);
    const sumClient = (type, isExtra) =>
      allE.filter(x => x.cost_type === type && !!x.is_extra === !!isExtra)
        .reduce((s, x) => s + clientOf(x), 0);

    // Počet hodin — z docházky (pro zobrazení v záhlaví)
    const calcEff = (ci, co) => {
      if (!ci || !co) return 0;
      const [h1,m1] = ci.split(':').map(Number);
      const [h2,m2] = co.split(':').map(Number);
      return Math.max(0, (h2*60+m2 - h1*60-m1)/60 - 1);
    };
    const attRecs = attendance.filter(a => (a.contract_id || a.contractId) === cid && a.checkin && a.checkout);

    // Dodací listy — materiálové náklady z delivery_notes
    const contDN = deliveryNotes.filter(d => d.contract_id === cid);
    const dnMaterialCost = contDN.reduce((s, d) => {
      const items = deliveryNoteItems.filter(i => i.delivery_note_id === d.id);
      return s + items.reduce((sum, i) => sum + Number(i.quantity||1) * Number(i.unit_price||0), 0);
    }, 0);
    const dnMaterialClient = contDN.reduce((s, d) => {
      const items = deliveryNoteItems.filter(i => i.delivery_note_id === d.id);
      const cost = items.reduce((sum, i) => sum + Number(i.quantity||1) * Number(i.unit_price||0), 0);
      return s + cost * (1 + Number(d.margin||30) / 100);
    }, 0);

    return {
      prace:           sum("práce", false),
      material:        sum("materiál", false) + dnMaterialCost,
      doprava:         sum("doprava", false),
      vicePrace:       sum("práce", true),
      viceMaterial:    sum("materiál", true),
      viceDoprava:     sum("doprava", true),
      praceClient:     sumClient("práce", false),
      viceClient:      sumClient("práce", true) + sumClient("materiál", true) + sumClient("doprava", true),
      attHours:        attRecs.reduce((s,a) => s + calcEff(a.checkin, a.checkout), 0),
      dnMaterialCost,
      dnMaterialClient,
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
      type:        form.type || null,
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

    // Pokud zakázka vznikla z obchodního případu, který má napojenou nabídku
    // z Nacenění, založíme rovnou i Projekt s plánem MD a rozvrhem po dnech.
    if (row && form.dealId) {
      try {
        const { data: quote } = await supabase
          .from("quotes").select("*").eq("deal_id", form.dealId)
          .order("updated_at", { ascending: false }).limit(1).maybeSingle();
        const qd = quote?.data;
        if (qd && (qd.interni?.radky?.length || qd.denniPlan?.length)) {
          const plannedMd = mdZeStareInterniho(qd.interni);
          const { data: proj } = await supabase.from("projects").insert({
            name: row.name, customer_id: row.customer_id, status: "Plánování",
            progress: 0, budget: Number(row.price) || 0, spent: 0,
            deadline: null, assignees: [],
            contract_id: row.id, planned_md: plannedMd,
          }).select().single();
          const dny = (qd.denniPlan || []).filter(p => p.datum).map(p => ({
            contract_id: row.id, project_id: proj?.id || null,
            date: p.datum, planned_people: Number(p.pocetLidi) || 1,
            note: p.poznamka || null,
          }));
          if (dny.length) await supabase.from("project_day_plan").insert(dny);
        }
      } catch (e) {
        // Zakázka je hlavní věc a je bezpečně uložená — založení projektu
        // je jen doplněk, takže případnou chybu nebudeme blokovat alertem,
        // jen ji necháme v konzoli pro ladění.
        console.warn("Nepodařilo se založit navazující projekt:", e);
      }
    }

    closeModal();
  }

  // ── Nová nákladová položka ──
  async function saveCostEntry(form) {
    const { data: row } = await supabase.from("contract_cost_entries").insert({
      contract_id:       form.contractId,
      cost_type:         form.costType,
      is_extra:          form.isExtra,
      date:              form.date,
      description:       form.description,
      quantity:          Number(form.quantity) || 1,
      unit:              form.unit,
      unit_price_cost:   Number(form.unitPriceCost) || 0,
      unit_price_client: Number(form.unitPriceClient) || 0,
      employee_id:       form.employeeId ? Number(form.employeeId) : null,
    }).select().single();
    if (row) setEntries([...entries, row]);
    closeModal();
  }

  // ── Smazat nákladovou položku ──
  async function deleteEntry(id) {
    await supabase.from("contract_cost_entries").delete().eq("id", id);
    setEntries(entries.filter(e => e.id !== id));
  }

  // ── Dodací listy ──
  async function saveDeliveryNote(form) {
    const { data: row } = await supabase.from("delivery_notes").insert({
      contract_id: form.contractId,
      supplier:    form.supplier,
      code:        form.code,
      margin:      Number(form.margin) || 30,
      notes:       form.notes || "",
      created_by:  currentUser?.name || "",
    }).select().single();
    if (row) setDeliveryNotes(prev => [...prev, row]);
    closeModal();
  }

  async function deleteDeliveryNote(id) {
    if (!window.confirm("Smazat dodací list i se všemi položkami?")) return;
    await supabase.from("delivery_notes").delete().eq("id", id);
    setDeliveryNotes(prev => prev.filter(d => d.id !== id));
    setDeliveryNoteItems(prev => prev.filter(i => i.delivery_note_id !== id));
  }

  // Plná úprava dodacího listu (dodavatel, kód/číslo, marže, poznámka) —
  // otevírá se kliknutím na hlavičku dodacího listu, stejný formulář jako
  // u přidání nového.
  async function updateDeliveryNoteFull(form) {
    const patch = {
      supplier: form.supplier,
      code:     form.code,
      margin:   Number(form.margin) || 30,
      notes:    form.notes || "",
    };
    await supabase.from("delivery_notes").update(patch).eq("id", form.id);
    setDeliveryNotes(prev => prev.map(d => d.id === form.id ? { ...d, ...patch } : d));
    closeModal();
  }

  async function updateDNMargin(id, margin) {
    await supabase.from("delivery_notes").update({ margin: Number(margin) }).eq("id", id);
    setDeliveryNotes(prev => prev.map(d => d.id === id ? { ...d, margin: Number(margin) } : d));
  }

  async function saveDNItem(form) {
    const { data: row } = await supabase.from("delivery_note_items").insert({
      delivery_note_id: form.deliveryNoteId,
      description:      form.description,
      quantity:         Number(form.quantity) || 1,
      unit:             form.unit || "ks",
      unit_price:       Number(form.unitPrice) || 0,
    }).select().single();
    if (row) setDeliveryNoteItems(prev => [...prev, row]);
    closeModal();
  }

  async function deleteDNItem(id) {
    await supabase.from("delivery_note_items").delete().eq("id", id);
    setDeliveryNoteItems(prev => prev.filter(i => i.id !== id));
  }

  // Plná úprava položky dodacího listu (popis, množství, jednotka, cena) —
  // otevírá se kliknutím na položku, stejný formulář jako u přidání nové.
  async function updateDNItemFull(form) {
    const patch = {
      description: form.description,
      quantity:    Number(form.quantity) || 1,
      unit:        form.unit || "ks",
      unit_price:  Number(form.unitPrice) || 0,
    };
    await supabase.from("delivery_note_items").update(patch).eq("id", form.id);
    setDeliveryNoteItems(prev => prev.map(i => i.id === form.id ? { ...i, ...patch } : i));
    closeModal();
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

  // ── Smazat zakázku ──
  // Náklady, úkoly, fotky a soupisy práce se v DB mažou automaticky (CASCADE
  // na contract_id). Zakázky s navázanou fakturou, projektem, podepsaným
  // dokumentem nebo skladovým pohybem se ale smazat nedají (DB to odmítne) —
  // dřív se to tiše ignorovalo a zakázka zmizela jen z obrazovky, i když v DB
  // zůstala. Teď se chyba zkontroluje a zobrazí se srozumitelná hláška.
  async function deleteContract(id) {
    if (!window.confirm("Smazat zakázku včetně všech nákladů, úkolů a fotek? Tato akce je nevratná.")) return;
    const { error } = await supabase.from("contracts").delete().eq("id", id);
    if (error) {
      alert("Zakázku nejde smazat — má navázané záznamy (např. fakturu, projekt, podepsaný dokument nebo pohyb ve skladu), které je potřeba nejdřív odstranit nebo přeřadit jinam.\n\nDetail: " + error.message);
      return;
    }
    setContracts(prev => prev.filter(c => c.id !== id));
    setEntries(prev => prev.filter(e => e.contract_id !== id));
    setPhotos(prev => prev.filter(p => p.contract_id !== id));
    setCtasks(prev => prev.filter(t => t.contract_id !== id));
    setDeliveryNotes(prev => prev.filter(d => d.contract_id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  // ── Duplikovat zakázku ──
  // Rychlé založení podobné zakázky (např. druhá etapa, sousední dům se
  // stejnou sestavou) — zkopíruje jen základní a rozpočtové údaje, ne náklady,
  // fotky ani historii. Nová zakázka dostane vlastní vygenerovaný kód a stav "Nová".
  async function duplicateContract(contract) {
    if (!window.confirm(`Vytvořit kopii zakázky "${contract.name}"? Zkopíruje se zákazník, typ a rozpočet — bez nákladů, fotek a historie.`)) return;
    const code = await generateContractCode(contract.type, currentUser);
    const { data: row, error } = await supabase.from("contracts").insert({
      customer_id: contract.customer_id,
      code: code || "",
      type: contract.type || null,
      name: (contract.name || "Zakázka") + " (kopie)",
      status: "Nová",
      price: 0,
      notes: "",
      address: "",
      budget_prace: Number(contract.budget_prace) || 0,
      budget_material: Number(contract.budget_material) || 0,
      budget_doprava: Number(contract.budget_doprava) || 0,
      budget_vice_prace: Number(contract.budget_vice_prace) || 0,
      budget_vice_material: Number(contract.budget_vice_material) || 0,
      budget_vice_doprava: Number(contract.budget_vice_doprava) || 0,
    }).select().single();
    if (error) { alert("Chyba při duplikaci zakázky: " + error.message); return; }
    if (row) setContracts(prev => [...prev, row]);
  }

  // ── Editovat zakázku (název, kód, zákazník, cena, adresa, poznámky) ──
  async function saveEditContract(form) {
    const upd = {
      name:        form.name,
      code:        form.code,
      type:        form.type || null,
      customer_id: Number(form.customerId) || null,
      price:       Number(form.price) || 0,
      address:     form.address || "",
      notes:       form.notes || "",
    };
    await supabase.from("contracts").update(upd).eq("id", form.id);
    setContracts(prev => prev.map(c => c.id === form.id ? { ...c, ...upd } : c));
    closeModal();
  }

  // ── Přeřadit nákladovou položku na jinou zakázku ──
  async function moveEntry(entryId, targetContractId) {
    await supabase.from("contract_cost_entries").update({ contract_id: targetContractId }).eq("id", entryId);
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, contract_id: targetContractId } : e));
    closeModal();
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
    let url, storagePath, itemId = null;
    const contract = contracts.find(c => c.id === contractId);
    const folderName = (contract?.name || String(contractId)).replace(/[/\\?%*:|"<>]/g, "_");
    if (isConnected()) {
      try {
        const res = await uploadFileObject(`FirmaCRM/Zakázky/${folderName}/Fotky`, file);
        url = res.webUrl;
        itemId = res.itemId;
        storagePath = "onedrive:" + file.name;
      } catch (e) { alert("OneDrive chyba: " + e.message); return; }
    } else {
      const ext = file.name.split(".").pop();
      const path = `${contractId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("zakazky-fotky").upload(path, file);
      if (error) { alert("Chyba uploadu: " + error.message); return; }
      const { data: urlData } = supabase.storage.from("zakazky-fotky").getPublicUrl(path);
      url = urlData.publicUrl;
      storagePath = path;
    }
    const { data: row } = await supabase.from("contract_photos").insert({
      contract_id: contractId, date: today(),
      storage_path: storagePath, url, item_id: itemId,
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
  const getNakFilter = (cid) => nakCostFilter[cid] || "vše";
  const setNakFilter = (cid, v) => setNakCostFilter(prev => ({ ...prev, [cid]: v }));

  const visibleContracts = contracts.filter(c => {
    const q = searchQ.toLowerCase();
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q) || c.address?.toLowerCase().includes(q);
    const matchStatus = filterStatus === "vše" ? true
      : filterStatus === "aktivní" ? (c.status !== "Dokončena" && c.status !== "Fakturována")
      : c.status === filterStatus;
    return matchSearch && matchStatus;
  });

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
          { label: "Probíhá", value: contracts.filter(c => c.status === "Probíhá").length, color: "#2E9BE0" },
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
        {["aktivní","vše","Nová","Probíhá","Dokončena","Fakturována"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid", fontSize: 12, cursor: "pointer", fontWeight: filterStatus === s ? 700 : 400,
              background: filterStatus === s ? "#6366f1" : "#1a2035",
              color: filterStatus === s ? "#fff" : "#94a3b8",
              borderColor: filterStatus === s ? "#6366f1" : "#252d45" }}>
            {s === "vše" ? "Vše" : s === "aktivní" ? "Aktivní" : s}
          </button>
        ))}
      </div>

      {/* SEZNAM ZAKÁZEK */}
      {contracts.length === 0 && (
        <div style={{ ...S.card, color: "#475569", textAlign: "center", padding: 40 }}>
          Žádné zakázky. Klikněte "+ Nová zakázka" nebo převeďte obchodní případ.
        </div>
      )}
      {contracts.length > 0 && visibleContracts.length === 0 && (
        <div style={{ ...S.card, color: "#475569", textAlign: "center", padding: 40 }}>
          {filterStatus === "aktivní"
            ? "Žádné aktivní zakázky — všechny jsou dokončené nebo fakturované. Zobrazit je můžeš přes filtr \"Vše\"."
            : "Žádná zakázka neodpovídá filtru/hledání."}
        </div>
      )}

      {visibleContracts.map(contract => {
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
        const contAttendance = attendance.filter(a => (a.contract_id || a.contractId) === contract.id);
        const contVehicleLog = vehicleLog.filter(v => v.contract_id === contract.id);
        const contDayPlan = dayPlan.filter(d => d.contract_id === contract.id);
        const contProject = projects.find(p => p.contract_id === contract.id);
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
                onClick={() => setModal({ type: "editContract", contract })}
                title="Upravit zakázku"
                style={{ background: "#1a2035", border: "1px solid #252d45", borderRadius: 8, padding: "6px 10px", color: "#94a3b8", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>
                ✏️
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("openSheet", { detail: { contractId: contract.id, contractName: contract.name } }))}
                title="Zakázkový list"
                style={{ background: "#2E9BE022", border: "1px solid #2E9BE044", borderRadius: 8, padding: "6px 10px", color: "#2E9BE0", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>
                📋
              </button>
              <button
                onClick={() => duplicateContract(contract)}
                title="Duplikovat zakázku"
                style={{ background: "#1a2035", border: "1px solid #252d45", borderRadius: 8, padding: "6px 10px", color: "#94a3b8", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>
                📑
              </button>
              <button
                onClick={() => deleteContract(contract.id)}
                title="Smazat zakázku"
                style={{ background: "#f8717111", border: "1px solid #f8717133", borderRadius: 8, padding: "6px 10px", color: "#f87171", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>
                🗑
              </button>
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
                      style={{ background: view === v ? "#2E9BE0" : "transparent", color: view === v ? "#fff" : "#64748b", border: "none", borderRadius: "8px 8px 0 0", padding: "8px 20px", fontSize: 13, fontWeight: view === v ? 700 : 500, cursor: "pointer", transition: "all 0.15s" }}>
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
                  {[["naklady","💰 Náklady"], ["financni","📊 Finance"], ["fakturace","🧾 K fakturaci"], ["zamestnanci",`👷 Zaměstnanci (${contAttendance.length})`], ...(contProject || contDayPlan.length ? [["plan","📐 Plán vs. skutečnost"]] : []), ["ukoly",`✅ Úkoly (${contTasks.length})`], ["fotky",`📷 Fotky (${contPhotos.length})`], ["komunikace","💬 Komunikace"], ["priprava","📋 Příprava"], ["dokumenty","📁 Dokumenty"], ["soupis","📋 Soupis práce"]].map(([t, label]) => (
                    <button key={t} onClick={() => setTab(contract.id, t)}
                      style={{ background: "none", border: "none", borderBottom: tab === t ? "2px solid #6366f1" : "2px solid transparent", color: tab === t ? "#fff" : "#475569", padding: "8px 16px", fontSize: 13, cursor: "pointer", fontWeight: tab === t ? 600 : 400 }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* TAB: NÁKLADY */}
                {tab === "naklady" && (() => {
                  const nakFilter = getNakFilter(contract.id);
                  const contDN = deliveryNotes.filter(d => d.contract_id === contract.id);
                  const showPrace    = nakFilter === "vše" || nakFilter === "práce";
                  const showMaterial = nakFilter === "vše" || nakFilter === "materiál";
                  const showDoprava  = nakFilter === "vše" || nakFilter === "doprava";
                  return (
                    <div>
                      {/* FILTR DROPDOWN */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                        <label style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>Zobrazit:</label>
                        <select
                          value={nakFilter}
                          onChange={e => setNakFilter(contract.id, e.target.value)}
                          style={{ ...S.select, marginBottom: 0, width: 180 }}>
                          <option value="vše">Vše</option>
                          <option value="práce">🔨 Práce</option>
                          <option value="materiál">📦 Materiál + dodací listy</option>
                          <option value="doprava">🚛 Doprava</option>
                        </select>
                      </div>

                      {/* PRÁCE */}
                      {showPrace && <>
                        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>🔨 Práce — základní</div>
                        <div style={{ marginBottom: 12 }}>
                          <CostSection
                            label="práce" actual={sums.prace} budget={contract.budget_prace}
                            entries={contEntries.filter(e => e.cost_type === "práce" && !e.is_extra)}
                            employees={employees} contractId={contract.id}
                            onUpdateBudget={(nv) => updateBudget(contract.id, "budget_prace", nv, contract.budget_prace)}
                            onAddEntry={() => setModal({ type: "addEntry", contractId: contract.id, costType: "práce", isExtra: false })}
                            onDeleteEntry={deleteEntry} onToggleApproved={toggleApproved}
                            onMoveEntry={(eid) => setModal({ type: "moveEntry", entryId: eid, currentContractId: contract.id })}
                          />
                        </div>
                        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>🔨 Práce — vícepráce</div>
                        <div style={{ marginBottom: 20 }}>
                          <CostSection
                            label="Více – práce" actual={sums.vicePrace} budget={contract.budget_vice_prace}
                            entries={contEntries.filter(e => e.cost_type === "práce" && e.is_extra)}
                            employees={employees} contractId={contract.id}
                            onUpdateBudget={(nv) => updateBudget(contract.id, "budget_vice_prace", nv, contract.budget_vice_prace)}
                            onAddEntry={() => setModal({ type: "addEntry", contractId: contract.id, costType: "práce", isExtra: true })}
                            onDeleteEntry={deleteEntry} onToggleApproved={toggleApproved} isExtra
                            onMoveEntry={(eid) => setModal({ type: "moveEntry", entryId: eid, currentContractId: contract.id })}
                          />
                        </div>

                        {/* KALENDÁŘ PRÁCE */}
                        <ContractKalendarWidget attendance={contAttendance} employees={employees} />

                      </>}

                      {/* MATERIÁL */}
                      {showMaterial && <>
                        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>📦 Materiál — základní</div>
                        <div style={{ marginBottom: 12 }}>
                          <CostSection
                            label="materiál" actual={sums.material} budget={contract.budget_material}
                            entries={contEntries.filter(e => e.cost_type === "materiál" && !e.is_extra)}
                            employees={employees} contractId={contract.id}
                            onUpdateBudget={(nv) => updateBudget(contract.id, "budget_material", nv, contract.budget_material)}
                            onAddEntry={() => setModal({ type: "addEntry", contractId: contract.id, costType: "materiál", isExtra: false })}
                            onDeleteEntry={deleteEntry} onToggleApproved={toggleApproved}
                            onMoveEntry={(eid) => setModal({ type: "moveEntry", entryId: eid, currentContractId: contract.id })}
                          />
                        </div>

                        {/* DODACÍ LISTY */}
                        <div style={{ background: "#0a0d14", borderRadius: 10, border: "1px solid #1a2035", marginBottom: 12, overflow: "hidden" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: contDN.length > 0 ? "1px solid #1a2035" : "none" }}>
                            <div>
                              <div style={{ fontWeight: 700, color: "#fff", fontSize: 13 }}>📋 Dodací listy</div>
                              {contDN.length > 0 && (
                                <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
                                  Náklad: <span style={{ color: "#f87171", fontWeight: 700 }}>{fmtKc(sums.dnMaterialCost)}</span>
                                  {" · "}Fakturace: <span style={{ color: "#34d399", fontWeight: 700 }}>{fmtKc(sums.dnMaterialClient)}</span>
                                </div>
                              )}
                            </div>
                            <button style={{ ...S.btn("#1a2035"), border: "1px solid #252d45", color: "#6366f1", fontSize: 12, padding: "6px 14px" }}
                              onClick={() => setModal({ type: "addDeliveryNote", contractId: contract.id })}>
                              + Nový dodací list
                            </button>
                          </div>
                          {contDN.length === 0 && (
                            <div style={{ padding: "16px", fontSize: 12, color: "#334155" }}>Žádné dodací listy. Klikněte "+ Nový dodací list".</div>
                          )}
                          {contDN.map(dn => (
                            <DeliveryNoteRow
                              key={dn.id} dn={dn}
                              items={deliveryNoteItems.filter(i => i.delivery_note_id === dn.id)}
                              onDelete={() => deleteDeliveryNote(dn.id)}
                              onUpdateMargin={(m) => updateDNMargin(dn.id, m)}
                              onAddItem={() => setModal({ type: "addDNItem", deliveryNoteId: dn.id })}
                              onDeleteItem={deleteDNItem}
                              onEditItem={(item) => setModal({ type: "addDNItem", deliveryNoteId: dn.id, item })}
                              onEditNote={() => setModal({ type: "addDeliveryNote", contractId: contract.id, dn })}
                            />
                          ))}
                        </div>

                        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>📦 Materiál — vícepráce</div>
                        <div style={{ marginBottom: 20 }}>
                          <CostSection
                            label="Více – materiál" actual={sums.viceMaterial} budget={contract.budget_vice_material}
                            entries={contEntries.filter(e => e.cost_type === "materiál" && e.is_extra)}
                            employees={employees} contractId={contract.id}
                            onUpdateBudget={(nv) => updateBudget(contract.id, "budget_vice_material", nv, contract.budget_vice_material)}
                            onAddEntry={() => setModal({ type: "addEntry", contractId: contract.id, costType: "materiál", isExtra: true })}
                            onDeleteEntry={deleteEntry} onToggleApproved={toggleApproved} isExtra
                            onMoveEntry={(eid) => setModal({ type: "moveEntry", entryId: eid, currentContractId: contract.id })}
                          />
                        </div>
                      </>}

                      {/* DOPRAVA */}
                      {showDoprava && <>
                        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>🚛 Doprava — základní</div>
                        <div style={{ marginBottom: 12 }}>
                          <CostSection
                            label="doprava" actual={sums.doprava} budget={contract.budget_doprava}
                            entries={contEntries.filter(e => e.cost_type === "doprava" && !e.is_extra)}
                            employees={employees} contractId={contract.id}
                            onUpdateBudget={(nv) => updateBudget(contract.id, "budget_doprava", nv, contract.budget_doprava)}
                            onAddEntry={() => setModal({ type: "addEntry", contractId: contract.id, costType: "doprava", isExtra: false })}
                            onDeleteEntry={deleteEntry} onToggleApproved={toggleApproved}
                            onMoveEntry={(eid) => setModal({ type: "moveEntry", entryId: eid, currentContractId: contract.id })}
                          />
                        </div>
                        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>🚛 Doprava — vícepráce</div>
                        <div style={{ marginBottom: 20 }}>
                          <CostSection
                            label="Více – doprava" actual={sums.viceDoprava} budget={contract.budget_vice_doprava}
                            entries={contEntries.filter(e => e.cost_type === "doprava" && e.is_extra)}
                            employees={employees} contractId={contract.id}
                            onUpdateBudget={(nv) => updateBudget(contract.id, "budget_vice_doprava", nv, contract.budget_vice_doprava)}
                            onAddEntry={() => setModal({ type: "addEntry", contractId: contract.id, costType: "doprava", isExtra: true })}
                            onDeleteEntry={deleteEntry} onToggleApproved={toggleApproved} isExtra
                            onMoveEntry={(eid) => setModal({ type: "moveEntry", entryId: eid, currentContractId: contract.id })}
                          />
                        </div>
                      </>}
                    </div>
                  );
                })()}

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

                {/* TAB: PLÁN VS. SKUTEČNOST */}
                {tab === "plan" && (
                  <PlanTab project={contProject} dayPlan={contDayPlan} attendance={contAttendance} vehicleLog={contVehicleLog} employees={employees} />
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
                          <div key={m.id} style={{ background: "#0E3B5E", borderRadius: 10, padding: "9px 13px" }}>
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
                {tab === "soupis" && (() => {
                  const sorted = [...contAttendance].sort((a, b) => b.date?.localeCompare(a.date));
                  const calcH = (ci, co) => {
                    if (!ci || !co) return 0;
                    const [h1,m1] = ci.split(":").map(Number);
                    const [h2,m2] = co.split(":").map(Number);
                    return Math.max(0, (h2*60+m2-(h1*60+m1))/60);
                  };
                  const fmtH = h => h <= 0 ? "—" : `${Math.floor(h)}h ${String(Math.round((h-Math.floor(h))*60)).padStart(2,"0")}m`;
                  const totalH = sorted.reduce((s,r) => s + calcH(r.checkin, r.checkout), 0);
                  const generatePDF = () => {
                    const rows = sorted.map(r => {
                      const emp = employees.find(e => e.id === (r.employee_id || r.employeeId));
                      const h = calcH(r.checkin, r.checkout);
                      return "<tr><td>"+fmtDateCz(r.date)+"</td><td>"+(emp?.name||"—")+"</td><td>"+(r.checkin||"—")+"</td><td>"+(r.checkout||"—")+"</td><td><strong>"+fmtH(h)+"</strong></td><td>"+(r.activity||"—")+"</td></tr>";
                    }).join("");
                    const totalRow = "<tr class='total'><td colspan='4'>Celkem</td><td><strong>"+fmtH(totalH)+"</strong></td><td>"+sorted.length+" záznamů</td></tr>";
                    const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Soupis práce — "+contract.name+"</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#555;font-weight:normal;margin-bottom:24px}table{width:100%;border-collapse:collapse}th{background:#0E3B5E;color:#fff;padding:8px 12px;text-align:left;font-size:12px}td{padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:12px}tr:nth-child(even) td{background:#f8fafc}tr.total td{font-weight:bold;background:#e0f2fe;border-top:2px solid #0284c7}@media print{body{padding:16px}}</style></head><body><h1>Soupis práce</h1><h2>"+contract.name+(contract.code?" · "+contract.code:"")+"</h2><table><thead><tr><th>Datum</th><th>Zaměstnanec</th><th>Příchod</th><th>Odchod</th><th>Odprac.</th><th>Činnost</th></tr></thead><tbody>"+rows+totalRow+"</tbody></table><script>window.onload=function(){window.print();<\/script><\/body><\/html>";
                    const win = window.open("", "_blank");
                    win.document.write(html);
                    win.document.close();
                  };
                  return (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 13, color: "#475569" }}>
                          Celkem: <strong style={{ color: "#fff" }}>{fmtH(totalH)}</strong> · {sorted.length} záznamů
                        </div>
                        <div style={{ flex: 1 }} />
                        <button style={{ ...S.btn("#6366f1"), padding: "7px 16px", fontWeight: 700, fontSize: 13 }} onClick={generatePDF}>
                          📄 Generovat PDF
                        </button>
                      </div>
                      {sorted.length === 0 ? (
                        <div style={{ color: "#475569", fontSize: 13 }}>Žádné záznamy práce pro tuto zakázku.</div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>{["Datum","Zaměstnanec","Příchod","Odchod","Hodiny","Činnost"].map(h => (
                              <th key={h} style={{ textAlign:"left", padding:"6px 10px", fontSize:11, color:"#475569", fontWeight:700, borderBottom:"1.5px solid #e2e8f0" }}>{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody>
                            {sorted.map(r => {
                              const emp = employees.find(e => e.id === (r.employee_id || r.employeeId));
                              const h = calcH(r.checkin, r.checkout);
                              return (
                                <tr key={r.id} style={{ borderBottom:"1px solid #e2e8f0" }}>
                                  <td style={{ padding:"6px 10px", fontSize:13, color:"#94a3b8" }}>{fmtDateCz(r.date)}</td>
                                  <td style={{ padding:"6px 10px", fontSize:13, color:"#fff", fontWeight:600 }}>{emp?.name||"—"}</td>
                                  <td style={{ padding:"6px 10px", fontSize:13, color:"#34d399" }}>{r.checkin||"—"}</td>
                                  <td style={{ padding:"6px 10px", fontSize:13, color:"#f59e0b" }}>{r.checkout||<span style={{color:"#475569"}}>probíhá</span>}</td>
                                  <td style={{ padding:"6px 10px", fontSize:13, color:"#fff", fontWeight:700 }}>{fmtH(h)}</td>
                                  <td style={{ padding:"6px 10px", fontSize:12, color:"#94a3b8", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.activity||"—"}</td>
                                </tr>
                              );
                            })}
                            <tr style={{ borderTop:"2px solid #1e3a5f" }}>
                              <td colSpan={4} style={{ padding:"8px 10px", fontSize:13, color:"#475569", fontWeight:600 }}>Celkem</td>
                              <td style={{ padding:"8px 10px", fontSize:13, color:"#6366f1", fontWeight:700 }}>{fmtH(totalH)}</td>
                              <td style={{ padding:"8px 10px", fontSize:12, color:"#475569" }}>{sorted.length} záznamů</td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })()}
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
          customers={customers} deal={modal.deal} currentUser={currentUser}
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
      {modal?.type === "addDeliveryNote" && (
        <AddDeliveryNoteModal
          contractId={modal.contractId}
          dn={modal.dn}
          onSave={modal.dn ? updateDeliveryNoteFull : saveDeliveryNote} onClose={closeModal}
        />
      )}
      {modal?.type === "addDNItem" && (
        <AddDNItemModal
          deliveryNoteId={modal.deliveryNoteId}
          item={modal.item}
          onSave={modal.item ? updateDNItemFull : saveDNItem} onClose={closeModal}
        />
      )}
      {modal?.type === "editContract" && (
        <EditContractModal
          contract={modal.contract}
          customers={customers}
          onSave={saveEditContract} onClose={closeModal}
        />
      )}
      {modal?.type === "moveEntry" && (
        <MoveEntryModal
          entryId={modal.entryId}
          currentContractId={modal.currentContractId}
          contracts={contracts}
          onMove={moveEntry} onClose={closeModal}
        />
      )}
    </>
  );
}

// ─── SEKCE NÁKLADŮ ───────────────────────────────────────────────────────────
function CostSection({ label, actual, budget, entries, employees, onUpdateBudget, onAddEntry, onDeleteEntry, onToggleApproved, onMoveEntry, isExtra }) {
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
                    {fmtDateCz(e.date)} {emp ? `· ${emp.name}` : ""}
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
                {!isBilled && onMoveEntry && (
                  <button onClick={() => onMoveEntry(e.id)} title="Přesunout na jinou zakázku"
                    style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 13, padding: "0 2px" }}>⇄</button>
                )}
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
  const [rates, setRates] = useState({}); // {attendanceId: billing_rate}

  useEffect(() => {
    const init = {};
    attendance.forEach(a => { if (a.billing_rate != null) init[a.id] = a.billing_rate; });
    setRates(init);
  }, [attendance]);

  const calcH = (ci, co) => {
    if (!ci || !co) return 0;
    const [h1, m1] = ci.split(":").map(Number);
    const [h2, m2] = co.split(":").map(Number);
    return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
  };
  const fmtH = (h) => `${Math.floor(h)}h ${pad(Math.round((h - Math.floor(h)) * 60))}m`;

  const sorted = [...attendance].sort((a, b) => b.date?.localeCompare(a.date));
  const totalH = attendance.reduce((s, a) => s + calcH(a.checkin, a.checkout), 0);
  const totalBilled = sorted.reduce((s, r) => {
    const emp = employees.find(e => e.id === r.employeeId || e.id === r.employee_id);
    const rate = rates[r.id] ?? r.billing_rate ?? Number(emp?.hourly_rate_client || 0);
    return s + calcH(r.checkin, r.checkout) * rate;
  }, 0);

  const saveRate = async (recId, val) => {
    const num = val === "" ? null : Number(val);
    setRates(prev => ({ ...prev, [recId]: num }));
    await supabase.from("attendance").update({ billing_rate: num }).eq("id", recId);
    // RPC záloha — obchází schema cache
    await supabase.rpc("set_attendance_billing_rate", { att_id: recId, rate: num });
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 24, marginBottom: 12, fontSize: 12, color: "#475569" }}>
        <span>Celkem odpracováno: <strong style={{ color: "#fff" }}>{fmtH(totalH)}</strong></span>
        <span>Celkem fakturováno: <strong style={{ color: "#34d399" }}>{fmtKc(totalBilled)}</strong></span>
      </div>
      {sorted.length === 0 ? (
        <div style={{ color: "#334155", fontSize: 13 }}>Žádné záznamy docházky pro tuto zakázku.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Datum","Zaměstnanec","Příchod","Odchod","Hod.","Sazba (Kč/h)","Fakturováno","Činnost"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const emp = employees.find(e => e.id === r.employeeId || e.id === r.employee_id);
              const h = calcH(r.checkin, r.checkout);
              const defaultRate = Number(emp?.hourly_rate_client || 0);
              const currentRate = rates[r.id] ?? r.billing_rate ?? defaultRate;
              const billed = h * currentRate;
              return (
                <tr key={r.id}>
                  <td style={S.td}>{fmtDateCz(r.date)}</td>
                  <td style={{ ...S.td, color: "#fff", fontWeight: 600 }}>{emp?.name || "—"}</td>
                  <td style={{ ...S.td, color: "#34d399" }}>{r.checkin || "—"}</td>
                  <td style={{ ...S.td, color: "#f59e0b" }}>{r.checkout || <span style={{ color: "#334155" }}>probíhá</span>}</td>
                  <td style={{ ...S.td, color: "#fff", fontWeight: 700 }}>{h > 0 ? fmtH(h) : "—"}</td>
                  <td style={S.td}>
                    <input
                      type="number"
                      style={{ ...S.input, marginBottom: 0, width: 80, padding: "3px 6px", fontSize: 12,
                        borderColor: (rates[r.id] != null && rates[r.id] !== defaultRate) ? "#f59e0b" : undefined }}
                      value={currentRate}
                      onChange={e => setRates(prev => ({ ...prev, [r.id]: e.target.value }))}
                      onBlur={e => saveRate(r.id, e.target.value)}
                      title={`Výchozí sazba zaměstnance: ${defaultRate} Kč/h`}
                    />
                  </td>
                  <td style={{ ...S.td, color: "#34d399", fontWeight: 700 }}>{h > 0 ? fmtKc(billed) : "—"}</td>
                  <td style={{ ...S.td, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.activity || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── TAB: PLÁN VS. SKUTEČNOST ────────────────────────────────────────────────
// Plán (z Nacenění: planned_md + project_day_plan) vs. skutečnost odvozená
// automaticky z docházky a knihy jízd navázané na tuto zakázku — bez
// samostatného ručního deníku, přesně jak bylo zadáno.
function PlanTab({ project, dayPlan, attendance, vehicleLog, employees }) {
  const HOD_NA_MD = 8;
  const calcH = (ci, co) => {
    if (!ci || !co) return 0;
    const [h1, m1] = ci.split(":").map(Number);
    const [h2, m2] = co.split(":").map(Number);
    return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
  };

  const skutecneHod = attendance.reduce((s, a) => s + calcH(a.checkin, a.checkout), 0);
  const skutecneMd = skutecneHod / HOD_NA_MD;
  const plannedMd = Number(project?.planned_md) || 0;
  const rozdilMd = skutecneMd - plannedMd;

  const skutecneKm = vehicleLog.reduce((s, v) => s + (Number(v.km_total) || 0), 0);

  // Skutečný počet lidí za den — podle unikátních zaměstnanců v docházce daného dne.
  const lidePoDnu = {};
  attendance.forEach(a => {
    if (!a.date) return;
    if (!lidePoDnu[a.date]) lidePoDnu[a.date] = new Set();
    lidePoDnu[a.date].add(a.employeeId || a.employee_id);
  });

  const vsechnyDny = Array.from(new Set([...dayPlan.map(d => d.date), ...Object.keys(lidePoDnu)])).sort();

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
        <div style={{ ...S.card, marginBottom: 0, padding: 14 }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Plán MD</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#a78bfa" }}>{plannedMd ? Math.round(plannedMd * 100) / 100 : "—"}</div>
        </div>
        <div style={{ ...S.card, marginBottom: 0, padding: 14 }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Skutečnost MD</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{Math.round(skutecneMd * 100) / 100}</div>
        </div>
        <div style={{ ...S.card, marginBottom: 0, padding: 14 }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Rozdíl</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: rozdilMd <= 0 ? "#34d399" : "#f87171" }}>
            {rozdilMd > 0 ? "+" : ""}{Math.round(rozdilMd * 100) / 100}
          </div>
        </div>
        <div style={{ ...S.card, marginBottom: 0, padding: 14 }}>
          <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>Najeto km</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{skutecneKm}</div>
        </div>
      </div>

      {!plannedMd && dayPlan.length === 0 ? (
        <div style={{ color: "#334155", fontSize: 13 }}>Tato zakázka nemá plán z Nacenění — porovnání se zobrazí u zakázek založených z nabídky s rozvrhem po dnech.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Datum", "Plán (lidí)", "Skutečnost (lidí)", "Poznámka z plánu"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {vsechnyDny.map(date => {
              const plan = dayPlan.find(d => d.date === date);
              const skutLide = lidePoDnu[date]?.size || 0;
              const planLide = plan ? Number(plan.planned_people) || 0 : null;
              const sedi = planLide == null || planLide === skutLide;
              return (
                <tr key={date}>
                  <td style={S.td}>{fmtDateCz(date)}</td>
                  <td style={{ ...S.td, color: "#a78bfa", fontWeight: 700 }}>{planLide ?? "—"}</td>
                  <td style={{ ...S.td, fontWeight: 700, color: sedi ? "#34d399" : "#f59e0b" }}>{skutLide || "—"}</td>
                  <td style={{ ...S.td, color: "#64748b" }}>{plan?.note || ""}</td>
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
                <OneDriveThumb itemId={p.item_id} fallbackUrl={p.url} alt={p.description} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
        <div style={{ fontWeight: 700, color: "#1A1A1A", fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          📍 Základní info
        </div>

        <label style={S.label}>Adresa místa výkonu</label>
        <input style={S.input} value={address} onChange={e => setAddress(e.target.value)} placeholder="Ulice 123, Praha" />

        <label style={S.label}>Datum dokončení</label>
        <input type="date" style={S.input} value={dueDate} onChange={e => setDueDate(e.target.value)} />

        <div style={{ fontWeight: 700, color: "#1A1A1A", fontSize: 14, margin: "20px 0 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          🗓 Průběžné termíny
          <button onClick={addMilestone} style={{ ...S.btn(), padding: "4px 12px", fontSize: 12 }}>+ Přidat</button>
        </div>

        {milestones.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>Žádné termíny.</div>}
        {milestones.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, background: "#f8fafc", borderRadius: 8, padding: "8px 10px", border: "1px solid #e2e8f0" }}>
            <input
              type="checkbox" checked={m.done}
              onChange={e => updMilestone(i, "done", e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#2E9BE0", flexShrink: 0 }} />
            <input
              style={{ ...S.input, marginBottom: 0, flex: 1, fontSize: 13, textDecoration: m.done ? "line-through" : "none", color: m.done ? "#94a3b8" : "#1A1A1A" }}
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
        <div style={{ fontWeight: 700, color: "#1A1A1A", fontSize: 14, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
            style={{ background: "#dbeafe", color: "#2E9BE0", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
            🗺 Otevřít v Mapy.cz
          </a>
        )}
      </div>
    </div>
  );
}

function NewContractModal({ customers, deal, currentUser, onSave, onClose }) {
  const [f, setF] = useState({
    code: "", type: "", name: deal?.name || "", customerId: deal?.customerId || deal?.customer_id || "",
    status: "Nová", price: deal?.value || "", notes: "", address: "",
    budgetPrace: "", budgetMaterial: "", budgetDoprava: "",
    budgetVicePrace: "", budgetViceMaterial: "", budgetViceDoprava: "",
    dealId: deal?.id || null,
  });
  const [codeAuto, setCodeAuto] = useState(true);
  const [codeLoading, setCodeLoading] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const onTypeChange = (type) => {
    set("type", type);
    if (!codeAuto || !type) return;
    setCodeLoading(true);
    generateContractCode(type, currentUser)
      .then(code => { if (code) set("code", code); })
      .catch(e => console.warn("Generování kódu selhalo:", e))
      .finally(() => setCodeLoading(false));
  };

  return (
    <div style={S.modal}>
      <div style={S.modalBox}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#fff" }}>Nová zakázka</div>
          <button style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }} onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={S.label}>Typ zakázky</label>
            <select style={S.select} value={f.type} onChange={e => onTypeChange(e.target.value)}>
              <option value="">— vyberte —</option>
              {TYPY_ZAKAZEK.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Název zakázky</label>
            <input style={S.input} value={f.name} onChange={e => set("name", e.target.value)} />
          </div>
        </div>

        <div>
          <label style={S.label}>Kód zakázky{codeLoading ? " (generuje se…)" : ""}</label>
          <input
            style={S.input}
            value={f.code}
            onChange={e => { setCodeAuto(false); set("code", e.target.value); }}
            placeholder="vyberte typ zakázky pro automatické vygenerování"
          />
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
            <span style={{ fontWeight: 700, color: pct === 100 ? "#16a34a" : "#2E9BE0" }}>{pct}%</span>
          </div>
          <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#16a34a" : "#2E9BE0", borderRadius: 3, transition: "width 0.4s" }} />
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
          style={{ width: 17, height: 17, accentColor: "#2E9BE0", cursor: "pointer", flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: task.done ? "#94a3b8" : "#1A1A1A", textDecoration: task.done ? "line-through" : "none" }}>
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
            style={{ width: 15, height: 15, accentColor: "#F5821F", cursor: "pointer", flexShrink: 0 }} />
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
      let url, storagePath;
      // Název zakázky pro složku
      const { data: cData } = await supabase.from("contracts").select("name").eq("id", contractId).single();
      const folderName = (cData?.name || String(contractId)).replace(/[/\\?%*:|"<>]/g, "_");
      if (isConnected()) {
        try {
          const res = await uploadFileObject(`FirmaCRM/Zakázky/${folderName}/Dokumenty`, file);
          url = res.webUrl;
          storagePath = "onedrive:" + file.name;
        } catch (e) { alert("OneDrive chyba: " + e.message); continue; }
      } else {
        const path = `${contractId}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from("zakazky-dokumenty").upload(path, file);
        if (error) { alert("Chyba: " + error.message); continue; }
        const { data: urlData } = supabase.storage.from("zakazky-dokumenty").getPublicUrl(path);
        url = urlData.publicUrl;
        storagePath = path;
      }
      const ext = file.name.split(".").pop().toLowerCase();
      const { data: row } = await supabase.from("contract_documents").insert({
        contract_id: contractId, name: file.name, description: desc || "",
        url, storage_path: storagePath, file_type: ext,
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
            <a href={doc.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: "#2E9BE0", fontSize: 14, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

// ─── DODACÍ LIST ROW ─────────────────────────────────────────────────────────
function DeliveryNoteRow({ dn, items, onDelete, onUpdateMargin, onAddItem, onDeleteItem, onEditItem, onEditNote }) {
  const [expanded, setExpanded] = useState(false);
  const [editMargin, setEditMargin] = useState(false);
  const [marginVal, setMarginVal] = useState(String(dn.margin ?? 30));

  const totalCost   = items.reduce((s, i) => s + Number(i.quantity||1) * Number(i.unit_price||0), 0);
  const totalClient = totalCost * (1 + Number(dn.margin||30) / 100);

  return (
    <div style={{ borderBottom: "1px solid #1a2035" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={onEditNote} title="Klikni pro úpravu dodavatele a čísla">
            <span style={{ background: "#6366f122", color: "#818cf8", borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{dn.code}</span>
            <span style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 13 }}>{dn.supplier}</span>
            <span style={{ fontSize: 11, color: "#334155" }}>✏️</span>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 11, color: "#475569", flexWrap: "wrap", alignItems: "center" }}>
            <span>Náklad: <strong style={{ color: "#f87171" }}>{fmtKc(totalCost)}</strong></span>
            <span>Fakturace: <strong style={{ color: "#34d399" }}>{fmtKc(totalClient)}</strong></span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              Marže:{" "}
              {editMargin ? (
                <>
                  <input
                    type="number"
                    value={marginVal}
                    onChange={e => setMarginVal(e.target.value)}
                    style={{ width: 50, background: "#0f1320", border: "1px solid #252d45", borderRadius: 4, color: "#e2e8f0", fontSize: 11, padding: "2px 5px" }}
                  />
                  %{" "}
                  <button onClick={() => { onUpdateMargin(marginVal); setEditMargin(false); }}
                    style={{ background: "none", border: "none", color: "#34d399", cursor: "pointer", fontSize: 13 }}>✓</button>
                  <button onClick={() => setEditMargin(false)}
                    style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 13 }}>✕</button>
                </>
              ) : (
                <>
                  <strong style={{ color: "#f59e0b" }}>{dn.margin ?? 30}%</strong>{" "}
                  <button onClick={() => { setMarginVal(String(dn.margin ?? 30)); setEditMargin(true); }}
                    style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 11, padding: 0 }}>✏️</button>
                </>
              )}
            </span>
          </div>
        </div>
        <button onClick={() => setExpanded(e => !e)}
          style={{ background: "none", border: "1px solid #252d45", borderRadius: 6, color: "#94a3b8", cursor: "pointer", fontSize: 11, padding: "4px 10px", whiteSpace: "nowrap" }}>
          {expanded ? `▲ Sbalit (${items.length})` : `▼ Položky (${items.length})`}
        </button>
        <button onClick={onAddItem}
          style={{ background: "#1a2035", border: "1px solid #6366f144", borderRadius: 6, color: "#6366f1", fontSize: 11, padding: "5px 10px", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
          + Položka
        </button>
        <button onClick={onDelete}
          style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 18, padding: "0 4px", lineHeight: 1 }}>×</button>
      </div>

      {expanded && (
        <div style={{ background: "#080b12", borderTop: "1px solid #1a2035" }}>
          {items.length === 0 && (
            <div style={{ padding: "12px 16px", fontSize: 12, color: "#334155" }}>Žádné položky. Klikněte "+ Položka".</div>
          )}
          {items.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Popis", "Množství", "Jedn.", "Cena/j (náklad)", "Cena/j (fakt.)", "Celkem náklad", "Celkem fakt.", ""].map(h => (
                    <th key={h} style={{ ...S.th, fontSize: 10, padding: "6px 10px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const itemCost   = Number(item.quantity||1) * Number(item.unit_price||0);
                  const margin     = Number(dn.margin||30) / 100;
                  const itemClient = itemCost * (1 + margin);
                  const clientUnit = Number(item.unit_price||0) * (1 + margin);
                  return (
                    <tr key={item.id} onClick={() => onEditItem(item)} title="Klikni pro úpravu položky"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#0f1320"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ ...S.td, color: "#e2e8f0" }}>{item.description}</td>
                      <td style={S.td}>{item.quantity}</td>
                      <td style={S.td}>{item.unit}</td>
                      <td style={{ ...S.td, color: "#f87171" }}>{fmtKc(item.unit_price)}</td>
                      <td style={{ ...S.td, color: "#34d399" }}>{fmtKc(clientUnit)}</td>
                      <td style={{ ...S.td, color: "#f87171", fontWeight: 700 }}>{fmtKc(itemCost)}</td>
                      <td style={{ ...S.td, color: "#34d399", fontWeight: 700 }}>{fmtKc(itemClient)}</td>
                      <td style={S.td}>
                        <button onClick={e => { e.stopPropagation(); onDeleteItem(item.id); }}
                          style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 16 }}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── MODAL: NOVÝ / EDITACE DODACÍHO LISTU ────────────────────────────────────
function AddDeliveryNoteModal({ contractId, dn, onSave, onClose }) {
  const isEdit = !!dn;
  const [f, setF] = useState(isEdit
    ? { id: dn.id, supplier: dn.supplier || "", code: dn.code || "", margin: String(dn.margin ?? "30"), notes: dn.notes || "", contractId }
    : { supplier: "", code: "", margin: "30", notes: "", contractId });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <div style={S.modal}>
      <div style={S.modalBox}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#fff" }}>{isEdit ? "Upravit dodací list" : "Nový dodací list"}</div>
          <button style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }} onClick={onClose}>✕</button>
        </div>

        <label style={S.label}>Dodavatel *</label>
        <input style={S.input} value={f.supplier} onChange={e => set("supplier", e.target.value)} placeholder="Firma Novák s.r.o." />

        <label style={S.label}>Kód / číslo dodacího listu *</label>
        <input style={S.input} value={f.code} onChange={e => set("code", e.target.value)} placeholder="DL-2026-001" />

        <label style={S.label}>Marže (%)</label>
        <input style={S.input} type="number" value={f.margin} onChange={e => set("margin", e.target.value)} placeholder="30" />
        <div style={{ fontSize: 11, color: "#475569", marginTop: -8, marginBottom: 10 }}>
          Cena pro zákazníka = nákladová cena × (1 + marže %). Výchozí: 30%.
        </div>

        <label style={S.label}>Poznámka</label>
        <textarea style={{ ...S.input, height: 56, resize: "vertical" }} value={f.notes} onChange={e => set("notes", e.target.value)} />

        <div style={{ display: "flex", gap: 10 }}>
          <button style={S.btn()} onClick={() => { if (f.supplier && f.code) onSave(f); }}>{isEdit ? "Uložit změny" : "Uložit dodací list"}</button>
          <button style={S.btnGhost} onClick={onClose}>Zrušit</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: NOVÁ POLOŽKA DODACÍHO LISTU ──────────────────────────────────────
function AddDNItemModal({ deliveryNoteId, item, onSave, onClose }) {
  const isEdit = !!item;
  const [f, setF] = useState(isEdit
    ? { id: item.id, description: item.description || "", quantity: String(item.quantity ?? "1"), unit: item.unit || "ks", unitPrice: String(item.unit_price ?? ""), deliveryNoteId }
    : { description: "", quantity: "1", unit: "ks", unitPrice: "", deliveryNoteId });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const total = (Number(f.quantity) || 0) * (Number(f.unitPrice) || 0);

  return (
    <div style={S.modal}>
      <div style={S.modalBox}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#fff" }}>{isEdit ? "Upravit položku dodacího listu" : "Nová položka dodacího listu"}</div>
          <button style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }} onClick={onClose}>✕</button>
        </div>

        <label style={S.label}>Popis *</label>
        <input style={S.input} value={f.description} onChange={e => set("description", e.target.value)} placeholder="Kabel CYKY 3×2,5..." />

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <div>
            <label style={S.label}>Množství</label>
            <input style={S.input} type="number" step="0.001" value={f.quantity} onChange={e => set("quantity", e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Jednotka</label>
            <select style={S.select} value={f.unit} onChange={e => set("unit", e.target.value)}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <label style={S.label}>Nákladová cena / jednotku (Kč)</label>
        <input style={S.input} type="number" value={f.unitPrice} onChange={e => set("unitPrice", e.target.value)} />

        {total > 0 && (
          <div style={{ background: "#0a0d14", borderRadius: 8, padding: 12, marginBottom: 10, border: "1px solid #252d45" }}>
            <div style={{ fontSize: 12, color: "#475569" }}>Celkový náklad: <strong style={{ color: "#f87171" }}>{fmtKc(total)}</strong></div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button style={S.btn()} onClick={() => { if (f.description) onSave(f); }}>{isEdit ? "Uložit změny" : "Uložit položku"}</button>
          <button style={S.btnGhost} onClick={onClose}>Zrušit</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL: EDITACE ZAKÁZKY ──────────────────────────────────────────────────
function EditContractModal({ contract, customers, onSave, onClose }) {
  const [f, setF] = useState({
    id:         contract.id,
    name:       contract.name || "",
    code:       contract.code || "",
    type:       contract.type || "",
    customerId: contract.customer_id || "",
    price:      contract.price || "",
    address:    contract.address || "",
    notes:      contract.notes || "",
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <div style={S.modal}>
      <div style={S.modalBox}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#fff" }}>Upravit zakázku</div>
          <button style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }} onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10 }}>
          <div>
            <label style={S.label}>Kód zakázky</label>
            <input style={S.input} value={f.code} onChange={e => set("code", e.target.value)} placeholder="ZAK-2026-001" />
          </div>
          <div>
            <label style={S.label}>Název zakázky *</label>
            <input style={S.input} value={f.name} onChange={e => set("name", e.target.value)} />
          </div>
        </div>

        <label style={S.label}>Typ zakázky</label>
        <select style={S.select} value={f.type} onChange={e => set("type", e.target.value)}>
          <option value="">— nezadáno —</option>
          {TYPY_ZAKAZEK.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>

        <label style={S.label}>Zákazník</label>
        <select style={S.select} value={f.customerId} onChange={e => set("customerId", e.target.value)}>
          <option value="">— vyberte —</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name} – {c.company}</option>)}
        </select>

        <label style={S.label}>Cena zakázky (Kč)</label>
        <input style={S.input} type="number" value={f.price} onChange={e => set("price", e.target.value)} />

        <label style={S.label}>Adresa místa výkonu</label>
        <input style={S.input} value={f.address} onChange={e => set("address", e.target.value)} placeholder="Ulice 123, Praha" />

        <label style={S.label}>Poznámky / popis</label>
        <textarea style={{ ...S.input, height: 80, resize: "vertical" }} value={f.notes} onChange={e => set("notes", e.target.value)} />

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button style={S.btn()} onClick={() => { if (f.name.trim()) onSave(f); }}>Ulozit zmeny</button>
          <button style={S.btnGhost} onClick={onClose}>Zrusit</button>
        </div>
      </div>
    </div>
  );
}

// MODAL: PRESUNOUT POLOZKU NA JINOU ZAKAZKU
function MoveEntryModal({ entryId, currentContractId, contracts, onMove, onClose }) {
  const [targetId, setTargetId] = useState("");
  const others = contracts.filter(c => c.id !== currentContractId);

  return (
    <div style={S.modal}>
      <div style={{ ...S.modalBox, width: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#fff" }}>Presunout polozku</div>
          <button style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }} onClick={onClose}>x</button>
        </div>

        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>
          Vyberte zakazku, na kterou chcete tuto nakladovou polozku presunout.
        </div>

        <label style={S.label}>Cilova zakazka *</label>
        <select style={S.select} value={targetId} onChange={e => setTargetId(e.target.value)}>
          <option value="">vyberte zakazku</option>
          {others.map(c => (
            <option key={c.id} value={c.id}>
              {c.code ? `[${c.code}] ` : ""}{c.name}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button style={S.btn()} onClick={() => { if (targetId) onMove(entryId, Number(targetId)); }}>
            Presunout
          </button>
          <button style={S.btnGhost} onClick={onClose}>Zrusit</button>
        </div>
      </div>
    </div>
  );
}

// TAB: K FAKTURACI
function BillingTab({ contractId, entries, summaries, employees, onMarkBilled, onToggleApproved }) {
  const S_th = S.th;
  const S_td = S.td;
  const MONTHS_CS = ["", "Leden", "Unor", "Brezen", "Duben", "Kveten", "Cerven",
    "Cervenec", "Srpen", "Zari", "Rijen", "Listopad", "Prosinec"];

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
        Zaskrtnete polozky v sekci Naklady jako schvalene, pote je zde oznacte jako vyfakturovane.
        Kazdy mesic je zobrazen zvlast pro prehledne dolozeni k fakture.
      </div>
      {months.length === 0 && <div style={{ color: "#334155", fontSize: 13 }}>Zadne zaznamy k fakturaci.</div>}
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
                  {pending.length > 0 && <span style={{ marginRight: 10, color: "#475569" }}>{pending.length}x ceka</span>}
                  {approved.length > 0 && <span style={{ marginRight: 10, color: "#34d399" }}>✓ {approved.length}x schvaleno ({fmtKc(approvedClient)})</span>}
                  {billed.length > 0 && <span style={{ color: "#f59e0b" }}>{billed.length}x fakturovano ({fmtKc(billedClient)})</span>}
                </div>
              </div>
              {approved.length > 0 && (
                <button style={{ background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  onClick={() => onMarkBilled(contractId, year, month)}>Oznacit jako fakturovano</button>
              )}
              {approved.length === 0 && billed.length > 0 && summary && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#475569" }}>Fakturovano celkem</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#f59e0b" }}>{fmtKc(summary.total_client)}</div>
                </div>
              )}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={{ ...S_th, width: 28 }}>✓</th>
                {["Datum", "Popis", "Zamestnanec", "Mnozstvi", "Naklad", "Fakturace", "Stav"].map(h => <th key={h} style={S_th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {items.sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(e => {
                  const emp = employees.find(em => em.id === e.employee_id);
                  const isApproved = !!e.approved;
                  const isBilled = !!e.billed;
                  return (
                    <tr key={e.id} style={{ opacity: isBilled ? 0.6 : 1, background: isApproved && !isBilled ? "#34d39906" : "transparent" }}>
                      <td style={S_td}><input type="checkbox" checked={isApproved} disabled={isBilled} onChange={() => onToggleApproved(e.id, !isApproved)} style={{ accentColor: "#34d399" }} /></td>
                      <td style={S_td}>{fmtDateCz(e.date)}</td>
                      <td style={{ ...S_td, color: "#cbd5e1" }}>{e.description}</td>
                      <td style={S_td}>{emp?.name || "-"}</td>
                      <td style={S_td}>{e.quantity} {e.unit}</td>
                      <td style={{ ...S_td, color: "#f87171" }}>{fmtKc(Number(e.amount_cost || 0))}</td>
                      <td style={{ ...S_td, color: "#34d399" }}>{fmtKc(Number(e.amount_client || 0))}</td>
                      <td style={S_td}>
                        {isBilled ? <span style={{ background: "#f59e0b22", color: "#f59e0b", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>Fakturovano</span>
                          : isApproved ? <span style={{ background: "#34d39922", color: "#34d399", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>✓ Schvaleno</span>
                          : <span style={{ background: "#47556922", color: "#475569", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>Ceka</span>}
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
