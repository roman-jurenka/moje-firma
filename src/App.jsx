import React, { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";
import Contracts from "./Contracts.jsx";
import ZakazkaSheet from "./ZakazkaSheet.jsx";
import FotoUpload from "./FotoUpload.jsx";
import Pricing from "./Pricing.jsx";
import OneDrivePanel from "./OneDrivePanel.jsx";
import PodpisyModule, { SignFlow } from "./Podpisy.jsx";
import FinanceModule, { ReceiptsModule } from "./Finance.jsx";
import InvoiceCreateFlow, { InvoicePreviewModal } from "./Invoicing.jsx";
import { downloadInvoicePDF } from "./invoicingUtils.js";
import { handleOAuthCallback, isConnected, uploadFileObject } from "./onedrive.js";

// ─── ZNAČKA ProudOS — modrý jistič s oranžovým bleskem ───────────────────────
function ProudOSMark({ size = 28, outline = true }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flexShrink: 0 }} aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#1d4ed8" />
      <circle cx="50" cy="50" r="40" fill="#2E9BE0" />
      <path d="M62,14 L32,54 L46,54 L36,88 L70,44 L52,44 Z" fill="#F5821F"
        stroke={outline ? "#ffffff" : "none"} strokeWidth={outline ? 3 : 0} strokeLinejoin="round" />
    </svg>
  );
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
  const startOffset = (firstDay + 6) % 7; // Pondělí = 0
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
    <div style={{ background: "#f8fafc", border: "1px solid #252d45", borderRadius: 10, padding: 12, width: 232, userSelect: "none", boxShadow: "0 8px 32px #00000088" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={prev} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>‹</button>
        <span style={{ color: "#1A1A1A", fontWeight: 700, fontSize: 13 }}>{CZ_MONTHS[view.month]} {view.year}</span>
        <button onClick={next} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>›</button>
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
                background: isSel ? "#2E9BE0" : isToday ? "#2E9BE022" : "transparent",
                color: isSel ? "#fff" : isToday ? "#3b82f6" : "#cbd5e1",
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
        style={{ width: "100%", padding: "9px 12px", background: "#f8fafc", border: "1px solid #252d45", borderRadius: 8,
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

// ─── VYHLEDÁVACÍ VÝBĚR (náhrada nativního <select>) ──────────────────────────
// Nativní <select> u dlouhých seznamů (zakázky) umí najít položku jen podle
// prvního napsaného písmene — pro hledání celým slovem to nestačí. Tahle
// komponenta je textové pole s dropdownem, které filtruje podle všech
// napsaných slov kdekoliv v názvu (ne jen na začátku).
function SearchSelect({ options, value, onChange, placeholder = "— vyberte —", style = {}, allowClear = true }) {
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
  const filtered = words.length === 0 ? options : options.filter(o => {
    const label = (o.label || "").toLowerCase();
    return words.every(w => label.includes(w));
  });
  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <input
        style={S.select}
        value={open ? q : (selected?.label || "")}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQ(""); }}
        onChange={e => { setQ(e.target.value); if (!open) setOpen(true); }}
      />
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 9999, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 240, overflowY: "auto", boxShadow: "0 6px 16px #00000022" }}>
          {allowClear && value && (
            <div onClick={() => { onChange(""); setQ(""); setOpen(false); }}
              style={{ padding: "8px 12px", fontSize: 13, color: "#94a3b8", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>— zrušit výběr —</div>
          )}
          {filtered.length === 0 && <div style={{ padding: "10px 12px", fontSize: 13, color: "#94a3b8" }}>Nic nenalezeno.</div>}
          {filtered.map(o => (
            <div key={o.id} onClick={() => { onChange(String(o.id)); setQ(""); setOpen(false); }}
              style={{ padding: "8px 12px", fontSize: 13, color: "#1A1A1A", cursor: "pointer", background: String(o.id) === String(value) ? "#eff6ff" : "transparent" }}
              onMouseDown={e => e.preventDefault()}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AUTH & USERS ────────────────────────────────────────────────────────────
// Žádná hesla tady! Ta žijí jen v Supabase Auth (login.md v README má postup
// založení účtů). Tohle je jen mapování jméno/username -> e-mail pro Auth,
// a kosmetická role pro tlačítko "Rychlé přihlášení" před přihlášením.
const AUTH_USERS = [
  { username: "roman",   email: "roman@proudos.app",   role: "admin",    name: "Roman Jurenka" },
  { username: "sarlota", email: "sarlota@proudos.app", role: "employee", name: "Šarlota Jurenková" },
  { username: "vaclav",  email: "vaclav@proudos.app",  role: "employee", name: "Václav Jahn" },
  { username: "david",   email: "david@proudos.app",   role: "employee", name: "David Winige" },
  { username: "honza",   email: "honza@proudos.app",   role: "employee", name: "Honza Vlček" },
];

const ROLES = {
  admin:    { label: "Administrátor", color: "#f87171", nav: ["dashboard","customers","pricing","deals","contracts","tasks","invoices","warehouse","hr","projects","costs","finance","reports","ai","attendance","calendar","knjiga","onedrive","permissions","podpisy","profile"] },
  manager:  { label: "Manažer",       color: "#f59e0b", nav: ["dashboard","customers","pricing","deals","contracts","tasks","invoices","projects","costs","finance","reports","ai","attendance","calendar","knjiga","podpisy","profile"] },
  hr:       { label: "HR",            color: "#a78bfa", nav: ["dashboard","hr","costs","attendance","calendar","knjiga","uctenky","podpisy","profile"] },
  employee: { label: "Zaměstnanec",   color: "#2E9BE0", nav: ["dashboard","fotoupload","attendance","calendar","knjiga","uctenky","podpisy","profile"] },
};

// Simulovaná docházka — záznamy příchod/odchod
const today = new Date();
const fmt = (d) => d.toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, "0");
// Čitelné zobrazení data pro uživatele — den v týdnu, den, měsíc slovem, rok (bez pomlček).
// fmt()/ISO řetězec zůstává beze změny pro ukládání a query, tohle je jen pro DISPLAY.
const DNY_ZKR = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];
const MESICE_2P = ["ledna", "února", "března", "dubna", "května", "června", "července", "srpna", "září", "října", "listopadu", "prosince"];
const fmtDateCz = (v) => {
  if (!v) return "";
  const d = new Date(v.length === 10 ? v + "T00:00:00" : v);
  if (isNaN(d.getTime())) return v; // neplatné/textové hodnoty necháme beze změny
  return `${DNY_ZKR[d.getDay()]} ${d.getDate()}. ${MESICE_2P[d.getMonth()]} ${d.getFullYear()}`;
};
const initialAttendance = [
  // Markéta (emp 1)
  { id: 1, employeeId: 1, date: "2026-04-07", checkin: "08:02", checkout: "16:45" },
  { id: 2, employeeId: 1, date: "2026-04-08", checkin: "07:55", checkout: "17:10" },
  { id: 3, employeeId: 1, date: "2026-04-09", checkin: "08:10", checkout: "16:30" },
  { id: 4, employeeId: 1, date: "2026-04-10", checkin: "08:00", checkout: "17:00" },
  // Ondřej (emp 2)
  { id: 5, employeeId: 2, date: "2026-04-07", checkin: "09:00", checkout: "18:00" },
  { id: 6, employeeId: 2, date: "2026-04-08", checkin: "09:15", checkout: "18:30" },
  { id: 7, employeeId: 2, date: "2026-04-09", checkin: "08:45", checkout: "17:45" },
  { id: 8, employeeId: 2, date: "2026-04-10", checkin: "09:00", checkout: "18:00" },
  // Lucie (emp 3)
  { id: 9,  employeeId: 3, date: "2026-04-07", checkin: "08:30", checkout: "16:00" },
  { id: 10, employeeId: 3, date: "2026-04-08", checkin: "08:25", checkout: "16:10" },
  { id: 11, employeeId: 3, date: "2026-04-09", checkin: "08:30", checkout: "15:55" },
  // Pavel (emp 4)
  { id: 12, employeeId: 4, date: "2026-04-07", checkin: "06:00", checkout: "14:00" },
  { id: 13, employeeId: 4, date: "2026-04-08", checkin: "06:05", checkout: "14:15" },
];

// ─── INITIAL DATA ────────────────────────────────────────────────────────────

const initialCustomers = [
  { id: 1, name: "Jan Novák", company: "TechSoft s.r.o.", email: "jan@techsoft.cz", phone: "+420 601 234 567", tag: "VIP" },
  { id: 2, name: "Petra Dvořáčková", company: "Media Group a.s.", email: "petra@mediagroup.cz", phone: "+420 602 345 678", tag: "Aktivní" },
  { id: 3, name: "Tomáš Krejčí", company: "BuildEx Prague", email: "tomas@buildex.cz", phone: "+420 603 456 789", tag: "Nový" },
];

const initialDeals = [
  { id: 1, name: "Roční licence software", value: 120000, stage: "Jednání", customerId: 1 },
  { id: 2, name: "Reklamní kampaň Q2", value: 85000, stage: "Nový", customerId: 2 },
  { id: 3, name: "Stavební projekt Brno", value: 450000, stage: "Vyhráno", customerId: 3 },
];

const initialCommunication = [
  { id: 1, type: "Email", date: "2026-04-08", note: "Zaslána nabídka na roční licenci.", customerId: 1 },
  { id: 2, type: "Hovor", date: "2026-04-09", note: "Diskuse o podmínkách kampaně.", customerId: 2 },
  { id: 3, type: "Schůzka", date: "2026-04-10", note: "Osobní prezentace projektu.", customerId: 3 },
];

const initialTasks = [
  { id: 1, title: "Follow-up email", due: "2026-04-14", priority: "Vysoká", done: false, customerId: 1 },
  { id: 2, title: "Připravit prezentaci", due: "2026-04-16", priority: "Střední", done: false, customerId: 2 },
  { id: 3, title: "Podepsat smlouvu", due: "2026-04-12", priority: "Vysoká", done: true, customerId: 3 },
];

const initialInvoices = [
  { id: 1, number: "FAK-2026-001", customerId: 1, amount: 120000, tax: 25200, status: "Zaplacena", issued: "2026-04-01", due: "2026-04-15", items: [{ desc: "Roční licence", qty: 1, price: 120000 }] },
  { id: 2, number: "FAK-2026-002", customerId: 2, amount: 85000, tax: 17850, status: "Čeká", issued: "2026-04-05", due: "2026-04-20", items: [{ desc: "Reklamní kampaň", qty: 1, price: 85000 }] },
  { id: 3, number: "FAK-2026-003", customerId: 3, amount: 450000, tax: 94500, status: "Po splatnosti", issued: "2026-03-20", due: "2026-04-03", items: [{ desc: "Stavební projekt", qty: 1, price: 450000 }] },
];

const initialProducts = [
  { id: 1, name: "Software licence", sku: "SW-001", category: "Software", price: 12000, stock: 50, minStock: 10, unit: "ks" },
  { id: 2, name: "Serverový rack", sku: "HW-012", category: "Hardware", price: 45000, stock: 3, minStock: 5, unit: "ks" },
  { id: 3, name: "Kancelářský papír A4", sku: "KA-003", category: "Kancelář", price: 120, stock: 200, minStock: 50, unit: "balík" },
  { id: 4, name: "Marketingový balíček", sku: "MK-007", category: "Služby", price: 8500, stock: 999, minStock: 0, unit: "ks" },
];

const initialEmployees = [
  { id: 1, name: "Markéta Horáčková", position: "Obchodní manažer", department: "Obchod", email: "marketa@firma.cz", salary: 65000, status: "Aktivní", start: "2022-03-01" },
  { id: 2, name: "Ondřej Beneš", position: "Vývojář", department: "IT", email: "ondrej@firma.cz", salary: 85000, status: "Aktivní", start: "2021-07-15" },
  { id: 3, name: "Lucie Marková", position: "HR specialista", department: "HR", email: "lucie@firma.cz", salary: 55000, status: "Aktivní", start: "2023-01-10" },
  { id: 4, name: "Pavel Šimánek", position: "Skladník", department: "Logistika", email: "pavel@firma.cz", salary: 42000, status: "Dovolená", start: "2020-11-01" },
];

const initialProjects = [
  { id: 1, name: "Vývoj mobilní aplikace", customerId: 1, status: "Probíhá", progress: 65, budget: 200000, spent: 130000, deadline: "2026-06-30", assignees: [1, 2],
    steps: [
      { id: 101, title: "Analýza požadavků", done: true, note: "Schváleno zákazníkem", order: 1 },
      { id: 102, title: "UI/UX design", done: true, note: "Figma prototyp hotov", order: 2 },
      { id: 103, title: "Vývoj backendu", done: true, note: "API endpointy připraveny", order: 3 },
      { id: 104, title: "Vývoj frontendu", done: false, note: "", order: 4 },
      { id: 105, title: "Testování", done: false, note: "", order: 5 },
      { id: 106, title: "Nasazení & předání", done: false, note: "", order: 6 },
    ]
  },
  { id: 2, name: "Rekonstrukce webu", customerId: 2, status: "Plánováno", progress: 10, budget: 80000, spent: 8000, deadline: "2026-07-15", assignees: [2],
    steps: [
      { id: 201, title: "Briefing se zákazníkem", done: true, note: "Proběhlo 2.4.2026", order: 1 },
      { id: 202, title: "Návrh struktury webu", done: false, note: "", order: 2 },
      { id: 203, title: "Grafický návrh", done: false, note: "", order: 3 },
      { id: 204, title: "Programování", done: false, note: "", order: 4 },
      { id: 205, title: "Spuštění", done: false, note: "", order: 5 },
    ]
  },
  { id: 3, name: "Stavba skladu Brno", customerId: 3, status: "Dokončeno", progress: 100, budget: 450000, spent: 442000, deadline: "2026-04-01", assignees: [1, 4],
    steps: [
      { id: 301, title: "Projektová dokumentace", done: true, note: "Schválena stavebním úřadem", order: 1 },
      { id: 302, title: "Zemní práce", done: true, note: "Dokončeno 15.2.2026", order: 2 },
      { id: 303, title: "Hrubá stavba", done: true, note: "Dokončeno 10.3.2026", order: 3 },
      { id: 304, title: "Instalace & vybavení", done: true, note: "Dokončeno 28.3.2026", order: 4 },
      { id: 305, title: "Předání zákazníkovi", done: true, note: "Podpis protokolu 1.4.2026", order: 5 },
    ]
  },
];

const initialTemplates = [
  { id: 1, name: "Vývoj softwaru", icon: "💻", steps: ["Analýza požadavků", "Návrh architektury", "UI/UX design", "Vývoj backendu", "Vývoj frontendu", "Testování (QA)", "Nasazení", "Předání & dokumentace"] },
  { id: 2, name: "Webový projekt", icon: "🌐", steps: ["Briefing se zákazníkem", "Návrh struktury", "Grafický návrh", "Programování", "Obsah & texty", "Testování", "Spuštění"] },
  { id: 3, name: "Stavební projekt", icon: "🏗️", steps: ["Projektová dokumentace", "Stavební povolení", "Zemní práce", "Hrubá stavba", "Instalace", "Dokončovací práce", "Předání zákazníkovi"] },
  { id: 4, name: "Marketingová kampaň", icon: "📣", steps: ["Definice cílů", "Analýza trhu", "Tvorba strategie", "Kreativní zpracování", "Spuštění kampaně", "Monitorování", "Vyhodnocení"] },
  { id: 5, name: "Implementace systému", icon: "⚙️", steps: ["Analýza stávajícího stavu", "Požadavky & specifikace", "Konfigurace systému", "Migrace dat", "Testování", "Školení uživatelů", "Go-live & podpora"] },
];

const COST_CATEGORIES = ["Mzdy", "Nájem", "Marketing", "IT & Software", "Logistika", "Ostatní"];
const CAT_COLORS = { "Mzdy": "#2E9BE0", "Nájem": "#f59e0b", "Marketing": "#f87171", "IT & Software": "#2E9BE0", "Logistika": "#34d399", "Ostatní": "#a78bfa" };
const MONTHS = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];

const initialCosts = [
  { id: 1, date: "2026-01-05", category: "Mzdy", description: "Mzdy leden", amount: 247000, recurring: true },
  { id: 2, date: "2026-01-10", category: "Nájem", description: "Nájem kancelář Q1", amount: 45000, recurring: true },
  { id: 3, date: "2026-01-15", category: "IT & Software", description: "Microsoft 365 licence", amount: 12000, recurring: true },
  { id: 4, date: "2026-01-20", category: "Marketing", description: "Google Ads leden", amount: 18000, recurring: false },
  { id: 5, date: "2026-02-05", category: "Mzdy", description: "Mzdy únor", amount: 247000, recurring: true },
  { id: 6, date: "2026-02-14", category: "Logistika", description: "Přepravní náklady", amount: 8500, recurring: false },
  { id: 7, date: "2026-02-20", category: "Marketing", description: "Veletrh Praha", amount: 35000, recurring: false },
  { id: 8, date: "2026-03-05", category: "Mzdy", description: "Mzdy březen", amount: 247000, recurring: true },
  { id: 9, date: "2026-03-10", category: "Nájem", description: "Nájem kancelář", amount: 45000, recurring: true },
  { id: 10, date: "2026-03-18", category: "IT & Software", description: "Nový server", amount: 85000, recurring: false },
  { id: 11, date: "2026-03-25", category: "Ostatní", description: "Kancelářské potřeby", amount: 6200, recurring: false },
  { id: 12, date: "2026-04-05", category: "Mzdy", description: "Mzdy duben", amount: 247000, recurring: true },
  { id: 13, date: "2026-04-08", category: "Marketing", description: "LinkedIn Ads", amount: 22000, recurring: false },
  { id: 14, date: "2026-04-10", category: "Logistika", description: "Sklad Brno provoz", amount: 15000, recurring: true },
];

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const STAGES = ["Nový", "Jednání", "Nabídka", "Vyhráno", "Prohráno"];
const STAGE_COLORS = { Nový: "#2E9BE0", Jednání: "#f59e0b", Nabídka: "#a78bfa", Vyhráno: "#34d399", Prohráno: "#f87171" };
const TAG_COLORS = { VIP: "#f59e0b", Aktivní: "#34d399", Nový: "#2E9BE0" };
const PRIO_COLORS = { Vysoká: "#f87171", Střední: "#f59e0b", Nízká: "#34d399" };
const INV_COLORS = { Zaplacena: "#34d399", Čeká: "#f59e0b", "Po splatnosti": "#f87171", Storno: "#64748b" };
const PROJ_COLORS = { Probíhá: "#2E9BE0", Plánováno: "#2E9BE0", Dokončeno: "#34d399", Pozastaveno: "#f87171" };
const avatarColors = ["#2E9BE0", "#f59e0b", "#34d399", "#f87171", "#a78bfa", "#2E9BE0"];

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "ti-layout-dashboard", group: "CRM" },
  { id: "customers", label: "Zákazníci", icon: "ti-users", group: "CRM" },
  { id: "pricing", label: "Nacenění", icon: "ti-calculator", group: "CRM" },
  { id: "deals", label: "Obchodní příp.", icon: "ti-briefcase", group: "CRM" },
  // { id: "communication", label: "Komunikace", icon: "ti-message-circle", group: "CRM" }, // odebráno — data zachována pro detail zákazníka
  { id: "contracts", label: "Zakázky", icon: "ti-file-invoice", group: "CRM" },
  { id: "sheets", label: "Listy zakázek", icon: "ti-clipboard-list", group: "CRM" },
  { id: "fotoupload", label: "Nahrát fotky", icon: "ti-camera", group: "Osobní" },
  { id: "tasks", label: "Úkoly", icon: "ti-checkbox", group: "CRM" },
  { id: "invoices", label: "Fakturace", icon: "ti-receipt", group: "ERP" },
  { id: "warehouse", label: "Sklad", icon: "ti-package", group: "ERP" },
  { id: "hr", label: "Zaměstnanci", icon: "ti-user", group: "ERP" },
  { id: "projects", label: "Projekty", icon: "ti-building", group: "ERP" },
  { id: "costs", label: "Náklady", icon: "ti-trending-down", group: "ERP" },
  { id: "finance", label: "Finanční tok", icon: "ti-cash", group: "ERP" },
  { id: "uctenky", label: "Účtenky", icon: "ti-receipt-2", group: "Osobní" },
  { id: "reports", label: "Reporty", icon: "ti-chart-line", group: "Analytika" },
  { id: "ai", label: "AI Asistent", icon: "ti-robot", group: "Analytika" },
  { id: "attendance", label: "Docházka", icon: "ti-clock", group: "Osobní" },
  { id: "calendar", label: "Kalendář", icon: "ti-calendar", group: "Osobní" },
  { id: "knjiga", label: "Kniha jízd", icon: "ti-car", group: "Osobní" },
  { id: "onedrive", label: "OneDrive", icon: "ti-cloud", group: "Osobní" },
  { id: "podpisy", label: "Podpisy", icon: "ti-signature", group: "Osobní" },
  { id: "profile", label: "Můj profil", icon: "ti-user-circle", group: "Osobní" },
  { id: "permissions", label: "Oprávnění", icon: "ti-lock", group: "ERP" },
];

// ─── STYLES ──────────────────────────────────────────────────────────────────

const S = {
  app: { fontFamily: "'DM Sans', sans-serif", background: "#f0f4f8", minHeight: "100vh", color: "#1A1A1A", display: "flex" },
  sidebar: (open) => ({ width: 220, background: "#0E3B5E", padding: "0", display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0, left: 0, overflowY: "auto", boxShadow: "2px 0 8px #0000001a", zIndex: 200, transition: "transform 0.25s ease" }),
  logo: { padding: "22px 20px 16px", fontSize: 19, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", borderBottom: "1px solid rgba(255,255,255,0.12)" },
  logoA: { color: "#fff" },
  logoB: { color: "#F5821F" },
  groupLabel: { padding: "16px 20px 4px", fontSize: 10, color: "#7C97AC", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 },
  navItem: (a) => ({ padding: "9px 16px", margin: "2px 10px", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 500, color: a ? "#fff" : "#B9CBDA", background: a ? "rgba(255,255,255,0.14)" : "transparent", transition: "all 0.12s" }),
  main: { marginLeft: 0, padding: "28px 32px", flex: 1, minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  h1: { fontSize: 24, fontWeight: 700, color: "#1A1A1A", margin: 0 },
  btn: (c = "#F5C518") => ({ background: c, color: c === "#F5C518" ? "#1A1A1A" : "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  btnGhost: { background: "transparent", color: "#2E9BE0", border: "1px solid #2E9BE0", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  card: { background: "#ffffff", borderRadius: 12, padding: 22, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px #0000000a" },
  grid4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  statCard: (c) => ({ background: "#ffffff", borderRadius: 12, padding: "18px 22px", border: `1px solid ${c}33`, boxShadow: "0 1px 4px #0000000a" }),
  statLabel: { fontSize: 11, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" },
  statValue: (c) => ({ fontSize: 26, fontWeight: 800, color: c }),
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "9px 12px", fontSize: 11, color: "#64748b", borderBottom: "1px solid #e2e8f0", textTransform: "uppercase", letterSpacing: "0.06em" },
  td: { padding: "11px 12px", fontSize: 13, borderBottom: "1px solid #f1f5f9", color: "#475569" },
  tag: (c) => ({ background: c + "22", color: c, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700, display: "inline-block" }),
  search: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 13px", color: "#1A1A1A", fontSize: 13, outline: "none", width: 240 },
  modal: { position: "fixed", inset: 0, background: "#0007", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  modalBox: { background: "#ffffff", borderRadius: 16, padding: 28, width: 440, maxWidth: "92vw", boxSizing: "border-box", border: "1px solid #e2e8f0", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px #0000001a" },
  input: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", color: "#1A1A1A", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box", marginBottom: 10 },
  select: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", color: "#1A1A1A", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box", marginBottom: 10 },
  label: { fontSize: 11, color: "#64748b", marginBottom: 3, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" },
  avatar: (c) => ({ width: 34, height: 34, borderRadius: "50%", background: c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }),
  progress: (pct, c) => ({ height: 6, borderRadius: 3, background: "#e2e8f0", overflow: "hidden", position: "relative" }),
  progressBar: (pct, c) => ({ height: "100%", width: `${pct}%`, background: c, borderRadius: 3, transition: "width 0.4s" }),
  kanbanCol: { background: "#f8fafc", borderRadius: 12, padding: 14, minWidth: 170, flex: 1, border: "1px solid #e2e8f0" },
  kanbanCard: { background: "#ffffff", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px #0000000a" },
  commItem: { display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #f1f5f9" },
  commDot: (t) => ({ width: 9, height: 9, borderRadius: "50%", background: t === "Email" ? "#2E9BE0" : t === "Hovor" ? "#16a34a" : "#F5821F", marginTop: 4, flexShrink: 0 }),
  divider: { height: 1, background: "#e2e8f0", margin: "12px 0" },
  badge: (c) => ({ background: c + "22", color: c, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }),
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const getInitial = (name) => name?.charAt(0).toUpperCase() || "?";
const fmtKc = (v) => `${Number(v).toLocaleString("cs-CZ")} Kč`;
const nextInvNum = (invoices) => `FAK-2026-${String(invoices.length + 1).padStart(3, "0")}`;

// ─── CONTRACT PHOTO PICKER ────────────────────────────────────────────────────
function ContractPhotoPicker({ onSelect, onClose }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.from("contract_photos").select("*, contracts(name)").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => { setPhotos(data || []); setLoading(false); });
  }, []);

  const filtered = photos.filter(p =>
    !search || (p.description || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.contracts?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={S.modal}>
      <div style={{ ...S.modalBox, width: 700, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <ModalHeader title="📁 Fotky ze zakázek" onClose={onClose} />
        <input style={{ ...S.input, marginBottom: 12 }} placeholder="Hledat podle popisu nebo zakázky..." value={search} onChange={e => setSearch(e.target.value)} />
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Načítám…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Žádné fotky</div>
        ) : (
          <div style={{ overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {filtered.map(p => (
              <div key={p.id} onClick={() => onSelect(p.url)} style={{ cursor: "pointer", borderRadius: 8, overflow: "hidden", border: "2px solid #e2e8f0", transition: "border 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#2E9BE0"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#e2e8f0"}>
                <img src={p.url} alt="" style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }} />
                <div style={{ padding: "4px 6px", fontSize: 11, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.contracts?.name || "—"}
                </div>
                {p.description && <div style={{ padding: "0 6px 4px", fontSize: 10, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.description}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 17, color: "#1A1A1A" }}>{title}</div>
      <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>✕</button>
    </div>
  );
}

function ModalActions({ onSave, onClose, saveLabel = "Uložit" }) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
      <button style={S.btn()} onClick={onSave}>{saveLabel}</button>
      <button style={S.btnGhost} onClick={onClose}>Zrušit</button>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────

function MainApp({ currentUser, setCurrentUser, onLogout }) {
  const [tab, setTab] = useState("dashboard");
  const [sheetContractId, setSheetContractId] = useState(null);
  const [sheetContractName, setSheetContractName] = useState("");

  // Zachyť event z Contracts.jsx — přepni na záložku sheets
  useEffect(() => {
    const handler = (e) => {
      setSheetContractId(e.detail.contractId);
      setSheetContractName(e.detail.contractName);
      setTab("sheets");
    };
    window.addEventListener("openSheet", handler);
    return () => window.removeEventListener("openSheet", handler);
  }, []);
  const [customers, setCustomers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [communication, setCommunication] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [costs, setCosts] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [contractInitialDeal, setContractInitialDeal] = useState(null);
  const [costEntries, setCostEntries] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [templates, setTemplates] = useState(initialTemplates);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("proudos-theme") || "light");
  useEffect(() => { localStorage.setItem("proudos-theme", theme); }, [theme]);

  const closeModal = () => setModal(null);

  // ── Load all data from Supabase ──
  useEffect(() => {
    // Zpracuj OneDrive OAuth callback hned při načtení appky
    if (window.location.search.includes("code=")) {
      handleOAuthCallback().then(ok => {
        if (ok) {
          console.log("✅ OneDrive připojeno");
          setTab("onedrive"); // přepni na OneDrive záložku po přihlášení
        }
      });
    }

    const load = async () => {
      setLoading(true);
      const [c, d, cm, t, inv, p, e, pr, co, att, ct, ce, notif, cal] = await Promise.all([
        supabase.from("customers").select("*").order("id"),
        supabase.from("deals").select("*").order("id"),
        supabase.from("communication").select("*").order("id"),
        supabase.from("tasks").select("*").order("id"),
        supabase.from("invoices").select("*").order("id"),
        supabase.from("products").select("*").order("id"),
        supabase.from("employees").select("*").order("id"),
        supabase.from("projects").select("*, project_steps(*)").order("id"),
        supabase.from("costs").select("*").order("id"),
        supabase.rpc("get_attendance_full"),
        supabase.from("contracts").select("id, name, status, customer_id, code, type, address, budget_prace, budget_material, budget_doprava, budget_vice_prace, budget_vice_material, budget_vice_doprava").order("name"),
        supabase.from("contract_cost_entries").select("id, employee_id, amount_cost, amount_client, contract_id, attendance_id, cost_type, is_extra").order("id"),
        supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("calendar_events").select("*").order("date"),
      ]);
      setCustomers((c.data || []).map(x => ({ ...x, customerId: x.customer_id })));
      setDeals((d.data || []).map(x => ({ ...x, customerId: x.customer_id })));
      setCommunication((cm.data || []).map(x => ({ ...x, customerId: x.customer_id })));
      setTasks((t.data || []).map(x => ({ ...x, customerId: x.customer_id })));
      setInvoices((inv.data || []).map(x => ({ ...x, customerId: x.customer_id })));
      setProducts((p.data || []).map(x => ({ ...x, minStock: x.min_stock })));
      setEmployees((e.data || []).map(x => ({ ...x, start: x.start_date })));
      setProjects((pr.data || []).map(x => ({ ...x, customerId: x.customer_id, steps: (x.project_steps || []).sort((a,b)=>a.step_order-b.step_order).map(s => ({ ...s, order: s.step_order })) })));
      setCosts(co.data || []);
      setAttendance((att.data || []).map(x => ({ ...x, employeeId: x.employee_id })));
      setContracts(ct.data || []);
      setCostEntries(ce.data || []);
      setNotifications(notif.data || []);
      setCalendarEvents(cal.data || []);
      // Log errors
      [c,d,cm,t,inv,p,e,pr,co,att,ct,ce,notif,cal].forEach((res, i) => {
        if (res.error) console.error("Load error table", i, res.error.message);
      });
      setLoading(false);
    };
    load();
  }, []);

  // ── Supabase CRUD helpers ──
  const dbAdd = async (table, data) => { const { data: row } = await supabase.from(table).insert(data).select().single(); return row; };
  const dbUpdate = async (table, id, data) => { await supabase.from(table).update(data).eq("id", id); };
  const dbDelete = async (table, id) => { await supabase.from(table).delete().eq("id", id); };
  const allowedTabs = currentUser.navOverride || ROLES[currentUser.role]?.nav || [];
  const visibleNav = NAV.filter(n => allowedTabs.includes(n.id));
  const groups = [...new Set(visibleNav.map(n => n.group))];

  const todayStr = fmt(new Date());
  const myEmpId = currentUser.employeeId;
  const todayRecord = attendance.find(a => a.employeeId === myEmpId && a.date === todayStr);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 16 }}>Firma<span style={{ color: "#2E9BE0" }}>CRM</span><span style={{ color: "#F5821F" }}>+ERP</span></div>
        <div style={{ color: "#475569", fontSize: 14 }}>Načítám data z databáze...</div>
        <div style={{ marginTop: 20, display: "flex", gap: 6, justifyContent: "center" }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: "#2E9BE0", animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}`}</style>
      </div>
    </div>
  );

  // totals
  const totalRevenue = invoices.filter(i => i.status === "Zaplacena").reduce((s, i) => s + i.amount, 0);
  const pendingRevenue = invoices.filter(i => i.status === "Čeká").reduce((s, i) => s + i.amount, 0);
  const overdueRevenue = invoices.filter(i => i.status === "Po splatnosti").reduce((s, i) => s + i.amount, 0);
  const lowStock = products.filter(p => p.stock <= p.minStock);
  const totalPayroll = employees.filter(e => e.status === "Aktivní").reduce((s, e) => s + e.salary, 0);
  const activeProjects = projects.filter(p => p.status === "Probíhá").length;


  const toggleTaskGlobal = async (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    await supabase.from("tasks").update({ done: !task.done }).eq("id", id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const checkin = async () => {
    const now = new Date();
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (todayRecord) {
      await supabase.from("attendance").update({ checkout: time }).eq("id", todayRecord.id);
      setAttendance(attendance.map(a => a.id === todayRecord.id ? { ...a, checkout: time } : a));
    } else {
      const { data: row } = await supabase.from("attendance")
        .insert({ employee_id: myEmpId, date: todayStr, checkin: time, checkout: null })
        .select().single();
      if (row) setAttendance([...attendance, { ...row, employeeId: row.employee_id }]);
    }
  };

  return (
    <>
      <button
        onClick={() => setTheme(t => t === "light" ? "dark" : "light")}
        title={theme === "light" ? "Přepnout na tmavý motiv" : "Přepnout na světlý motiv"}
        style={{
          position: "fixed", top: 14, right: 16, zIndex: 500,
          width: 38, height: 38, borderRadius: "50%", border: "1px solid #cbd5e1",
          background: "#fff", color: "#0E3B5E", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
          boxShadow: "0 2px 8px #0002",
        }}
      >
        <i className={`ti ${theme === "light" ? "ti-moon" : "ti-sun"}`} aria-hidden="true"></i>
      </button>
    <div data-app-theme={theme} style={{ ...S.app, ...(theme === "dark" ? { filter: "invert(1) hue-rotate(180deg)" } : {}) }}>
      <style>{`
        /* Boční menu je na obou velikostech schované mimo obrazovku, dokud na něj
           nenajedete myší (desktop, přes úzký proužek u levého okraje) nebo ho
           neotevřete hamburgerem (mobil). Obsah proto nikdy nerezervuje 220px. */
        .sidebar-nav { transform: translateX(-100%); }
        .sidebar-nav.open { transform: translateX(0); }
        /* Tmavý motiv: invertujeme celou plochu filtrem, ale obrázky (fotky ze
           zakázek, loga apod.) invertujeme podruhé, aby zůstaly v přirozených
           barvách. */
        [data-app-theme="dark"] img,
        [data-app-theme="dark"] video {
          filter: invert(1) hue-rotate(180deg);
        }
        @media (min-width: 769px) {
          .sidebar-backdrop { display: none !important; }
        }
        @media (max-width: 768px) {
          .hamburger-btn { display: flex !important; }
          .sidebar-close { display: flex !important; }
          .main-content { padding: 60px 12px 24px !important; }
          .sidebar-hover-zone { display: none !important; }

          /* Grid layouts → single column */
          .stat-grid, .kpi-grid { grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
          .emp-card-grid { grid-template-columns: 1fr !important; }
          .emp-detail-grid { grid-template-columns: 1fr !important; }
          .two-col-grid { grid-template-columns: 1fr !important; }
          .three-col-grid { grid-template-columns: 1fr !important; }

          /* Tables: horizontal scroll */
          .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }

          /* Cards: remove min-width constraints */
          .card-min { min-width: unset !important; }

          /* Modals: full width */
          .modal-inner { width: 96vw !important; max-width: 96vw !important; margin: 16px auto !important; }

          /* Header: stack items */
          .page-header { flex-wrap: wrap !important; gap: 8px !important; }

          /* Filter bars */
          .filter-bar { flex-wrap: wrap !important; gap: 6px !important; }

          /* Contracts detail */
          .contract-detail-grid { grid-template-columns: 1fr !important; }

          /* Inputs full width on mobile */
          .mobile-full { width: 100% !important; box-sizing: border-box; }

          /* Obecná záchranná síť pro celou appku — spousta míst (Zakázky,
             Finanční tok, Nacenění, Podpisy...) používá vlastní vícesloupcové
             mřížky přes inline styl bez zvláštní třídy. Místo ručního
             dolaďování každé z nich zvlášť je tu srazíme na jeden sloupec
             podle atributového selektoru na inline "grid-template-columns"
             (v DOM se camelCase gridTemplateColumns vždy převede na tenhle
             tvar), aby nic nepřetékalo mimo obrazovku. */
          /* Vyjímka: kalendáře s 7 sloupci (dny v týdnu) mají zůstat 7
             sloupců i na mobilu, jen užší — na jeden sloupec by byly
             nepoužitelné. */
          [style*="grid-template-columns"]:not([style*="repeat(7"]) { grid-template-columns: 1fr !important; }

          /* Tabulky bez wrapperu (téměř všechny v appce) — necháme je
             tabulkově vykreslit, ale umožníme vodorovné posouvání, aby se
             nerozbily rozlité přes okraj obrazovky. */
          table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
        }
      `}</style>
      <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} style={{ display: "none", position: "fixed", top: 10, left: 10, zIndex: 300, background: "#0E3B5E", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 22, color: "#fff", alignItems: "center", justifyContent: "center" }}><i className="ti ti-menu-2" aria-hidden="true"></i></button>
      {/* Úzký proužek u levého okraje — najetím myší na desktopu vyjede menu */}
      <div className="sidebar-hover-zone" onMouseEnter={() => setSidebarOpen(true)}
        style={{ position: "fixed", top: 0, bottom: 0, left: 0, width: 14, zIndex: 199 }} />
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "#0007", zIndex: 150 }} />}

      {/* SIDEBAR */}
      <div className={`sidebar-nav${sidebarOpen ? " open" : ""}`} style={S.sidebar()}
        onMouseLeave={() => setSidebarOpen(false)}>
        <div style={{ ...S.logo, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <ProudOSMark size={26} />
            <span><span style={S.logoA}>Proud</span><span style={S.logoB}>OS</span></span>
          </span>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} style={{ display: "none", background: "none", border: "none", color: "#94a3b8", fontSize: 22, cursor: "pointer", padding: 0 }}><i className="ti ti-x" aria-hidden="true"></i></button>
        </div>

        {/* User info + role */}
        <div style={{ padding: "12px 16px", margin: "0 12px 8px", background: "#f8fafc", borderRadius: 10, border: "1px solid #1a2035" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2E9BE0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }}>
              {getInitial(currentUser.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.name}</div>
              <span style={{ ...S.tag(ROLES[currentUser.role]?.color || "#2E9BE0"), fontSize: 10 }}>{ROLES[currentUser.role]?.label}</span>
            </div>
          </div>
          {/* Quick checkin */}
          {myEmpId && (
            <button onClick={checkin} style={{ ...S.btn(todayRecord?.checkin && !todayRecord?.checkout ? "#f59e0b" : todayRecord?.checkout ? "#34d399" : "#2E9BE0"), width: "100%", marginTop: 10, fontSize: 11, padding: "7px" }}>
              {todayRecord?.checkout ? `✓ Odchod ${todayRecord.checkout}` : todayRecord?.checkin ? `⏱ Zapsat odchod (${todayRecord.checkin})` : "▶ Zapsat příchod"}
            </button>
          )}
        </div>

        {groups.map(g => (
          <div key={g}>
            <div style={S.groupLabel}>{g}</div>
            {visibleNav.filter(n => n.group === g).map(n => (
              <div key={n.id} style={S.navItem(tab === n.id)} onClick={() => { setTab(n.id); setSearch(""); setSidebarOpen(false); }}>
                <i className={`ti ${n.icon}`} style={{ fontSize: 16, width: 18, textAlign: "center" }} aria-hidden="true"></i> {n.label}
              </div>
            ))}
          </div>
        ))}

        {/* Notifikace + Logout */}
        <div style={{ marginTop: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => setTab("notifications")} style={{ ...S.btnGhost, width: "100%", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span><i className="ti ti-bell" aria-hidden="true" style={{ marginRight: 6 }}></i>Oznámení</span>
            {notifications.filter(n => !n.read && n.user_name === currentUser?.name).length > 0 && (
              <span style={{ background: "#f87171", borderRadius: 10, padding: "1px 7px", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                {notifications.filter(n => !n.read && n.user_name === currentUser?.name).length}
              </span>
            )}
          </button>
          <button onClick={onLogout} style={{ ...S.btnGhost, width: "100%", fontSize: 12, color: "#f87171", borderColor: "#f8717133" }}>
            <i className="ti ti-logout" aria-hidden="true" style={{ marginRight: 6 }}></i>Odhlásit se
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div className="main-content" style={S.main}>

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (currentUser?.role === "employee" || currentUser?.role === "hr"
          ? <EmployeeDashboard
              currentUser={currentUser} attendance={attendance} tasks={tasks} setTasks={setTasks}
              employees={employees} toggleTask={toggleTaskGlobal} setTab={setTab}
              setNotifications={setNotifications}
            />
          : <Dashboard
              customers={customers} deals={deals} tasks={tasks} invoices={invoices}
              products={products} employees={employees} projects={projects}
              totalRevenue={totalRevenue} pendingRevenue={pendingRevenue}
              overdueRevenue={overdueRevenue} lowStock={lowStock}
              totalPayroll={totalPayroll} activeProjects={activeProjects}
              costs={costs} toggleTask={toggleTaskGlobal} setTab={setTab}
              contracts={contracts} attendance={attendance} costEntries={costEntries}
              onOpenSheet={(id, name) => { setSheetContractId(id); setSheetContractName(name); setTab("sheets"); }}
            />
        )}

        {/* ── ZÁKAZNÍCI ── */}
        {tab === "customers" && <Customers
          customers={customers} setCustomers={setCustomers}
          invoices={invoices} deals={deals} communication={communication}
          contracts={contracts}
          search={search} setSearch={setSearch}
          modal={modal} setModal={setModal} closeModal={closeModal}
        />}

        {/* ── NACENĚNÍ ── */}
        {tab === "pricing" && <Pricing
          customers={customers} employees={employees} currentUser={currentUser}
          onConvertToDeal={(deal) => { setDeals(prev => [deal, ...prev]); setTab("deals"); }}
        />}

        {/* ── DEALY ── */}
        {tab === "deals" && <Deals
          deals={deals} setDeals={setDeals} customers={customers}
          employees={employees} tasks={tasks} currentUser={currentUser}
          modal={modal} setModal={setModal} closeModal={closeModal}
          onConvertToContract={(deal) => { setContractInitialDeal(deal); setTab("contracts"); }}
        />}

        {/* ── KOMUNIKACE ── */}
        {tab === "communication" && <Communication
          communication={communication} setCommunication={setCommunication}
          customers={customers} deals={deals} contracts={contracts}
          currentUser={currentUser}
          modal={modal} setModal={setModal} closeModal={closeModal}
        />}

        {/* ── ÚKOLY ── */}
        {tab === "tasks" && <Tasks
          tasks={tasks} setTasks={setTasks} customers={customers}
          employees={employees} deals={deals} contracts={contracts}
          currentUser={currentUser}
          notifications={notifications} setNotifications={setNotifications}
          modal={modal} setModal={setModal} closeModal={closeModal}
        />}

        {/* ── FAKTURACE ── */}
        {tab === "invoices" && <Invoices
          invoices={invoices} setInvoices={setInvoices} customers={customers}
          contracts={contracts} costEntries={costEntries}
          modal={modal} setModal={setModal} closeModal={closeModal}
        />}

        {/* ── SKLAD ── */}
        {tab === "warehouse" && <Warehouse
          products={products} setProducts={setProducts}
          contracts={contracts} currentUser={currentUser}
          modal={modal} setModal={setModal} closeModal={closeModal}
        />}

        {/* ── HR ── */}
        {tab === "hr" && <HR
          employees={employees} setEmployees={setEmployees}
          modal={modal} setModal={setModal} closeModal={closeModal}
          costEntries={costEntries} attendance={attendance}
          tasks={tasks} setTasks={setTasks}
        />}

        {/* ── PROJEKTY ── */}
        {tab === "projects" && <Projects
          projects={projects} setProjects={setProjects}
          customers={customers} employees={employees}
          templates={templates} setTemplates={setTemplates}
          modal={modal} setModal={setModal} closeModal={closeModal}
        />}

        {/* ── NÁKLADY ── */}
        {tab === "costs" && <Costs
          costs={costs} setCosts={setCosts}
          modal={modal} setModal={setModal} closeModal={closeModal}
        />}

        {tab === "finance" && <FinanceModule currentUser={currentUser} employees={employees} />}

        {tab === "uctenky" && <ReceiptsModule currentUser={currentUser} />}

        {tab === "reports" && <Reports
          customers={customers} deals={deals} invoices={invoices}
          costs={costs} employees={employees} projects={projects}
        />}

        {tab === "ai" && <AIAssistant
          customers={customers} deals={deals} invoices={invoices}
          costs={costs} employees={employees} projects={projects}
          tasks={tasks} communication={communication}
        />}

        {tab === "attendance" && <Attendance
          currentUser={currentUser} attendance={attendance} setAttendance={setAttendance}
          employees={employees} contracts={contracts} products={products} setTab={setTab}
        />}

        {tab === "podpisy" && <PodpisyModule employees={employees} currentUser={currentUser} />}

        {tab === "calendar" && <CalendarModule
          currentUser={currentUser} employees={employees} contracts={contracts}
          customers={customers}
          calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents}
        />}

        {tab === "knjiga" && <KnihaJizd
          currentUser={currentUser} employees={employees} contracts={contracts}
        />}

        {tab === "onedrive" && (
          <OneDrivePanel supabase={supabase} />
        )}
        {tab === "fotoupload" && (
          <FotoUpload currentUser={currentUser} setTab={setTab} />
        )}
        {tab === "profile" && <Profile
          currentUser={currentUser} attendance={attendance} employees={employees}
        />}
        {tab === "permissions" && <PermissionsPanel />}

        {/* ── NOTIFIKACE ── */}
        {tab === "notifications" && (
          <div>
            <div style={S.header}><h1 style={S.h1}>Oznámení</h1>
              <button style={{ ...S.btn("#334155"), padding: "7px 14px" }} onClick={async () => {
                const myName = currentUser?.name || "";
                await supabase.from("notifications").update({ read: true }).eq("user_name", myName).eq("read", false);
                setNotifications(notifications.map(n => n.user_name === myName ? { ...n, read: true } : n));
              }}>Označit vše jako přečtené</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {notifications.filter(n => !n.user_name || n.user_name === currentUser?.name).map(n => (
                <div key={n.id} style={{ ...S.card, borderLeft: `3px solid ${n.read ? "#cbd5e1" : "#2E9BE0"}`, padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: n.read ? "#64748b" : "#fff", marginBottom: 4 }}>{n.title}</div>
                      <div style={{ color: "#475569", fontSize: 13 }}>{n.message}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap", marginLeft: 12 }}>{new Date(n.created_at).toLocaleString("cs")}</div>
                  </div>
                </div>
              ))}
              {notifications.length === 0 && <Empty />}
            </div>
          </div>
        )}

        {/* ── ZAKÁZKY ── */}
        {tab === "contracts" && <Contracts
          customers={customers} employees={employees}
          currentUser={currentUser}
          initialDeal={contractInitialDeal}
        />}
        {tab === "sheets" && <ZakazkaSheet
          customers={customers}
          currentUser={currentUser}
          initialContractId={sheetContractId}
          initialContractName={sheetContractName}
          onClearInitial={() => { setSheetContractId(null); setSheetContractName(""); }}
        />}
      </div>
      <RadialMenu currentUser={currentUser} tab={tab} setTab={setTab} />
    </div>
    </>
  );
}

// ─── RADIÁLNÍ MENU (kolečko rychlých akcí, vpravo dole) ──────────────────────
// Dvouprstencové: střed = aktuální sekce, vnitřní mezikruží = rychlé (existující)
// odkazy k aktuální sekci, vnější kruh = hlavní sekce. Vše jen na existující taby.
//
// NEPOSTAVENO ZATÍM (na budoucí úpravy — uživatel je chce, ale ne teď):
// Šablony (u Nacenění), Export (CSV), Report (Dashboard), Nastavení (Dashboard),
// Přehled nákladů — tyhle byly v návrhu jen jako ukázka, appka je zatím neumí.

const NAV_BY_ID = Object.fromEntries(NAV.map((n) => [n.id, n]));

const RADIAL_OUTER = {
  admin: ["dashboard", "pricing", "contracts", "customers", "warehouse", "hr"],
  manager: ["dashboard", "pricing", "contracts", "customers", "costs"],
  hr: ["dashboard", "hr", "attendance", "costs", "calendar"],
  employee: ["dashboard", "fotoupload", "attendance", "knjiga", "calendar"],
};

const RADIAL_QUICK_LINKS = {
  dashboard: ["calendar", "attendance", "costs"],
  pricing: ["deals", "contracts", "invoices"],
  contracts: ["invoices", "costs", "fotoupload"],
  customers: ["deals", "contracts", "tasks"],
  warehouse: ["costs", "contracts"],
  hr: ["attendance", "calendar", "costs"],
  costs: ["contracts", "reports"],
  attendance: ["hr", "calendar"],
  calendar: ["attendance", "hr"],
  fotoupload: ["knjiga", "attendance"],
  knjiga: ["attendance", "fotoupload"],
  invoices: ["contracts", "costs"],
  deals: ["pricing", "contracts"],
  tasks: ["contracts", "customers"],
};

// Barvy prstenců — modrá = hlavní sekce, zelená = rychlé akce, oranžová = aktuální sekce
const RADIAL_COLOR_OUTER = { bg: "#E6F1FB", bgActive: "#B5D4F4", border: "#85B7EB", borderActive: "#185FA5", text: "#0C447C" };
const RADIAL_COLOR_INNER = { bg: "#E1F5EE", border: "#5DCAA5", text: "#085041" };
const RADIAL_COLOR_CENTER = { bg: "#FDEEE0", border: "#F5821F", icon: "#B85F14", text: "#8A3E0A" };

function RadialMenu({ currentUser, tab, setTab }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("outer"); // "outer" → vybírám sekci, "inner" → vybírám úkon
  const [selectedOuter, setSelectedOuter] = useState(null);
  const [hoverId, setHoverId] = useState(null); // najetá/přidržená položka — myší nebo prstem
  const dragging = useRef(false);

  const roleNav = ROLES[currentUser?.role]?.nav || [];
  const outerIds = (RADIAL_OUTER[currentUser?.role] || RADIAL_OUTER.employee).filter((id) => roleNav.includes(id));
  const previewTab = step === "outer" ? (hoverId && outerIds.includes(hoverId) ? hoverId : tab) : selectedOuter;
  const innerIds = (RADIAL_QUICK_LINKS[selectedOuter] || []).filter((id) => roleNav.includes(id) && id !== selectedOuter);
  const centerNav = NAV_BY_ID[previewTab];

  const close = () => { setOpen(false); setStep("outer"); setSelectedOuter(null); setHoverId(null); };
  const go = (id) => { setTab(id); close(); };
  const pickOuter = (id) => { setSelectedOuter(id); setStep("inner"); setHoverId(null); };
  const back = () => { setStep("outer"); setSelectedOuter(null); setHoverId(null); };
  const confirm = (id) => { if (step === "outer") pickOuter(id); else go(id); };
  // Klik mimo kruh (na ztmavené pozadí) potvrdí to, co je zrovna najeté/vybrané —
  // nezahodí rozjetý výběr, jen ho rovnou uplatní a menu zavře.
  const commitAndClose = () => {
    if (hoverId) go(hoverId);
    else if (step === "inner" && selectedOuter) go(selectedOuter);
    else close();
  };

  const outerR = 175, innerR = 96;
  const activeIds = step === "outer" ? outerIds : innerIds;
  const activeRadius = step === "outer" ? outerR : innerR;
  const activeSize = step === "outer" ? 56 : 48;
  const activeColors = step === "outer" ? RADIAL_COLOR_OUTER : RADIAL_COLOR_INNER;

  // Na dotykové obrazovce najíždíme prstem nad různé položky — sleduje se, co je
  // aktuálně pod prstem, a puštěním se potvrdí výběr (jako u kolečka fotoaparátu).
  const findRadialId = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const target = el && el.closest ? el.closest("[data-radial-id]") : null;
    return target ? target.getAttribute("data-radial-id") : null;
  };
  const onWheelTouchStart = (e) => {
    dragging.current = true;
    const t = e.touches[0];
    const id = findRadialId(t.clientX, t.clientY);
    if (id) setHoverId(id);
  };
  const onWheelTouchMove = (e) => {
    if (!dragging.current) return;
    e.preventDefault();
    const t = e.touches[0];
    const id = findRadialId(t.clientX, t.clientY);
    if (id) setHoverId(id);
  };
  const onWheelTouchEnd = (e) => {
    e.preventDefault();
    dragging.current = false;
    if (hoverId) confirm(hoverId); else if (step === "inner") back(); else close();
  };

  const ring = (ids, radius, size, colors) => ids.map((id, i) => {
    const n = NAV_BY_ID[id];
    if (!n) return null;
    const deg = (360 / ids.length) * i - 90;
    const rad = (deg * Math.PI) / 180;
    const x = Math.cos(rad) * radius, y = Math.sin(rad) * radius;
    const dx = Math.cos(rad), dy = Math.sin(rad);
    const active = id === hoverId || (step === "outer" && !hoverId && id === tab);
    const labelDist = radius + size / 2 + 26;
    const lx = Math.cos(rad) * labelDist, ly = Math.sin(rad) * labelDist;
    return (
      <React.Fragment key={id}>
        <div style={{
          position: "absolute", left: "50%", top: "50%", width: radius, height: 1, background: "#e2e8f0",
          transformOrigin: "0 0", transform: `rotate(${deg}deg)`,
        }} />
        <button title={n.label} aria-label={n.label} data-radial-id={id}
          onClick={() => confirm(id)}
          onMouseEnter={() => setHoverId(id)}
          style={{
            position: "absolute", left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, width: size, height: size,
            marginLeft: -size / 2, marginTop: -size / 2,
            borderRadius: "50%", border: `${active ? 2 : 1}px solid ${active ? colors.borderActive || colors.border : colors.border}`,
            background: active ? (colors.bgActive || colors.bg) : colors.bg, color: colors.text,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: size >= 50 ? 20 : 17, zIndex: 2, touchAction: "none",
          }}>
          <i className={`ti ${n.icon}`} aria-hidden="true"></i>
        </button>
        <div style={{
          position: "absolute", left: `calc(50% + ${lx}px)`, top: `calc(50% + ${ly}px)`,
          width: "max-content", maxWidth: 110, marginLeft: dx >= 0 ? 0 : -110, marginTop: -10, textAlign: dx >= 0 ? "left" : "right",
          fontSize: 12, fontWeight: active ? 700 : 500, color: colors.text, background: colors.bg,
          border: `1px solid ${colors.border}`, borderRadius: 6, padding: "3px 7px",
          pointerEvents: "none", lineHeight: 1.2, zIndex: 4, whiteSpace: "nowrap",
        }}>{n.label}</div>
      </React.Fragment>
    );
  });

  return (
    <>
      {open && (
        <div onClick={commitAndClose} style={{
          position: "fixed", inset: 0, zIndex: 998, background: "rgba(14,59,94,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div onClick={(e) => e.stopPropagation()}
            onTouchStart={onWheelTouchStart} onTouchMove={onWheelTouchMove} onTouchEnd={onWheelTouchEnd} onTouchCancel={onWheelTouchEnd}
            style={{ position: "relative", width: 480, height: 480, touchAction: "none" }}>
            <div style={{
              position: "absolute", left: "50%", top: "50%", width: activeRadius * 2, height: activeRadius * 2,
              marginLeft: -activeRadius, marginTop: -activeRadius, borderRadius: "50%", border: "1px dashed #cbd5e1",
              transition: "width .18s ease, height .18s ease, margin .18s ease",
            }} />
            {ring(activeIds, activeRadius, activeSize, activeColors)}
            {step === "inner" && (
              <button title="Zpět na sekce" aria-label="Zpět na sekce" onClick={back}
                style={{
                  position: "absolute", left: "50%", top: `calc(50% - ${activeRadius + 60}px)`, marginLeft: -18, marginTop: -18,
                  width: 36, height: 36, borderRadius: "50%", border: "1px solid #cbd5e1", background: "#fff", color: "#64748b",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, zIndex: 4,
                }}>
                <i className="ti ti-arrow-back-up" aria-hidden="true"></i>
              </button>
            )}
            <div onClick={() => step === "inner" && go(selectedOuter)} style={{
              position: "absolute", left: "50%", top: "50%", width: 104, height: 104, marginLeft: -52, marginTop: -52,
              borderRadius: "50%", background: RADIAL_COLOR_CENTER.bg, border: `1px solid ${RADIAL_COLOR_CENTER.border}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, zIndex: 3,
              cursor: step === "inner" ? "pointer" : "default",
            }}>
              <i className={`ti ${centerNav?.icon || "ti-layout-grid"}`} style={{ fontSize: 24, color: RADIAL_COLOR_CENTER.icon }} aria-hidden="true"></i>
              <span style={{ fontSize: 11, fontWeight: 500, color: RADIAL_COLOR_CENTER.text }}>{centerNav?.label || ""}</span>
            </div>
          </div>
        </div>
      )}
      <div style={{ position: "fixed", right: 28, bottom: 28, zIndex: 999, width: 56, height: 56 }}>
        <button onClick={() => { if (open) close(); else setOpen(true); }} title={open ? "Zavřít" : (centerNav?.label || "Rychlé menu")}
          aria-label={open ? "Zavřít rychlé menu" : "Otevřít rychlé menu"}
          style={{
            width: 56, height: 56, borderRadius: "50%", border: "none", cursor: "pointer",
            background: "#F5821F", color: "#fff", fontSize: 22, boxShadow: "0 6px 20px #0000003a",
            display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 2,
          }}>
          <i className={`ti ${open ? "ti-x" : (centerNav?.icon || "ti-layout-grid")}`} aria-hidden="true"></i>
        </button>
      </div>
    </>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────


// ─── DASHBOARD ZAMĚSTNANCE ───────────────────────────────────────────────────

function EmployeeDashboard({ currentUser, attendance, tasks, setTasks, employees, toggleTask, setTab, setNotifications }) {
  const myName = currentUser?.name || "";
  const emp = employees.find(e => e.name === myName) || {};
  const [newTask, setNewTask] = useState({ title: "", due: "", priority: "Střední" });
  const [addingTask, setAddingTask] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);

  const saveQuickTask = async () => {
    if (!newTask.title.trim()) return;
    setTaskSaving(true);
    const row_data = {
      title: newTask.title, due: newTask.due || null, priority: newTask.priority,
      done: false, created_by: myName, assigned_to: myName,
      visible_to: [myName],
    };
    const { data: row } = await supabase.from("tasks").insert(row_data).select().single();
    if (row) {
      setTasks(prev => [...prev, row]);
    }
    setNewTask({ title: "", due: "", priority: "Střední" });
    setAddingTask(false);
    setTaskSaving(false);
  };

  // Dovolená
  const vacTotal = currentUser.vacationDays || 0;
  const vacUsed  = currentUser.vacationUsed || 0;
  const vacLeft  = vacTotal - vacUsed;
  const vacPct   = vacTotal > 0 ? Math.round((vacUsed / vacTotal) * 100) : 0;

  // Odpracováno tento měsíc
  // Pozor: checkin/checkout jsou jen časy dne ("07:00"), datum záznamu je v
  // poli date — porovnávat měsíc/týden proti checkinu byla chyba, proto se
  // hodiny nikdy nespočítaly (žádný záznam tomu filtru neodpovídal).
  const nowM = new Date().toISOString().slice(0, 7); // "2026-06"
  const myAtt = attendance.filter(a =>
    (a.employeeId === currentUser.employeeId || a.employee_id === currentUser.employeeId) &&
    a.date?.startsWith(nowM) && a.checkout
  );
  const hoursThisMonth = myAtt.reduce((s, a) => s + Math.max(0, calcHours(a.checkin, a.checkout) - 1), 0);

  // Odpracováno tento týden
  const startOfWeek = (() => {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.toISOString().slice(0, 10);
  })();
  const hoursThisWeek = myAtt.filter(a => a.date >= startOfWeek)
    .reduce((s, a) => s + Math.max(0, calcHours(a.checkin, a.checkout) - 1), 0);

  // Poslední záznamy docházky
  const recentAtt = [...myAtt].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  // Moje úkoly
  const myTasks = tasks.filter(t =>
    !t.done && (
      t.assigned_to === myName ||
      t.assignedTo === myName ||
      (t.visible_to || []).includes(myName) ||
      (t.visible_to || []).length === 0
    )
  ).slice(0, 5);

  const fmtH = (h) => `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;

  return (
    <>
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>Dobrý den, {myName.split(" ")[0]} 👋</h1>
          <div style={{ color: "#475569", fontSize: 13 }}>{new Date().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
      </div>

      {/* Hlavní karty */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
        {/* Dovolená */}
        <div style={{ ...S.statCard("#34d399"), gridColumn: "span 1" }}>
          <div style={S.statLabel}>🏖 Zbývající dovolená</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: "#34d399", lineHeight: 1.1 }}>{vacLeft}</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>dní z {vacTotal} celkem</div>
          <div style={{ marginTop: 10, background: "#e2e8f0", borderRadius: 6, height: 6, overflow: "hidden" }}>
            <div style={{ width: `${vacPct}%`, background: "#34d399", height: "100%", borderRadius: 6, transition: "width 0.4s" }} />
          </div>
          <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>Vyčerpáno {vacUsed} dní ({vacPct}%)</div>
        </div>

        {/* Hodiny tento měsíc */}
        <div style={S.statCard("#2E9BE0")}>
          <div style={S.statLabel}>📅 Odpracováno tento měsíc</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: "#2E9BE0", lineHeight: 1.1 }}>{Math.floor(hoursThisMonth)}</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>hodin ({fmtH(hoursThisMonth)})</div>
          <div style={{ fontSize: 11, color: "#334155", marginTop: 8 }}>{myAtt.length} směn tento měsíc</div>
        </div>

        {/* Hodiny tento týden */}
        <div style={S.statCard("#3b82f6")}>
          <div style={S.statLabel}>📆 Odpracováno tento týden</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: "#3b82f6", lineHeight: 1.1 }}>{Math.floor(hoursThisWeek)}</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>hodin ({fmtH(hoursThisWeek)})</div>
          <div style={{ fontSize: 11, color: "#334155", marginTop: 8 }}>
            {myAtt.filter(a => a.date >= startOfWeek).length} směn tento týden
          </div>
        </div>
      </div>

      <div style={S.grid2}>
        {/* Moje úkoly */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>📋 Moje úkoly</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button style={{ ...S.btn(), padding: "5px 12px", fontSize: 12 }} onClick={() => setAddingTask(!addingTask)}>
                {addingTask ? "✕" : "+ Přidat"}
              </button>
              <span style={{ color: "#2E9BE0", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("tasks")}>Vše →</span>
            </div>
          </div>

          {/* Formulář pro nový úkol */}
          {addingTask && (
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <input style={{ ...S.input, marginBottom: 8 }} placeholder="Název úkolu..."
                value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                onKeyDown={e => e.key === "Enter" && saveQuickTask()} autoFocus />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <DatePicker value={newTask.due} onChange={v => setNewTask({ ...newTask, due: v })} placeholder="Termín (volitelné)" />
                <select style={S.select} value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })}>
                  {["Vysoká","Střední","Nízká"].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={S.btn()} onClick={saveQuickTask} disabled={taskSaving}>
                  {taskSaving ? "⏳" : "Uložit úkol"}
                </button>
                <button style={S.btnGhost} onClick={() => setAddingTask(false)}>Zrušit</button>
              </div>
            </div>
          )}

          {myTasks.length === 0
            ? <div style={{ color: "#334155", fontSize: 13 }}>Žádné otevřené úkoly ✓</div>
            : myTasks.map(t => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <input type="checkbox" checked={false} onChange={() => toggleTask(t.id)} style={{ accentColor: "#2E9BE0", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#1A1A1A" }}>{t.title}</div>
                  {t.due && <div style={{ fontSize: 11, color: "#475569" }}>📅 {fmtDateCz(t.due)}</div>}
                </div>
                {t.priority && <span style={S.tag(PRIO_COLORS[t.priority] || "#64748b")}>{t.priority}</span>}
              </div>
            ))
          }
        </div>

        {/* Poslední docházka */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
            🕐 Poslední docházka
            <span style={{ color: "#2E9BE0", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("attendance")}>Vše →</span>
          </div>
          {recentAtt.length === 0
            ? <div style={{ color: "#334155", fontSize: 13 }}>Žádné záznamy</div>
            : recentAtt.map((a, i) => {
              const h = Math.max(0, calcHours(a.checkin, a.checkout) - 1);
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 10, borderBottom: i < recentAtt.length - 1 ? "1px solid #1a2035" : "none" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#1A1A1A" }}>{new Date(a.date + "T00:00:00").toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>
                      {a.checkin} – {a.checkout}
                      {a.contract_name && <span style={{ color: "#2E9BE0", marginLeft: 6 }}>· {a.contract_name}</span>}
                    </div>
                  </div>
                  <span style={S.badge("#2E9BE0")}>{fmtH(h)}</span>
                </div>
              );
            })
          }
        </div>
      </div>
    </>
  );
}

const DASH_WIDGETS = [
  { id: "zakazky", label: "Zakázky a fakturace", icon: "ti-file-invoice" },
  { id: "dochazka", label: "Docházka / HR", icon: "ti-users" },
  { id: "sklad", label: "Sklad / materiál", icon: "ti-package" },
  { id: "projekty", label: "Projekty", icon: "ti-building" },
  { id: "rozpracovane", label: "Rozpracované zakázky", icon: "ti-progress" },
];

// Sekce, podle kterých se u zakázky sleduje rozpočet vs. skutečné čerpání.
const CONTRACT_COST_SECTIONS = [
  { key: "prace", label: "Práce", costType: "práce", budgetKey: "budget_prace", budgetExtraKey: "budget_vice_prace", color: "#2E9BE0" },
  { key: "material", label: "Materiál", costType: "materiál", budgetKey: "budget_material", budgetExtraKey: "budget_vice_material", color: "#f59e0b" },
  { key: "doprava", label: "Doprava", costType: "doprava", budgetKey: "budget_doprava", budgetExtraKey: "budget_vice_doprava", color: "#a78bfa" },
];

function widgetCardHeader(icon, label, color, action) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A", display: "flex", alignItems: "center", gap: 7 }}>
        <i className={`ti ${icon}`} style={{ color, fontSize: 15 }} aria-hidden="true"></i> {label}
      </span>
      {action}
    </div>
  );
}

function Dashboard({ customers, deals, tasks, invoices, products, employees, projects,
  totalRevenue, pendingRevenue, overdueRevenue, lowStock, totalPayroll, activeProjects, costs, toggleTask, setTab, contracts, attendance, onOpenSheet, costEntries }) {
  const [sheetSearch, setSheetSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [hiddenWidgets, setHiddenWidgets] = useState(() => {
    try { return JSON.parse(localStorage.getItem("proudos_dash_hidden") || "[]"); } catch { return []; }
  });
  const toggleWidget = (id) => {
    setHiddenWidgets(prev => {
      const next = prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id];
      try { localStorage.setItem("proudos_dash_hidden", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const totalCosts = costs.reduce((s, c) => s + c.amount, 0);
  const todayStr = fmt(new Date());
  const thisMonth = todayStr.slice(0, 7);
  const thisMonthCosts = costs.filter(c => c.date.startsWith(thisMonth)).reduce((s, c) => s + c.amount, 0);
  const profit = totalRevenue - totalCosts;
  const activeEmployees = employees.filter(e => e.status === "Aktivní");
  const presentToday = (attendance || []).filter(a => a.date === todayStr && a.checkin);
  const openInvoices = invoices.filter(i => i.status === "Čeká" || i.status === "Po splatnosti");
  const inProgressContracts = (contracts || []).filter(c => c.status === "Probíhá");

  // Tržby (zaplacené faktury) za posledních 6 měsíců pro mini graf
  const monthKeys = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(todayStr + "T00:00:00");
    d.setMonth(d.getMonth() - (5 - i));
    return d.toISOString().slice(0, 7);
  });
  const revenueByMonth = monthKeys.map(mk =>
    invoices.filter(i => i.status === "Zaplacena" && (i.issued || "").startsWith(mk)).reduce((s, i) => s + i.amount, 0)
  );
  const maxRevenue = Math.max(1, ...revenueByMonth);

  const stats = [
    { label: "Zákazníci", value: customers.length, color: "#2E9BE0" },
    { label: "Zaplaceno (příjmy)", value: fmtKc(totalRevenue), color: "#34d399" },
    { label: "Náklady celkem", value: fmtKc(totalCosts), color: "#f87171" },
    { label: "Zisk", value: fmtKc(profit), color: profit >= 0 ? "#34d399" : "#f87171" },
    { label: "Náklady tento měsíc", value: fmtKc(thisMonthCosts), color: "#f59e0b" },
    { label: "Produkty skladu", value: products.length, color: "#2E9BE0" },
    { label: "Zaměstnanci", value: employees.length, color: "#a78bfa" },
    { label: "Aktivní projekty", value: activeProjects, color: "#34d399" },
    { label: "Mzdové náklady", value: fmtKc(totalPayroll), color: "#f59e0b" },
    { label: "Na pracovišti dnes", value: `${presentToday.length} / ${activeEmployees.length}`, color: "#2E9BE0" },
  ];

  return (
    <>
      <div style={S.header}>
        <h1 style={S.h1}>Dashboard</h1>
        <button style={{ ...S.btnGhost, fontSize: 12, padding: "7px 14px" }} onClick={() => setEditMode(!editMode)}>
          {editMode ? <><i className="ti ti-check" aria-hidden="true" style={{ marginRight: 6 }}></i>Hotovo</> : <><i className="ti ti-layout-grid-add" aria-hidden="true" style={{ marginRight: 6 }}></i>Přizpůsobit rozvržení</>}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={S.statCard(s.color)}>
            <div style={S.statLabel}>{s.label}</div>
            <div style={S.statValue(s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Přizpůsobitelné widgety */}
      {editMode && (
        <div style={{ ...S.card, marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Zobrazit widgety:</span>
          {DASH_WIDGETS.map(w => (
            <label key={w.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#1A1A1A", cursor: "pointer" }}>
              <input type="checkbox" checked={!hiddenWidgets.includes(w.id)} onChange={() => toggleWidget(w.id)} />
              <i className={`ti ${w.icon}`} aria-hidden="true"></i> {w.label}
            </label>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        {/* Zakázky a fakturace */}
        {!hiddenWidgets.includes("zakazky") && (
          <div style={S.card}>
            {widgetCardHeader("ti-file-invoice", "Zakázky a fakturace", "#2E9BE0",
              <span style={{ color: "#2E9BE0", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("invoices")}>Vše →</span>)}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>Tržby tento měsíc</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A" }}>{fmtKc(revenueByMonth[5])}</div>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>Otevřené faktury</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#F5821F" }}>{openInvoices.length}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 44 }}>
              {revenueByMonth.map((v, i) => (
                <div key={i} title={fmtKc(v)} style={{ flex: 1, background: i === 5 ? "#2E9BE0" : "#bfdbfe", borderRadius: "3px 3px 0 0", height: `${Math.max(4, (v / maxRevenue) * 100)}%` }} />
              ))}
            </div>
          </div>
        )}

        {/* Docházka / HR */}
        {!hiddenWidgets.includes("dochazka") && (
          <div style={S.card}>
            {widgetCardHeader("ti-users", "Docházka / HR", "#2E9BE0",
              <span style={{ color: "#2E9BE0", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("attendance")}>Vše →</span>)}
            {activeEmployees.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 13 }}>Žádní aktivní zaměstnanci</div> :
              activeEmployees.map(e => {
                const rec = presentToday.find(a => a.employeeId === e.id);
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, marginBottom: 9, opacity: rec ? 1 : 0.55 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7, color: "#1A1A1A" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: rec ? (rec.checkout ? "#94a3b8" : "#34d399") : "#cbd5e1" }} />
                      {e.name}
                    </span>
                    <span style={{ color: "#64748b", fontSize: 12 }}>
                      {rec ? (rec.checkout ? `Odešel/a ${rec.checkout}` : `Od ${rec.checkin}`) : "Nezapsáno"}
                    </span>
                  </div>
                );
              })
            }
          </div>
        )}

        {/* Sklad / materiál */}
        {!hiddenWidgets.includes("sklad") && (
          <div style={S.card}>
            {widgetCardHeader("ti-package", "Sklad / materiál", "#2E9BE0",
              <span style={{ color: "#2E9BE0", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("warehouse")}>Sklad →</span>)}
            {lowStock.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 13 }}>Vše skladem v pořádku ✓</div> :
              lowStock.slice(0, 4).map(p => {
                const critical = p.stock <= p.minStock * 0.5;
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, marginBottom: 9 }}>
                    <span style={{ color: "#1A1A1A" }}>{p.name}</span>
                    <span style={S.tag(critical ? "#f87171" : "#f59e0b")}>zbývá {p.stock} {p.unit}</span>
                  </div>
                );
              })
            }
          </div>
        )}

        {/* Projekty */}
        {!hiddenWidgets.includes("projekty") && (
          <div style={S.card}>
            {widgetCardHeader("ti-building", "Projekty", "#2E9BE0",
              <span style={{ color: "#2E9BE0", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("projects")}>Vše →</span>)}
            {projects.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 13 }}>Žádné projekty</div> :
              projects.slice(0, 3).map(p => (
                <div key={p.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#1A1A1A" }}>{p.name}</span>
                    <span style={S.badge(PROJ_COLORS[p.status])}>{p.status}</span>
                  </div>
                  <div style={S.progress(p.progress)}>
                    <div style={S.progressBar(p.progress, PROJ_COLORS[p.status])} />
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>{p.progress}% dokončeno</div>
                </div>
              ))
            }
          </div>
        )}
      </div>

      <div style={S.grid2}>
        {/* Rozpracované zakázky — finanční stav po sekcích a úkoly */}
        {!hiddenWidgets.includes("rozpracovane") && (
          <div style={{ ...S.card, gridColumn: "1 / -1" }}>
            {widgetCardHeader("ti-progress", "Rozpracované zakázky — finanční stav", "#2E9BE0",
              <span style={{ color: "#2E9BE0", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("contracts")}>Vše →</span>)}
            {inProgressContracts.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 13 }}>Žádné rozpracované zakázky</div> :
              inProgressContracts.map(c => {
                const contractTasks = (tasks || []).filter(t => t.contract_id === c.id);
                const doneTasks = contractTasks.filter(t => t.done).length;
                return (
                  <div key={c.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: "#1A1A1A", fontSize: 13, cursor: "pointer" }} onClick={() => onOpenSheet(c.id, c.name)}>
                        {c.name} {c.code && <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: 11 }}>({c.code})</span>}
                      </span>
                      {contractTasks.length > 0 && (
                        <span style={{ fontSize: 11, color: "#64748b" }}>Úkoly: {doneTasks}/{contractTasks.length}</span>
                      )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                      {CONTRACT_COST_SECTIONS.map(sec => {
                        const budget = (Number(c[sec.budgetKey]) || 0) + (Number(c[sec.budgetExtraKey]) || 0);
                        const spent = (costEntries || []).filter(e => e.contract_id === c.id && e.cost_type === sec.costType).reduce((s, e) => s + (Number(e.amount_cost) || 0), 0);
                        const pct = budget > 0 ? (spent / budget) * 100 : (spent > 0 ? 100 : 0);
                        const over = budget > 0 && spent > budget;
                        return (
                          <div key={sec.key}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 3 }}>
                              <span>{sec.label}</span>
                              <span style={{ color: over ? "#f87171" : "#64748b", fontWeight: over ? 700 : 400 }}>{fmtKc(spent)} / {fmtKc(budget)}</span>
                            </div>
                            <div style={{ background: "#f1f5f9", borderRadius: 6, height: 6, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: over ? "#f87171" : sec.color, borderRadius: 6 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            }
          </div>
        )}

        {/* ZAKÁZKOVÝ LIST — rychlé vyhledání */}
        <div style={{ ...S.card, gridColumn: "1 / -1", marginBottom: 0 }}>
          <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span>📋</span> Zakázkový list — rychlé vyhledání
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              style={{ ...S.input, flex: 1, marginBottom: 0 }}
              placeholder="Hledat zakázku podle jména zákazníka nebo čísla OP..."
              value={sheetSearch}
              onChange={e => setSheetSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && sheetSearch.trim()) {
                  const q = sheetSearch.toLowerCase();
                  const found = (contracts || []).find(c =>
                    c.name?.toLowerCase().includes(q) ||
                    c.code?.toLowerCase().includes(q) ||
                    c.address?.toLowerCase().includes(q)
                  );
                  if (found) { onOpenSheet(found.id, found.name); setSheetSearch(""); }
                }
              }}
            />
            <button style={{ ...S.btn("#2E9BE0"), padding: "9px 18px", flexShrink: 0 }}
              onClick={() => {
                const q = sheetSearch.toLowerCase();
                const found = (contracts || []).find(c =>
                  c.name?.toLowerCase().includes(q) ||
                  c.code?.toLowerCase().includes(q) ||
                  c.address?.toLowerCase().includes(q)
                );
                if (found) { onOpenSheet(found.id, found.name); setSheetSearch(""); }
              }}>
              Otevřít →
            </button>
          </div>
          {/* Výsledky při psaní */}
          {sheetSearch.trim() && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {(contracts || [])
                .filter(c => c.name?.toLowerCase().includes(sheetSearch.toLowerCase()) || c.code?.toLowerCase().includes(sheetSearch.toLowerCase()) || c.address?.toLowerCase().includes(sheetSearch.toLowerCase()))
                .slice(0, 5)
                .map(c => (
                  <div key={c.id} onClick={() => { onOpenSheet(c.id, c.name); setSheetSearch(""); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f8fafc", borderRadius: 8, cursor: "pointer", border: "1px solid #e2e8f0" }}>
                    <span style={{ fontSize: 16 }}>📋</span>
                    <div>
                      <div style={{ fontWeight: 600, color: "#1A1A1A", fontSize: 13 }}>{c.name}</div>
                      {c.code && <div style={{ fontSize: 11, color: "#64748b" }}>{c.code}</div>}
                    </div>
                    <span style={{ marginLeft: "auto", color: "#2E9BE0", fontSize: 12 }}>Otevřít →</span>
                  </div>
                ))
              }
              {(contracts || []).filter(c => c.name?.toLowerCase().includes(sheetSearch.toLowerCase()) || c.code?.toLowerCase().includes(sheetSearch.toLowerCase())).length === 0 && (
                <div style={{ color: "#64748b", fontSize: 12, padding: "8px 12px" }}>Žádná zakázka nenalezena</div>
              )}
            </div>
          )}
        </div>

        {/* Nejbližší úkoly */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
            Nejbližší úkoly <span style={{ color: "#2E9BE0", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("tasks")}>Vše →</span>
          </div>
          {tasks.filter(t => !t.done).slice(0, 4).map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} style={{ accentColor: "#2E9BE0" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#1A1A1A" }}>{t.title}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{fmtDateCz(t.due)}</div>
              </div>
              <span style={S.tag(PRIO_COLORS[t.priority] || "#64748b")}>{t.priority}</span>
            </div>
          ))}
        </div>

        {/* Poslední faktury */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
            Poslední faktury <span style={{ color: "#2E9BE0", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("invoices")}>Vše →</span>
          </div>
          {invoices.slice(-3).reverse().map(inv => {
            const cust = customers.find(c => c.id === inv.customerId);
            return (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#1A1A1A" }}>{inv.number}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{cust?.name}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{fmtKc(inv.amount)}</div>
                  <span style={S.tag(INV_COLORS[inv.status])}>{inv.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── ZÁKAZNÍCI ────────────────────────────────────────────────────────────────

function Customers({ customers, setCustomers, invoices, deals, communication, contracts, search, setSearch, modal, setModal, closeModal }) {
  const [newC, setNewC] = useState({ name: "", company: "", email: "", phone: "", tag: "Nový" });
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = customers.filter(c => c.archived).length;
  const filtered = customers.filter(c =>
    !!c.archived === showArchived &&
    ((c.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.company || "").toLowerCase().includes(search.toLowerCase()))
  );

  const save = async () => {
    if (!newC.name) return;
    const { data: row } = await supabase.from("customers").insert({
      name: newC.name, company: newC.company, email: newC.email,
      phone: newC.phone, tag: newC.tag,
    }).select().single();
    if (row) setCustomers([...customers, row]);
    setNewC({ name: "", company: "", email: "", phone: "", tag: "Nový" });
    closeModal();
  };

  // Zákazník se nikdy fyzicky nemaže — jen se archivuje, aby zůstaly zachované
  // vazby na jeho zakázky, poptávky, faktury i komunikaci v historii.
  const archiveCustomer = async (id) => {
    if (!confirm("Smazat zákazníka? Jeho zakázky, poptávky a faktury zůstanou zachované v historii, zákazník se jen skryje ze seznamu.")) return;
    await supabase.from("customers").update({ archived: true }).eq("id", id);
    setCustomers(customers.map(c => c.id === id ? { ...c, archived: true } : c));
    closeModal();
  };

  const restoreCustomer = async (id) => {
    await supabase.from("customers").update({ archived: false }).eq("id", id);
    setCustomers(customers.map(c => c.id === id ? { ...c, archived: false } : c));
    closeModal();
  };

  return (
    <>
      <div style={S.header}>
        <h1 style={S.h1}>Zákazníci</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <input style={S.search} placeholder="🔍 Hledat..." value={search} onChange={e => setSearch(e.target.value)} />
          <button style={showArchived ? S.btn("#334155") : S.btnGhost} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "← Zpět na aktivní" : `🗑️ Smazaní (${archivedCount})`}
          </button>
          {!showArchived && <button style={S.btn()} onClick={() => setModal({ type: "addCustomer" })}>+ Přidat</button>}
        </div>
      </div>
      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>{["Jméno", "Firma", "Email", "Telefon", "Faktury", "Štítek", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ ...S.td, color: "#334155", textAlign: "center", padding: 20 }}>{showArchived ? "Žádní smazaní zákazníci." : "Žádní zákazníci."}</td></tr>
            )}
            {filtered.map((c, i) => {
              const custInvoices = invoices.filter(inv => inv.customerId === c.id);
              return (
                <tr key={c.id} style={{ cursor: "pointer", opacity: c.archived ? 0.6 : 1 }} onClick={() => setModal({ type: "customerDetail", data: c })}>
                  <td style={S.td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={S.avatar(avatarColors[i % 6])}>{getInitial(c.name)}</div>
                      <span style={{ color: "#fff", fontWeight: 600 }}>{c.name}</span>
                    </div>
                  </td>
                  <td style={S.td}>{c.company}</td>
                  <td style={S.td}>{c.email}</td>
                  <td style={S.td}>{c.phone || "—"}</td>
                  <td style={S.td}>{custInvoices.length} faktur</td>
                  <td style={S.td}><span style={S.tag(TAG_COLORS[c.tag] || "#2E9BE0")}>{c.tag}</span></td>
                  <td style={S.td}>
                    {c.archived ? (
                      <button onClick={e => { e.stopPropagation(); restoreCustomer(c.id); }} style={{ ...S.btn("#34d399"), padding: "4px 10px", fontSize: 11 }}>↺ Obnovit</button>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); archiveCustomer(c.id); }} style={{ ...S.btn("#ef4444"), padding: "4px 10px", fontSize: 11 }}>🗑️ Smazat</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal?.type === "addCustomer" && (
        <div style={S.modal}>
          <div style={S.modalBox}>
            <ModalHeader title="Nový zákazník" onClose={closeModal} />
            {[["Jméno", "name"], ["Firma", "company"], ["Email", "email"], ["Telefon", "phone"]].map(([l, k]) => (
              <div key={k}><label style={S.label}>{l}</label><input style={S.input} value={newC[k]} onChange={e => setNewC({ ...newC, [k]: e.target.value })} /></div>
            ))}
            <label style={S.label}>Štítek</label>
            <select style={S.select} value={newC.tag} onChange={e => setNewC({ ...newC, tag: e.target.value })}>
              {["Nový", "Aktivní", "VIP"].map(t => <option key={t}>{t}</option>)}
            </select>
            <ModalActions onSave={save} onClose={closeModal} />
          </div>
        </div>
      )}

      {modal?.type === "customerDetail" && (() => {
        const c = modal.data;
        const custInv = invoices.filter(i => i.customerId === c.id);
        const custDeals = deals.filter(d => d.customerId === c.id);
        const custContracts = (contracts || []).filter(z => z.customer_id === c.id);
        const CONTRACT_STATUS_COLOR = { "Příprava": "#f59e0b", "Probíhá": "#2E9BE0", "Dokončeno": "#34d399", "Pozastaveno": "#ef4444" };
        return (
          <div style={S.modal} onClick={closeModal}>
            <div style={{ ...S.modalBox, width: 600 }} onClick={e => e.stopPropagation()}>
              <ModalHeader title={c.name} onClose={closeModal} />
              <div style={{ color: "#475569", fontSize: 13, marginBottom: 16 }}>
                {c.company && <span style={{ fontWeight: 600, color: "#94a3b8" }}>{c.company} · </span>}
                {c.email && <a href={`mailto:${c.email}`} style={{ color: "#2E9BE0" }}>{c.email}</a>}
                {c.phone && <span> · <a href={`tel:${c.phone}`} style={{ color: "#16a34a" }}>📞 {c.phone}</a></span>}
                {c.email_contact && c.email_contact !== c.email && <span> · <a href={`mailto:${c.email_contact}`} style={{ color: "#a78bfa" }}>✉️ {c.email_contact}</a></span>}
              </div>
              <div style={{ marginBottom: 16 }}>
                {c.archived ? (
                  <button onClick={() => restoreCustomer(c.id)} style={{ ...S.btn("#34d399"), padding: "6px 14px", fontSize: 12 }}>↺ Obnovit zákazníka</button>
                ) : (
                  <button onClick={() => archiveCustomer(c.id)} style={{ ...S.btn("#ef4444"), padding: "6px 14px", fontSize: 12 }}>🗑️ Smazat zákazníka</button>
                )}
              </div>

              <SectionTitle>🔧 Zakázky ({custContracts.length})</SectionTitle>
              {custContracts.length === 0 ? <Empty /> : custContracts.map(z => (
                <div key={z.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #1a2035" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{z.name}</div>
                    {z.code && <div style={{ fontSize: 11, color: "#475569" }}>{z.code}{z.address ? " · " + z.address : ""}</div>}
                  </div>
                  <span style={S.tag(CONTRACT_STATUS_COLOR[z.status] || "#64748b")}>{z.status || "—"}</span>
                </div>
              ))}

              <SectionTitle style={{ marginTop: 16 }}>💼 Poptávky ({custDeals.length})</SectionTitle>
              {custDeals.length === 0 ? <Empty /> : custDeals.map(d => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a2035" }}>
                  <span style={{ color: "#e2e8f0", fontSize: 13 }}>{d.name}</span>
                  <span style={S.tag(STAGE_COLORS[d.stage])}>{d.stage}</span>
                </div>
              ))}

              <SectionTitle style={{ marginTop: 16 }}>🧾 Faktury ({custInv.length})</SectionTitle>
              {custInv.length === 0 ? <Empty /> : custInv.map(inv => (
                <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a2035" }}>
                  <span style={{ color: "#e2e8f0", fontSize: 13 }}>{inv.number}</span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{fmtKc(inv.amount)}</span>
                    <span style={S.tag(INV_COLORS[inv.status])}>{inv.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </>
  );
}

// ─── DEALS ────────────────────────────────────────────────────────────────────

function Deals({ deals, setDeals, customers, employees, tasks, modal, setModal, closeModal, onConvertToContract, currentUser }) {
  const [newD, setNewD] = useState({ name: "", value: "", stage: "Nový", customerId: "", assigned_to: "" });
  const [dragId, setDragId] = useState(null);
  const [selectedDeal, setSelectedDeal] = useState(null);

  const save = async () => {
    if (!newD.name) return;
    const { data: row } = await supabase.from("deals").insert({
      name: newD.name, value: Number(newD.value), stage: newD.stage,
      customer_id: Number(newD.customerId), assigned_to: newD.assigned_to,
    }).select().single();
    if (row) setDeals([...deals, { ...row, customerId: row.customer_id }]);
    setNewD({ name: "", value: "", stage: "Nový", customerId: "", assigned_to: "" });
    closeModal();
  };

  const moveStage = async (deal, newStage) => {
    await supabase.from("deals").update({ stage: newStage }).eq("id", deal.id);
    setDeals(deals.map(d => d.id === deal.id ? { ...d, stage: newStage } : d));
    if (selectedDeal?.id === deal.id) setSelectedDeal({ ...selectedDeal, stage: newStage });
  };

  const deleteDeal = async (id) => {
    await supabase.from("deals").delete().eq("id", id);
    setDeals(deals.filter(d => d.id !== id));
    setSelectedDeal(null);
  };

  const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; };
  const onDrop = async (e, stage) => {
    e.preventDefault();
    if (!dragId) return;
    const deal = deals.find(d => d.id === dragId);
    if (deal && deal.stage !== stage) await moveStage(deal, stage);
    setDragId(null);
  };

  return (
    <>
      <div style={S.header}>
        <h1 style={S.h1}>Obchodní příležitosti</h1>
        <button style={S.btn()} onClick={() => setModal({ type: "addDeal" })}>+ Přidat poptávku</button>
      </div>

      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 16 }}>
        {STAGES.map(stage => (
          <div key={stage} style={{ ...S.kanbanCol, minHeight: 300 }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => onDrop(e, stage)}>
            <div style={{ fontWeight: 700, color: STAGE_COLORS[stage], marginBottom: 12, fontSize: 11, letterSpacing: "0.08em" }}>
              {stage.toUpperCase()} <span style={{ color: "#475569" }}>({deals.filter(d => d.stage === stage).length})</span>
            </div>
            {deals.filter(d => d.stage === stage).map(d => {
              const cust = customers.find(c => c.id === d.customerId || c.id === d.customer_id);
              return (
                <div key={d.id}
                  style={{ ...S.kanbanCard, opacity: dragId === d.id ? 0.4 : 1, cursor: "grab", outline: selectedDeal?.id === d.id ? "2px solid #2E9BE0" : "none" }}
                  draggable onDragStart={e => onDragStart(e, d.id)}
                  onClick={() => setSelectedDeal(selectedDeal?.id === d.id ? null : d)}>
                  <div style={{ fontWeight: 600, color: "#fff", fontSize: 13, marginBottom: 3 }}>{d.name}</div>
                  {cust && <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 3 }}>🏢 {cust.name}</div>}
                  {d.assigned_to && <div style={{ fontSize: 11, color: "#2E9BE0", marginBottom: 4 }}>👤 {d.assigned_to}</div>}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: STAGE_COLORS[stage], fontWeight: 800, fontSize: 14 }}>{d.value ? fmtKc(d.value) : "—"}</div>
                    {stage === "Vyhráno" && onConvertToContract && (
                      <button title="Převést na zakázku" onClick={e => { e.stopPropagation(); onConvertToContract(d); }}
                        style={{ background: "#0d948822", border: "1px solid #0d9488", borderRadius: 6, color: "#2dd4bf", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontWeight: 700 }}>
                        🔧 → Zakázka
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Detail poptávky — inline panel */}
      {selectedDeal && (() => {
        const cust = customers.find(c => c.id === selectedDeal.customerId || c.id === selectedDeal.customer_id);
        const dealTasks = (tasks || []).filter(t => t.deal_id === selectedDeal.id);
        return (
          <div style={{ ...S.card, marginTop: 8, borderLeft: "3px solid " + (STAGE_COLORS[selectedDeal.stage] || "#2E9BE0") }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 16 }}>{selectedDeal.name}</div>
                {cust && <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>🏢 {cust.name}{cust.phone ? " · " + cust.phone : ""}</div>}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {selectedDeal.stage === "Vyhráno" && onConvertToContract && (
                  <button style={{ ...S.btn("#0d9488"), padding: "7px 16px", fontWeight: 700 }}
                    onClick={() => { onConvertToContract(selectedDeal); setSelectedDeal(null); }}>
                    🔧 Převést na zakázku
                  </button>
                )}
                <button style={{ ...S.btn("#ef4444"), padding: "6px 12px", fontSize: 12 }}
                  onClick={() => deleteDeal(selectedDeal.id)}>✕ Smazat</button>
                <button style={{ ...S.btn("#334155"), padding: "6px 12px" }} onClick={() => setSelectedDeal(null)}>✕</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 14 }}>
              <div><div style={{ fontSize: 11, color: "#64748b" }}>Hodnota</div><div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{selectedDeal.value ? fmtKc(selectedDeal.value) : "—"}</div></div>
              <div><div style={{ fontSize: 11, color: "#64748b" }}>Vede případ</div><div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 13 }}>{selectedDeal.assigned_to || "—"}</div></div>
              <div><div style={{ fontSize: 11, color: "#64748b" }}>Fáze</div><span style={S.tag(STAGE_COLORS[selectedDeal.stage])}>{selectedDeal.stage}</span></div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Přesunout do fáze:</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STAGES.map(s => (
                  <button key={s} onClick={() => moveStage(selectedDeal, s)}
                    style={{ ...S.btn(selectedDeal.stage === s ? STAGE_COLORS[s] : "#0E3B5E"), padding: "5px 12px", fontSize: 11, opacity: selectedDeal.stage === s ? 1 : 0.65 }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {dealTasks.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Úkoly ({dealTasks.length})</div>
                {dealTasks.map(t => (
                  <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", borderBottom: "1px solid #e2e8f0" }}>
                    <span>{t.done ? "✅" : "⏳"}</span>
                    <span style={{ color: "#e2e8f0", fontSize: 13, textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {modal?.type === "addDeal" && (
        <div style={S.modal}><div style={S.modalBox}>
          <ModalHeader title="Nová poptávka" onClose={closeModal} />
          <label style={S.label}>Název / popis</label>
          <input style={S.input} value={newD.name} onChange={e => setNewD({ ...newD, name: e.target.value })} placeholder="např. Elektroinstalace rodinný dům" />
          <label style={S.label}>Odhadovaná hodnota (Kč)</label>
          <input style={S.input} type="number" value={newD.value} onChange={e => setNewD({ ...newD, value: e.target.value })} />
          <label style={S.label}>Fáze</label>
          <select style={S.select} value={newD.stage} onChange={e => setNewD({ ...newD, stage: e.target.value })}>{STAGES.map(s => <option key={s}>{s}</option>)}</select>
          <label style={S.label}>Zákazník</label>
          <select style={S.select} value={newD.customerId} onChange={e => setNewD({ ...newD, customerId: e.target.value })}>
            <option value="">— vyberte —</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={S.label}>Zodpovídá</label>
          <select style={S.select} value={newD.assigned_to} onChange={e => setNewD({ ...newD, assigned_to: e.target.value })}>
            <option value="">— vyberte —</option>{(employees || []).map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
          </select>
          <ModalActions onSave={save} onClose={closeModal} />
        </div></div>
      )}
    </>
  );
}

// ─── KOMUNIKACE ───────────────────────────────────────────────────────────────

function Communication({ communication, setCommunication, customers, deals, contracts, currentUser, modal, setModal, closeModal }) {
  const [tab, setTab] = useState("all");
  const [dealMsgs, setDealMsgs] = useState([]);
  const [contractMsgs, setContractMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newC, setNewC] = useState({ type: "Email", date: "", note: "", customerId: "" });
  const [threadDeal, setThreadDeal] = useState(null);
  const [threadContract, setThreadContract] = useState(null);
  const [newMsg, setNewMsg] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("deal_messages").select("*").order("created_at", { ascending: false }),
      supabase.from("contract_messages").select("*").order("created_at", { ascending: false }),
    ]).then(([d, c]) => {
      setDealMsgs(d.data || []);
      setContractMsgs(c.data || []);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    if (!newC.note) return;
    const { data: row } = await supabase.from("communication").insert({
      type: newC.type, date: newC.date, note: newC.note,
      customer_id: Number(newC.customerId),
    }).select().single();
    if (row) setCommunication([...communication, { ...row, customerId: row.customer_id }]);
    setNewC({ type: "Email", date: "", note: "", customerId: "" });
    closeModal();
  };

  const sendDealMsg = async () => {
    if (!newMsg.trim() || !threadDeal) return;
    const { data: row } = await supabase.from("deal_messages").insert({
      deal_id: threadDeal.id, user_name: currentUser?.name || "?", message: newMsg.trim(),
    }).select().single();
    if (row) setDealMsgs([row, ...dealMsgs]);
    setNewMsg("");
  };

  const sendContractMsg = async () => {
    if (!newMsg.trim() || !threadContract) return;
    const { data: row } = await supabase.from("contract_messages").insert({
      contract_id: threadContract.id, user_name: currentUser?.name || "?", message: newMsg.trim(),
    }).select().single();
    if (row) setContractMsgs([row, ...contractMsgs]);
    setNewMsg("");
  };

  const TABS = [
    { id: "all", label: "Vše" },
    { id: "deals", label: `Obchodní případy (${[...new Set(dealMsgs.map(m => m.deal_id))].length})` },
    { id: "contracts", label: `Zakázky (${[...new Set(contractMsgs.map(m => m.contract_id))].length})` },
    { id: "log", label: "Komunikační log" },
  ];

  return (
    <>
      <div style={S.header}><h1 style={S.h1}>Komunikace</h1>
        <button style={S.btn()} onClick={() => setModal({ type: "addComm" })}>+ Přidat záznam</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setThreadDeal(null); setThreadContract(null); }}
            style={{ ...S.btn(tab === t.id ? "#2E9BE0" : "#0E3B5E"), padding: "7px 16px", fontSize: 12 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: deals — vlákna příležitostí */}
      {tab === "deals" && !threadDeal && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 12 }}>
          {(deals || []).map(deal => {
            const msgs = dealMsgs.filter(m => m.deal_id === deal.id);
            if (msgs.length === 0) return null;
            const last = msgs[0];
            return (
              <div key={deal.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => { setThreadDeal(deal); setNewMsg(""); }}>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 13, marginBottom: 4 }}>💼 {deal.name}</div>
                <div style={{ fontSize: 11, color: "#2E9BE0", marginBottom: 4 }}>{msgs.length} zpráv</div>
                <div style={{ fontSize: 12, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{last.user_name}: {last.message}</div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>{new Date(last.created_at).toLocaleString("cs")}</div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "deals" && threadDeal && (
        <div>
          <button onClick={() => setThreadDeal(null)} style={{ ...S.btn("#334155"), padding: "6px 14px", marginBottom: 14 }}>← Zpět</button>
          <div style={S.card}>
            <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14 }}>💼 {threadDeal.name}</div>
            <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {dealMsgs.filter(m => m.deal_id === threadDeal.id).slice().reverse().map(m => (
                <div key={m.id} style={{ background: "#0E3B5E", borderRadius: 10, padding: "9px 13px" }}>
                  <div style={{ fontSize: 11, color: "#2E9BE0", fontWeight: 600, marginBottom: 3 }}>{m.user_name} · {new Date(m.created_at).toLocaleString("cs")}</div>
                  <div style={{ color: "#1A1A1A", fontSize: 13 }}>{m.message}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...S.input, marginBottom: 0, flex: 1 }} placeholder="Zpráva..." value={newMsg}
                onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendDealMsg()} />
              <button style={{ ...S.btn(), padding: "0 14px" }} onClick={sendDealMsg}>Odeslat</button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: contracts — vlákna zakázek */}
      {tab === "contracts" && !threadContract && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))", gap: 12 }}>
          {(contracts || []).map(contract => {
            const msgs = contractMsgs.filter(m => m.contract_id === contract.id);
            if (msgs.length === 0) return null;
            const last = msgs[0];
            return (
              <div key={contract.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => { setThreadContract(contract); setNewMsg(""); }}>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 13, marginBottom: 4 }}>🔧 {contract.name}</div>
                <div style={{ fontSize: 11, color: "#34d399", marginBottom: 4 }}>{msgs.length} zpráv</div>
                <div style={{ fontSize: 12, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{last.user_name}: {last.message}</div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>{new Date(last.created_at).toLocaleString("cs")}</div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "contracts" && threadContract && (
        <div>
          <button onClick={() => setThreadContract(null)} style={{ ...S.btn("#334155"), padding: "6px 14px", marginBottom: 14 }}>← Zpět</button>
          <div style={S.card}>
            <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14 }}>🔧 {threadContract.name}</div>
            <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {contractMsgs.filter(m => m.contract_id === threadContract.id).slice().reverse().map(m => (
                <div key={m.id} style={{ background: "#0E3B5E", borderRadius: 10, padding: "9px 13px" }}>
                  <div style={{ fontSize: 11, color: "#34d399", fontWeight: 600, marginBottom: 3 }}>{m.user_name} · {new Date(m.created_at).toLocaleString("cs")}</div>
                  <div style={{ color: "#1A1A1A", fontSize: 13 }}>{m.message}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...S.input, marginBottom: 0, flex: 1 }} placeholder="Zpráva..." value={newMsg}
                onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendContractMsg()} />
              <button style={{ ...S.btn(), padding: "0 14px" }} onClick={sendContractMsg}>Odeslat</button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: komunikační log */}
      {(tab === "all" || tab === "log") && (
        <div style={S.card}>
          {communication.map(c => {
            const cust = customers.find(cu => cu.id === c.customerId);
            return (
              <div key={c.id} style={S.commItem}>
                <div style={S.commDot(c.type)} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: "#fff", fontSize: 13 }}>{cust?.name || "—"}</span>
                    <span style={S.tag(c.type === "Email" ? "#2E9BE0" : c.type === "Hovor" ? "#34d399" : "#f59e0b")}>{c.type}</span>
                    <span style={{ color: "#475569", fontSize: 11, marginLeft: "auto" }}>{fmtDateCz(c.date)}</span>
                  </div>
                  <div style={{ color: "#475569", fontSize: 13 }}>{c.note}</div>
                </div>
              </div>
            );
          })}
          {communication.length === 0 && <Empty />}
        </div>
      )}

      {modal?.type === "addComm" && (
        <div style={S.modal}><div style={S.modalBox}>
          <ModalHeader title="Nový záznam" onClose={closeModal} />
          <label style={S.label}>Typ</label>
          <select style={S.select} value={newC.type} onChange={e => setNewC({ ...newC, type: e.target.value })}>{["Email", "Hovor", "Schůzka"].map(t => <option key={t}>{t}</option>)}</select>
          <label style={S.label}>Datum</label><input style={S.input} type="date" value={newC.date} onChange={e => setNewC({ ...newC, date: e.target.value })} />
          <label style={S.label}>Poznámka</label><input style={S.input} value={newC.note} onChange={e => setNewC({ ...newC, note: e.target.value })} />
          <label style={S.label}>Zákazník</label>
          <select style={S.select} value={newC.customerId} onChange={e => setNewC({ ...newC, customerId: e.target.value })}>
            <option value="">— vyberte —</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ModalActions onSave={save} onClose={closeModal} />
        </div></div>
      )}
    </>
  );
}

// ─── ÚKOLY ───────────────────────────────────────────────────────────────────

function Tasks({ tasks, setTasks, customers, employees, deals, contracts, currentUser, notifications, setNotifications, modal, setModal, closeModal }) {
  const [newT, setNewT] = useState({ title: "", due: "", priority: "Střední", customerId: "", contractId: "", dealId: "", assignedTo: "", visibleTo: [], photo_url: "", created_by: "" });
  const [showTaskPhotoPicker, setShowTaskPhotoPicker] = useState(false);
  const [taskUploading, setTaskUploading] = useState(false);
  const [taskPhotoPanel, setTaskPhotoPanel] = useState(false);
  const [filter, setFilter] = useState("all");
  const [taskPhotos, setTaskPhotos] = useState([]); // [{url, name}]
  const [detailTask, setDetailTask] = useState(null);
  const [lightboxUrl, setLightboxUrl] = useState(null);

  const loadHeic2any = () => new Promise((resolve) => {
    if (window.heic2any) return resolve(window.heic2any);
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.js";
    s.onload = () => resolve(window.heic2any);
    document.head.appendChild(s);
  });

  const uploadTaskPhoto = async (file) => {
    if (!file) return;
    setTaskUploading(true);
    const origName = file.name.replace(/\.[^.]+$/, "");
    let uploadFile = file;
    let ext = file.name.split(".").pop().toLowerCase();
    if (ext === "heic" || ext === "heif" || file.type === "image/heic" || file.type === "image/heif") {
      try {
        const heic2any = await loadHeic2any();
        const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
        uploadFile = new File([blob], origName + ".jpg", { type: "image/jpeg" });
        ext = "jpg";
      } catch (e) {
        alert("Chyba převodu HEIC: " + e.message);
        setTaskUploading(false);
        return;
      }
    }
    const path = `task_global_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("zakazky-fotky").upload(path, uploadFile, { upsert: true });
    if (error) {
      alert("Chyba nahrání fotky: " + error.message);
    } else {
      const { data: { publicUrl } } = supabase.storage.from("zakazky-fotky").getPublicUrl(path);
      setTaskPhotos(prev => [...prev, { url: publicUrl, name: origName }]);
    }
    setTaskUploading(false);
  };

  const save = async () => {
    if (!newT.title) return;
    const row_data = {
      title: newT.title, due: newT.due, priority: newT.priority, done: false,
      customer_id: Number(newT.customerId) || null,
      contract_id: Number(newT.contractId) || null,
      deal_id: Number(newT.dealId) || null,
      created_by: currentUser?.name || "?",
      assigned_to: newT.assignedTo || "",
      photo_url: newT.photo_url || (taskPhotos.length > 0 ? taskPhotos[0].url : ""),
      photos: taskPhotos.length > 0 ? taskPhotos : null,
      visible_to: newT.visibleTo || [],
    };
    const { data: row } = await supabase.from("tasks").insert(row_data).select().single();
    if (row) {
      setTasks([...tasks, { ...row, customerId: row.customer_id }]);
      // Notifikace přiřazenému
      if (newT.assignedTo) {
        const notif = { user_name: newT.assignedTo, title: "Nový úkol", message: `${currentUser?.name || "?"} ti zadal: ${newT.title}`, link_type: "task", link_id: row.id };
        const { data: n } = await supabase.from("notifications").insert(notif).select().single();
        if (n && setNotifications) setNotifications(prev => [n, ...prev]);
      }
    }
    setNewT({ title: "", due: "", priority: "Střední", customerId: "", contractId: "", dealId: "", assignedTo: "", visibleTo: [], photo_url: "", created_by: "" });
    setTaskPhotos([]);
    setTaskPhotoPanel(false);
    closeModal();
  };

  const toggle = async (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    await supabase.from("tasks").update({ done: !task.done }).eq("id", id);
    setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const myName = currentUser?.name || "";
  const visibleTasks = tasks.filter(t => {
    if (!t.visible_to || t.visible_to.length === 0) return true;
    return t.visible_to.includes(myName) || t.created_by === myName;
  });

  const filtered = filter === "mine"
    ? visibleTasks.filter(t => t.created_by === myName || (t.visible_to || []).includes(myName))
    : filter === "done" ? visibleTasks.filter(t => t.done)
    : filter === "open" ? visibleTasks.filter(t => !t.done)
    : visibleTasks;

  return (
    <>
      <div style={S.header}><h1 style={S.h1}>Úkoly & připomínky</h1><button style={S.btn()} onClick={() => setModal({ type: "addTask" })}>+ Přidat</button></div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["all", "Vše"], ["open", "Otevřené"], ["mine", "Moje"], ["done", "Hotové"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ ...S.btn(filter === k ? "#2E9BE0" : "#0E3B5E"), padding: "6px 14px", fontSize: 12 }}>{l}</button>
        ))}
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>{["", "Úkol", "Zákazník", "Zakázka / Deal", "Termín", "Zadal", "Priorita"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(t => {
              const cust = customers.find(c => c.id === (t.customerId || t.customer_id));
              const contr = (contracts || []).find(c => c.id === t.contract_id);
              const deal  = (deals || []).find(d => d.id === t.deal_id);
              return (
                <tr key={t.id} style={{ opacity: t.done ? 0.4 : 1, cursor: "pointer" }} onClick={() => setDetailTask(t)}>
                  <td style={S.td} onClick={e => e.stopPropagation()}><input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} style={{ accentColor: "#2E9BE0" }} /></td>
                  <td style={{ ...S.td, textDecoration: t.done ? "line-through" : "none", color: "#fff", fontWeight: 500 }}>
                    {t.title}
                    {t.visible_to?.length > 0 && <span style={{ fontSize: 10, color: "#2E9BE0", marginLeft: 6 }}>👁 {t.visible_to.join(", ")}</span>}
                  </td>
                  <td style={S.td}>{cust?.name || "—"}</td>
                  <td style={S.td}>
                    {contr && <span style={S.tag("#34d399")}>🔧 {contr.name}</span>}
                    {deal && <span style={S.tag("#f59e0b")}>💼 {deal.name}</span>}
                    {!contr && !deal && "—"}
                  </td>
                  <td style={S.td}>{fmtDateCz(t.due)}</td>
                  <td style={{ ...S.td, color: "#2E9BE0", fontSize: 11 }}>{t.created_by || "—"}</td>
                  <td style={S.td}><span style={S.tag(PRIO_COLORS[t.priority] || "#64748b")}>{t.priority}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <Empty />}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div style={{ ...S.modal, zIndex: 300 }} onClick={() => setLightboxUrl(null)}>
          <div style={{ maxWidth: "90vw", maxHeight: "90vh", position: "relative" }}>
            <img src={lightboxUrl} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 12, boxShadow: "0 20px 60px #000a" }} />
            <button onClick={() => setLightboxUrl(null)} style={{ position: "absolute", top: -16, right: -16, background: "#ef4444", color: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, fontSize: 16, cursor: "pointer" }}>✕</button>
          </div>
        </div>
      )}

      {/* Detail úkolu */}
      {detailTask && (
        <div style={S.modal}>
          <div style={{ ...S.modalBox, width: 560 }}>
            <ModalHeader title={detailTask.title} onClose={() => setDetailTask(null)} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div><div style={S.statLabel}>Termín</div><div style={{ color: "#fff", fontWeight: 600 }}>{fmtDateCz(detailTask.due) || "—"}</div></div>
              <div><div style={S.statLabel}>Priorita</div><span style={S.tag(PRIO_COLORS[detailTask.priority] || "#64748b")}>{detailTask.priority}</span></div>
              <div><div style={S.statLabel}>Zadal</div><div style={{ color: "#94a3b8", fontSize: 13 }}>{detailTask.created_by || "—"}</div></div>
              <div><div style={S.statLabel}>Přiřazeno</div><div style={{ color: "#94a3b8", fontSize: 13 }}>{detailTask.assigned_to || "—"}</div></div>
            </div>
            {detailTask.description && (
              <div style={{ background: "#0E3B5E", borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "#cbd5e1", fontSize: 14, lineHeight: 1.6 }}>
                {detailTask.description}
              </div>
            )}
            {(() => {
              const photos = detailTask.photos || (detailTask.photo_url ? [{ url: detailTask.photo_url, name: "Fotka" }] : []);
              if (photos.length === 0) return null;
              return (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 8 }}>FOTKY ({photos.length})</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                    {photos.map((ph, i) => (
                      <div key={i} onClick={() => setLightboxUrl(ph.url)} style={{ cursor: "pointer", borderRadius: 8, overflow: "hidden", border: "2px solid #334155" }}>
                        <img src={ph.url} alt={ph.name} style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} />
                        {ph.name && <div style={{ padding: "3px 6px", fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: "#0E3B5E" }}>{ph.name}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button style={S.btnGhost} onClick={() => setDetailTask(null)}>Zavřít</button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "addTask" && (
        <div style={S.modal}><div style={S.modalBox}>
          <ModalHeader title="Nový úkol" onClose={closeModal} />
          <label style={S.label}>Název úkolu</label>
          <input style={S.input} value={newT.title} onChange={e => setNewT({ ...newT, title: e.target.value })} />
          <label style={S.label}>Popis</label>
          <textarea style={{ ...S.input, minHeight: 72, resize: "vertical" }} placeholder="Podrobnosti, poznámky..." value={newT.description} onChange={e => setNewT({ ...newT, description: e.target.value })} />
          <label style={S.label}>Termín</label>
          <DatePicker value={newT.due} onChange={v => setNewT({ ...newT, due: v })} />
          <label style={S.label}>Priorita</label>
          <select style={S.select} value={newT.priority} onChange={e => setNewT({ ...newT, priority: e.target.value })}>
            {["Vysoká", "Střední", "Nízká"].map(p => <option key={p}>{p}</option>)}
          </select>
          <label style={S.label}>Zákazník</label>
          <select style={S.select} value={newT.customerId} onChange={e => setNewT({ ...newT, customerId: e.target.value })}>
            <option value="">— volitelné —</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={S.label}>Zakázka</label>
          <select style={S.select} value={newT.contractId} onChange={e => setNewT({ ...newT, contractId: e.target.value })}>
            <option value="">— volitelné —</option>{(contracts || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={S.label}>Obchodní případ</label>
          <select style={S.select} value={newT.dealId} onChange={e => setNewT({ ...newT, dealId: e.target.value })}>
            <option value="">— volitelné —</option>{(deals || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <label style={S.label}>Upozornit zaměstnance (notifikace)</label>
          <select style={S.select} value={newT.assignedTo} onChange={e => setNewT({ ...newT, assignedTo: e.target.value })}>
            <option value="">— volitelné —</option>{(employees || []).map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
          </select>
          <label style={S.label}>Viditelné pro (zaměstnance)</label>
          <div style={{ background: "#f8fafc", border: "1px solid #252d45", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input type="checkbox"
                checked={newT.visibleTo.length === 0}
                onChange={() => setNewT({ ...newT, visibleTo: [] })}
                style={{ accentColor: "#2E9BE0" }} />
              <span style={{ fontSize: 12, color: "#475569", fontWeight: 600 }}>Všichni zaměstnanci</span>
            </div>
            <div style={{ borderTop: "1px solid #1a2035", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {(employees || []).map(e => {
                const checked = newT.visibleTo.includes(e.name);
                const toggle = () => {
                  const next = checked
                    ? newT.visibleTo.filter(n => n !== e.name)
                    : [...newT.visibleTo, e.name];
                  setNewT({ ...newT, visibleTo: next });
                };
                return (
                  <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={checked} onChange={toggle} style={{ accentColor: "#2E9BE0" }} />
                    <span style={{ fontSize: 13, color: checked ? "#e2e8f0" : "#64748b" }}>{e.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
          {/* Fotky */}
          <label style={S.label}>Fotky k úkolu</label>
          <button style={{ ...S.btn("#0E3B5E"), padding: "6px 14px", fontSize: 12, marginBottom: 8 }}
            onClick={() => setTaskPhotoPanel(!taskPhotoPanel)}>
            {taskPhotoPanel ? "▲ Skrýt" : `📷 Přidat fotky${taskPhotos.length > 0 ? ` (${taskPhotos.length})` : ""}`}
          </button>
          {taskPhotoPanel && (
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <label style={{ ...S.btn("#334155"), padding: "6px 14px", display: "inline-flex", gap: 6, cursor: "pointer", fontSize: 12 }}>
                  {taskUploading ? "⏳ Nahrávám..." : "📤 Nahrát fotku"}
                  <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => Array.from(e.target.files).forEach(f => uploadTaskPhoto(f))} />
                </label>
                <button style={{ ...S.btnGhost, padding: "6px 14px", fontSize: 12 }} onClick={() => setShowTaskPhotoPicker(true)}>📁 Ze zakázek</button>
              </div>
              {taskPhotos.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {taskPhotos.map((ph, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: 8, padding: "6px 8px", border: "1px solid #e2e8f0" }}>
                      <img src={ph.url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                      <input style={{ ...S.input, marginBottom: 0, flex: 1, fontSize: 12 }} value={ph.name}
                        onChange={e => setTaskPhotos(prev => prev.map((p, j) => j === i ? { ...p, name: e.target.value } : p))}
                        placeholder="Název fotky..." />
                      <button style={{ ...S.btn("#ef4444"), padding: "3px 8px", fontSize: 11, flexShrink: 0 }}
                        onClick={() => setTaskPhotos(prev => prev.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {showTaskPhotoPicker && <ContractPhotoPicker onSelect={url => { setTaskPhotos(prev => [...prev, { url, name: "Ze zakázky" }]); setShowTaskPhotoPicker(false); }} onClose={() => setShowTaskPhotoPicker(false)} />}
            </div>
          )}
          <ModalActions onSave={save} onClose={closeModal} />
        </div></div>
      )}
    </>
  );
}

// ─── FAKTURACE ────────────────────────────────────────────────────────────────

function Invoices({ invoices, setInvoices, customers, contracts, costEntries, modal, setModal, closeModal }) {
  const [invTab, setInvTab] = useState("vydané");
  const [pdfBusyId, setPdfBusyId] = useState(null);
  const [previewInv, setPreviewInv] = useState(null);

  const saveFromFlow = async (f) => {
    const invNum = nextInvNum(invoices);
    const { data: row, error } = await supabase.from("invoices").insert({
      number: invNum, customer_id: Number(f.customerId), amount: f.amount,
      tax: f.tax, status: f.status,
      issued: f.issued, due: f.due, items: f.items,
      invoice_type: f.invoiceType, is_deposit: f.isDeposit, order_ref: f.orderRef,
      variable_symbol: invNum.replace(/\D/g, ""), contract_id: f.contractId,
      customer_ico: f.customerIco || null, customer_dic: f.customerDic || null,
      discount_percent: f.discountPercent || 0,
    }).select().single();
    if (error) { alert("Fakturu se nepodařilo uložit: " + error.message); return; }
    if (row) setInvoices([...invoices, { ...row, customerId: row.customer_id }]);
    closeModal();
  };

  const handlePdf = async (inv) => {
    setPdfBusyId(inv.id);
    try {
      const cust = customers.find(c => c.id === inv.customerId);
      await downloadInvoicePDF(inv, cust);
    } catch (e) {
      alert("Nepodařilo se vygenerovat PDF: " + (e?.message || e));
    } finally {
      setPdfBusyId(null);
    }
  };

  const changeStatus = async (id, status) => {
    await supabase.from("invoices").update({ status }).eq("id", id);
    setInvoices(invoices.map(i => i.id === id ? { ...i, status } : i));
  };

  return (
    <>
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>Fakturace & účetnictví</h1>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {["vydané", "přijaté"].map(t => (
              <button key={t} onClick={() => setInvTab(t)}
                style={{ ...S.btn(invTab === t ? "#2E9BE0" : "#e2e8f0"), color: invTab === t ? "#fff" : "#475569", padding: "6px 18px", fontSize: 12, textTransform: "capitalize" }}>
                {t === "vydané" ? "📤 Vydané" : "📥 Přijaté"}
              </button>
            ))}
          </div>
        </div>
        <button style={S.btn()} onClick={() => setModal({ type: "newInvoiceFlow" })}>+ Nová faktura</button>
      </div>

      {/* Souhrn */}
      <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Zaplaceno", value: fmtKc(invoices.filter(i => i.status === "Zaplacena").reduce((s, i) => s + i.amount, 0)), color: "#34d399" },
          { label: "Čeká na platbu", value: fmtKc(invoices.filter(i => i.status === "Čeká").reduce((s, i) => s + i.amount, 0)), color: "#f59e0b" },
          { label: "Po splatnosti", value: fmtKc(invoices.filter(i => i.status === "Po splatnosti").reduce((s, i) => s + i.amount, 0)), color: "#f87171" },
        ].map(s => (
          <div key={s.label} style={S.statCard(s.color)}><div style={S.statLabel}>{s.label}</div><div style={S.statValue(s.color)}>{s.value}</div></div>
        ))}
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>{["Číslo", "Zákazník", "Částka", "DPH", "Vystavena", "Splatnost", "Stav", "", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {invoices.filter(i => (i.invoice_type || "vydaná") === (invTab === "vydané" ? "vydaná" : "přijatá")).map(inv => {
              const cust = customers.find(c => c.id === inv.customerId);
              return (
                <tr key={inv.id}>
                  <td style={{ ...S.td, color: "#1e293b", fontWeight: 600 }}>{inv.number}</td>
                  <td style={S.td}>{cust?.name || "—"}</td>
                  <td style={{ ...S.td, color: "#1e293b", fontWeight: 700 }}>{fmtKc(inv.amount)}</td>
                  <td style={S.td}>{fmtKc(inv.tax)}</td>
                  <td style={S.td}>{fmtDateCz(inv.issued)}</td>
                  <td style={S.td}>{fmtDateCz(inv.due)}</td>
                  <td style={S.td}><span style={S.tag(INV_COLORS[inv.status])}>{inv.status}</span></td>
                  <td style={S.td}>
                    <select style={{ ...S.select, marginBottom: 0, width: 130, padding: "5px 8px", fontSize: 12 }}
                      value={inv.status} onChange={e => changeStatus(inv.id, e.target.value)}>
                      {["Čeká", "Zaplacena", "Po splatnosti", "Storno"].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ ...S.td, display: "flex", gap: 6 }}>
                    <button onClick={() => setPreviewInv(inv)}
                      style={{ ...S.btn("#475569"), padding: "5px 12px", fontSize: 12 }}>
                      👁️ Náhled
                    </button>
                    <button disabled={pdfBusyId === inv.id} onClick={() => handlePdf(inv)}
                      style={{ ...S.btn("#475569"), padding: "5px 12px", fontSize: 12 }}>
                      {pdfBusyId === inv.id ? "…" : "📄 PDF"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal?.type === "newInvoiceFlow" && (
        <InvoiceCreateFlow customers={customers} contracts={contracts} costEntries={costEntries}
          onSave={saveFromFlow} onClose={closeModal} />
      )}

      {previewInv && (
        <InvoicePreviewModal key={previewInv.id} invoice={previewInv} customer={customers.find(c => c.id === previewInv.customerId)}
          onClose={() => setPreviewInv(null)} />
      )}
    </>
  );
}

// ─── SKLAD ────────────────────────────────────────────────────────────────────

function Warehouse({ products, setProducts, contracts, currentUser }) {
  const isAdmin = currentUser?.role === "admin";
  const [newP, setNewP] = useState({ name: "", sku: "", category: "", price: "", price_sell: "", stock: "", minStock: "", unit: "ks", emas_code: "", image_url: "" });
  const [editP, setEditP] = useState(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [movements, setMovements] = useState([]);
  const [loadingMov, setLoadingMov] = useState(true);
  const [whTab, setWhTab] = useState("stock");
  const [newMov, setNewMov] = useState({ product_name: "", quantity: "", unit: "ks", movement_type: "in", contract_id: "", vehicle: "", from_location: "Sklad", to_location: "", note: "" });
  const [movSuggestions, setMovSuggestions] = useState([]);

  useEffect(() => {
    supabase.from("warehouse_movements").select("*").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => { setMovements(data || []); setLoadingMov(false); });
  }, []);

  const save = async () => {
    if (!newP.name) return;
    const emasImg = newP.image_url || (newP.emas_code ? `https://www.emas.cz/media/cache/product_image/img/product/${newP.emas_code}.jpg` : "");
    const { data: row } = await supabase.from("products").insert({
      name: newP.name, sku: newP.sku, category: newP.category,
      price: Number(newP.price), price_sell: Number(newP.price_sell),
      stock: Number(newP.stock), min_stock: Number(newP.minStock),
      unit: newP.unit, emas_code: newP.emas_code, image_url: emasImg || "",
    }).select().single();
    if (row) setProducts([...products, { ...row, minStock: row.min_stock }]);
    setNewP({ name: "", sku: "", category: "", price: "", price_sell: "", stock: "", minStock: "", unit: "ks", emas_code: "", image_url: "" });
    setShowAddProduct(false);
  };

  const saveEdit = async () => {
    if (!editP) return;
    const emasImg = editP.image_url || (editP.emas_code ? `https://www.emas.cz/media/cache/product_image/img/product/${editP.emas_code}.jpg` : "");
    const upd = {
      name: editP.name, sku: editP.sku, category: editP.category,
      price: Number(editP.price), price_sell: Number(editP.price_sell || 0),
      stock: Number(editP.stock), min_stock: Number(editP.min_stock || editP.minStock || 0),
      unit: editP.unit, emas_code: editP.emas_code || "", image_url: emasImg || editP.image_url || "",
    };
    await supabase.from("products").update(upd).eq("id", editP.id);
    setProducts(products.map(p => p.id === editP.id ? { ...p, ...upd, minStock: upd.min_stock } : p));
    setEditP(null);
  };

  const adjustStock = async (id, delta) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    const newStock = Math.max(0, prod.stock + delta);
    await supabase.from("products").update({ stock: newStock }).eq("id", id);
    setProducts(products.map(p => p.id === id ? { ...p, stock: newStock } : p));
  };

  const MOVE_TYPES = [
    { value: "in",             label: "📥 Naskladnění", from: "Dodavatel", to: "Sklad" },
    { value: "out_contract",   label: "📦 Výdej na zakázku", from: "Sklad", to: "Zakázka" },
    { value: "out_vehicle",    label: "🚗 Výdej na auto", from: "Sklad", to: "Auto" },
    { value: "transfer",       label: "🔄 Přesun auto→sklad", from: "Auto", to: "Sklad" },
    { value: "transfer_vh",    label: "🔄 Přesun sklad→auto", from: "Sklad", to: "Auto" },
    { value: "out",            label: "📤 Výdej obecný", from: "Sklad", to: "" },
  ];

  const saveMovement = async () => {
    if (!newMov.product_name || !newMov.quantity) return;
    const movType = MOVE_TYPES.find(t => t.value === newMov.movement_type);
    const row_data = {
      product_name: newMov.product_name,
      quantity: Number(newMov.quantity),
      unit: newMov.unit,
      movement_type: newMov.movement_type,
      from_location: newMov.from_location || movType?.from || "Sklad",
      to_location: newMov.to_location || movType?.to || "",
      contract_id: Number(newMov.contract_id) || null,
      vehicle: newMov.vehicle,
      note: newMov.note,
      created_by: currentUser?.name || "?",
    };
    const { data: row } = await supabase.from("warehouse_movements").insert(row_data).select().single();
    if (row) setMovements([row, ...movements]);
    // Upravit sklad pokud jde o naskladneni
    if (newMov.movement_type === "in") {
      const prod = products.find(p => p.name.toLowerCase() === newMov.product_name.toLowerCase());
      if (prod) {
        const ns = prod.stock + Number(newMov.quantity);
        await supabase.from("products").update({ stock: ns }).eq("id", prod.id);
        setProducts(products.map(p => p.id === prod.id ? { ...p, stock: ns } : p));
      }
    } else if (["out_contract","out_vehicle","out"].includes(newMov.movement_type)) {
      const prod = products.find(p => p.name.toLowerCase() === newMov.product_name.toLowerCase());
      if (prod) {
        const ns = Math.max(0, prod.stock - Number(newMov.quantity));
        await supabase.from("products").update({ stock: ns }).eq("id", prod.id);
        setProducts(products.map(p => p.id === prod.id ? { ...p, stock: ns } : p));
      }
      // Výdej materiálu na zakázku se zároveň propíše jako nákladová položka (materiál) k dané zakázce
      if (newMov.movement_type === "out_contract" && newMov.contract_id) {
        await supabase.from("contract_cost_entries").insert({
          contract_id: Number(newMov.contract_id),
          cost_type: "materiál",
          is_extra: false,
          date: fmt(new Date()),
          description: `Materiál – ${newMov.product_name}`,
          quantity: Number(newMov.quantity),
          unit: newMov.unit,
          unit_price_cost: Number(prod?.price || 0),
          unit_price_client: Number(prod?.price_sell || prod?.price || 0),
        });
      }
    }
    setNewMov({ product_name: "", quantity: "", unit: "ks", movement_type: "in", contract_id: "", vehicle: "", from_location: "Sklad", to_location: "", note: "" });
  };

  const MOV_COLORS = { in: "#34d399", out: "#f87171", out_contract: "#f87171", out_vehicle: "#f59e0b", transfer: "#2E9BE0", transfer_vh: "#a78bfa" };
  const MOV_LABELS = Object.fromEntries(MOVE_TYPES.map(t => [t.value, t.label]));

  return (
    <>
      <div style={S.header}><h1 style={S.h1}>Sklad & zboží</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...S.btn(whTab === "stock" ? "#2E9BE0" : "#94a3b8"), padding: "7px 16px" }} onClick={() => setWhTab("stock")}>📦 Skladové zásoby</button>
          <button style={{ ...S.btn(whTab === "movements" ? "#2E9BE0" : "#94a3b8"), padding: "7px 16px" }} onClick={() => setWhTab("movements")}>🔄 Pohyby</button>
          <button style={S.btn()} onClick={() => setShowAddProduct(true)}>+ Přidat produkt</button>
        </div>
      </div>

      {whTab === "stock" && (
        <>
          <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
            {[
              { label: "Produktů celkem", value: products.length, color: "#2E9BE0" },
              { label: "Nízký stav", value: products.filter(p => p.stock <= p.minStock).length, color: "#f87171" },
              { label: "Hodnota skladu", value: fmtKc(products.reduce((s, p) => s + p.price * p.stock, 0)), color: "#34d399" },
            ].map(s => (
              <div key={s.label} style={S.statCard(s.color)}><div style={S.statLabel}>{s.label}</div><div style={S.statValue(s.color)}>{s.value}</div></div>
            ))}
          </div>
          <div style={S.card}>
            <table style={S.table}>
              <thead><tr>{["", "Produkt", "SKU", "Kat.", "Nákupní", "Prodejní", "Skladem", "Min.", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {products.map(p => {
                  const low = p.stock <= (p.minStock || p.min_stock || 0);
                  const img = p.image_url || (p.emas_code ? `https://www.emas.cz/media/cache/product_image/img/product/${p.emas_code}.jpg` : null);
                  return (
                    <tr key={p.id}>
                      <td style={{ ...S.td, width: 44 }}>
                        <div style={{ width: 36, height: 36, background: "#f1f5f9", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative", overflow: "hidden", border: "1px solid #e2e8f0", flexShrink: 0 }}>
                        📦
                        {img && <img src={img} alt="" onError={e => e.target.remove()} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", borderRadius: 6, background: "#fff" }} />}
                      </div>
                      </td>
                      <td style={{ ...S.td, fontWeight: 600, color: "#1A1A1A" }}>{p.name}</td>
                      <td style={{ ...S.td, fontSize: 12, color: "#64748b" }}>{p.sku}</td>
                      <td style={{ ...S.td, fontSize: 12, color: "#64748b" }}>{p.category}</td>
                      <td style={S.td}>{fmtKc(p.price)}</td>
                      <td style={{ ...S.td, color: "#F5821F", fontWeight: 600 }}>{p.price_sell ? fmtKc(p.price_sell) : "—"}</td>
                      <td style={S.td}><span style={{ ...S.tag(low ? "#ef4444" : "#16a34a"), fontWeight: 700 }}>{p.stock} {p.unit}</span></td>
                      <td style={{ ...S.td, fontSize: 12, color: "#94a3b8" }}>{p.minStock || p.min_stock || 0} {p.unit}</td>
                      <td style={S.td}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button style={{ ...S.btn("#16a34a"), padding: "4px 10px", fontSize: 13 }} onClick={() => adjustStock(p.id, 1)}>+</button>
                          <button style={{ ...S.btn("#ef4444"), padding: "4px 10px", fontSize: 13 }} onClick={() => adjustStock(p.id, -1)}>−</button>
                          {isAdmin && <button style={{ ...S.btnGhost, padding: "4px 10px", fontSize: 12 }} onClick={() => setEditP({ ...p, minStock: p.min_stock || p.minStock || 0 })}>✏️</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {whTab === "movements" && (
        <>
          {/* Formulář pohybu */}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 14 }}>NOVÝ POHYB</div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={S.label}>Typ pohybu</label>
                <select style={{ ...S.select, marginBottom: 0 }} value={newMov.movement_type}
                  onChange={e => {
                    const t = MOVE_TYPES.find(x => x.value === e.target.value);
                    setNewMov({ ...newMov, movement_type: e.target.value, from_location: t?.from || "Sklad", to_location: t?.to || "" });
                  }}>
                  {MOVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Produkt</label>
                <div style={{ position: "relative" }}>
                  <input style={{ ...S.input, marginBottom: 0 }} placeholder="Název produktu..."
                    value={newMov.product_name}
                    onChange={e => {
                      const v = e.target.value;
                      setNewMov({ ...newMov, product_name: v });
                      setMovSuggestions(v.length > 0 ? products.filter(p => p.name.toLowerCase().includes(v.toLowerCase())).slice(0, 6) : []);
                    }} />
                  {movSuggestions.length > 0 && (
                    <div style={{ position: "absolute", zIndex: 99, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, width: "100%", top: "100%", boxShadow: "0 4px 16px #0000001a" }}>
                      {movSuggestions.map(p => {
                        const img = p.image_url || (p.emas_code ? `https://www.emas.cz/media/cache/product_image/img/product/${p.emas_code}.jpg` : null);
                        return (
                          <div key={p.id} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #f1f5f9" }}
                            onClick={() => { setNewMov({ ...newMov, product_name: p.name, unit: p.unit }); setMovSuggestions([]); }}>
                            <span style={{ fontSize: 15, flexShrink: 0, position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28 }}>
                                      📦
                                      {img && <img src={img} alt="" onError={e => e.target.remove()} style={{ position: "absolute", inset: 0, width: 28, height: 28, objectFit: "contain", background: "#fff", borderRadius: 4 }} />}
                                    </span>
                            <span style={{ color: "#1A1A1A", fontWeight: 500 }}>{p.name}</span>
                            <span style={{ color: "#64748b", fontSize: 11, marginLeft: "auto" }}>{p.stock} {p.unit}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label style={S.label}>Množství</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <input style={{ ...S.input, marginBottom: 0, flex: 1 }} type="number" value={newMov.quantity} onChange={e => setNewMov({ ...newMov, quantity: e.target.value })} />
                  <select style={{ ...S.select, marginBottom: 0, width: 70 }} value={newMov.unit} onChange={e => setNewMov({ ...newMov, unit: e.target.value })}>
                    {["ks", "m", "m²", "kg", "l", "bal"].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                {(newMov.movement_type === "out_contract") && (
                  <>
                    <label style={S.label}>Zakázka</label>
                    <select style={{ ...S.select, marginBottom: 0 }} value={newMov.contract_id} onChange={e => setNewMov({ ...newMov, contract_id: e.target.value })}>
                      <option value="">— vyberte —</option>
                      {contractList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </>
                )}
                {(["out_vehicle","transfer","transfer_vh"].includes(newMov.movement_type)) && (
                  <>
                    <label style={S.label}>Auto (SPZ / název)</label>
                    <input style={{ ...S.select, marginBottom: 0 }} placeholder="např. 1AB 2345" value={newMov.vehicle} onChange={e => setNewMov({ ...newMov, vehicle: e.target.value })} />
                  </>
                )}
                {(!["out_contract","out_vehicle","transfer","transfer_vh"].includes(newMov.movement_type)) && (
                  <>
                    <label style={S.label}>Poznámka</label>
                    <input style={{ ...S.input, marginBottom: 0 }} value={newMov.note} onChange={e => setNewMov({ ...newMov, note: e.target.value })} />
                  </>
                )}
              </div>
            </div>
            <button style={{ ...S.btn(), padding: "9px 24px", fontWeight: 700 }} onClick={saveMovement}>✅ Zaznamenat pohyb</button>
          </div>

          {/* Seznam pohybů */}
          <div style={S.card}>
            <table style={S.table}>
              <thead><tr>{["Čas", "Typ", "Produkt", "Množství", "Z → Do", "Zakázka / Auto", "Kdo"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {movements.map(m => {
                  const contr = (contracts || []).find(c => c.id === m.contract_id);
                  return (
                    <tr key={m.id}>
                      <td style={{ ...S.td, fontSize: 11, color: "#64748b" }}>{new Date(m.created_at).toLocaleString("cs", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={S.td}><span style={S.tag(MOV_COLORS[m.movement_type] || "#64748b")}>{MOV_LABELS[m.movement_type] || m.movement_type}</span></td>
                      <td style={{ ...S.td, color: "#fff", fontWeight: 600 }}>{m.product_name}</td>
                      <td style={{ ...S.td, fontWeight: 700, color: m.movement_type === "in" ? "#34d399" : "#f87171" }}>{m.movement_type === "in" ? "+" : "−"}{m.quantity} {m.unit}</td>
                      <td style={{ ...S.td, fontSize: 11 }}>{m.from_location} → {m.to_location}</td>
                      <td style={S.td}>{contr ? <span style={S.tag("#34d399")}>🔧 {contr.name}</span> : m.vehicle ? <span style={S.tag("#f59e0b")}>🚗 {m.vehicle}</span> : m.note || "—"}</td>
                      <td style={{ ...S.td, fontSize: 11, color: "#2E9BE0" }}>{m.created_by}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {movements.length === 0 && !loadingMov && <Empty />}
          </div>
        </>
      )}

      {showAddProduct && (
        <div style={S.modal}><div style={S.modalBox}>
          <ModalHeader title="Nový produkt" onClose={() => setShowAddProduct(false)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["Název", "name"], ["SKU kód", "sku"], ["Kategorie", "category"], ["Jednotka", "unit"], ["Cena nákupní (Kč)", "price"], ["Cena prodejní (Kč)", "price_sell"], ["Počet na skladě", "stock"], ["Minimální stav", "minStock"]].map(([l, k]) => (
              <div key={k}><label style={S.label}>{l}</label><input style={S.input} value={newP[k]} onChange={e => setNewP({ ...newP, [k]: e.target.value })} /></div>
            ))}
          </div>
          <div style={{ marginTop: 8, padding: "10px 12px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#2E9BE0", marginBottom: 6 }}>🖼 Obrázek produktu</div>
            <label style={S.label}>Kód produktu z emas.cz (číslo)</label>
            <input style={S.input} value={newP.emas_code} onChange={e => setNewP({ ...newP, emas_code: e.target.value })} placeholder="např. 12345" />
            <label style={S.label}>Nebo přímý URL obrázku</label>
            <input style={S.input} value={newP.image_url} onChange={e => setNewP({ ...newP, image_url: e.target.value })} placeholder="https://..." />
            {(newP.emas_code || newP.image_url) && (
              <img src={newP.emas_code ? `https://www.emas.cz/media/cache/product_image/img/product/${newP.emas_code}.jpg` : newP.image_url}
                alt="" onError={e => e.target.style.display="none"}
                style={{ width: 80, height: 80, objectFit: "contain", marginTop: 8, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            )}
          </div>
          <ModalActions onSave={save} onClose={() => setShowAddProduct(false)} />
        </div></div>
      )}

      {/* Admin edit modal */}
      {editP && isAdmin && (
        <div style={S.modal}><div style={S.modalBox}>
          <ModalHeader title="Upravit produkt" onClose={() => setEditP(null)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["Název", "name"], ["SKU kód", "sku"], ["Kategorie", "category"], ["Jednotka", "unit"], ["Cena nákupní (Kč)", "price"], ["Cena prodejní (Kč)", "price_sell"], ["Skladem", "stock"], ["Minimální stav", "min_stock"]].map(([l, k]) => (
              <div key={k}><label style={S.label}>{l}</label><input style={S.input} value={editP[k] || ""} onChange={e => setEditP({ ...editP, [k]: e.target.value })} /></div>
            ))}
          </div>
          <div style={{ marginTop: 8, padding: "10px 12px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#2E9BE0", marginBottom: 6 }}>🖼 Obrázek produktu</div>
            <label style={S.label}>Kód emas.cz</label>
            <input style={S.input} value={editP.emas_code || ""} onChange={e => setEditP({ ...editP, emas_code: e.target.value })} placeholder="12345" />
            <label style={S.label}>URL obrázku</label>
            <input style={S.input} value={editP.image_url || ""} onChange={e => setEditP({ ...editP, image_url: e.target.value })} placeholder="https://..." />
            {(editP.emas_code || editP.image_url) && (
              <img src={editP.emas_code ? `https://www.emas.cz/media/cache/product_image/img/product/${editP.emas_code}.jpg` : editP.image_url}
                alt="" onError={e => e.target.style.display="none"}
                style={{ width: 80, height: 80, objectFit: "contain", marginTop: 8, borderRadius: 8, border: "1px solid #e2e8f0" }} />
            )}
          </div>
          <ModalActions onSave={saveEdit} onClose={() => setEditP(null)} />
        </div></div>
      )}
    </>
  );
}

// ─── HR ──────────────────────────────────────────────────────────────────────
// Jméno zaměstnance se pořád ukládá jako jeden řetězec (sloupec name v DB —
// na tom stojí spousta jiných míst v appce), ale ve formulářích ho ukazujeme
// rozdělené na Jméno/Příjmení, ať je jasné, co kam patřit — split/join se
// dělá jen na pohled.
const firstOf = (full) => (full || "").trim().split(/\s+/)[0] || "";
const lastOf = (full) => { const parts = (full || "").trim().split(/\s+/).filter(Boolean); return parts.length > 1 ? parts.slice(1).join(" ") : ""; };
const joinName = (first, last) => [first, last].map(s => (s || "").trim()).filter(Boolean).join(" ");

function HR({ employees, setEmployees, modal, setModal, closeModal, costEntries, attendance, tasks, setTasks }) {
  const [newE, setNewE] = useState({ name: "", position: "", department: "", email: "", salary: "", status: "Aktivní", start: "" });
  const [detailEmp, setDetailEmp] = useState(null);
  const [editField, setEditField] = useState({});
  const [uploading, setUploading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Zaměstnanec se nikdy fyzicky nemaže — jen se archivuje, aby zůstaly
  // zachované jeho staré záznamy (docházka, náklady, kniha jízd, úkoly) v historii.
  const archiveEmployee = async (id) => {
    if (!confirm("Smazat zaměstnance? Jeho stará docházka, náklady i kniha jízd zůstanou zachované v historii, jen se skryje ze seznamu.")) return;
    await supabase.from("employees").update({ archived: true }).eq("id", id);
    setEmployees(employees.map(e => e.id === id ? { ...e, archived: true } : e));
    setDetailEmp(null);
  };

  const restoreEmployee = async (id) => {
    await supabase.from("employees").update({ archived: false }).eq("id", id);
    setEmployees(employees.map(e => e.id === id ? { ...e, archived: false } : e));
    setDetailEmp(null);
  };

  const save = async () => {
    if (!newE.name) return;
    const { data: row } = await supabase.from("employees").insert({
      name: newE.name, position: newE.position, department: newE.department,
      email: newE.email, salary: Number(newE.salary),
      status: newE.status, start_date: newE.start,
    }).select().single();
    if (row) setEmployees([...employees, { ...row, start: row.start_date }]);
    setNewE({ name: "", position: "", department: "", email: "", salary: "", status: "Aktivní", start: "" });
    closeModal();
  };

  // ── Přístup do aplikace (Auth účet + role) ──
  const [accessProfile, setAccessProfile] = useState(null); // { id, email, role, ... } nebo null = zatím nemá přístup
  const [accessForm, setAccessForm] = useState({ email: "", username: "", role: "employee" });
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessErr, setAccessErr] = useState("");

  const loadAccess = async (emp) => {
    const { data } = await supabase.from("profiles").select("*").eq("employee_id", emp.id).maybeSingle();
    setAccessProfile(data || null);
    setAccessForm({ email: data?.email || emp.email || "", username: (emp.name || "").split(" ")[0].toLowerCase(), role: data?.role || "employee" });
    setAccessErr("");
  };

  const createAccess = async (emp) => {
    if (!accessForm.email || !accessForm.username) { setAccessErr("Vyplňte email i uživatelské jméno."); return; }
    setAccessBusy(true);
    setAccessErr("");
    // 1) Pošli pozvánku e-mailem — appka sama založí Auth účet přes zabezpečenou funkci
    const { data: inviteRes, error: inviteErr } = await supabase.functions.invoke("invite-employee", { body: { email: accessForm.email } });
    if (inviteErr || inviteRes?.error) {
      // Edge Function při chybě (non-2xx) vrací tělo jen přes inviteErr.context — supabase-js
      // ho samo nerozbalí, takže bez tohohle bychom viděli jen obecné "non-2xx" hlášení.
      let detail = inviteRes?.error || inviteErr?.message || "neznámá chyba";
      if (inviteErr?.context?.json) {
        try { const body = await inviteErr.context.json(); if (body?.error) detail = body.error; } catch { /* tělo se nepodařilo přečíst */ }
      }
      const msg = detail.toLowerCase();
      if (!msg.includes("already") && !msg.includes("registrov")) {
        setAccessErr("Odeslání pozvánky selhalo: " + detail);
        setAccessBusy(false);
        return;
      }
      // účet s tímto emailem už existuje — v pořádku, pokračuj propojením
    }
    // 2) Propoj založený účet se zaměstnancem a rolí v appce
    const { error } = await supabase.rpc("link_employee_profile", {
      p_employee_id: emp.id, p_email: accessForm.email, p_role: accessForm.role, p_name: emp.name,
    });
    if (error) {
      setAccessErr("Založení přístupu selhalo: " + error.message);
      setAccessBusy(false);
      return;
    }
    await supabase.from("login_directory").upsert({ username: accessForm.username, email: accessForm.email, name: emp.name });
    await loadAccess(emp);
    setAccessBusy(false);
  };

  const removeAccess = async (emp) => {
    if (!confirm("Zrušit přístup do aplikace? Účet v Supabase Authentication zůstane zachovaný, jen se odpojí role a přihlášení k appce.")) return;
    setAccessBusy(true);
    await supabase.rpc("unlink_employee_profile", { p_employee_id: emp.id });
    if (accessForm.username) await supabase.from("login_directory").delete().eq("username", accessForm.username);
    await loadAccess(emp);
    setAccessBusy(false);
  };

  const openDetail = (emp) => {
    setDetailEmp(emp);
    setEditField({
      name: emp.name, position: emp.position, department: emp.department,
      email: emp.email, salary: emp.salary || "", status: emp.status,
      start: emp.start || emp.start_date || "",
      bio: emp.bio || "", specialization: emp.specialization || "",
      notes_warning: emp.notes_warning || "",
      hourly_rate_cost: emp.hourly_rate_cost || "",
      hourly_rate_client: emp.hourly_rate_client || "",
    });
    loadAccess(emp);
  };

  const saveDetail = async () => {
    if (!detailEmp) return;
    const upd = {
      name: editField.name, position: editField.position, department: editField.department,
      email: editField.email, salary: Number(editField.salary), status: editField.status,
      start_date: editField.start, bio: editField.bio,
      specialization: editField.specialization, notes_warning: editField.notes_warning,
      hourly_rate_cost: Number(editField.hourly_rate_cost) || 0,
      hourly_rate_client: Number(editField.hourly_rate_client) || 0,
    };
    await supabase.from("employees").update(upd).eq("id", detailEmp.id);
    // RPC záloha pro hourly_rate — obchází schema cache
    await supabase.rpc("set_employee_rates", { emp_id: detailEmp.id, rate_cost: upd.hourly_rate_cost, rate_client: upd.hourly_rate_client });
    setEmployees(employees.map(e => e.id === detailEmp.id ? { ...e, ...upd, start: editField.start } : e));
    setDetailEmp({ ...detailEmp, ...upd, start: editField.start });
  };

  const uploadPhoto = async (file) => {
    if (!file || !detailEmp) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${detailEmp.id}.${ext}`;
    const { error } = await supabase.storage.from("employee-photos").upload(path, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from("employee-photos").getPublicUrl(path);
      await supabase.from("employees").update({ photo_url: publicUrl }).eq("id", detailEmp.id);
      setEmployees(employees.map(e => e.id === detailEmp.id ? { ...e, photo_url: publicUrl } : e));
      setDetailEmp({ ...detailEmp, photo_url: publicUrl });
    }
    setUploading(false);
  };

  const totalPayroll = employees.filter(e => e.status === "Aktivní" && !e.archived).reduce((s, e) => s + (e.salary || 0), 0);

  // Barvy podle oddělení
  const deptColor = (dept) => {
    const map = { "IT": "#2E9BE0", "Obchod": "#f59e0b", "Výroba": "#34d399", "Management": "#a78bfa", "Finance": "#38bdf8", "HR": "#f87171" };
    return map[dept] || "#64748b";
  };

  const [hrTab, setHrTab] = useState("info");

  if (detailEmp) {
    const emp = { ...detailEmp, ...employees.find(e => e.id === detailEmp.id) };
    const empCost = (costEntries || []).filter(c => c.employee_id === emp.id);
    const totalPaid   = empCost.reduce((s, c) => s + Number(c.amount_cost || 0), 0);
    const totalBilled = empCost.reduce((s, c) => s + Number(c.amount_client || 0), 0);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthAtt = (attendance || []).filter(a => (a.employee_id === emp.id || a.employeeId === emp.id) && (a.date || "").startsWith(thisMonth));
    const monthHours = monthAtt.reduce((s, a) => s + (a.checkin && a.checkout ? Math.max(0, calcHours(a.checkin, a.checkout) - 1) : 0), 0);

    return (
      <div>
        {/* Back */}
        <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button onClick={() => { setDetailEmp(null); setHrTab("info"); }} style={{ ...S.btn("#334155"), padding: "7px 16px", display: "flex", alignItems: "center", gap: 6 }}>
            ← Zpět na seznam
          </button>
          {["info","ukoly"].map(t => (
            <button key={t} onClick={() => setHrTab(t)}
              style={{ ...S.btn(hrTab === t ? "#6366f1" : "#0E3B5E"), padding: "7px 18px", fontSize: 13 }}>
              {t === "info" ? "👤 Profil" : "✅ Úkoly"}
            </button>
          ))}
          {emp.archived ? (
            <button onClick={() => restoreEmployee(emp.id)} style={{ ...S.btn("#34d399"), padding: "7px 16px", fontSize: 13, marginLeft: "auto" }}>↺ Obnovit zaměstnance</button>
          ) : (
            <button onClick={() => archiveEmployee(emp.id)} style={{ ...S.btn("#ef4444"), padding: "7px 16px", fontSize: 13, marginLeft: "auto" }}>🗑️ Smazat zaměstnance</button>
          )}
        </div>

        {hrTab === "ukoly" && (() => {
          const empTasks = (tasks || []).filter(t => t.assignee_id === emp.id || t.assigned_to === emp.id);
          const open  = empTasks.filter(t => !t.done);
          const done  = empTasks.filter(t =>  t.done);
          return (
            <div>
              <div style={{ fontSize: 12, color: "#475569", marginBottom: 14 }}>
                Otevřených: <strong style={{ color: "#f59e0b" }}>{open.length}</strong> · Hotových: <strong style={{ color: "#34d399" }}>{done.length}</strong>
              </div>
              {empTasks.length === 0
                ? <div style={{ ...S.card, color: "#475569", textAlign: "center", padding: 32 }}>Žádné úkoly pro tohoto zaměstnance</div>
                : [...open, ...done].map(t => (
                  <div key={t.id} style={{ ...S.card, marginBottom: 10, display: "flex", alignItems: "flex-start", gap: 14,
                    opacity: t.done ? 0.6 : 1, borderLeft: `3px solid ${t.done ? "#34d399" : t.priority === "Vysoká" ? "#f87171" : "#f59e0b"}` }}>
                    <input type="checkbox" checked={!!t.done} style={{ marginTop: 3, accentColor: "#6366f1", width: 16, height: 16, cursor: "pointer" }}
                      onChange={async () => {
                        await supabase.from("tasks").update({ done: !t.done }).eq("id", t.id);
                        setTasks(tasks.map(x => x.id === t.id ? { ...x, done: !x.done } : x));
                      }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: t.done ? "#475569" : "#fff", textDecoration: t.done ? "line-through" : "none", fontSize: 14 }}>{t.title}</div>
                      {t.description && <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{t.description}</div>}
                      <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                        {t.due_date && <span style={{ ...S.tag("#f59e0b"), fontSize: 11 }}>📅 {t.due_date}</span>}
                        {t.priority  && <span style={{ ...S.tag(t.priority === "Vysoká" ? "#f87171" : "#a78bfa"), fontSize: 11 }}>{t.priority}</span>}
                        {t.done && <span style={{ ...S.tag("#34d399"), fontSize: 11 }}>✓ Hotovo</span>}
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          );
        })()}

        {hrTab === "info" && <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }} className="emp-detail-grid">

          {/* Levý panel - foto + základní info */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Foto */}
            <div style={{ ...S.card, textAlign: "center", padding: 24 }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                {emp.photo_url
                  ? <img src={emp.photo_url} alt={emp.name} style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover", border: "3px solid #6366f1" }} />
                  : <div style={{ width: 120, height: 120, borderRadius: "50%", background: "#2E9BE0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, color: "#fff", fontWeight: 800, margin: "0 auto" }}>{getInitial(emp.name)}</div>
                }
                <label style={{ position: "absolute", bottom: 0, right: 0, background: "#2E9BE0", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16 }} title="Nahrát foto">
                  {uploading ? "⏳" : "📷"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => uploadPhoto(e.target.files[0])} />
                </label>
              </div>
              <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, color: "#fff" }}>{emp.name}</div>
              <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>{emp.position}</div>
              <div style={{ marginTop: 8 }}>
                <span style={S.tag(emp.status === "Aktivní" ? "#34d399" : "#f59e0b")}>{emp.status}</span>
              </div>
            </div>

            {/* Přístup do aplikace */}
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 12 }}>PŘÍSTUP DO APLIKACE</div>
              {accessErr && <div style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 8, padding: "8px 10px", fontSize: 12, marginBottom: 10 }}>{accessErr}</div>}
              {accessProfile ? (
                <>
                  <div style={{ fontSize: 13, color: "#34d399", fontWeight: 700, marginBottom: 6 }}>✅ Má přístup</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>{accessProfile.email}</div>
                  <div style={{ marginBottom: 10 }}><span style={S.tag(ROLES[accessProfile.role]?.color || "#2E9BE0")}>{ROLES[accessProfile.role]?.label || accessProfile.role}</span></div>
                  <button style={{ ...S.btn("#ef4444"), width: "100%", fontSize: 12, padding: "7px" }} disabled={accessBusy} onClick={() => removeAccess(emp)}>
                    {accessBusy ? "Ruším…" : "Zrušit přístup"}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                    Zaměstnanec zatím nemá přihlašovací účet. Appka mu na zadaný email pošle pozvánku, kterou si sám otevře a nastaví si vlastní heslo.
                  </div>
                  <label style={S.label}>Email zaměstnance</label>
                  <input style={S.input} value={accessForm.email} onChange={e => setAccessForm({ ...accessForm, email: e.target.value })} placeholder="jmeno@email.cz" />
                  <label style={S.label}>Uživatelské jméno</label>
                  <input style={S.input} value={accessForm.username} onChange={e => setAccessForm({ ...accessForm, username: e.target.value })} placeholder="jmeno" />
                  <label style={S.label}>Role</label>
                  <select style={S.select} value={accessForm.role} onChange={e => setAccessForm({ ...accessForm, role: e.target.value })}>
                    {Object.keys(ROLES).map(r => <option key={r} value={r}>{ROLES[r].label}</option>)}
                  </select>
                  <button style={{ ...S.btn("#34d399"), width: "100%", fontSize: 12, padding: "8px" }} disabled={accessBusy} onClick={() => createAccess(emp)}>
                    {accessBusy ? "Odesílám pozvánku…" : "Vytvořit přístup a poslat pozvánku"}
                  </button>
                </>
              )}
            </div>

            {/* Statistiky */}
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 12 }}>PŘEHLED</div>
              {[
                { label: "Plat/měs.", value: fmtKc(emp.salary || 0), color: "#f59e0b" },
                { label: "Sazba náklady", value: `${Number(editField.hourly_rate_cost || emp.hourly_rate_cost || 0)} Kč/h`, color: "#f87171" },
                { label: "Sazba fakturace", value: `${Number(editField.hourly_rate_client || emp.hourly_rate_client || 0)} Kč/h`, color: "#34d399" },
                { label: "Vyplaceno ze zakázek", value: fmtKc(totalPaid), color: "#f87171" },
                { label: "Fakturováno ze zakázek", value: fmtKc(totalBilled), color: "#34d399" },
                { label: `Hodiny tento měsíc (${thisMonth})`, value: fmtHours(monthHours), color: "#2E9BE0" },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <span style={{ color: "#475569", fontSize: 12 }}>{s.label}</span>
                  <span style={{ color: s.color, fontWeight: 700, fontSize: 14 }}>{s.value}</span>
                </div>
              ))}
            </div>

          </div>

          {/* Pravý panel - editable pole */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Základní údaje */}
            <div style={S.card}>
              {(!emp.hourly_rate_cost || !emp.hourly_rate_client) && (
                <div style={{ background: "#f59e0b22", border: "1px solid #f59e0b44", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#f59e0b" }}>
                  ⚠️ Zaměstnanec nemá nastavenou hodinovou sazbu — náklady ze zakázek se nebudou počítat správně.
                  Doplňte <strong>Hodinová sazba náklady</strong> a <strong>Hodinová sazba klient</strong> v tabulce zaměstnanců v Supabase (sloupce hourly_rate_cost, hourly_rate_client).
                </div>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 14 }}>ZÁKLADNÍ ÚDAJE</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={S.label}>Jméno</label>
                  <input style={S.input} value={firstOf(editField.name)} onChange={e => setEditField({ ...editField, name: joinName(e.target.value, lastOf(editField.name)) })} />
                </div>
                <div>
                  <label style={S.label}>Příjmení</label>
                  <input style={S.input} value={lastOf(editField.name)} onChange={e => setEditField({ ...editField, name: joinName(firstOf(editField.name), e.target.value) })} />
                </div>
                {[
                  ["Pozice", "position"], ["Oddělení", "department"],
                  ["Email", "email"], ["Plat (Kč)", "salary"], ["Datum nástupu", "start"],
                  ["Sazba náklady (Kč/h)", "hourly_rate_cost"], ["Sazba fakturace (Kč/h)", "hourly_rate_client"],
                ].map(([label, key]) => (
                  <div key={key}>
                    <label style={S.label}>{label}</label>
                    <input style={S.input} value={editField[key] || ""} onChange={e => setEditField({ ...editField, [key]: e.target.value })} />
                  </div>
                ))}
                <div>
                  <label style={S.label}>Stav</label>
                  <select style={S.select} value={editField.status || "Aktivní"} onChange={e => setEditField({ ...editField, status: e.target.value })}>
                    {["Aktivní", "Dovolená", "Nemocenská", "Ukončen"].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Bio / popis */}
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 14 }}>POPIS / BIO</div>
              <textarea
                style={{ ...S.input, minHeight: 80, resize: "vertical" }}
                placeholder="Krátký popis zaměstnance..."
                value={editField.bio || ""}
                onChange={e => setEditField({ ...editField, bio: e.target.value })}
              />
            </div>

            {/* Zkušenosti / specializace */}
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#34d399", letterSpacing: 1, marginBottom: 14 }}>✅ ZKUŠENOSTI / SPECIALIZACE</div>
              <textarea
                style={{ ...S.input, minHeight: 100, resize: "vertical", borderColor: "#34d39940" }}
                placeholder="Co umí, na co se specializuje, zkušenosti..."
                value={editField.specialization || ""}
                onChange={e => setEditField({ ...editField, specialization: e.target.value })}
              />
            </div>

            {/* Na co si dát pozor */}
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: 1, marginBottom: 14 }}>⚠️ NA CO SI DÁT POZOR</div>
              <textarea
                style={{ ...S.input, minHeight: 100, resize: "vertical", borderColor: "#f8717140" }}
                placeholder="Slabiny, rizika, specifika při spolupráci..."
                value={editField.notes_warning || ""}
                onChange={e => setEditField({ ...editField, notes_warning: e.target.value })}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={{ ...S.btn(), padding: "10px 28px", fontSize: 15, fontWeight: 700 }} onClick={saveDetail}>💾 Uložit změny</button>
            </div>
          </div>
        </div>}
      </div>
    );
  }

  return (
    <>
      <div style={S.header}>
        <h1 style={S.h1}>Zaměstnanci & HR</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={showArchived ? S.btn("#334155") : S.btnGhost} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "← Zpět na aktivní" : `🗑️ Smazaní (${employees.filter(e => e.archived).length})`}
          </button>
          {!showArchived && <button style={S.btn()} onClick={() => setModal({ type: "addEmployee" })}>+ Přidat zaměstnance</button>}
        </div>
      </div>
      <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Celkem zaměstnanců", value: employees.filter(e => !e.archived).length, color: "#a78bfa" },
          { label: "Aktivních", value: employees.filter(e => e.status === "Aktivní" && !e.archived).length, color: "#34d399" },
          { label: "Mzdové náklady/měs.", value: fmtKc(totalPayroll), color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={S.statCard(s.color)}><div style={S.statLabel}>{s.label}</div><div style={S.statValue(s.color)}>{s.value}</div></div>
        ))}
      </div>
      <div className="emp-card-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {employees.filter(e => !!e.archived === showArchived).length === 0 && (
          <div style={{ color: "#334155", fontSize: 13, gridColumn: "1 / -1", textAlign: "center", padding: 24 }}>
            {showArchived ? "Žádní smazaní zaměstnanci." : "Žádní zaměstnanci."}
          </div>
        )}
        {employees.filter(e => !!e.archived === showArchived).map((e, i) => {
          const empPaid   = (costEntries || []).filter(c => c.employee_id === e.id).reduce((s, c) => s + Number(c.amount_cost || 0), 0);
          const empBilled = (costEntries || []).filter(c => c.employee_id === e.id).reduce((s, c) => s + Number(c.amount_client || 0), 0);
          return (
            <div key={e.id} style={{ ...S.card, cursor: "pointer", transition: "transform .15s", padding: 20, opacity: e.archived ? 0.6 : 1 }}
              onClick={() => openDetail(e)}
              onMouseEnter={ev => ev.currentTarget.style.transform = "translateY(-3px)"}
              onMouseLeave={ev => ev.currentTarget.style.transform = "none"}>
              {/* Avatar + foto */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                {e.photo_url
                  ? <img src={e.photo_url} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "3px solid #6366f1", flexShrink: 0 }} />
                  : <div style={{ ...S.avatar(avatarColors[i % 6]), width: 52, height: 52, fontSize: 22, flexShrink: 0 }}>{getInitial(e.name)}</div>
                }
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{e.name}</div>
                  <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>{e.position}</div>
                  <div style={{ marginTop: 5 }}>
                    <span style={S.tag(e.status === "Aktivní" ? "#34d399" : "#f59e0b")}>{e.status}</span>
                    {e.department && <span style={{ ...S.tag(deptColor(e.department)), marginLeft: 4 }}>{e.department}</span>}
                  </div>
                </div>
                {e.archived ? (
                  <button onClick={ev => { ev.stopPropagation(); restoreEmployee(e.id); }} style={{ ...S.btn("#34d399"), padding: "4px 9px", fontSize: 11, flexShrink: 0 }}>↺</button>
                ) : (
                  <button onClick={ev => { ev.stopPropagation(); archiveEmployee(e.id); }} style={{ ...S.btn("#ef4444"), padding: "4px 9px", fontSize: 11, flexShrink: 0 }}>🗑️</button>
                )}
              </div>
              {/* Specializace */}
              {e.specialization && (
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, background: "#f8fafc", borderRadius: 6, padding: "5px 8px" }}>
                  ✅ {e.specialization.slice(0, 60)}{e.specialization.length > 60 ? "…" : ""}
                </div>
              )}
              {/* Upozornění */}
              {e.notes_warning && (
                <div style={{ fontSize: 11, color: "#f87171", marginBottom: 10, background: "#1a0000", borderRadius: 6, padding: "5px 8px" }}>
                  ⚠️ {e.notes_warning.slice(0, 50)}{e.notes_warning.length > 50 ? "…" : ""}
                </div>
              )}
              {/* Finance */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: "auto" }}>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: "#64748b" }}>Plat/měs.</div>
                  <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 13 }}>{fmtKc(e.salary || 0)}</div>
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: "#64748b" }}>Vyplaceno</div>
                  <div style={{ color: "#f87171", fontWeight: 700, fontSize: 13 }}>{fmtKc(empPaid)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {modal?.type === "addEmployee" && (
        <div style={S.modal}><div style={S.modalBox}>
          <ModalHeader title="Nový zaměstnanec" onClose={closeModal} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={S.label}>Jméno</label><input style={S.input} value={firstOf(newE.name)} onChange={e => setNewE({ ...newE, name: joinName(e.target.value, lastOf(newE.name)) })} /></div>
            <div><label style={S.label}>Příjmení</label><input style={S.input} value={lastOf(newE.name)} onChange={e => setNewE({ ...newE, name: joinName(firstOf(newE.name), e.target.value) })} /></div>
          </div>
          {[["Pozice", "position"], ["Oddělení", "department"], ["Email", "email"], ["Plat (Kč)", "salary"], ["Datum nástupu", "start"]].map(([l, k]) => (
            <div key={k}><label style={S.label}>{l}</label><input style={S.input} value={newE[k]} onChange={e => setNewE({ ...newE, [k]: e.target.value })} /></div>
          ))}
          <label style={S.label}>Stav</label>
          <select style={S.select} value={newE.status} onChange={e => setNewE({ ...newE, status: e.target.value })}>
            {["Aktivní", "Dovolená", "Nemocenská", "Ukončen"].map(s => <option key={s}>{s}</option>)}
          </select>
          <ModalActions onSave={save} onClose={closeModal} />
        </div></div>
      )}
    </>
  );
}

// ─── PROJEKTY ─────────────────────────────────────────────────────────────────

function Projects({ projects, setProjects, customers, employees, templates, setTemplates, modal, setModal, closeModal }) {
  const [newP, setNewP] = useState({ name: "", customerId: "", status: "Plánováno", progress: 0, budget: "", spent: 0, deadline: "", assignees: [], steps: [] });
  const [expandedId, setExpandedId] = useState(null);
  const [newStep, setNewStep] = useState({});
  const [editingNote, setEditingNote] = useState({});
  const [showTemplates, setShowTemplates] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", icon: "📋", steps: [""] });
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [projectTab, setProjectTab] = useState({}); // { [projectId]: "kroky" | "material" }
  const [deliveryItems, setDeliveryItems] = useState({}); // { [projectId]: [...items] }
  const [newDeliveryItem, setNewDeliveryItem] = useState({}); // { [projectId]: {name, quantity, unit} }
  const [editingItem, setEditingItem] = useState({}); // { [itemId]: quantity }

  const loadDeliveryItems = async (projectId) => {
    const { data } = await supabase.from("delivery_items").select("*").eq("project_id", projectId).order("created_at");
    setDeliveryItems(prev => ({ ...prev, [projectId]: data || [] }));
  };

  const addDeliveryItem = async (projectId) => {
    const item = newDeliveryItem[projectId];
    if (!item?.name?.trim()) return;
    const { data: row } = await supabase.from("delivery_items").insert({
      project_id: projectId,
      name: item.name.trim(),
      quantity: Number(item.quantity) || 1,
      unit: item.unit || "ks",
      note: item.note || "",
    }).select().single();
    if (row) {
      setDeliveryItems(prev => ({ ...prev, [projectId]: [...(prev[projectId] || []), row] }));
      setNewDeliveryItem(prev => ({ ...prev, [projectId]: { name: "", quantity: 1, unit: "ks", note: "" } }));
    }
  };

  const updateDeliveryQty = async (projectId, itemId, quantity) => {
    await supabase.from("delivery_items").update({ quantity: Number(quantity) }).eq("id", itemId);
    setDeliveryItems(prev => ({
      ...prev,
      [projectId]: (prev[projectId] || []).map(i => i.id === itemId ? { ...i, quantity: Number(quantity) } : i)
    }));
    setEditingItem({});
  };

  const deleteDeliveryItem = async (projectId, itemId) => {
    await supabase.from("delivery_items").delete().eq("id", itemId);
    setDeliveryItems(prev => ({
      ...prev,
      [projectId]: (prev[projectId] || []).filter(i => i.id !== itemId)
    }));
  };

  // Recalculate progress from steps
  const calcProgress = (steps) => {
    if (!steps || steps.length === 0) return 0;
    return Math.round((steps.filter(s => s.done).length / steps.length) * 100);
  };

  const toggleStep = async (projectId, stepId) => {
    const proj = projects.find(p => p.id === projectId);
    const step = proj?.steps.find(s => s.id === stepId);
    if (!step) return;
    const newDone = !step.done;
    await supabase.from("project_steps").update({ done: newDone }).eq("id", stepId);
    setProjects(projects.map(p => {
      if (p.id !== projectId) return p;
      const steps = p.steps.map(s => s.id === stepId ? { ...s, done: newDone } : s);
      const progress = calcProgress(steps);
      const status = progress === 100 ? "Dokončeno" : progress > 0 ? "Probíhá" : p.status;
      supabase.from("projects").update({ progress, status }).eq("id", projectId);
      return { ...p, steps, progress, status };
    }));
  };

  const addStep = async (projectId) => {
    const title = newStep[projectId]?.trim();
    if (!title) return;
    const proj = projects.find(p => p.id === projectId);
    const stepOrder = (proj?.steps?.length || 0) + 1;
    const { data: row } = await supabase.from("project_steps").insert({
      project_id: projectId, title, done: false, note: "", step_order: stepOrder,
    }).select().single();
    if (row) {
      setProjects(projects.map(p => {
        if (p.id !== projectId) return p;
        const steps = [...(p.steps || []), { ...row, order: row.step_order }];
        return { ...p, steps, progress: calcProgress(steps) };
      }));
    }
    setNewStep({ ...newStep, [projectId]: "" });
  };

  const deleteStep = async (projectId, stepId) => {
    await supabase.from("project_steps").delete().eq("id", stepId);
    setProjects(projects.map(p => {
      if (p.id !== projectId) return p;
      const steps = p.steps.filter(s => s.id !== stepId);
      return { ...p, steps, progress: calcProgress(steps) };
    }));
  };

  const saveNote = async (projectId, stepId, note) => {
    await supabase.from("project_steps").update({ note }).eq("id", stepId);
    setProjects(projects.map(p => {
      if (p.id !== projectId) return p;
      return { ...p, steps: p.steps.map(s => s.id === stepId ? { ...s, note } : s) };
    }));
    setEditingNote({});
  };

  const applyTemplate = async (projectId, template) => {
    // Remove existing steps and insert new ones from template
    await supabase.from("project_steps").delete().eq("project_id", projectId);
    const stepData = template.steps.map((title, i) => ({
      project_id: projectId, title, done: false, note: "", step_order: i + 1,
    }));
    const { data: stepsRows } = await supabase.from("project_steps").insert(stepData).select();
    const steps = (stepsRows || []).map(s => ({ ...s, order: s.step_order }));
    await supabase.from("projects").update({ progress: 0 }).eq("id", projectId);
    setProjects(projects.map(p => {
      if (p.id !== projectId) return p;
      return { ...p, steps, progress: 0 };
    }));
    setSelectedTemplate(null);
  };

  const saveNewTemplate = () => {
    if (!newTemplate.name) return;
    const steps = newTemplate.steps.filter(s => s.trim());
    setTemplates([...templates, { ...newTemplate, id: Date.now(), steps }]);
    setNewTemplate({ name: "", icon: "📋", steps: [""] });
    setModal(null);
  };

  const save = async () => {
    if (!newP.name) return;
    const { data: proj } = await supabase.from("projects").insert({
      name: newP.name, customer_id: Number(newP.customerId), status: newP.status,
      progress: 0, budget: Number(newP.budget), spent: 0,
      deadline: newP.deadline, assignees: [],
    }).select().single();
    if (!proj) return;
    let steps = [];
    if (selectedTemplate) {
      const stepData = selectedTemplate.steps.map((title, i) => ({
        project_id: proj.id, title, done: false, note: "", step_order: i + 1,
      }));
      const { data: stepsRows } = await supabase.from("project_steps").insert(stepData).select();
      steps = (stepsRows || []).map(s => ({ ...s, order: s.step_order }));
    }
    const progress = calcProgress(steps);
    if (steps.length > 0) await supabase.from("projects").update({ progress }).eq("id", proj.id);
    setProjects([...projects, { ...proj, customerId: proj.customer_id, steps, progress }]);
    setNewP({ name: "", customerId: "", status: "Plánováno", progress: 0, budget: "", spent: 0, deadline: "", assignees: [], steps: [] });
    setSelectedTemplate(null);
    closeModal();
  };

  const updateProgress = async (id, progress) => {
    await supabase.from("projects").update({ progress: Number(progress) }).eq("id", id);
    setProjects(projects.map(p => p.id === id ? { ...p, progress: Number(progress) } : p));
  };
  const projectBudget = projects.reduce((s, p) => s + p.budget, 0);
  const projectSpent = projects.reduce((s, p) => s + p.spent, 0);

  return (
    <>
      <div style={S.header}>
        <h1 style={S.h1}>Výroba & projekty</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.btnGhost} onClick={() => setShowTemplates(!showTemplates)}>📋 Šablony ({templates.length})</button>
          <button style={S.btn()} onClick={() => setModal({ type: "addProject" })}>+ Nový projekt</button>
        </div>
      </div>

      {/* Šablony panel */}
      {showTemplates && (
        <div style={{ ...S.card, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>📋 Šablony projektů</div>
            <button style={{ ...S.btn("#34d399"), padding: "6px 14px", fontSize: 12 }} onClick={() => setModal({ type: "addTemplate" })}>+ Nová šablona</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 12 }}>
            {templates.map(t => (
              <div key={t.id} style={{ background: "#f8fafc", border: "1px solid #1a2035", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{t.icon}</div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 13, marginBottom: 8 }}>{t.name}</div>
                <div style={{ marginBottom: 10 }}>
                  {t.steps.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: "1px solid #1a2035" }}>
                      <div style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid #252d45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#475569", flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ fontSize: 11, color: "#475569" }}>{s}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: "#334155" }}>{t.steps.length} kroků</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Celkem projektů", value: projects.length, color: "#2E9BE0" },
          { label: "Probíhá", value: projects.filter(p => p.status === "Probíhá").length, color: "#2E9BE0" },
          { label: "Celkový rozpočet", value: fmtKc(projectBudget), color: "#34d399" },
        ].map(s => (
          <div key={s.label} style={S.statCard(s.color)}><div style={S.statLabel}>{s.label}</div><div style={S.statValue(s.color)}>{s.value}</div></div>
        ))}
      </div>

      {/* Projekty */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {projects.map(p => {
          const cust = customers.find(c => c.id === p.customerId);
          const assignedEmps = employees.filter(e => p.assignees?.includes(e.id));
          const budgetPct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0;
          const steps = p.steps || [];
          const doneSteps = steps.filter(s => s.done).length;
          const realProgress = calcProgress(steps);
          const isExpanded = expandedId === p.id;

          return (
            <div key={p.id} style={{ ...S.card, border: isExpanded ? "1px solid #6366f155" : "1px solid #1a2035" }}>
              {/* Hlavička projektu */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{p.name}</div>
                  <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>{cust?.name || "—"} · Deadline: {fmtDateCz(p.deadline)}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={S.badge(PROJ_COLORS[p.status])}>{p.status}</span>
                  <button onClick={() => {
                    const newExpanded = isExpanded ? null : p.id;
                    setExpandedId(newExpanded);
                    if (newExpanded && !deliveryItems[newExpanded]) loadDeliveryItems(newExpanded);
                  }}
                    style={{ background: "#e2e8f0", border: "1px solid #252d45", borderRadius: 8, padding: "5px 12px", color: "#475569", cursor: "pointer", fontSize: 12 }}>
                    {isExpanded ? "▲ Sbalit" : "▼ Detail"}
                  </button>
                </div>
              </div>

              {/* Progress bary */}
              <div style={{ marginBottom: 10 }}>
                {steps.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569", marginBottom: 3 }}>
                      <span>Reálný postup dle kroků: {doneSteps}/{steps.length} kroků</span>
                      <span style={{ color: "#2E9BE0", fontWeight: 700 }}>{realProgress}%</span>
                    </div>
                    {/* Kroky vizuální progress */}
                    <div style={{ display: "flex", gap: 2 }}>
                      {steps.map(s => (
                        <div key={s.id} style={{ flex: 1, height: 6, borderRadius: 3, background: s.done ? "#2E9BE0" : "#e2e8f0", transition: "background 0.3s" }} title={s.title} />
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569", marginBottom: 3 }}>
                  <span>Rozpočet: {fmtKc(p.spent)} / {fmtKc(p.budget)}</span>
                  <span style={{ color: budgetPct > 90 ? "#f87171" : "#94a3b8" }}>{budgetPct}%</span>
                </div>
                <div style={S.progress(budgetPct)}>
                  <div style={S.progressBar(Math.min(budgetPct, 100), budgetPct > 90 ? "#f87171" : PROJ_COLORS[p.status])} />
                </div>
              </div>

              {/* Assignees + manuální slider (jen pokud nejsou kroky) */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 5 }}>
                  {assignedEmps.map((e, i) => (
                    <div key={e.id} title={e.name} style={{ ...S.avatar(avatarColors[i % 6]), width: 28, height: 28, fontSize: 11 }}>{getInitial(e.name)}</div>
                  ))}
                </div>
                {steps.length === 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#475569" }}>Postup:</span>
                    <input type="range" min={0} max={100} value={p.progress}
                      onChange={e => updateProgress(p.id, e.target.value)}
                      style={{ accentColor: PROJ_COLORS[p.status], width: 100 }} />
                    <span style={{ fontSize: 11, color: "#2E9BE0", fontWeight: 700 }}>{p.progress}%</span>
                  </div>
                )}
              </div>

              {/* Expandovaný panel kroků */}
              {isExpanded && (
                <div style={{ marginTop: 18, borderTop: "1px solid #1a2035", paddingTop: 18 }}>
                  {/* Záložky */}
                  <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid #1a2035" }}>
                    {["kroky", "material"].map(tab => (
                      <button key={tab} onClick={() => setProjectTab(prev => ({ ...prev, [p.id]: tab }))}
                        style={{ padding: "7px 18px", background: "none", border: "none", borderBottom: (projectTab[p.id] || "kroky") === tab ? "2px solid #2E9BE0" : "2px solid transparent", color: (projectTab[p.id] || "kroky") === tab ? "#2E9BE0" : "#475569", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                        {tab === "kroky" ? "📋 Kroky" : "📦 Materiál / Dodací list"}
                      </button>
                    ))}
                  </div>

                  {/* ZÁLOŽKA KROKY */}
                  {(projectTab[p.id] || "kroky") === "kroky" && (
                    <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, color: "#fff", fontSize: 13 }}>Kroky projektu</div>
                    {/* Přiřadit šablonu */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {selectedTemplate?.forProject === p.id ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <select style={{ ...S.select, marginBottom: 0, width: 180, padding: "5px 10px", fontSize: 12 }}
                            onChange={e => {
                              const t = templates.find(t => t.id === Number(e.target.value));
                              if (t) applyTemplate(p.id, t);
                            }} defaultValue="">
                            <option value="" disabled>Vyber šablonu...</option>
                            {templates.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
                          </select>
                          <button style={{ ...S.btnGhost, padding: "4px 10px", fontSize: 11 }} onClick={() => setSelectedTemplate(null)}>Zrušit</button>
                        </div>
                      ) : (
                        <button style={{ ...S.btnGhost, padding: "5px 12px", fontSize: 11 }}
                          onClick={() => setSelectedTemplate({ forProject: p.id })}>
                          📋 Použít šablonu
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Seznam kroků */}
                  {steps.length === 0 ? (
                    <div style={{ color: "#334155", fontSize: 13, padding: "12px 0", textAlign: "center" }}>
                      Žádné kroky. Přidejte kroky nebo použijte šablonu.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {steps.sort((a, b) => a.order - b.order).map((step, idx) => {
                        const isEditingNote = editingNote[step.id] !== undefined;
                        return (
                          <div key={step.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #1a2035", alignItems: "flex-start" }}>
                            {/* Číslo a checkbox */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 2 }}>
                              <div style={{ width: 22, height: 22, borderRadius: "50%", background: step.done ? "#2E9BE0" : "#e2e8f0", border: step.done ? "none" : "1px solid #252d45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: step.done ? "#fff" : "#334155", flexShrink: 0, cursor: "pointer", fontWeight: 700 }}
                                onClick={() => toggleStep(p.id, step.id)}>
                                {step.done ? "✓" : idx + 1}
                              </div>
                            </div>

                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 13, color: step.done ? "#475569" : "#e2e8f0", textDecoration: step.done ? "line-through" : "none", fontWeight: step.done ? 400 : 500 }}>
                                  {step.title}
                                </span>
                                {step.done && <span style={S.tag("#34d399")}>Hotovo</span>}
                              </div>

                              {/* Poznámka */}
                              {isEditingNote ? (
                                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                  <input style={{ ...S.input, marginBottom: 0, flex: 1, fontSize: 12, padding: "6px 10px" }}
                                    value={editingNote[step.id]}
                                    onChange={e => setEditingNote({ ...editingNote, [step.id]: e.target.value })}
                                    placeholder="Poznámka ke kroku..."
                                    onKeyDown={e => e.key === "Enter" && saveNote(p.id, step.id, editingNote[step.id])}
                                  />
                                  <button style={{ ...S.btn(), padding: "5px 12px", fontSize: 12 }} onClick={() => saveNote(p.id, step.id, editingNote[step.id])}>Uložit</button>
                                  <button style={{ ...S.btnGhost, padding: "5px 10px", fontSize: 12 }} onClick={() => setEditingNote({})}>✕</button>
                                </div>
                              ) : step.note ? (
                                <div style={{ fontSize: 11, color: "#475569", marginTop: 4, cursor: "pointer" }}
                                  onClick={() => setEditingNote({ [step.id]: step.note })}>
                                  📝 {step.note}
                                </div>
                              ) : (
                                <div style={{ fontSize: 11, color: "#1A1A1A", marginTop: 3, cursor: "pointer" }}
                                  onClick={() => setEditingNote({ [step.id]: "" })}>
                                  + Přidat poznámku
                                </div>
                              )}
                            </div>

                            <button onClick={() => deleteStep(p.id, step.id)}
                              style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 15, paddingTop: 2 }}
                              title="Smazat krok">×</button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Přidat nový krok */}
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <input style={{ ...S.input, marginBottom: 0, flex: 1, fontSize: 13, padding: "9px 12px" }}
                      value={newStep[p.id] || ""}
                      onChange={e => setNewStep({ ...newStep, [p.id]: e.target.value })}
                      placeholder="Přidat nový krok..."
                      onKeyDown={e => e.key === "Enter" && addStep(p.id)}
                    />
                    <button style={{ ...S.btn("#2E9BE0"), padding: "9px 16px", fontSize: 13 }} onClick={() => addStep(p.id)}>+ Přidat</button>
                  </div>
                    </div>
                  )}

                  {/* ZÁLOŽKA MATERIÁL */}
                  {(projectTab[p.id] || "kroky") === "material" && (
                    <div>
                      <div style={{ fontWeight: 700, color: "#fff", fontSize: 13, marginBottom: 14 }}>📦 Dodací list — položky materiálu</div>

                      {/* Tabulka položek */}
                      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
                        <thead>
                          <tr>
                            {["Název položky", "Množství", "Jednotka", "Poznámka", ""].map(h => (
                              <th key={h} style={{ textAlign: "left", padding: "7px 10px", fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", borderBottom: "1px solid #1a2035" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(deliveryItems[p.id] || []).map(item => (
                            <tr key={item.id} style={{ borderBottom: "1px solid #1a2035" }}>
                              <td style={{ padding: "9px 10px", color: "#e2e8f0", fontSize: 13 }}>{item.name}</td>
                              <td style={{ padding: "9px 10px" }}>
                                {editingItem[item.id] !== undefined ? (
                                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <input type="number" min={0} step={0.1}
                                      style={{ ...S.input, marginBottom: 0, width: 70, padding: "5px 8px", fontSize: 13 }}
                                      value={editingItem[item.id]}
                                      onChange={e => setEditingItem({ ...editingItem, [item.id]: e.target.value })}
                                      onKeyDown={e => e.key === "Enter" && updateDeliveryQty(p.id, item.id, editingItem[item.id])}
                                      autoFocus
                                    />
                                    <button onClick={() => updateDeliveryQty(p.id, item.id, editingItem[item.id])}
                                      style={{ ...S.btn("#2E9BE0"), padding: "4px 10px", fontSize: 12 }}>✓</button>
                                    <button onClick={() => setEditingItem({})}
                                      style={{ ...S.btnGhost, padding: "4px 8px", fontSize: 12 }}>✕</button>
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontWeight: 700, color: "#2E9BE0", fontSize: 14 }}>{item.quantity}</span>
                                    <button onClick={() => setEditingItem({ [item.id]: item.quantity })}
                                      style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 13, padding: "2px 6px" }}
                                      title="Upravit množství">✏️</button>
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: "9px 10px", color: "#94a3b8", fontSize: 13 }}>{item.unit}</td>
                              <td style={{ padding: "9px 10px", color: "#475569", fontSize: 12 }}>{item.note || "—"}</td>
                              <td style={{ padding: "9px 10px" }}>
                                <button onClick={() => deleteDeliveryItem(p.id, item.id)}
                                  style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 15 }}
                                  title="Smazat jen tuto položku">×</button>
                              </td>
                            </tr>
                          ))}
                          {(deliveryItems[p.id] || []).length === 0 && (
                            <tr><td colSpan={5} style={{ padding: "16px 10px", color: "#334155", fontSize: 13, textAlign: "center" }}>Žádné položky. Přidejte první položku níže.</td></tr>
                          )}
                        </tbody>
                      </table>

                      {/* Přidat novou položku */}
                      <div style={{ background: "#0a0d14", borderRadius: 10, padding: 14 }}>
                        <div style={{ fontWeight: 600, color: "#94a3b8", fontSize: 12, marginBottom: 10 }}>+ Přidat položku do dodacího listu</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                          <div style={{ flex: 3, minWidth: 200 }}>
                            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>Název</div>
                            <input style={{ ...S.input, marginBottom: 0 }}
                              placeholder="např. Solární panely AIKO 500 Wp"
                              value={newDeliveryItem[p.id]?.name || ""}
                              onChange={e => setNewDeliveryItem(prev => ({ ...prev, [p.id]: { ...prev[p.id], name: e.target.value } }))}
                              onKeyDown={e => e.key === "Enter" && addDeliveryItem(p.id)}
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 80 }}>
                            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>Množství</div>
                            <input type="number" min={0} step={0.1}
                              style={{ ...S.input, marginBottom: 0 }}
                              value={newDeliveryItem[p.id]?.quantity ?? 1}
                              onChange={e => setNewDeliveryItem(prev => ({ ...prev, [p.id]: { ...prev[p.id], quantity: e.target.value } }))}
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 80 }}>
                            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>Jednotka</div>
                            <select style={{ ...S.select, marginBottom: 0 }}
                              value={newDeliveryItem[p.id]?.unit || "ks"}
                              onChange={e => setNewDeliveryItem(prev => ({ ...prev, [p.id]: { ...prev[p.id], unit: e.target.value } }))}>
                              {["ks", "m", "m²", "m³", "kg", "t", "l", "hod", "soubor"].map(u => <option key={u}>{u}</option>)}
                            </select>
                          </div>
                          <div style={{ flex: 2, minWidth: 140 }}>
                            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>Poznámka</div>
                            <input style={{ ...S.input, marginBottom: 0 }}
                              placeholder="volitelná poznámka"
                              value={newDeliveryItem[p.id]?.note || ""}
                              onChange={e => setNewDeliveryItem(prev => ({ ...prev, [p.id]: { ...prev[p.id], note: e.target.value } }))}
                            />
                          </div>
                          <button style={{ ...S.btn("#2E9BE0"), padding: "9px 16px", fontSize: 13, flexShrink: 0 }}
                            onClick={() => addDeliveryItem(p.id)}>+ Přidat</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal: nový projekt */}
      {modal?.type === "addProject" && (
        <div style={S.modal}><div style={S.modalBox}>
          <ModalHeader title="Nový projekt" onClose={closeModal} />
          <label style={S.label}>Název</label><input style={S.input} value={newP.name} onChange={e => setNewP({ ...newP, name: e.target.value })} />
          <label style={S.label}>Zákazník</label>
          <select style={S.select} value={newP.customerId} onChange={e => setNewP({ ...newP, customerId: e.target.value })}>
            <option value="">— vyberte —</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={S.label}>Stav</label>
          <select style={S.select} value={newP.status} onChange={e => setNewP({ ...newP, status: e.target.value })}>
            {["Plánováno", "Probíhá", "Pozastaveno", "Dokončeno"].map(s => <option key={s}>{s}</option>)}
          </select>
          <label style={S.label}>Rozpočet (Kč)</label><input style={S.input} type="number" value={newP.budget} onChange={e => setNewP({ ...newP, budget: e.target.value })} />
          <label style={S.label}>Deadline</label><input style={S.input} type="date" value={newP.deadline} onChange={e => setNewP({ ...newP, deadline: e.target.value })} />
          <label style={S.label}>Šablona kroků (volitelné)</label>
          <select style={S.select} value={selectedTemplate?.id || ""} onChange={e => {
            const t = templates.find(t => t.id === Number(e.target.value));
            setSelectedTemplate(t || null);
          }}>
            <option value="">— bez šablony —</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name} ({t.steps.length} kroků)</option>)}
          </select>
          {selectedTemplate && (
            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10, marginBottom: 10, border: "1px solid #252d45" }}>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>Kroky které budou přidány:</div>
              {selectedTemplate.steps.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: "#475569", padding: "2px 0" }}>
                  <span style={{ color: "#334155" }}>{i + 1}. </span>{s}
                </div>
              ))}
            </div>
          )}
          <ModalActions onSave={save} onClose={closeModal} />
        </div></div>
      )}

      {/* Modal: nová šablona */}
      {modal?.type === "addTemplate" && (
        <div style={S.modal}><div style={{ ...S.modalBox, maxHeight: "85vh", overflowY: "auto" }}>
          <ModalHeader title="Nová šablona" onClose={closeModal} />
          <label style={S.label}>Název šablony</label>
          <input style={S.input} value={newTemplate.name} onChange={e => setNewTemplate({ ...newTemplate, name: e.target.value })} placeholder="např. E-commerce projekt" />
          <label style={S.label}>Ikona</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {["💻", "🌐", "🏗️", "📣", "⚙️", "🎨", "📦", "🔬", "🎯", "📋", "🚀", "💡"].map(ico => (
              <button key={ico} onClick={() => setNewTemplate({ ...newTemplate, icon: ico })}
                style={{ fontSize: 20, padding: "6px 10px", borderRadius: 8, background: newTemplate.icon === ico ? "#2E9BE033" : "#f8fafc", border: newTemplate.icon === ico ? "1px solid #6366f1" : "1px solid #252d45", cursor: "pointer" }}>
                {ico}
              </button>
            ))}
          </div>
          <label style={S.label}>Kroky šablony</label>
          {newTemplate.steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <div style={{ width: 22, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#334155", flexShrink: 0 }}>{i + 1}.</div>
              <input style={{ ...S.input, marginBottom: 0, flex: 1 }}
                value={step}
                onChange={e => {
                  const steps = [...newTemplate.steps];
                  steps[i] = e.target.value;
                  setNewTemplate({ ...newTemplate, steps });
                }}
                placeholder={`Krok ${i + 1}...`}
              />
              {newTemplate.steps.length > 1 && (
                <button onClick={() => setNewTemplate({ ...newTemplate, steps: newTemplate.steps.filter((_, j) => j !== i) })}
                  style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 18, padding: "0 4px" }}>×</button>
              )}
            </div>
          ))}
          <button style={{ ...S.btnGhost, width: "100%", marginBottom: 12, fontSize: 12 }}
            onClick={() => setNewTemplate({ ...newTemplate, steps: [...newTemplate.steps, ""] })}>
            + Přidat krok
          </button>
          <ModalActions onSave={saveNewTemplate} onClose={closeModal} />
        </div></div>
      )}
    </>
  );
}

// ─── NÁKLADY ─────────────────────────────────────────────────────────────────

function Costs({ costs, setCosts, modal, setModal, closeModal }) {
  const [newC, setNewC] = useState({ date: "", category: "Mzdy", description: "", amount: "", recurring: false });
  const [filterCat, setFilterCat] = useState("Vše");
  const [selectedYear] = useState(2026);

  const save = async () => {
    if (!newC.description || !newC.amount) return;
    const { data: row } = await supabase.from("costs").insert({
      date: newC.date, category: newC.category, description: newC.description,
      amount: Number(newC.amount), recurring: newC.recurring,
    }).select().single();
    if (row) setCosts([...costs, row]);
    setNewC({ date: "", category: "Mzdy", description: "", amount: "", recurring: false });
    closeModal();
  };

  const deleteCost = async (id) => {
    await supabase.from("costs").delete().eq("id", id);
    setCosts(costs.filter(c => c.id !== id));
  };

  const filtered = filterCat === "Vše" ? costs : costs.filter(c => c.category === filterCat);
  const totalAll = costs.reduce((s, c) => s + c.amount, 0);

  // Per-month totals for bar chart
  const monthlyData = MONTHS.map((m, i) => {
    const monthStr = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
    return {
      month: m,
      total: costs.filter(c => c.date.startsWith(monthStr)).reduce((s, c) => s + c.amount, 0),
      byCategory: COST_CATEGORIES.reduce((acc, cat) => {
        acc[cat] = costs.filter(c => c.date.startsWith(monthStr) && c.category === cat).reduce((s, c) => s + c.amount, 0);
        return acc;
      }, {}),
    };
  });

  const maxMonthly = Math.max(...monthlyData.map(m => m.total), 1);

  // Category breakdown
  const catTotals = COST_CATEGORIES.map(cat => ({
    cat,
    total: costs.filter(c => c.category === cat).reduce((s, c) => s + c.amount, 0),
    count: costs.filter(c => c.category === cat).length,
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  const totalForPct = catTotals.reduce((s, c) => s + c.total, 0) || 1;

  // Q totals
  const quarters = [
    { label: "Q1", months: [0, 1, 2] },
    { label: "Q2", months: [3, 4, 5] },
    { label: "Q3", months: [6, 7, 8] },
    { label: "Q4", months: [9, 10, 11] },
  ].map(q => ({
    label: q.label,
    total: q.months.reduce((s, mi) => s + monthlyData[mi].total, 0),
  }));

  return (
    <>
      <div style={S.header}>
        <h1 style={S.h1}>Sledování nákladů {selectedYear}</h1>
        <button style={S.btn()} onClick={() => setModal({ type: "addCost" })}>+ Přidat náklad</button>
      </div>

      {/* Top stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Náklady celkem", value: fmtKc(totalAll), color: "#f87171" },
          ...quarters.map(q => ({ label: q.label, value: fmtKc(q.total), color: "#2E9BE0" })),
        ].map(s => (
          <div key={s.label} style={S.statCard(s.color)}>
            <div style={S.statLabel}>{s.label}</div>
            <div style={S.statValue(s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ ...S.card, marginBottom: 22 }}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 18, fontSize: 14 }}>Měsíční přehled nákladů {selectedYear}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180 }}>
          {monthlyData.map((m, i) => {
            const barH = maxMonthly > 0 ? Math.round((m.total / maxMonthly) * 150) : 0;
            return (
              <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 10, color: "#475569", fontWeight: 600 }}>{m.total > 0 ? `${Math.round(m.total / 1000)}k` : ""}</div>
                <div style={{ position: "relative", width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  {/* Stacked bar by category */}
                  <div style={{ width: "100%", display: "flex", flexDirection: "column-reverse", borderRadius: 4, overflow: "hidden", height: barH || 3, minHeight: m.total > 0 ? 8 : 3, background: m.total > 0 ? "transparent" : "#e2e8f0" }}>
                    {COST_CATEGORIES.map(cat => {
                      const catH = maxMonthly > 0 ? (m.byCategory[cat] / maxMonthly) * 150 : 0;
                      if (catH < 1) return null;
                      return <div key={cat} style={{ width: "100%", height: catH, background: CAT_COLORS[cat], opacity: 0.85 }} title={`${cat}: ${fmtKc(m.byCategory[cat])}`} />;
                    })}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: i === 3 ? "#2E9BE0" : "#475569", fontWeight: i === 3 ? 700 : 400 }}>{m.month}</div>
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 16 }}>
          {COST_CATEGORIES.map(cat => (
            <div key={cat} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: CAT_COLORS[cat] }} />
              <span style={{ fontSize: 11, color: "#475569" }}>{cat}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={S.grid2}>
        {/* Category breakdown */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 16, fontSize: 14 }}>Rozložení dle kategorie</div>
          {catTotals.map(c => (
            <div key={c.cat} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: CAT_COLORS[c.cat] }} />
                  <span style={{ fontSize: 13, color: "#1A1A1A" }}>{c.cat}</span>
                  <span style={{ fontSize: 11, color: "#334155" }}>({c.count}×)</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmtKc(c.total)}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(c.total / totalForPct) * 100}%`, background: CAT_COLORS[c.cat], borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{Math.round((c.total / totalForPct) * 100)}% z celku</div>
            </div>
          ))}
        </div>

        {/* Recurring vs jednorázové */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 16, fontSize: 14 }}>Pravidelné vs. jednorázové</div>
          {[
            { label: "Pravidelné náklady", items: costs.filter(c => c.recurring), color: "#2E9BE0" },
            { label: "Jednorázové náklady", items: costs.filter(c => !c.recurring), color: "#f59e0b" },
          ].map(g => {
            const total = g.items.reduce((s, c) => s + c.amount, 0);
            return (
              <div key={g.label} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: "#1A1A1A" }}>{g.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: g.color }}>{fmtKc(total)}</span>
                </div>
                {g.items.slice(0, 3).map(item => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #1a2035" }}>
                    <span style={{ fontSize: 12, color: "#475569" }}>{item.description}</span>
                    <span style={{ fontSize: 12, color: "#475569" }}>{fmtKc(item.amount)}</span>
                  </div>
                ))}
                {g.items.length > 3 && <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>+ {g.items.length - 3} dalších</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div style={{ ...S.card, marginTop: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>Všechny náklady</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Vše", ...COST_CATEGORIES].map(cat => (
              <button key={cat} onClick={() => setFilterCat(cat)}
                style={{ ...S.btn(filterCat === cat ? CAT_COLORS[cat] || "#2E9BE0" : "#e2e8f0"), padding: "5px 12px", fontSize: 11, border: filterCat === cat ? "none" : "1px solid #252d45" }}>
                {cat}
              </button>
            ))}
          </div>
        </div>
        <table style={S.table}>
          <thead><tr>{["Datum", "Kategorie", "Popis", "Částka", "Typ", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.sort((a, b) => b.date.localeCompare(a.date)).map(c => (
              <tr key={c.id}>
                <td style={S.td}>{fmtDateCz(c.date)}</td>
                <td style={S.td}><span style={S.tag(CAT_COLORS[c.category] || "#2E9BE0")}>{c.category}</span></td>
                <td style={{ ...S.td, color: "#1A1A1A" }}>{c.description}</td>
                <td style={{ ...S.td, color: "#fff", fontWeight: 700 }}>{fmtKc(c.amount)}</td>
                <td style={S.td}><span style={S.tag(c.recurring ? "#2E9BE0" : "#f59e0b")}>{c.recurring ? "Pravidelný" : "Jednorázový"}</span></td>
                <td style={S.td}>
                  <button onClick={() => deleteCost(c.id)}
                    style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 16 }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal?.type === "addCost" && (
        <div style={S.modal}><div style={S.modalBox}>
          <ModalHeader title="Nový náklad" onClose={closeModal} />
          <label style={S.label}>Datum</label>
          <input style={S.input} type="date" value={newC.date} onChange={e => setNewC({ ...newC, date: e.target.value })} />
          <label style={S.label}>Kategorie</label>
          <select style={S.select} value={newC.category} onChange={e => setNewC({ ...newC, category: e.target.value })}>
            {COST_CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <label style={S.label}>Popis</label>
          <input style={S.input} value={newC.description} onChange={e => setNewC({ ...newC, description: e.target.value })} />
          <label style={S.label}>Částka (Kč)</label>
          <input style={S.input} type="number" value={newC.amount} onChange={e => setNewC({ ...newC, amount: e.target.value })} />
          <label style={{ ...S.label, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={newC.recurring} onChange={e => setNewC({ ...newC, recurring: e.target.checked })} style={{ accentColor: "#2E9BE0" }} />
            Pravidelný náklad
          </label>
          <ModalActions onSave={save} onClose={closeModal} />
        </div></div>
      )}
    </>
  );
}

// ─── REPORTY ──────────────────────────────────────────────────────────────────

function Reports({ customers, deals, invoices, costs, employees, projects }) {
  const [period, setPeriod] = useState("2026");

  const totalRevenue = invoices.filter(i => i.status === "Zaplacena").reduce((s, i) => s + i.amount, 0);
  const totalCosts = costs.reduce((s, c) => s + c.amount, 0);
  const profit = totalRevenue - totalCosts;
  const margin = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0;

  const wonDeals = deals.filter(d => d.stage === "Vyhráno");
  const conversionRate = deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0;
  const avgDealValue = wonDeals.length > 0 ? Math.round(wonDeals.reduce((s, d) => s + d.value, 0) / wonDeals.length) : 0;

  // Monthly revenue vs costs
  const monthlyChart = MONTHS.map((m, i) => {
    const monthStr = `2026-${String(i + 1).padStart(2, "0")}`;
    const rev = invoices.filter(inv => inv.status === "Zaplacena" && inv.issued?.startsWith(monthStr)).reduce((s, inv) => s + inv.amount, 0);
    const cost = costs.filter(c => c.date.startsWith(monthStr)).reduce((s, c) => s + c.amount, 0);
    return { month: m, revenue: rev, costs: cost, profit: rev - cost };
  });

  const maxVal = Math.max(...monthlyChart.map(m => Math.max(m.revenue, m.costs)), 1);

  // Top zákazníci dle faktur
  const topCustomers = customers.map(c => ({
    ...c,
    revenue: invoices.filter(i => i.customerId === c.id && i.status === "Zaplacena").reduce((s, i) => s + i.amount, 0),
    invoiceCount: invoices.filter(i => i.customerId === c.id).length,
  })).sort((a, b) => b.revenue - a.revenue);

  // Pipeline hodnota dle fáze
  const pipelineByStage = STAGES.map(stage => ({
    stage,
    value: deals.filter(d => d.stage === stage).reduce((s, d) => s + d.value, 0),
    count: deals.filter(d => d.stage === stage).length,
  })).filter(s => s.count > 0);

  const totalPipeline = pipelineByStage.reduce((s, p) => s + p.value, 0) || 1;

  // Projekty – rozpočet vs. utraceno
  const projectBudget = projects.reduce((s, p) => s + p.budget, 0);
  const projectSpent = projects.reduce((s, p) => s + p.spent, 0);

  return (
    <>
      <div style={S.header}>
        <h1 style={S.h1}>📈 Analytika & reporty</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {["2026"].map(y => (
            <button key={y} style={{ ...S.btn(period === y ? "#2E9BE0" : "#e2e8f0"), border: "1px solid #252d45" }} onClick={() => setPeriod(y)}>{y}</button>
          ))}
        </div>
      </div>

      {/* KPI řada */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Celkový zisk", value: fmtKc(profit), sub: `Marže ${margin}%`, color: profit >= 0 ? "#34d399" : "#f87171" },
          { label: "Příjmy", value: fmtKc(totalRevenue), sub: `${invoices.filter(i => i.status === "Zaplacena").length} faktur`, color: "#2E9BE0" },
          { label: "Náklady", value: fmtKc(totalCosts), sub: `${costs.length} položek`, color: "#f87171" },
          { label: "Konverzní poměr", value: `${conversionRate}%`, sub: `Ø deal ${fmtKc(avgDealValue)}`, color: "#f59e0b" },
        ].map(k => (
          <div key={k.label} style={S.statCard(k.color)}>
            <div style={S.statLabel}>{k.label}</div>
            <div style={S.statValue(k.color)}>{k.value}</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Graf příjmy vs náklady */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 4, fontSize: 14 }}>Příjmy vs. Náklady — měsíčně</div>
        <div style={{ fontSize: 11, color: "#475569", marginBottom: 16 }}>Zelená = příjmy · Červená = náklady · Tečky = zisk/ztráta</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 200 }}>
          {monthlyChart.map((m, i) => {
            const revH = Math.round((m.revenue / maxVal) * 160);
            const costH = Math.round((m.costs / maxVal) * 160);
            const isProfit = m.profit >= 0;
            return (
              <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 9, color: isProfit ? "#34d399" : "#f87171", fontWeight: 700 }}>
                  {m.revenue > 0 || m.costs > 0 ? (isProfit ? "▲" : "▼") : ""}
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 160 }}>
                  <div style={{ width: 10, height: revH || 2, background: "#34d399", borderRadius: "2px 2px 0 0", opacity: 0.85 }} title={`Příjmy: ${fmtKc(m.revenue)}`} />
                  <div style={{ width: 10, height: costH || 2, background: "#f87171", borderRadius: "2px 2px 0 0", opacity: 0.85 }} title={`Náklady: ${fmtKc(m.costs)}`} />
                </div>
                <div style={{ fontSize: 9, color: i === 3 ? "#2E9BE0" : "#334155" }}>{m.month}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
          {[["#34d399", "Příjmy"], ["#f87171", "Náklady"]].map(([c, l]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, background: c, borderRadius: 2 }} />
              <span style={{ fontSize: 11, color: "#475569" }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={S.grid2}>
        {/* Top zákazníci */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 16, fontSize: 14 }}>🏆 Top zákazníci dle příjmů</div>
          {topCustomers.map((c, i) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : "#cd7c2f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#f8fafc", flexShrink: 0 }}>{i + 1}</div>
              <div style={S.avatar(avatarColors[i % 6])}>{getInitial(c.name)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#475569" }}>{c.company} · {c.invoiceCount} faktur</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#34d399" }}>{fmtKc(c.revenue)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Pipeline dle fáze */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 16, fontSize: 14 }}>💼 Pipeline hodnota dle fáze</div>
          {pipelineByStage.map(p => (
            <div key={p.stage} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={S.tag(STAGE_COLORS[p.stage])}>{p.stage}</span>
                  <span style={{ fontSize: 11, color: "#334155" }}>{p.count} deal{p.count > 1 ? "y" : ""}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmtKc(p.value)}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(p.value / totalPipeline) * 100}%`, background: STAGE_COLORS[p.stage], borderRadius: 3 }} />
              </div>
            </div>
          ))}
          <div style={{ ...S.divider, margin: "14px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "#475569" }}>Celková pipeline hodnota</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#2E9BE0" }}>{fmtKc(totalPipeline)}</span>
          </div>
        </div>

        {/* Projekty – rozpočty */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 16, fontSize: 14 }}>🏗️ Projekty — rozpočet vs. čerpání</div>
          {projects.map(p => {
            const pct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0;
            const over = pct > 100;
            return (
              <div key={p.id} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: "#1A1A1A" }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: over ? "#f87171" : "#34d399", fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: over ? "#f87171" : PROJ_COLORS[p.status], borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>{fmtKc(p.spent)} / {fmtKc(p.budget)}</div>
              </div>
            );
          })}
          <div style={{ ...S.divider, margin: "12px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "#475569" }}>Celkem utraceno / rozpočet</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmtKc(projectSpent)} / {fmtKc(projectBudget)}</span>
          </div>
        </div>

        {/* HR přehled */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 16, fontSize: 14 }}>👤 HR — mzdové náklady dle oddělení</div>
          {(() => {
            const depts = [...new Set(employees.map(e => e.department))];
            const deptData = depts.map(d => ({
              dept: d,
              count: employees.filter(e => e.department === d).length,
              salary: employees.filter(e => e.department === d && e.status === "Aktivní").reduce((s, e) => s + e.salary, 0),
            })).sort((a, b) => b.salary - a.salary);
            const maxSalary = Math.max(...deptData.map(d => d.salary), 1);
            return deptData.map((d, i) => (
              <div key={d.dept} style={{ marginBottom: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: avatarColors[i % 6] }} />
                    <span style={{ fontSize: 13, color: "#1A1A1A" }}>{d.dept}</span>
                    <span style={{ fontSize: 11, color: "#334155" }}>{d.count} os.</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmtKc(d.salary)}</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "#e2e8f0", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(d.salary / maxSalary) * 100}%`, background: avatarColors[i % 6], borderRadius: 3 }} />
                </div>
              </div>
            ));
          })()}
        </div>
      </div>
    </>
  );
}

// ─── AI ASISTENT ──────────────────────────────────────────────────────────────

function AIAssistant({ customers, deals, invoices, costs, employees, projects, tasks, communication }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Ahoj! Jsem váš AI asistent pro firemní systém. Mám přístup ke všem datům — zákazníkům, dealům, fakturám, nákladům, zaměstnancům i projektům. Na co se chcete zeptat? 💼"
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const suggestions = [
    "Který zákazník nám přinesl nejvíce příjmů?",
    "Jaký je aktuální stav pipeline?",
    "Napiš follow-up email pro Jana Nováka",
    "Shrň stav projektů a jejich čerpání rozpočtu",
    "Jaké jsou naše největší nákladové položky?",
    "Kteří zaměstnanci jsou na dovolené?",
  ];

  const buildContext = () => `
Jsi AI asistent integrovaný do firemního CRM+ERP systému. Máš přístup k těmto datům:

ZÁKAZNÍCI (${customers.length}):
${customers.map(c => `- ${c.name} (${c.company}), email: ${c.email}, štítek: ${c.tag}`).join("\n")}

OBCHODNÍ PŘÍLEŽITOSTI (${deals.length}):
${deals.map(d => {
  const c = customers.find(cu => cu.id === d.customerId);
  return `- "${d.name}" — ${d.stage}, hodnota: ${d.value.toLocaleString()} Kč, zákazník: ${c?.name || "—"}`;
}).join("\n")}

FAKTURY (${invoices.length}):
${invoices.map(i => {
  const c = customers.find(cu => cu.id === i.customerId);
  return `- ${i.number}: ${i.amount.toLocaleString()} Kč, stav: ${i.status}, zákazník: ${c?.name || "—"}, splatnost: ${i.due}`;
}).join("\n")}

NÁKLADY (${costs.length} položek, celkem ${costs.reduce((s, c) => s + c.amount, 0).toLocaleString()} Kč):
${costs.map(c => `- ${c.date} | ${c.category}: ${c.description} — ${c.amount.toLocaleString()} Kč`).join("\n")}

ZAMĚSTNANCI (${employees.length}):
${employees.map(e => `- ${e.name}, ${e.position} (${e.department}), plat: ${e.salary.toLocaleString()} Kč, stav: ${e.status}`).join("\n")}

PROJEKTY (${projects.length}):
${projects.map(p => {
  const c = customers.find(cu => cu.id === p.customerId);
  return `- "${p.name}": ${p.status}, postup: ${p.progress}%, rozpočet: ${p.budget.toLocaleString()} Kč, čerpáno: ${p.spent.toLocaleString()} Kč, deadline: ${p.deadline}, zákazník: ${c?.name || "—"}`;
}).join("\n")}

ÚKOLY (${tasks.filter(t => !t.done).length} otevřených):
${tasks.filter(t => !t.done).map(t => `- "${t.title}", termín: ${t.due}, priorita: ${t.priority}`).join("\n")}

Odpovídej vždy v češtině. Buď konkrétní, stručný a praktický. Pokud tě žádají o napsání emailu nebo textu, napiš ho kompletně. Používej čísla z dat výše.
`;

  const send = async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg || loading) return;
    setInput("");
    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildContext(),
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.map(b => b.text || "").join("") || "Omlouvám se, nepodařilo se získat odpověď.";
      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages([...newMessages, { role: "assistant", content: "⚠️ Chyba připojení k AI. Zkuste to prosím znovu." }]);
    }
    setLoading(false);
  };

  const messagesEndRef = { current: null };

  return (
    <>
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>🤖 AI Asistent</h1>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>Má přístup ke všem datům systému · Powered by Claude</div>
        </div>
        <button style={{ ...S.btnGhost, fontSize: 12 }} onClick={() => setMessages([{ role: "assistant", content: "Ahoj! Jsem váš AI asistent. Na co se chcete zeptat? 💼" }])}>Vymazat chat</button>
      </div>

      {/* Rychlé návrhy */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {suggestions.map(s => (
          <button key={s} onClick={() => send(s)}
            style={{ background: "#ffffff", border: "1px solid #252d45", borderRadius: 20, padding: "6px 14px", fontSize: 12, color: "#475569", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => { e.target.style.borderColor = "#2E9BE0"; e.target.style.color = "#fff"; }}
            onMouseLeave={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.color = "#94a3b8"; }}>
            {s}
          </button>
        ))}
      </div>

      {/* Chat okno */}
      <div style={{ ...S.card, height: 440, overflowY: "auto", marginBottom: 16, display: "flex", flexDirection: "column", gap: 16, padding: 20 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 12, flexDirection: m.role === "user" ? "row-reverse" : "row", alignItems: "flex-start" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.role === "user" ? "#2E9BE0" : "#e2e8f0", border: m.role === "assistant" ? "1px solid #252d45" : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
              {m.role === "user" ? "👤" : "🤖"}
            </div>
            <div style={{ maxWidth: "75%", background: m.role === "user" ? "#2E9BE033" : "#e2e8f0", border: `1px solid ${m.role === "user" ? "#6366f155" : "#e2e8f0"}`, borderRadius: m.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px", padding: "12px 16px" }}>
              <div style={{ fontSize: 13, color: "#1A1A1A", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e2e8f0", border: "1px solid #252d45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🤖</div>
            <div style={{ background: "#e2e8f0", border: "1px solid #252d45", borderRadius: "4px 16px 16px 16px", padding: "14px 18px" }}>
              <div style={{ display: "flex", gap: 5 }}>
                {[0, 1, 2].map(j => (
                  <div key={j} style={{ width: 7, height: 7, borderRadius: "50%", background: "#2E9BE0", animation: `pulse 1.2s ease-in-out ${j * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 10 }}>
        <input
          style={{ ...S.input, marginBottom: 0, flex: 1, fontSize: 14, padding: "12px 16px" }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Zeptejte se na cokoliv o vašem byznysu... (Enter pro odeslání)"
          disabled={loading}
        />
        <button style={{ ...S.btn(), padding: "12px 22px", fontSize: 15, opacity: loading ? 0.5 : 1 }} onClick={() => send()} disabled={loading}>
          ➤
        </button>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
    </>
  );
}

// ─── KALENDÁŘ ────────────────────────────────────────────────────────────────

const WORK_TYPES = {
  "Zakázka":     { color: "#2E9BE0", bg: "#dbeafe" },
  "Servis":      { color: "#F5821F", bg: "#ffedd5" },
  "Hrubé práce": { color: "#dc2626", bg: "#fee2e2" },
  "Nedodělek":   { color: "#d97706", bg: "#fef3c7" },
  "Reklamace":   { color: "#7c3aed", bg: "#ede9fe" },
};

function CalendarModule({ currentUser, employees, contracts, customers, calendarEvents, setCalendarEvents }) {
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "manager";
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [filterEmp, setFilterEmp] = useState(isAdmin ? "all" : String(currentUser?.id));
  const [showAdd, setShowAdd] = useState(false);
  const [detailEvent, setDetailEvent] = useState(null);
  const [form, setForm] = useState({
    date: fmt(today), work_type: "Zakázka", title: "",
    customer_name: "", customer_company: "", address: "",
    contact_name: "", contact_phone: "", work_description: "",
    contract_id: "", employee_id: currentUser?.id || "",
  });

  const fmt2 = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const firstDayOfMonth = (y, m) => { const d = new Date(y, m, 1).getDay(); return (d + 6) % 7; };

  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11); } else setViewMonth(m => m-1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y+1); setViewMonth(0); } else setViewMonth(m => m+1); };

  const visibleEvents = calendarEvents.filter(e => {
    if (filterEmp === "all") return true;
    return String(e.employee_id) === filterEmp;
  });

  const eventsOnDay = (dateStr) => visibleEvents.filter(e => e.date === dateStr);

  const saveEvent = async () => {
    const empId = isAdmin ? (form.employee_id || currentUser.id) : currentUser.id;
    const emp = employees.find(e => e.id === Number(empId));
    const payload = {
      ...form,
      employee_id: Number(empId),
      employee_name: emp ? emp.name : currentUser.name,
      contract_id: form.contract_id ? Number(form.contract_id) : null,
    };
    const { data } = await supabase.from("calendar_events").insert(payload).select().single();
    if (data) setCalendarEvents(prev => [...prev, data]);
    setShowAdd(false);
    setForm({ date: fmt(today), work_type: "Zakázka", title: "", customer_name: "", customer_company: "", address: "", contact_name: "", contact_phone: "", work_description: "", contract_id: "", employee_id: currentUser?.id || "" });
  };

  const deleteEvent = async (id) => {
    await supabase.from("calendar_events").delete().eq("id", id);
    setCalendarEvents(prev => prev.filter(e => e.id !== id));
    setDetailEvent(null);
  };

  const numDays = daysInMonth(viewYear, viewMonth);
  const startOffset = firstDayOfMonth(viewYear, viewMonth);
  const totalCells = Math.ceil((startOffset + numDays) / 7) * 7;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1A1A1A" }}>📅 Kalendář</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {isAdmin && (
            <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
              style={{ ...S.input, marginBottom: 0, width: "auto", minWidth: 160 }}>
              <option value="all">Všichni zaměstnanci</option>
              {employees.map(e => <option key={e.id} value={String(e.id)}>{e.name}</option>)}
            </select>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={prevMonth} style={{ ...S.btnGhost, padding: "6px 12px" }}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#1A1A1A", minWidth: 160, textAlign: "center" }}>
              {CZ_MONTHS[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} style={{ ...S.btnGhost, padding: "6px 12px" }}>›</button>
          </div>
          <button onClick={() => { setShowAdd(true); }} style={S.btn()}>+ Přidat událost</button>
        </div>
      </div>

      {/* Legenda */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(WORK_TYPES).map(([k, v]) => (
          <span key={k} style={{ background: v.bg, color: v.color, border: `1px solid ${v.color}44`, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>{k}</span>
        ))}
      </div>

      {/* Grid */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
          {CZ_DAYS.map(d => (
            <div key={d} style={{ padding: "10px 0", textAlign: "center", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>{d}</div>
          ))}
        </div>
        {/* Days */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {Array.from({ length: totalCells }, (_, i) => {
            const dayNum = i - startOffset + 1;
            if (dayNum < 1 || dayNum > numDays) return <div key={i} style={{ minHeight: 90, borderRight: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9", background: "#fafbfc" }} />;
            const dateStr = `${viewYear}-${pad(viewMonth+1)}-${pad(dayNum)}`;
            const todayStr = fmt2(today);
            const isToday = dateStr === todayStr;
            const dayEvents = eventsOnDay(dateStr);
            return (
              <div key={i} style={{ minHeight: 90, borderRight: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9", padding: 6, position: "relative", background: isToday ? "#eff6ff" : "#fff" }}>
                <div style={{ fontSize: 13, fontWeight: isToday ? 800 : 500, color: isToday ? "#2E9BE0" : "#374151",
                  background: isToday ? "#2E9BE0" : "transparent", color: isToday ? "#fff" : "#374151",
                  borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                  {dayNum}
                </div>
                {dayEvents.slice(0, 3).map(ev => {
                  const wt = WORK_TYPES[ev.work_type] || WORK_TYPES["Zakázka"];
                  return (
                    <div key={ev.id} onClick={() => setDetailEvent(ev)}
                      style={{ background: wt.bg, color: wt.color, borderLeft: `3px solid ${wt.color}`, borderRadius: 4, padding: "2px 5px", fontSize: 11, fontWeight: 600, marginBottom: 2, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ev.work_type}{ev.customer_name ? ` – ${ev.customer_name}` : ""}
                    </div>
                  );
                })}
                {dayEvents.length > 3 && <div style={{ fontSize: 10, color: "#94a3b8" }}>+{dayEvents.length-3} další</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ADD MODAL */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "#00000066", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowAdd(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 520, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>Přidat událost do kalendáře</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={S.label}>Datum</label>
                <input type="date" style={S.input} value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} />
              </div>
              <div>
                <label style={S.label}>Typ práce</label>
                <select style={S.input} value={form.work_type} onChange={e => setForm(f => ({...f, work_type: e.target.value}))}>
                  {Object.keys(WORK_TYPES).map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
            </div>

            {isAdmin && (
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>Zaměstnanec</label>
                <select style={S.input} value={form.employee_id} onChange={e => setForm(f => ({...f, employee_id: e.target.value}))}>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}

            <label style={S.label}>Název / popis (stručně)</label>
            <input style={S.input} value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="Montáž elektroinstalace..." />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={S.label}>Jméno zákazníka</label>
                <input style={S.input} value={form.customer_name} onChange={e => setForm(f => ({...f, customer_name: e.target.value}))} placeholder="Jan Novák" />
              </div>
              <div>
                <label style={S.label}>Firma zákazníka</label>
                <input style={S.input} value={form.customer_company} onChange={e => setForm(f => ({...f, customer_company: e.target.value}))} placeholder="Firma s.r.o." />
              </div>
            </div>

            <label style={S.label}>Adresa</label>
            <input style={S.input} value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="Ulice 123, Praha" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={S.label}>Kontaktní osoba</label>
                <input style={S.input} value={form.contact_name} onChange={e => setForm(f => ({...f, contact_name: e.target.value}))} placeholder="Jméno kontaktu" />
              </div>
              <div>
                <label style={S.label}>Telefon</label>
                <input style={S.input} value={form.contact_phone} onChange={e => setForm(f => ({...f, contact_phone: e.target.value}))} placeholder="+420 000 000 000" />
              </div>
            </div>

            <label style={S.label}>Zakázka</label>
            <select style={S.input} value={form.contract_id} onChange={e => {
              const cid = e.target.value;
              const contract = contracts.find(c => String(c.id) === cid);
              const cust = contract?.customer_id ? (customers || []).find(cu => cu.id === contract.customer_id) : null;
              setForm(f => ({
                ...f,
                contract_id: cid,
                title: contract ? (contract.code ? `${contract.code} – ${contract.name}` : contract.name) : f.title,
                address: contract?.address || f.address,
                customer_name: cust ? cust.name : f.customer_name,
                customer_company: cust ? (cust.company || "") : f.customer_company,
                contact_name: cust ? cust.name : f.contact_name,
                contact_phone: cust ? (cust.phone || "") : f.contact_phone,
              }));
            }}>
              <option value="">— vyberte zakázku —</option>
              {contracts.map(c => <option key={c.id} value={c.id}>{c.code ? `[${c.code}] ` : ""}{c.name}</option>)}
            </select>

            <label style={S.label}>Popis práce</label>
            <textarea style={{ ...S.input, minHeight: 80, resize: "vertical" }} value={form.work_description} onChange={e => setForm(f => ({...f, work_description: e.target.value}))} placeholder="Co bude probíhat..." />

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={saveEvent} style={{ ...S.btn(), flex: 1 }}>Uložit</button>
              <button onClick={() => setShowAdd(false)} style={{ ...S.btnGhost, flex: 1 }}>Zrušit</button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailEvent && (() => {
        const wt = WORK_TYPES[detailEvent.work_type] || WORK_TYPES["Zakázka"];
        const mapsUrl = detailEvent.address ? `https://mapy.cz/zakladni?q=${encodeURIComponent(detailEvent.address)}` : null;
        const canDelete = isAdmin || detailEvent.employee_id === currentUser?.id;
        return (
          <div style={{ position: "fixed", inset: 0, background: "#00000066", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setDetailEvent(null)}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 460, maxWidth: "92vw", boxSizing: "border-box", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <span style={{ background: wt.bg, color: wt.color, border: `1px solid ${wt.color}44`, borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 700 }}>{detailEvent.work_type}</span>
                <span style={{ fontSize: 14, color: "#64748b" }}>{fmtDateCz(detailEvent.date)}</span>
              </div>

              {detailEvent.title && <div style={{ fontSize: 17, fontWeight: 700, color: "#1A1A1A", marginBottom: 16 }}>{detailEvent.title}</div>}

              {(detailEvent.customer_name || detailEvent.customer_company) && (
                <div style={{ marginBottom: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Zákazník</div>
                  {detailEvent.customer_name && <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A" }}>{detailEvent.customer_name}</div>}
                  {detailEvent.customer_company && <div style={{ fontSize: 13, color: "#64748b" }}>{detailEvent.customer_company}</div>}
                </div>
              )}

              {detailEvent.address && (
                <div style={{ marginBottom: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Adresa</div>
                  <div style={{ fontSize: 14, color: "#1A1A1A", marginBottom: 8 }}>📍 {detailEvent.address}</div>
                  {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", background: "#dbeafe", color: "#2E9BE0", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>🗺 Otevřít v Mapy.cz →</a>}
                </div>
              )}

              {(detailEvent.contact_name || detailEvent.contact_phone) && (
                <div style={{ marginBottom: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Kontakt</div>
                  {detailEvent.contact_name && <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>👤 {detailEvent.contact_name}</div>}
                  {detailEvent.contact_phone && <a href={`tel:${detailEvent.contact_phone}`} style={{ fontSize: 14, color: "#2E9BE0", textDecoration: "none" }}>📞 {detailEvent.contact_phone}</a>}
                </div>
              )}

              {detailEvent.work_description && (
                <div style={{ marginBottom: 16, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Popis práce</div>
                  <div style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{detailEvent.work_description}</div>
                </div>
              )}

              {isAdmin && detailEvent.employee_name && (
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Zaměstnanec: <strong style={{ color: "#475569" }}>{detailEvent.employee_name}</strong></div>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                {canDelete && <button onClick={() => deleteEvent(detailEvent.id)} style={{ ...S.btn("#ef4444"), flex: 1 }}>🗑 Smazat</button>}
                <button onClick={() => setDetailEvent(null)} style={{ ...S.btnGhost, flex: 1 }}>Zavřít</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

// ─── HELPERS PRO ČAS ─────────────────────────────────────────────────────────

const calcHours = (checkin, checkout) => {
  if (!checkin || !checkout) return 0;
  const [h1, m1] = checkin.split(":").map(Number);
  const [h2, m2] = checkout.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
};
const calcEffectiveHours = (checkin, checkout) => Math.max(0, calcHours(checkin, checkout) - 1);

const fmtHours = (h) => {
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}h ${pad(mins)}m`;
};

const getWeekDates = () => {
  const now = new Date();
  const day = now.getDay() || 7;
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1);
  return Array.from({ length: 5 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return fmt(d); });
};

// ─── DOCHÁZKA ─────────────────────────────────────────────────────────────────

function Attendance({ currentUser, attendance, setAttendance, employees, contracts, products, setTab }) {
  const isHR = ["admin", "hr", "manager"].includes(currentUser.role);
  const [viewEmpId, setViewEmpId] = useState(currentUser.employeeId);
  // Tvrdý zámek — zaměstnanec vidí vždy jen sebe
  const effectiveEmpId = isHR ? viewEmpId : (currentUser.employeeId || viewEmpId);
  const [viewMonth, setViewMonth] = useState(fmt(new Date()).slice(0, 7)); // YYYY-MM
  const [manualDate, setManualDate] = useState(fmt(new Date()));
  const [manualIn, setManualIn] = useState("");
  const [manualOut, setManualOut] = useState("");
  const [projects, setProjects] = useState([]);
  const [attVehicles, setAttVehicles] = useState([]);
  // check-in modal
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [ciContractId, setCiContractId] = useState("");
  const [ciVehicleId, setCiVehicleId] = useState("");
  const [ciKmStart, setCiKmStart] = useState("");
  const [ciTripContractId, setCiTripContractId] = useState("");
  const [ciActivity, setCiActivity] = useState("");
  const [attLocalContracts, setAttLocalContracts] = useState([]);
  const [editRecord, setEditRecord] = useState(null); // for editing project/activity on existing record
  const todayStr = fmt(new Date());
  const [attPhotoUploading, setAttPhotoUploading] = useState(false);
  const [attUploadedPhotos, setAttUploadedPhotos] = useState([]);

  // ── Uzamčení docházky po měsíčním podpisu + žádosti o zápis/úpravu ──
  const [lockedMonths, setLockedMonths] = useState(new Set());
  const [myRequests, setMyRequests] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [requestModal, setRequestModal] = useState(null);
  const [monthSignModal, setMonthSignModal] = useState(null);

  useEffect(() => {
    if (!currentUser.employeeId) return;
    supabase.from("signed_documents").select("data,employee_signature")
      .eq("doc_type", "dochazka_mesic").eq("employee_id", currentUser.employeeId)
      .not("employee_signature", "is", null)
      .then(({ data }) => {
        setLockedMonths(new Set((data || []).map(d => `${d.data?.year}-${String(d.data?.month).padStart(2, "0")}`)));
      });
  }, [currentUser.employeeId]);

  const reloadRequests = () => {
    if (currentUser.role === "admin") {
      supabase.from("attendance_change_requests").select("*").eq("status", "čeká na schválení").order("created_at", { ascending: false })
        .then(({ data }) => setPendingRequests(data || []));
    }
    if (currentUser.employeeId) {
      supabase.from("attendance_change_requests").select("*").eq("employee_id", currentUser.employeeId).order("created_at", { ascending: false })
        .then(({ data }) => setMyRequests(data || []));
    }
  };
  useEffect(() => { reloadRequests(); }, [currentUser.role, currentUser.employeeId]);

  // Je daný den v už podepsaném (uzamčeném) měsíci? Admin zámek vždy obchází.
  const isMonthLocked = (dateStr) => lockedMonths.has((dateStr || "").slice(0, 7));
  const guardWrite = (dateStr, proposed) => {
    if (currentUser.role === "admin") return true;
    if (!isMonthLocked(dateStr)) return true;
    setRequestModal({
      date: dateStr, checkin: proposed.checkin || "", checkout: proposed.checkout || "",
      contract_id: proposed.contract_id || "", activity: proposed.activity || "",
      target_attendance_id: proposed.target_attendance_id || null, reason: "",
    });
    return false;
  };

  const submitChangeRequest = async () => {
    if (!requestModal.reason.trim()) { alert("Napiš prosím krátký důvod žádosti."); return; }
    await supabase.from("attendance_change_requests").insert({
      employee_id: effectiveEmpId,
      target_attendance_id: requestModal.target_attendance_id,
      date: requestModal.date,
      checkin: requestModal.checkin || null,
      checkout: requestModal.checkout || null,
      contract_id: requestModal.contract_id || null,
      activity: requestModal.activity || null,
      reason: requestModal.reason.trim(),
    });
    setRequestModal(null);
    reloadRequests();
    alert("Žádost byla odeslána ke schválení administrátorovi.");
  };

  const approveRequest = async (req) => {
    if (req.target_attendance_id) {
      await supabase.from("attendance").update({ checkin: req.checkin, checkout: req.checkout, contract_id: req.contract_id, activity: req.activity }).eq("id", req.target_attendance_id);
      setAttendance(attendance.map(a => a.id === req.target_attendance_id ? { ...a, checkin: req.checkin, checkout: req.checkout, contract_id: req.contract_id, activity: req.activity } : a));
    } else {
      const { data: row } = await supabase.from("attendance").insert({
        employee_id: req.employee_id, date: req.date, checkin: req.checkin, checkout: req.checkout, contract_id: req.contract_id, activity: req.activity,
      }).select().single();
      if (row) setAttendance([...attendance, { ...row, employeeId: row.employee_id }]);
    }
    await supabase.from("attendance_change_requests").update({ status: "schváleno", reviewed_by: currentUser.name, reviewed_at: new Date().toISOString() }).eq("id", req.id);
    reloadRequests();
  };

  const rejectRequest = async (req) => {
    await supabase.from("attendance_change_requests").update({ status: "zamítnuto", reviewed_by: currentUser.name, reviewed_at: new Date().toISOString() }).eq("id", req.id);
    reloadRequests();
  };

  useEffect(() => {
    if (window.location.search.includes("code=")) {
      handleOAuthCallback().then(ok => { if (ok) console.log("OneDrive připojeno"); });
    }
    supabase.from("projects").select("id, name").order("name").then(({ data }) => { if (data) setProjects(data); });
    supabase.from("vehicles").select("*").order("name").then(({ data }) => setAttVehicles(data || []));
    supabase.from("contracts").select("id, name").order("name").then(({ data }) => setAttLocalContracts(data || []));
    supabase.from("attendance_block_templates").select("*").order("name").then(({ data }) => setBlockTemplates(data || []));
    supabase.from("harmonogram").select("*").order("date", { ascending: false }).then(({ data }) => setHarmonogramRecs(data || []));
  }, []);

  const contractOpts = (contracts && contracts.length > 0) ? contracts : attLocalContracts;
  const activeContractOpts = contractOpts.filter(c => !c.status || c.status === "Nová" || c.status === "Probíhá");

  // Připomenutí odsouhlasit docházku za předchozí měsíc — jen pro vlastního
  // zaměstnance, admin zámek/podpis netýká.
  const prevMonthDateObj = new Date(); prevMonthDateObj.setDate(1); prevMonthDateObj.setMonth(prevMonthDateObj.getMonth() - 1);
  const prevYear = prevMonthDateObj.getFullYear();
  const prevMonthNum = prevMonthDateObj.getMonth() + 1;
  const prevMonthKey = `${prevYear}-${String(prevMonthNum).padStart(2, "0")}`;
  const prevMonthLabel = prevMonthDateObj.toLocaleString("cs-CZ", { month: "long", year: "numeric" });
  const hasPrevMonthRecords = currentUser.employeeId && attendance.some(a => a.employeeId === currentUser.employeeId && a.date && a.date.startsWith(prevMonthKey));
  const showConfirmBanner = currentUser.role !== "admin" && hasPrevMonthRecords && !lockedMonths.has(prevMonthKey);

  const monthNamesCz = ["", "Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

  const openMonthSign = async (year, month) => {
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    const recs = attendance.filter(a => a.employeeId === currentUser.employeeId && a.date && a.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date));
    const totalH = recs.reduce((s, r) => s + calcEffectiveHours(r.checkin, r.checkout), 0);
    const monthLabelStr = monthNamesCz[month] + " " + year;
    const empObj = employees.find(e => e.id === currentUser.employeeId);
    const { data: existingDoc } = await supabase.from("signed_documents").select("*")
      .eq("doc_type", "dochazka_mesic").eq("employee_id", currentUser.employeeId)
      .eq("data->>year", String(year)).eq("data->>month", String(month))
      .maybeSingle();
    let doc = existingDoc;
    if (!doc) {
      const rowsData = recs.map(r => {
        const h = calcEffectiveHours(r.checkin, r.checkout);
        const contract = contractOpts.find(c => c.id === r.contract_id);
        return { date: fmtDateCz(r.date), checkin: r.checkin, checkout: r.checkout, hoursLabel: fmtHours(h), contractName: contract ? contract.name : "", activity: r.activity || "" };
      });
      const { data: inserted } = await supabase.from("signed_documents").insert({
        doc_type: "dochazka_mesic",
        title: "Docházka – " + (empObj ? empObj.name : "") + " – " + monthLabelStr,
        employee_id: currentUser.employeeId,
        data: { year, month, empName: empObj ? empObj.name : "", monthLabel: monthLabelStr, rows: rowsData, totalHLabel: fmtHours(totalH) },
        status: "čeká na podpis zaměstnance",
        created_by: currentUser.name,
      }).select().single();
      doc = inserted;
    }
    if (doc) setMonthSignModal({ doc });
  };

  const onMonthSigned = async (dataUrl) => {
    const { doc } = monthSignModal;
    const now = new Date().toISOString();
    const { data: updated } = await supabase.from("signed_documents").update({
      employee_signature: dataUrl, employee_signed_at: now, employee_signed_name: currentUser.name,
      status: "čeká na podpis zaměstnavatele",
    }).eq("id", doc.id).select().single();
    if (updated) {
      setLockedMonths(prev => new Set([...prev, `${updated.data.year}-${String(updated.data.month).padStart(2, "0")}`]));
    }
    setMonthSignModal(null);
  };

  const empRecords = attendance.filter(a => a.employeeId === effectiveEmpId && (viewMonth === "all" || (a.date && a.date.startsWith(viewMonth)))).sort((a, b) => b.date.localeCompare(a.date));
  const viewMonthHours = empRecords.reduce((s, a) => s + calcHours(a.checkin, a.checkout), 0);
  const todayRecord = attendance.find(a => a.employeeId === effectiveEmpId && a.date === todayStr);

  // Tichá synchronizace — bez alertu, spouští se automaticky
  const syncCostEntriesQuiet = async (attList) => {
    const list = attList || attendance;
    const toSync = list.filter(a => a.contract_id && a.checkin && a.checkout);
    for (const rec of toSync) {
      const emp = employees.find(e => e.id === (rec.employee_id || rec.employeeId));
      if (!emp || (!emp.hourly_rate_cost && !emp.hourly_rate_client)) continue;
      const effH = calcEffectiveHours(rec.checkin, rec.checkout);
      if (effH <= 0) continue;
      await supabase.from("contract_cost_entries").delete().eq("attendance_id", rec.id);
      await supabase.from("contract_cost_entries").insert({
        contract_id: rec.contract_id,
        cost_type: "práce", is_extra: false,
        date: rec.date,
        description: `${emp.name} - docházka`,
        quantity: Math.round(effH * 100) / 100,
        unit: "h",
        unit_price_cost: Number(emp.hourly_rate_cost || 0),
        unit_price_client: Number(emp.hourly_rate_client || 0),
        employee_id: emp.id,
        attendance_id: rec.id,
      });
    }
  };

  // Manuální sync s alertem (tlačítko ⚡)
  const syncCostEntries = async () => {
    const toSync = attendance.filter(a => a.contract_id && a.checkin && a.checkout);
    await syncCostEntriesQuiet(toSync);
    alert(`Synchronizováno ${toSync.filter(a => {
      const emp = employees.find(e => e.id === (a.employee_id || a.employeeId));
      return emp && (emp.hourly_rate_cost || emp.hourly_rate_client);
    }).length} záznamů do nákladů zakázek.`);
  };

  // Automatická synchronizace při načtení docházky
  useEffect(() => {
    if (attendance.length > 0 && employees.length > 0) {
      syncCostEntriesQuiet(attendance);
    }
  }, [attendance.length, employees.length]);

  const loadRecordMaterials = async (attendanceId) => {
    if (recordMaterials[attendanceId]) return;
    const { data } = await supabase.from("attendance_materials").select("*").eq("attendance_id", attendanceId).order("created_at");
    setRecordMaterials(prev => ({ ...prev, [attendanceId]: data || [] }));
  };

  const addMaterial = async (attendanceId, contractId) => {
    if (!matItem.trim() || !matQty) return;
    const row_data = {
      attendance_id: attendanceId,
      employee_id: viewEmpId,
      contract_id: contractId || null,
      item_name: matItem.trim(),
      quantity: Number(matQty),
      unit: matUnit,
    };
    const { data: row } = await supabase.from("attendance_materials").insert(row_data).select().single();
    if (row) {
      setRecordMaterials(prev => ({ ...prev, [attendanceId]: [...(prev[attendanceId] || []), row] }));
    }
    setMatItem(""); setMatQty(""); setMatSuggestions([]);
  };

  const createCostEntryFromAttendance = async (attRecord, checkoutTime) => {
    if (!attRecord.contract_id) return;
    const emp = employees.find(e => e.id === attRecord.employee_id || e.id === attRecord.employeeId);
    if (!emp) return;
    const effH = calcEffectiveHours(attRecord.checkin, checkoutTime);
    if (effH <= 0) return;
    // Smazat existujici zaznam pro tento attendance (aby neduplikoval pri update)
    await supabase.from("contract_cost_entries").delete().eq("attendance_id", attRecord.id);
    await supabase.from("contract_cost_entries").insert({
      contract_id: attRecord.contract_id,
      cost_type: "práce", is_extra: false,
      date: attRecord.date,
      description: `${emp.name} - docházka`,
      quantity: Math.round(effH * 100) / 100,
      unit: "h",
      unit_price_cost: Number(emp.hourly_rate_cost || 0),
      unit_price_client: Number(emp.hourly_rate_client || 0),
      employee_id: emp.id,
      attendance_id: attRecord.id,
    });
  };

  const checkinNow = async () => {
    const now = new Date();
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (todayRecord) {
      // Odchod
      await supabase.from("attendance").update({ checkout: time }).eq("id", todayRecord.id);
      const updated = { ...todayRecord, checkout: time };
      setAttendance(attendance.map(a => a.id === todayRecord.id ? updated : a));
      await createCostEntryFromAttendance(updated, time);
    } else {
      // Příchod — volat přímo bez modalu
      doCheckin();
    }
  };

  const doCheckin = async () => {
    const now = new Date();
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const contractIdVal = ciContractId ? Number(ciContractId) : null;
    const { data: row } = await supabase.from("attendance")
      .insert({ employee_id: effectiveEmpId, date: todayStr, checkin: time, checkout: null, contract_id: contractIdVal, activity: ciActivity || null })
      .select().single();
    if (row) setAttendance([...attendance, { ...row, employeeId: row.employee_id }]);
    // Zapis zahajeni jizdy pokud bylo zadano vozidlo + km
    if (ciVehicleId && ciKmStart) {
      const vehicle = attVehicles.find(v => String(v.id) === String(ciVehicleId));
      const vehicleStr = vehicle ? `${vehicle.name}${vehicle.spz ? " (" + vehicle.spz + ")" : ""}` : "";
      const tripContractId = ciTripContractId ? Number(ciTripContractId) : null;
      const tripContractName = contractOpts.find(c => c.id === tripContractId)?.name || null;
      await supabase.from("vehicle_log").insert({
        employee_id: effectiveEmpId,
        employee_name: employees.find(e => e.id === viewEmpId)?.name || currentUser?.name || "",
        date: todayStr,
        vehicle: vehicleStr,
        km_start: Number(ciKmStart),
        km_end: Number(ciKmStart),
        contract_id: tripContractId,
        contract_name: tripContractName,
        note: "Zahájení — km konec doplňte v Knize jízd",
      });
    }
    setShowCheckinModal(false);
  };

  // Fotka k dnešní práci — uloží se na zakázku, kterou má zaměstnanec v
  // dnešním záznamu vybranou (stejná logika jako upload fotek u zakázky).
  const uploadAttendancePhoto = async (file) => {
    const contractIdVal = todayRecord?.contract_id || (ciContractId ? Number(ciContractId) : null);
    if (!contractIdVal) { alert("Nejdřív vyber zakázku, ke které fotku přiřadit."); return; }
    setAttPhotoUploading(true);
    try {
      let url, storagePath, itemId = null;
      const contract = contractOpts.find(c => c.id === contractIdVal);
      const folderName = (contract?.name || String(contractIdVal)).replace(/[/\\?%*:|"<>]/g, "_");
      if (isConnected()) {
        const res = await uploadFileObject(`FirmaCRM/Zakázky/${folderName}/Fotky`, file);
        url = res.webUrl; itemId = res.itemId; storagePath = "onedrive:" + file.name;
      } else {
        const ext = file.name.split(".").pop();
        const path = `${contractIdVal}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("zakazky-fotky").upload(path, file);
        if (error) { alert("Chyba uploadu: " + error.message); setAttPhotoUploading(false); return; }
        url = supabase.storage.from("zakazky-fotky").getPublicUrl(path).data.publicUrl;
        storagePath = path;
      }
      const { data: row } = await supabase.from("contract_photos").insert({
        contract_id: contractIdVal, date: todayStr, storage_path: storagePath, url, item_id: itemId,
        description: "Docházka " + todayStr, uploaded_by: currentUser?.employeeId || null,
      }).select().single();
      if (row) setAttUploadedPhotos(prev => [...prev, row]);
    } catch (e) {
      alert("Chyba uploadu: " + e.message);
    }
    setAttPhotoUploading(false);
  };
  const onAttPhotoInput = (e) => {
    Array.from(e.target.files || []).forEach(f => uploadAttendancePhoto(f));
    e.target.value = "";
  };

  const saveRecordDetail = async (id, projectId, contractId, activity) => {
    await supabase.from("attendance").update({ project_id: projectId || null, contract_id: contractId || null, activity: activity || null }).eq("id", id);
    setAttendance(attendance.map(a => a.id === id ? { ...a, project_id: projectId, contract_id: contractId, activity } : a));
    setEditRecord(null);
  };

  const [manualContractId, setManualContractId] = useState("");
  const [attMaterials, setAttMaterials] = useState([]);
  const [matItem, setMatItem] = useState("");
  const [matQty, setMatQty] = useState("");
  const [matUnit, setMatUnit] = useState("ks");
  const [matSuggestions, setMatSuggestions] = useState([]);
  const [expandedMatRecord, setExpandedMatRecord] = useState(null);
  const [recordMaterials, setRecordMaterials] = useState({});
  const [attTab, setAttTab] = useState("zaznam");
  const [kalDay, setKalDay] = useState(null);
  const [soupisEmpId, setSoupisEmpId] = useState("vše");
  const [reportModal, setReportModal] = useState(false);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportEmpId, setReportEmpId] = useState(null);
  const [expandedActivity, setExpandedActivity] = useState(null);
  const [timelineDate, setTimelineDate] = useState(fmt(new Date()));
  const [tlIn, setTlIn] = useState("");
  const [tlOut, setTlOut] = useState("");
  const [tlActivity, setTlActivity] = useState("");
  const [tlContractId, setTlContractId] = useState("");
  const [blockTemplates, setBlockTemplates] = useState([]);
  const [tlSuggestions, setTlSuggestions] = useState([]);
  const [newTplName, setNewTplName] = useState("");
  const [newTplDesc, setNewTplDesc] = useState("");
  const [harmonogramRecs, setHarmonogramRecs] = useState([]);
  const addManual = async () => {
    if (!manualDate || !manualIn) return;
    const existing = attendance.find(a => a.employeeId === effectiveEmpId && a.date === manualDate);
    const contractIdVal = manualContractId ? Number(manualContractId) : null;
    if (!guardWrite(manualDate, { checkin: manualIn, checkout: manualOut, contract_id: contractIdVal, target_attendance_id: existing?.id || null })) return;
    if (existing) {
      await supabase.from("attendance").update({ checkin: manualIn, checkout: manualOut || null, contract_id: contractIdVal }).eq("id", existing.id);
      const updated = { ...existing, checkin: manualIn, checkout: manualOut || null, contract_id: contractIdVal };
      setAttendance(attendance.map(a => a.id === existing.id ? updated : a));
      if (manualOut && contractIdVal) await createCostEntryFromAttendance(updated, manualOut);
    } else {
      const { data: row } = await supabase.from("attendance")
        .insert({ employee_id: effectiveEmpId, date: manualDate, checkin: manualIn, checkout: manualOut || null, contract_id: contractIdVal })
        .select().single();
      if (row) {
        const newRow = { ...row, employeeId: row.employee_id };
        setAttendance([...attendance, newRow]);
        if (manualOut && contractIdVal) await createCostEntryFromAttendance(newRow, manualOut);
      }
    }
    setManualIn(""); setManualOut(""); setManualContractId("");
  };

  const deleteRecord = async (id) => {
    await supabase.from("attendance").delete().eq("id", id);
    setAttendance(attendance.filter(a => a.id !== id));
  };

  const weekDates = getWeekDates();
  const weekHours = weekDates.reduce((s, d) => { const r = attendance.find(a => a.employeeId === effectiveEmpId && a.date === d); return s + (r ? calcHours(r.checkin, r.checkout) : 0); }, 0);
  const monthStr = todayStr.slice(0, 7);
  const monthHours = attendance.filter(a => a.employeeId === effectiveEmpId && a.date.startsWith(monthStr)).reduce((s, a) => s + calcHours(a.checkin, a.checkout), 0);
  const yearStr = todayStr.slice(0, 4);
  const yearHours = attendance.filter(a => a.employeeId === effectiveEmpId && a.date.startsWith(yearStr)).reduce((s, a) => s + calcHours(a.checkin, a.checkout), 0);
  const todayHours = todayRecord ? calcHours(todayRecord.checkin, todayRecord.checkout) : 0;
  const todayEffective = todayRecord ? calcEffectiveHours(todayRecord.checkin, todayRecord.checkout) : 0;
  const viewEmp = employees.find(e => e.id === effectiveEmpId);
  const vacDays = viewEmp?.vacation_days ?? currentUser?.vacationDays ?? 0;
  const vacUsed = viewEmp?.vacation_used ?? currentUser?.vacationUsed ?? 0;

  // helper: label měsíce
  const monthLabel = viewMonth !== "all"
    ? new Date(viewMonth + "-01").toLocaleString("cs-CZ", { month: "long", year: "numeric" })
    : "Vše";

  // Timeline záznamy pro vybraný den
  // Harmonogram — filtruje přímo z attendance (ne z empRecords omezených měsícem)
  const timelineRecs = attendance.filter(r =>
    (r.employeeId === effectiveEmpId || r.employee_id === effectiveEmpId) && r.date === timelineDate
  ).sort((a,b) => (a.checkin||"").localeCompare(b.checkin||""));

  // Generování výkazu práce — otevře tisknutelné okno
  const generateReport = () => {
    const empForReport = isHR && reportEmpId ? reportEmpId : effectiveEmpId;
    const recs = attendance.filter(a => {
      const empMatch = a.employeeId === empForReport || a.employee_id === empForReport;
      const dateMatch = a.date && a.date.startsWith(reportYear + "-" + String(reportMonth).padStart(2,"0"));
      return empMatch && dateMatch;
    }).sort((a,b) => a.date.localeCompare(b.date));
    const empObj = employees.find(e => e.id === empForReport);
    const totalH = recs.reduce((s,r) => s + calcEffectiveHours(r.checkin, r.checkout), 0);
    const rows = recs.map(r => {
      const h = calcEffectiveHours(r.checkin, r.checkout);
      const contract = contractOpts.find(c => c.id === r.contract_id);
      return "<tr><td>" + fmtDateCz(r.date) + "</td><td>" + (r.checkin||"—") + "</td><td>" + (r.checkout||"—") + "</td><td><strong>" + fmtHours(h) + "</strong></td><td>" + (contract ? contract.name : "—") + "</td><td>" + (r.activity||"—") + "</td></tr>";
    }).join("");
    const totalRow = "<tr class='total'><td colspan='3'>Celkem</td><td><strong>" + fmtHours(totalH) + "</strong></td><td colspan='2'>" + recs.length + " záznamů</td></tr>";
    const monthNames = ["","Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"];
    const sazba = Number(empObj?.hourly_rate_cost) || 0;
    const castka = totalH * sazba;
    const castkaHtml = sazba
      ? "<div class='vyplata'>Celková částka k výplatě: <strong>" + castka.toLocaleString("cs-CZ") + " Kč</strong><span class='vyplata-detail'> (" + fmtHours(totalH) + " × " + sazba.toLocaleString("cs-CZ") + " Kč/h)</span></div>"
      : "<div class='vyplata vyplata-warn'>⚠️ Zaměstnanci není nastavena hodinová sazba — částku k výplatě nelze spočítat.</div>";
    const podpisyHtml = "<div class='podpisy'><div class='podpis'><div class='cara'></div><div class='popisek'>Podpis zaměstnance</div></div><div class='podpis'><div class='cara'></div><div class='popisek'>Podpis zaměstnavatele</div></div></div>";
    const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Výkaz práce</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#555;font-weight:normal;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#0E3B5E;color:#fff;padding:8px 12px;text-align:left;font-size:13px}td{padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:13px}tr:nth-child(even) td{background:#f8fafc}.total{font-weight:bold}.vyplata{margin-top:18px;padding:14px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:15px}.vyplata strong{font-size:18px}.vyplata-detail{color:#64748b;font-size:12px;margin-left:6px}.vyplata-warn{background:#fffbeb;border-color:#fde68a;font-size:13px}.podpisy{display:flex;justify-content:space-between;margin-top:64px}.podpis{width:42%}.cara{border-top:1px solid #111;margin-bottom:6px}.popisek{font-size:12px;color:#555;text-align:center}@media print{body{padding:16px}}</style></head><body><h1>Výkaz práce</h1><h2>" + (empObj ? empObj.name : "") + " · " + monthNames[reportMonth] + " " + reportYear + "</h2><table><thead><tr><th>Datum</th><th>Příchod</th><th>Odchod</th><th>Odpracováno</th><th>Zakázka</th><th>Popis</th></tr></thead><tbody>" + rows + totalRow + "</tbody></table>" + castkaHtml + podpisyHtml + "<script>window.onload=function(){window.print();}<\/script></body></html>";
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    setReportModal(false);
  };

  // Vytvoří výkaz jako digitálně podepisovatelný dokument (modul Podpisy) —
  // uloží snapshot dat, zaměstnanec ho tam hned podepíše, zaměstnavatel dopodepíše později.
  const signReportDigitally = async () => {
    const empForReport = isHR && reportEmpId ? reportEmpId : effectiveEmpId;
    const recs = attendance.filter(a => {
      const empMatch = a.employeeId === empForReport || a.employee_id === empForReport;
      const dateMatch = a.date && a.date.startsWith(reportYear + "-" + String(reportMonth).padStart(2,"0"));
      return empMatch && dateMatch;
    }).sort((a,b) => a.date.localeCompare(b.date));
    const empObj = employees.find(e => e.id === empForReport);
    const totalH = recs.reduce((s,r) => s + calcEffectiveHours(r.checkin, r.checkout), 0);
    const monthNames = ["","Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"];
    const sazba = Number(empObj?.hourly_rate_cost) || 0;
    const rowsData = recs.map(r => {
      const h = calcEffectiveHours(r.checkin, r.checkout);
      const contract = contractOpts.find(c => c.id === r.contract_id);
      return { date: fmtDateCz(r.date), checkin: r.checkin, checkout: r.checkout, hoursLabel: fmtHours(h), contractName: contract ? contract.name : "", activity: r.activity || "" };
    });
    const monthLabel = monthNames[reportMonth] + " " + reportYear;
    const { error } = await supabase.from("signed_documents").insert({
      doc_type: "vykaz_prace",
      title: "Výkaz práce – " + (empObj ? empObj.name : "") + " – " + monthLabel,
      employee_id: empForReport,
      data: { empName: empObj ? empObj.name : "", monthLabel, rows: rowsData, totalHLabel: fmtHours(totalH), sazba, castka: totalH * sazba },
      status: "čeká na podpis zaměstnance",
      created_by: currentUser.name,
    });
    if (error) { alert("Chyba při vytváření dokumentu: " + error.message); return; }
    setReportModal(false);
    if (setTab) setTab("podpisy");
  };

  return (
    <>
      {/* TAB NAVIGATION — full width */}
      <div style={{ borderBottom: "none", marginBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4, paddingLeft: 2 }}>
            {[
              { id: "zaznam", label: "📅 Záznamy & Docházka" },
              { id: "harmonogram", label: "🗓 Harmonogram" },
              { id: "prehled", label: "📊 Přehled" + (viewMonth !== "all" ? " – " + monthLabel : "") },
              { id: "kalendar", label: "📆 Kalendář" },
              { id: "soupis", label: "📋 Soupis práce" },
              ...((currentUser.role === "admin" || currentUser.name === "Šarlota Jurenková") ? [{ id: "sablony", label: "📋 Šablony bloků" }] : []),
              ...(currentUser.role === "admin" ? [{ id: "zadosti", label: "📩 Žádosti" + (pendingRequests.length ? ` (${pendingRequests.length})` : "") }] : []),
            ].map(t => (
              <button key={t.id} onClick={() => setAttTab(t.id)} style={{
                padding: "10px 22px",
                background: attTab === t.id ? "#0d2137" : "rgba(100,116,139,0.25)",
                border: attTab === t.id ? "1.5px solid #2E9BE0" : "1.5px solid #64748b",
                borderBottom: attTab === t.id ? "1.5px solid #0d2137" : "1.5px solid #64748b",
                borderRadius: "10px 10px 0 0",
                color: attTab === t.id ? "#93c5fd" : "#1A1A1A",
                fontWeight: attTab === t.id ? 700 : 500,
                cursor: "pointer", fontSize: 14, marginBottom: -1,
              }}>{t.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0" }}>
            {isHR && (
              <select style={{ ...S.select, marginBottom: 0, width: 180 }} value={viewEmpId} onChange={e => setViewEmpId(Number(e.target.value))}>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            )}
            <select style={{ ...S.select, marginBottom: 0, width: 150 }} value={viewMonth} onChange={e => setViewMonth(e.target.value)}>
              <option value="all">Vše</option>
              {Array.from({ length: 12 }, (_, i) => {
                const d = new Date(); d.setMonth(d.getMonth() - i);
                const val = d.toISOString().slice(0, 7);
                const label = d.toLocaleString("cs-CZ", { month: "long", year: "numeric" });
                return <option key={val} value={val}>{label}</option>;
              })}
            </select>
          </div>
        </div>
      </div>

      {/* TAB CONTENT PANEL */}
      <div style={{
        border: "1.5px solid #2E9BE0",
        borderTop: "none",
        borderRadius: "0 10px 10px 10px",
        padding: "20px 16px",
        marginBottom: 16,
      }}>

      {showConfirmBanner && (
        <div style={{ ...S.card, background: "#fffbeb", border: "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "#92400e" }}>📢 Potvrď prosím docházku za <strong>{prevMonthLabel}</strong> — po podpisu se měsíc uzamkne a nepůjde do něj dál zapisovat (jen žádostí ke schválení).</div>
          <button style={S.btn("#f59e0b")} onClick={() => openMonthSign(prevYear, prevMonthNum)}>✍️ Podepsat docházku</button>
        </div>
      )}

      {/* LIST 1: ZÁZNAMY & DOCHÁZKA */}
      {attTab === "zaznam" && (
        <>
          {viewEmp && (
            <div style={{ ...S.card, margin: "16px 0", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ ...S.avatar("#2E9BE0"), width: 48, height: 48, fontSize: 18 }}>{getInitial(viewEmp.name)}</div>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{viewEmp.name}</div>
                <div style={{ color: "#475569", fontSize: 12 }}>{viewEmp.position} · {viewEmp.department}</div>
              </div>
              {vacDays > 0 && (
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "#475569" }}>Dovolená</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>{vacDays - vacUsed} dní</div>
                  <div style={{ fontSize: 11, color: "#334155" }}>zbývá z {vacDays} dní</div>
                </div>
              )}
            </div>
          )}

          {/* Dnešní záznam */}
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: "#fff", marginBottom: 16, fontSize: 14 }}>📅 Dnešní záznam — {todayStr}</div>
            <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
              <div>
                <div style={S.statLabel}>Příchod</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: todayRecord?.checkin ? "#34d399" : "#334155" }}>{todayRecord?.checkin?.slice(0,5) || "—"}</div>
              </div>
              <div>
                <div style={S.statLabel}>Odchod</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: todayRecord?.checkout ? "#f59e0b" : "#334155" }}>{todayRecord?.checkout?.slice(0,5) || (todayRecord?.checkin ? "probíhá..." : "—")}</div>
              </div>
              {todayRecord?.checkin && todayRecord?.checkout && (
                <div>
                  <div style={S.statLabel}>Odpracováno</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#2E9BE0" }}>{fmtHours(todayEffective)}</div>
                </div>
              )}
            </div>
            <label style={S.label}>Zakázka</label>
            <SearchSelect
              options={activeContractOpts.map(c => ({ id: c.id, label: c.name }))}
              value={todayRecord?.contract_id || ciContractId}
              placeholder="— bez zakázky — (piš pro hledání)"
              onChange={async val => {
                const cid = val ? Number(val) : null;
                setCiContractId(val);
                if (todayRecord) {
                  await supabase.from("attendance").update({ contract_id: cid }).eq("id", todayRecord.id);
                  setAttendance(attendance.map(a => a.id === todayRecord.id ? { ...a, contract_id: cid } : a));
                }
              }} />
            <label style={S.label}>Popis práce</label>
            <textarea style={{ ...S.input, minHeight: 64, resize: "vertical" }}
              placeholder="Co jsi dělal/a..."
              value={todayRecord?.activity || ciActivity}
              onChange={async e => {
                setCiActivity(e.target.value);
                if (todayRecord) {
                  await supabase.from("attendance").update({ activity: e.target.value }).eq("id", todayRecord.id);
                  setAttendance(attendance.map(a => a.id === todayRecord.id ? { ...a, activity: e.target.value } : a));
                }
              }} />
            <label style={S.label}>📷 Fotky ze zakázky</label>
            <input type="file" accept="image/*" multiple capture="environment"
              onChange={onAttPhotoInput} disabled={attPhotoUploading || !(todayRecord?.contract_id || ciContractId)}
              style={{ ...S.input, padding: 8 }} />
            {!(todayRecord?.contract_id || ciContractId) && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Nejdřív vyber zakázku výše.</div>}
            {attPhotoUploading && <div style={{ fontSize: 12, color: "#2E9BE0", marginTop: 4 }}>Nahrávám…</div>}
            {attUploadedPhotos.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, marginBottom: 4 }}>
                {attUploadedPhotos.map(p => (
                  <img key={p.id} src={p.url} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid #252d45" }} />
                ))}
              </div>
            )}
            {!todayRecord && (<>
              <label style={S.label}>Vozidlo (volitelné)</label>
              <select style={S.select} value={ciVehicleId} onChange={e => setCiVehicleId(e.target.value)}>
                <option value="">— nevyužívám vozidlo —</option>
                {attVehicles.map(v => <option key={v.id} value={v.id}>{v.name}{v.spz ? " (" + v.spz + ")" : ""}</option>)}
              </select>
              {ciVehicleId && (<>
                <label style={S.label}>Počáteční stav km</label>
                <input type="number" style={S.input} placeholder="např. 12450" value={ciKmStart} onChange={e => setCiKmStart(e.target.value)} />
                <label style={S.label}>Zakázka jízdy (volitelné)</label>
                <SearchSelect
                  options={activeContractOpts.map(c => ({ id: c.id, label: c.name }))}
                  value={ciTripContractId}
                  placeholder="— bez zakázky — (piš pro hledání)"
                  onChange={val => setCiTripContractId(val)} />
              </>)}
            </>)}
            <button style={{ ...S.btn(todayRecord?.checkin && !todayRecord?.checkout ? "#f59e0b" : todayRecord?.checkout ? "#334155" : "#2E9BE0"), width: "100%", padding: "12px", fontWeight: 700, marginTop: 8, fontSize: 15 }}
              onClick={checkinNow} disabled={!!todayRecord?.checkout}>
              {todayRecord?.checkout ? "✓ Odchod zapsán (" + todayRecord.checkout + ")" : todayRecord?.checkin ? "⏱ Zapsat odchod (příchod " + todayRecord.checkin + ")" : "▶ Zapsat příchod"}
            </button>
          </div>

          {/* Ruční zadání */}
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 12, fontSize: 13 }}>✏️ Ruční záznam</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr auto", gap: 10, alignItems: "end" }}>
              <div><label style={S.label}>Datum</label><input type="date" style={S.input} value={manualDate} onChange={e => setManualDate(e.target.value)} /></div>
              <div><label style={S.label}>Příchod</label><input type="time" style={S.input} value={manualIn} onChange={e => setManualIn(e.target.value)} /></div>
              <div><label style={S.label}>Odchod</label><input type="time" style={S.input} value={manualOut} onChange={e => setManualOut(e.target.value)} /></div>
              <div>
                <label style={S.label}>Zakázka</label>
                <SearchSelect
                  style={{ marginBottom: 0 }}
                  options={activeContractOpts.map(c => ({ id: c.id, label: c.name }))}
                  value={manualContractId}
                  placeholder="— bez zakázky — (piš pro hledání)"
                  onChange={val => setManualContractId(val)} />
              </div>
              <button style={{ ...S.btn(), marginBottom: 0 }} onClick={addManual}>Uložit</button>
            </div>
          </div>

          {/* Moje žádosti o zápis/úpravu po uzamčení měsíce */}
          {!isHR && myRequests.length > 0 && (
            <div style={{ ...S.card, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 12, fontSize: 13 }}>📩 Moje žádosti o úpravu</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {myRequests.map(req => {
                  const reqColor = req.status === "schváleno" ? "#34d399" : req.status === "zamítnuto" ? "#ef4444" : "#f59e0b";
                  return (
                    <div key={req.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "6px 0", borderBottom: "1px solid #e2e8f0" }}>
                      <span>{fmtDateCz(req.date)} · {req.checkin || "—"}–{req.checkout || "—"}</span>
                      <span style={{ color: reqColor, fontWeight: 700 }}>{req.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ŽÁDOSTI O ZÁPIS/ÚPRAVU PO UZAMČENÍ MĚSÍCE — jen admin */}
      {attTab === "zadosti" && (
        <div>
          {pendingRequests.length === 0 ? (
            <div style={{ color: "#334155", fontSize: 13 }}>Žádné čekající žádosti.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pendingRequests.map(req => {
                const emp = employees.find(e => e.id === req.employee_id);
                const contract = contractOpts.find(c => c.id === req.contract_id);
                return (
                  <div key={req.id} style={{ ...S.card, marginBottom: 0 }}>
                    <div style={{ fontWeight: 700, color: "#1A1A1A" }}>{emp?.name || "?"} · {fmtDateCz(req.date)}</div>
                    <div style={{ fontSize: 12, color: "#475569", margin: "4px 0" }}>
                      {req.checkin || "—"}–{req.checkout || "—"} · {contract ? contract.name : "bez zakázky"} · {req.target_attendance_id ? "úprava existujícího záznamu" : "nový záznam"}
                    </div>
                    {req.activity && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Popis: {req.activity}</div>}
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Důvod: {req.reason}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={{ ...S.btn("#34d399"), padding: "6px 14px", fontSize: 12 }} onClick={() => approveRequest(req)}>✓ Schválit</button>
                      <button style={{ ...S.btn("#ef4444"), padding: "6px 14px", fontSize: 12 }} onClick={() => rejectRequest(req)}>✕ Zamítnout</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* LIST 2: HARMONOGRAM */}
      {attTab === "harmonogram" && (() => {
        const hlRecs = harmonogramRecs.filter(r =>
          r.employee_id === effectiveEmpId && r.date === timelineDate
        ).sort((a,b) => (a.checkin||"").localeCompare(b.checkin||""));
        return (
          <div>
            {/* Hlavička — výběr dne + zaměstnance (HR) */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>🗓 Harmonogram dne</div>
              <input type="date" style={{ ...S.input, marginBottom: 0, width: 160 }} value={timelineDate} onChange={e => setTimelineDate(e.target.value)} />
              {isHR && (
                <select style={{ ...S.select, marginBottom: 0, width: 180 }} value={viewEmpId} onChange={e => setViewEmpId(Number(e.target.value))}>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              )}
            </div>

            {/* Přidat blok */}
            {(
              <div style={{ ...S.card, marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 13, marginBottom: 12 }}>➕ Přidat blok</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr 2fr auto", gap: 8, alignItems: "end" }}>
                  <div><label style={{ ...S.label, fontSize: 11 }}>Od</label><input type="time" style={{ ...S.input, marginBottom: 0, fontSize: 12 }} value={tlIn} onChange={e => setTlIn(e.target.value)} /></div>
                  <div><label style={{ ...S.label, fontSize: 11 }}>Do</label><input type="time" style={{ ...S.input, marginBottom: 0, fontSize: 12 }} value={tlOut} onChange={e => setTlOut(e.target.value)} /></div>
                  <div>
                    <label style={{ ...S.label, fontSize: 11 }}>Zakázka</label>
                    <SearchSelect
                      style={{ marginBottom: 0 }}
                      options={activeContractOpts.map(c => ({ id: c.id, label: c.name }))}
                      value={tlContractId}
                      placeholder="— bez zakázky —"
                      onChange={val => setTlContractId(val)} />
                  </div>
                  <div style={{ position: "relative" }}>
                    <label style={{ ...S.label, fontSize: 11 }}>Popis činnosti</label>
                    <input type="text" style={{ ...S.input, marginBottom: 0, fontSize: 12 }} placeholder="Název nebo popis..."
                      value={tlActivity}
                      onChange={e => {
                        const v = e.target.value; setTlActivity(v);
                        setTlSuggestions(v.length > 1 ? blockTemplates.filter(b => b.name.toLowerCase().includes(v.toLowerCase())).slice(0,6) : []);
                      }}
                      onBlur={() => setTimeout(() => setTlSuggestions([]), 150)} />
                    {tlSuggestions.length > 0 && (
                      <div style={{ position: "absolute", zIndex: 200, background: "#0E3B5E", border: "1px solid #334155", borderRadius: 8, width: "100%", top: "100%", boxShadow: "0 4px 16px #0006", maxHeight: 220, overflowY: "auto" }}>
                        {tlSuggestions.map(b => (
                          <div key={b.id} style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #0f172a" }}
                            onMouseDown={() => { setTlActivity(b.description || b.name); setTlSuggestions([]); }}>
                            <div style={{ fontWeight: 700, color: "#fff", fontSize: 13 }}>{b.name}</div>
                            {b.description && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.description}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button style={{ ...S.btn(), marginBottom: 0, padding: "8px 14px", fontSize: 12 }}
                    onClick={async () => {
                      if (!tlIn) return;
                      const cid = tlContractId ? Number(tlContractId) : null;
                      const { data: row, error } = await supabase.from("harmonogram")
                        .insert({ employee_id: effectiveEmpId, date: timelineDate, checkin: tlIn, checkout: tlOut||null, activity: tlActivity||null, contract_id: cid, created_by: currentUser.name })
                        .select().single();
                      if (error) { alert("Chyba při ukládání: " + error.message); return; }
                      if (row) setHarmonogramRecs([...harmonogramRecs, row]);
                      setTlIn(""); setTlOut(""); setTlActivity(""); setTlContractId("");
                    }}>+ Přidat</button>
                </div>
              </div>
            )}

            {/* Časová osa */}
            {hlRecs.length === 0 ? (
              <div style={{ ...S.card, color: "#334155", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
                Žádné bloky pro {timelineDate}
                {(currentUser.role === "admin" || currentUser.name === "Šarlota Jurenková") ? " — přidejte první blok výše" : ""}
              </div>
            ) : (
              <div style={{ ...S.card }}>
                <div style={{ position: "relative", paddingLeft: 72 }}>
                  {(() => {
                    const allTimes = hlRecs.flatMap(r => [r.checkin, r.checkout].filter(Boolean).map(t => { const [h,m]=t.split(":").map(Number); return h*60+m; }));
                    const minT = Math.max(0, (allTimes.length ? Math.min(...allTimes) : 6*60) - 30);
                    const maxT = Math.min(23*60, (allTimes.length ? Math.max(...allTimes) : 18*60) + 30);
                    const totalMin = maxT - minT || 60;
                    const px = Math.max(300, hlRecs.length * 80);
                    const toY = (t) => { const [h,m]=t.split(":").map(Number); return ((h*60+m - minT) / totalMin) * px; };
                    const hours = [];
                    for (let h = Math.floor(minT/60); h <= Math.ceil(maxT/60); h++) {
                      if (h >= 0 && h <= 23) hours.push({ h, y: ((h*60 - minT) / totalMin) * px });
                    }
                    const colors = ["#6366f1","#34d399","#f59e0b","#f87171","#38bdf8"];
                    return (
                      <div style={{ position: "relative", height: px + 40 }}>
                        {hours.map(({ h, y }) => (
                          <div key={h} style={{ position: "absolute", left: -72, right: 0, top: y + 12, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: "#475569", minWidth: 38, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pad(h)}:00</span>
                            <div style={{ flex: 1, borderTop: "1px dashed #e2e8f0" }} />
                          </div>
                        ))}
                        {hlRecs.map((rec, ri) => {
                          if (!rec.checkin) return null;
                          const checkoutT = rec.checkout || rec.checkin;
                          const y1 = toY(rec.checkin);
                          const y2 = toY(checkoutT);
                          const h = calcEffectiveHours(rec.checkin, rec.checkout);
                          const contract = contractOpts.find(c => c.id === rec.contract_id);
                          const col = colors[ri % colors.length];
                          const blockH = Math.max(44, y2 - y1);
                          return (
                            <div key={rec.id} style={{ position: "absolute", left: 0, right: 0, top: y1 + 12 }}>
                              <div onClick={() => setExpandedActivity(expandedActivity === rec.id ? null : rec.id)}
                                style={{ background: col + "22", border: "2px solid " + col, borderRadius: 8, padding: "6px 10px",
                                  cursor: "pointer", minHeight: blockH, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                <div style={{ fontSize: 12, color: col, fontWeight: 700 }}>
                                  {rec.checkin.slice(0,5)} – {rec.checkout ? rec.checkout.slice(0,5) : "—"} {h > 0 ? "(" + fmtHours(h) + ")" : ""}
                                </div>
                                <div style={{ fontSize: 13, color: "#fff", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {rec.activity || "— bez popisu —"}
                                </div>
                                {contract && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>📋 {contract.name}</div>}
                              </div>
                              {expandedActivity === rec.id && (
                                <div style={{ ...S.card, marginTop: 6, borderLeft: "3px solid " + col, padding: "12px 16px" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                    <div>
                                      <div style={{ fontWeight: 700, color: "#fff", marginBottom: 6 }}>Detail bloku</div>
                                      <div style={{ fontSize: 13, color: "#475569" }}>🕐 {rec.checkin.slice(0,5)} – {rec.checkout ? rec.checkout.slice(0,5) : "—"} {h > 0 ? " · " + fmtHours(h) : ""}</div>
                                      {contract && <div style={{ fontSize: 13, color: "#2E9BE0", marginTop: 4 }}>📋 Zakázka: {contract.name}</div>}
                                      <div style={{ marginTop: 8, fontSize: 13, color: "#cbd5e1", whiteSpace: "pre-wrap" }}>{rec.activity || "Žádný popis"}</div>
                                    </div>
                                    {(currentUser.role === "admin" || currentUser.name === "Šarlota Jurenková") && (
                                      <button style={{ ...S.btn("#ef4444"), padding: "4px 10px", fontSize: 12 }} onClick={async () => {
                                        await supabase.from("harmonogram").delete().eq("id", rec.id);
                                        setHarmonogramRecs(harmonogramRecs.filter(r => r.id !== rec.id));
                                        setExpandedActivity(null);
                                      }}>✕ Smazat</button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* LIST 3: PŘEHLED */}
      {attTab === "prehled" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, margin: "16px 0 20px" }}>
            {[
              { label: "Dnes (bez pauzy)", value: todayEffective > 0 ? fmtHours(todayEffective) : todayRecord?.checkin ? "Probíhá..." : "—", color: "#2E9BE0" },
              { label: "Tento týden", value: fmtHours(weekHours), color: "#2E9BE0" },
              { label: viewMonth === "all" ? "Celkem" : monthLabel, value: fmtHours(viewMonth === "all" ? yearHours : viewMonthHours), color: "#34d399" },
              { label: "Tento rok", value: fmtHours(yearHours), color: "#f59e0b" },
            ].map(s => (
              <div key={s.label} style={S.statCard(s.color)}>
                <div style={S.statLabel}>{s.label}</div>
                <div style={{ ...S.statValue(s.color), fontSize: 20 }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button style={{ ...S.btn("#6366f1"), padding: "10px 22px", fontWeight: 700 }}
              onClick={() => { setReportEmpId(effectiveEmpId); setReportModal(true); }}>
              📄 Generovat výkaz práce
            </button>
          </div>

          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: "#1A1A1A", fontSize: 14 }}>Historie docházky</div>
              {isHR && <button onClick={syncCostEntries} style={{ ...S.btnGhost, fontSize: 12, padding: "5px 12px" }}>⚡ Sync do nákladů</button>}
            </div>
            <table style={S.table}>
              <thead><tr>{["Datum","Příchod","Odchod","Odpracováno","Zakázka","Popis",""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {empRecords.map(rec => {
                  const h = calcEffectiveHours(rec.checkin, rec.checkout);
                  const contract = contractOpts.find(c => c.id === rec.contract_id);
                  const mats = recordMaterials[rec.id];
                  return (
                    <React.Fragment key={rec.id}>
                      <tr>
                        <td style={S.td}>{fmtDateCz(rec.date)}</td>
                        <td style={{ ...S.td, color: "#34d399" }}>{rec.checkin || "—"}</td>
                        <td style={{ ...S.td, color: "#f59e0b" }}>{rec.checkout || <span style={{ color: "#334155" }}>probíhá</span>}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: "#fff" }}>{h > 0 ? fmtHours(h) : "—"}</td>
                        <td style={S.td}>
                          <SearchSelect
                            style={{ marginBottom: 0, minWidth: 160 }}
                            options={contractOpts.map(c => ({ id: c.id, label: c.name }))}
                            value={rec.contract_id || ""}
                            placeholder="—"
                            onChange={async val => {
                              const cid = val ? Number(val) : null;
                              if (!guardWrite(rec.date, { checkin: rec.checkin, checkout: rec.checkout, contract_id: cid, activity: rec.activity, target_attendance_id: rec.id })) return;
                              await supabase.from("attendance").update({ contract_id: cid }).eq("id", rec.id);
                              const updated = { ...rec, contract_id: cid };
                              setAttendance(attendance.map(a => a.id === rec.id ? updated : a));
                              if (cid && rec.checkout) await createCostEntryFromAttendance(updated, rec.checkout);
                            }} />
                        </td>
                        <td style={{ ...S.td, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rec.activity || "—"}</td>
                        <td style={S.td}>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button style={{ ...S.btnGhost, padding: "3px 8px", fontSize: 11 }}
                              onClick={async () => {
                                setEditRecord(editRecord === rec.id ? null : rec.id);
                                if (!mats) {
                                  const { data } = await supabase.from("attendance_materials").select("*").eq("attendance_id", rec.id).order("created_at");
                                  setRecordMaterials(prev => ({ ...prev, [rec.id]: data || [] }));
                                }
                              }}>✏️ detail</button>
                            {isHR && <button style={{ ...S.btn("#ef4444"), padding: "3px 8px", fontSize: 11 }} onClick={() => deleteRecord(rec.id)}>✕</button>}
                          </div>
                        </td>
                      </tr>
                      {editRecord === rec.id && (
                        <tr>
                          <td colSpan={7} style={{ ...S.td, background: "#0f172a" }}>
                            <div style={{ padding: "10px 0" }}>
                              <label style={S.label}>Popis práce</label>
                              <textarea style={{ ...S.input, minHeight: 60, resize: "vertical" }}
                                defaultValue={rec.activity || ""}
                                onBlur={async e => {
                                  if (!guardWrite(rec.date, { checkin: rec.checkin, checkout: rec.checkout, contract_id: rec.contract_id, activity: e.target.value, target_attendance_id: rec.id })) return;
                                  await supabase.from("attendance").update({ activity: e.target.value }).eq("id", rec.id);
                                  setAttendance(attendance.map(a => a.id === rec.id ? { ...a, activity: e.target.value } : a));
                                }} />
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginTop: 8, marginBottom: 6 }}>Materiál</div>
                              {mats && mats.length > 0 && (
                                <table style={{ width: "100%", fontSize: 12, marginBottom: 10 }}>
                                  <thead><tr>{["Položka","Množství","Jednotka"].map(h => <th key={h} style={{ ...S.th, fontSize: 11 }}>{h}</th>)}</tr></thead>
                                  <tbody>
                                    {mats.map(m => (
                                      <tr key={m.id}><td style={S.td}>{m.item_name}</td><td style={S.td}>{m.quantity}</td><td style={S.td}>{m.unit}</td></tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                              {(!mats || mats.length === 0) && <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 8 }}>Žádný materiál.</div>}
                              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                                <div style={{ position: "relative", flex: 2 }}>
                                  <input style={{ ...S.input, marginBottom: 0, fontSize: 12 }} placeholder="Název materiálu..."
                                    value={matItem}
                                    onChange={e => {
                                      const v = e.target.value; setMatItem(v);
                                      setMatSuggestions(v.length > 1 ? (products || []).filter(p => p.name.toLowerCase().includes(v.toLowerCase())).slice(0, 5) : []);
                                    }} />
                                  {matSuggestions.length > 0 && (
                                    <div style={{ position: "absolute", zIndex: 99, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, width: "100%", top: "100%", boxShadow: "0 4px 12px #0000001a" }}>
                                      {matSuggestions.map(p => {
                                        const img = p.image_url || (p.emas_code ? "https://www.emas.cz/media/cache/product_image/img/product/" + p.emas_code + ".jpg" : null);
                                        return (
                                          <div key={p.id} style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 7, borderBottom: "1px solid #f1f5f9" }}
                                            onClick={() => { setMatItem(p.name); setMatUnit(p.unit); setMatSuggestions([]); }}>
                                            {img ? <img src={img} alt="" onError={e => e.target.style.display="none"} style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4 }} /> : <span>📦</span>}
                                            <span style={{ color: "#1A1A1A" }}>{p.name}</span>
                                            <span style={{ color: "#94a3b8", marginLeft: "auto", fontSize: 11 }}>{p.stock} {p.unit}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                                <input style={{ ...S.input, marginBottom: 0, width: 70, fontSize: 12 }} type="number" placeholder="Qty" value={matQty} onChange={e => setMatQty(e.target.value)} />
                                <select style={{ ...S.select, marginBottom: 0, width: 70, fontSize: 12 }} value={matUnit} onChange={e => setMatUnit(e.target.value)}>
                                  {["ks","h","m","m²","m³","l","kg","t","den","pauš."].map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                                <button style={{ ...S.btn(), padding: "7px 14px", fontSize: 12, flexShrink: 0 }}
                                  onClick={() => addMaterial(rec.id, rec.contract_id)}>+ Přidat</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* LIST 4: ŠABLONY BLOKŮ */}
      {attTab === "sablony" && (currentUser.role === "admin" || currentUser.name === "Šarlota Jurenková") && (
        <div style={{ marginTop: 16 }}>
          {/* Přidat šablonu */}
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, fontSize: 14 }}>➕ Nová šablona bloku</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <label style={S.label}>Název bloku</label>
                <input style={S.input} placeholder="např. Montáž elektro" value={newTplName} onChange={e => setNewTplName(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Popis (vyplní se při výběru)</label>
                <input style={S.input} placeholder="Podrobný popis činnosti..." value={newTplDesc} onChange={e => setNewTplDesc(e.target.value)} />
              </div>
              <button style={{ ...S.btn(), marginBottom: 0 }} onClick={async () => {
                if (!newTplName.trim()) return;
                const { data: row } = await supabase.from("attendance_block_templates")
                  .insert({ name: newTplName.trim(), description: newTplDesc.trim() || null, created_by: currentUser.name })
                  .select().single();
                if (row) setBlockTemplates([...blockTemplates, row].sort((a,b) => a.name.localeCompare(b.name)));
                setNewTplName(""); setNewTplDesc("");
              }}>Uložit</button>
            </div>
          </div>

          {/* Seznam šablon */}
          <div style={S.card}>
            <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, fontSize: 14 }}>📋 Předdefinované bloky ({blockTemplates.length})</div>
            {blockTemplates.length === 0 ? (
              <div style={{ color: "#334155", fontSize: 13, textAlign: "center", padding: "20px 0" }}>Žádné šablony — přidejte první výše</div>
            ) : (
              <table style={S.table}>
                <thead><tr>{["Název","Popis","Vytvořil/a",""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {blockTemplates.map(b => (
                    <tr key={b.id}>
                      <td style={{ ...S.td, fontWeight: 700, color: "#fff" }}>{b.name}</td>
                      <td style={{ ...S.td, color: "#94a3b8", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.description || "—"}</td>
                      <td style={{ ...S.td, color: "#475569", fontSize: 12 }}>{b.created_by || "—"}</td>
                      <td style={S.td}>
                        <button style={{ ...S.btn("#ef4444"), padding: "3px 10px", fontSize: 12 }} onClick={async () => {
                          await supabase.from("attendance_block_templates").delete().eq("id", b.id);
                          setBlockTemplates(blockTemplates.filter(x => x.id !== b.id));
                        }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}


      {/* LIST 5: KALENDÁŘ */}
      {attTab === "kalendar" && (() => {
        const calMonth = viewMonth !== "all" ? viewMonth : fmt(new Date()).slice(0,7);
        const [calYear, calMonthNum] = calMonth.split("-").map(Number);
        const firstDay = new Date(calYear, calMonthNum - 1, 1);
        const daysInMonth = new Date(calYear, calMonthNum, 0).getDate();
        // 0=Ne,1=Po… shift to Mon-first
        const startDow = (firstDay.getDay() + 6) % 7;
        const kalIsHR = isHR || currentUser.name === "Šarlota Jurenková";
        const monthAttendance = attendance.filter(a =>
          a.date && a.date.startsWith(calMonth) &&
          (kalIsHR || (a.employeeId === effectiveEmpId || a.employee_id === effectiveEmpId))
        );
        const empColors = ["#6366f1","#10b981","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];
        const empColorMap = {};
        employees.forEach((e, i) => { empColorMap[e.id] = empColors[i % empColors.length]; });
        const dayLabel = new Date(calYear, calMonthNum - 1, 1).toLocaleString("cs-CZ", { month: "long", year: "numeric" });
        return (
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 16 }}>
              📆 {dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)}
            </div>
            {/* Legend */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {employees.map(e => (
                <span key={e.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#94a3b8" }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: empColorMap[e.id], display: "inline-block" }} />
                  {e.name}
                </span>
              ))}
            </div>
            {/* Calendar grid header */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
              {["Po","Út","St","Čt","Pá","So","Ne"].map(d => (
                <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#475569", padding: "4px 0" }}>{d}</div>
              ))}
            </div>
            {/* Calendar cells */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {Array.from({ length: startDow }).map((_, i) => <div key={"e"+i} />)}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateStr = calMonth + "-" + String(day).padStart(2,"0");
                const dayRecs = monthAttendance.filter(a => a.date === dateStr);
                const isToday = dateStr === fmt(new Date());
                const isSelected = kalDay === dateStr;
                const dow = (new Date(dateStr).getDay() + 6) % 7; // Mon=0
                return (
                  <div key={day}
                    onClick={() => setKalDay(isSelected ? null : dateStr)}
                    style={{
                      background: isSelected ? "#1e3a5f" : isToday ? "#0f2d47" : "#0f172a",
                      border: isSelected ? "1.5px solid #3b82f6" : isToday ? "1.5px solid #2E9BE055" : "1px solid #e2e8f0",
                      borderRadius: 8,
                      padding: "6px 4px",
                      cursor: dayRecs.length > 0 ? "pointer" : "default",
                      minHeight: 56,
                    }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: dow >= 5 ? "#64748b" : "#94a3b8", textAlign: "right", marginBottom: 4 }}>{day}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center" }}>
                      {dayRecs.map(r => {
                        const emp = employees.find(e => e.id === (r.employee_id || r.employeeId));
                        if (!emp) return null;
                        return (
                          <span key={r.id} title={emp.name} style={{
                            width: 18, height: 18, borderRadius: "50%",
                            background: empColorMap[emp.id] || "#475569",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 8, fontWeight: 700, color: "#fff",
                          }}>{emp.name.charAt(0)}</span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Day detail */}
            {kalDay && (() => {
              const dayRecs = monthAttendance.filter(a => a.date === kalDay);
              return (
                <div style={{ marginTop: 16, background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 12, padding: "16px 20px" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#93c5fd", marginBottom: 12 }}>
                    {new Date(kalDay).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })}
                    {" · "}
                    <span style={{ color: "#475569", fontWeight: 400 }}>{dayRecs.length} záznamů</span>
                  </div>
                  {dayRecs.length === 0 ? (
                    <div style={{ color: "#475569", fontSize: 13 }}>Žádné záznamy pro tento den.</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>{["Zaměstnanec","Příchod","Odchod","Hodiny","Zakázka","Činnost"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "4px 10px", fontSize: 11, color: "#475569", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {dayRecs.map(r => {
                          const emp = employees.find(e => e.id === (r.employee_id || r.employeeId));
                          const h = calcHours(r.checkin, r.checkout);
                          const contract = contractOpts.find(c => c.id === r.contract_id);
                          return (
                            <tr key={r.id}>
                              <td style={{ padding: "6px 10px", fontSize: 13, color: "#fff", fontWeight: 600 }}>
                                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: empColorMap[emp?.id] || "#475569", marginRight: 6 }} />
                                {emp?.name || "—"}
                              </td>
                              <td style={{ padding: "6px 10px", fontSize: 13, color: "#34d399" }}>{r.checkin || "—"}</td>
                              <td style={{ padding: "6px 10px", fontSize: 13, color: "#f59e0b" }}>{r.checkout || <span style={{ color: "#475569" }}>probíhá</span>}</td>
                              <td style={{ padding: "6px 10px", fontSize: 13, color: "#fff", fontWeight: 700 }}>{h > 0 ? fmtHours(h) : "—"}</td>
                              <td style={{ padding: "6px 10px", fontSize: 12, color: "#94a3b8" }}>{contract?.name || "—"}</td>
                              <td style={{ padding: "6px 10px", fontSize: 12, color: "#94a3b8", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.activity || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* LIST 6: SOUPIS PRÁCE */}
      {attTab === "soupis" && (() => {
        const calMonth = viewMonth !== "all" ? viewMonth : fmt(new Date()).slice(0,7);
        const filtered = attendance.filter(a => {
          const monthMatch = viewMonth === "all" || (a.date && a.date.startsWith(calMonth));
          const empMatch = soupisEmpId === "vše" || String(a.employeeId || a.employee_id) === String(soupisEmpId);
          return monthMatch && empMatch;
        }).sort((a, b) => b.date?.localeCompare(a.date) || 0);
        const totalH = filtered.reduce((s, r) => s + calcHours(r.checkin, r.checkout), 0);
        const monthNames = ["","Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"];
        const generateSoupisPDF = () => {
          const empObj = soupisEmpId !== "vše" ? employees.find(e => String(e.id) === String(soupisEmpId)) : null;
          const [y, m] = calMonth.split("-").map(Number);
          const rows = filtered.map(r => {
            const emp = employees.find(e => e.id === (r.employeeId || r.employee_id));
            const h = calcHours(r.checkin, r.checkout);
            const contract = contractOpts.find(c => c.id === r.contract_id);
            return "<tr><td>" + fmtDateCz(r.date) + "</td><td>" + (emp?.name || "—") + "</td><td>" + (r.checkin||"—") + "</td><td>" + (r.checkout||"—") + "</td><td><strong>" + fmtHours(h) + "</strong></td><td>" + (contract?.name||"—") + "</td><td>" + (r.activity||"—") + "</td></tr>";
          }).join("");
          const totalRow = "<tr class='total'><td colspan='4'>Celkem</td><td><strong>" + fmtHours(totalH) + "</strong></td><td colspan='2'>" + filtered.length + " záznamů</td></tr>";
          const title = empObj ? empObj.name : "Všichni zaměstnanci";
          const period = viewMonth !== "all" ? monthNames[m] + " " + y : "Celé období";
          const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Soupis práce</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;color:#555;font-weight:normal;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin-top:16px}th{background:#0E3B5E;color:#fff;padding:8px 12px;text-align:left;font-size:12px}td{padding:7px 12px;border-bottom:1px solid #e2e8f0;font-size:12px}tr:nth-child(even) td{background:#f8fafc}tr.total td{font-weight:bold;background:#e0f2fe;border-top:2px solid #0284c7}@media print{body{padding:16px}}</style></head><body><h1>Soupis práce</h1><h2>" + title + " · " + period + "</h2><table><thead><tr><th>Datum</th><th>Zaměstnanec</th><th>Příchod</th><th>Odchod</th><th>Odprac.</th><th>Zakázka</th><th>Činnost</th></tr></thead><tbody>" + rows + totalRow + "</tbody></table><script>window.onload=function(){window.print();}<\/script></body></html>";
          const win = window.open("", "_blank");
          win.document.write(html);
          win.document.close();
        };
        return (
          <div>
            {/* Filters + PDF button */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
              {isHR && (
                <select style={{ ...S.select, marginBottom: 0, width: 180 }} value={soupisEmpId} onChange={e => setSoupisEmpId(e.target.value)}>
                  <option value="vše">Všichni zaměstnanci</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              )}
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 13, color: "#475569" }}>
                Celkem: <strong style={{ color: "#fff" }}>{fmtHours(totalH)}</strong> · {filtered.length} záznamů
              </div>
              <button style={{ ...S.btn("#6366f1"), padding: "8px 18px", fontWeight: 700 }} onClick={generateSoupisPDF}>
                📄 Generovat PDF
              </button>
            </div>
            {filtered.length === 0 ? (
              <div style={{ color: "#475569", fontSize: 13 }}>Žádné záznamy pro zadané filtry.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>{["Datum","Zaměstnanec","Příchod","Odchod","Hodiny","Zakázka","Činnost"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "7px 12px", fontSize: 11, color: "#475569", fontWeight: 700, borderBottom: "1.5px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const emp = employees.find(e => e.id === (r.employeeId || r.employee_id));
                      const h = calcHours(r.checkin, r.checkout);
                      const contract = contractOpts.find(c => c.id === r.contract_id);
                      return (
                        <tr key={r.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "6px 12px", fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap" }}>{fmtDateCz(r.date)}</td>
                          <td style={{ padding: "6px 12px", fontSize: 13, color: "#fff", fontWeight: 600 }}>{emp?.name || "—"}</td>
                          <td style={{ padding: "6px 12px", fontSize: 13, color: "#34d399" }}>{r.checkin || "—"}</td>
                          <td style={{ padding: "6px 12px", fontSize: 13, color: "#f59e0b" }}>{r.checkout || <span style={{ color: "#475569" }}>probíhá</span>}</td>
                          <td style={{ padding: "6px 12px", fontSize: 13, color: "#fff", fontWeight: 700 }}>{h > 0 ? fmtHours(h) : "—"}</td>
                          <td style={{ padding: "6px 12px", fontSize: 12, color: "#94a3b8" }}>{contract?.name || "—"}</td>
                          <td style={{ padding: "6px 12px", fontSize: 12, color: "#94a3b8", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.activity || "—"}</td>
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: "2px solid #1e3a5f" }}>
                      <td colSpan={4} style={{ padding: "8px 12px", fontSize: 13, color: "#475569", fontWeight: 600 }}>Celkem</td>
                      <td style={{ padding: "8px 12px", fontSize: 13, color: "#6366f1", fontWeight: 700 }}>{fmtHours(totalH)}</td>
                      <td colSpan={2} style={{ padding: "8px 12px", fontSize: 12, color: "#475569" }}>{filtered.length} záznamů</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      </div>{/* END TAB CONTENT PANEL */}

      {/* MODAL: VÝKAZ PRÁCE */}
      {reportModal && (
        <div style={{ position: "fixed", inset: 0, background: "#0009", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#0E3B5E", borderRadius: 16, padding: "28px 32px", minWidth: 360, maxWidth: 460, width: "100%" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 20 }}>📄 Generovat výkaz práce</div>
            {isHR && (
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Zaměstnanec</label>
                <select style={S.select} value={reportEmpId || effectiveEmpId} onChange={e => setReportEmpId(Number(e.target.value))}>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div>
                <label style={S.label}>Rok</label>
                <select style={S.select} value={reportYear} onChange={e => setReportYear(Number(e.target.value))}>
                  {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Měsíc</label>
                <select style={S.select} value={reportMonth} onChange={e => setReportMonth(Number(e.target.value))}>
                  {["Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"].map((m,i) => (
                    <option key={i+1} value={i+1}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button style={{ ...S.btn("#334155"), padding: "9px 20px" }} onClick={() => setReportModal(false)}>Zrušit</button>
              <button style={{ ...S.btn("#6366f1"), padding: "9px 20px", fontWeight: 700 }} onClick={generateReport}>📥 Generovat & Tisknout</button>
              <button style={{ ...S.btn("#34d399"), padding: "9px 20px", fontWeight: 700 }} onClick={signReportDigitally}>✍️ Podepsat digitálně</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PODPIS DOCHÁZKY ZA MĚSÍC */}
      {monthSignModal && (
        <div style={{ position: "fixed", inset: 0, background: "#0009", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#0E3B5E", borderRadius: 16, padding: "28px 32px", minWidth: 360, maxWidth: 460, width: "100%" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 4 }}>✍️ {monthSignModal.doc.title}</div>
            <div style={{ fontSize: 12, color: "#93c5fd", marginBottom: 16 }}>Podpisem odsouhlasíš docházku za tento měsíc — poté už do něj nepůjde přímo zapisovat, jen žádostí ke schválení.</div>
            <SignFlow currentUser={currentUser} onSigned={onMonthSigned} />
            <button onClick={() => setMonthSignModal(null)} style={{ ...S.btn("#334155"), marginTop: 16, padding: "8px 18px" }}>Zrušit</button>
          </div>
        </div>
      )}

      {/* MODAL: ŽÁDOST O ZÁPIS/ÚPRAVU PO UZAMČENÍ MĚSÍCE */}
      {requestModal && (
        <div style={{ position: "fixed", inset: 0, background: "#0009", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#0E3B5E", borderRadius: 16, padding: "28px 32px", minWidth: 360, maxWidth: 460, width: "100%" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 4 }}>📩 Žádost o zápis/úpravu záznamu</div>
            <div style={{ fontSize: 12, color: "#93c5fd", marginBottom: 16 }}>Měsíc {fmtDateCz(requestModal.date)} je už odsouhlasený a uzamčený. Návrh záznamu pošli ke schválení administrátorovi.</div>
            <label style={S.label}>Datum</label>
            <input style={{ ...S.input, opacity: 0.7 }} value={requestModal.date} disabled />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={S.label}>Příchod</label><input type="time" style={S.input} value={requestModal.checkin} onChange={e => setRequestModal({ ...requestModal, checkin: e.target.value })} /></div>
              <div><label style={S.label}>Odchod</label><input type="time" style={S.input} value={requestModal.checkout} onChange={e => setRequestModal({ ...requestModal, checkout: e.target.value })} /></div>
            </div>
            <label style={S.label}>Zakázka</label>
            <select style={S.select} value={requestModal.contract_id || ""} onChange={e => setRequestModal({ ...requestModal, contract_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {(contracts || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label style={S.label}>Popis práce</label>
            <textarea style={{ ...S.input, minHeight: 50 }} value={requestModal.activity || ""} onChange={e => setRequestModal({ ...requestModal, activity: e.target.value })} />
            <label style={S.label}>Důvod žádosti</label>
            <textarea style={{ ...S.input, minHeight: 60 }} value={requestModal.reason} onChange={e => setRequestModal({ ...requestModal, reason: e.target.value })} placeholder="Proč se záznam přidává/upravuje dodatečně..." />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <button style={{ ...S.btn("#334155"), padding: "9px 20px" }} onClick={() => setRequestModal(null)}>Zrušit</button>
              <button style={{ ...S.btn("#6366f1"), padding: "9px 20px", fontWeight: 700 }} onClick={submitChangeRequest}>Odeslat žádost</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── EMPTY ────────────────────────────────────────────────────────────────────

function Empty() {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
      <div style={{ fontSize: 14 }}>Žádné záznamy</div>
    </div>
  );
}

// ─── PROFIL ───────────────────────────────────────────────────────────────────

function Profile({ currentUser, attendance, employees }) {
  const myName = currentUser?.name || "";
  const emp = employees.find(e => e.name === myName) || {};
  const nowM = new Date().toISOString().slice(0, 7);
  const myAtt = attendance.filter(a => (a.employee_id === currentUser.employeeId || a.employee_name === myName));
  const thisMonth = myAtt.filter(a => a.date && a.date.startsWith(nowM));
  const totalH = thisMonth.reduce((s, r) => s + calcEffectiveHours(r.checkin, r.checkout), 0);

  return (
    <div>
      <div style={S.header}><h1 style={S.h1}>Můj profil</h1></div>
      <div style={{ ...S.grid2, marginBottom: 20 }}>
        <div style={S.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#2E9BE0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#fff", fontWeight: 800 }}>{getInitial(myName)}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, color: "#1A1A1A" }}>{myName}</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>{currentUser.role}</div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {emp.position && <div style={{ fontSize: 13, color: "#475569" }}><strong>Pozice:</strong> {emp.position}</div>}
            {emp.email && <div style={{ fontSize: 13, color: "#475569" }}><strong>Email:</strong> {emp.email}</div>}
            {emp.phone && <div style={{ fontSize: 13, color: "#475569" }}><strong>Telefon:</strong> {emp.phone}</div>}
          </div>
        </div>
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 14 }}>Statistiky tento měsíc</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={S.statCard("#2E9BE0")}><div style={S.statLabel}>Odpracováno</div><div style={S.statValue("#2E9BE0")}>{fmtHours(totalH)}</div></div>
            <div style={S.statCard("#34d399")}><div style={S.statLabel}>Docházka</div><div style={S.statValue("#34d399")}>{thisMonth.length} dní</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KNIHA JÍZD ──────────────────────────────────────────────────────────────

// ─── OPRÁVNĚNÍ — kdo vidí jaké záložky a kdo smí zapisovat km ────────────────
function PermissionsPanel() {
  const [profiles, setProfiles] = useState([]);
  const [perms, setPerms] = useState({}); // profile_id -> { can_edit_km, nav_override }
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setLoading(true);
    const [{ data: pr }, { data: pe }] = await Promise.all([
      supabase.from("profiles").select("*").order("name"),
      supabase.from("user_permissions").select("*"),
    ]);
    setProfiles(pr || []);
    const map = {};
    (pe || []).forEach(p => { map[p.profile_id] = p; });
    setPerms(map);
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  const changeRole = async (profileId, role) => {
    setSavingId(profileId);
    await supabase.from("profiles").update({ role }).eq("id", profileId);
    setProfiles(ps => ps.map(p => p.id === profileId ? { ...p, role } : p));
    setSavingId(null);
  };

  const upsertPerm = async (profileId, patch) => {
    setSavingId(profileId);
    const current = perms[profileId] || { profile_id: profileId, can_edit_km: false, nav_override: null };
    const next = { ...current, ...patch };
    await supabase.from("user_permissions").upsert(next);
    setPerms(m => ({ ...m, [profileId]: next }));
    setSavingId(null);
  };

  const toggleKm = (profile) => upsertPerm(profile.id, { can_edit_km: !(perms[profile.id]?.can_edit_km) });

  const toggleNav = (profile, navId) => {
    const roleDefault = ROLES[profile.role]?.nav || [];
    const current = perms[profile.id]?.nav_override || roleDefault;
    const next = current.includes(navId) ? current.filter(n => n !== navId) : [...current, navId];
    upsertPerm(profile.id, { nav_override: next });
  };

  const resetNav = (profile) => upsertPerm(profile.id, { nav_override: null });

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Načítám…</div>;

  return (
    <div>
      <div style={S.header}>
        <h1 style={S.h1}>🔐 Oprávnění</h1>
      </div>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 20 }}>
        Nastav roli, kdo smí zapisovat kilometry v knize jízd, a které záložky menu daný člověk vidí (přepíše výchozí nastavení role).
      </p>
      {profiles.map(p => {
        const perm = perms[p.id];
        const roleDefault = ROLES[p.role]?.nav || [];
        const navSelected = perm?.nav_override || roleDefault;
        const jeVychozi = !perm?.nav_override;
        return (
          <div key={p.id} style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, color: "#1A1A1A", fontSize: 15, minWidth: 160 }}>{p.name}</div>
              <div>
                <label style={{ ...S.label, marginBottom: 2 }}>Role</label>
                <select style={{ ...S.select, marginBottom: 0, width: 160 }} value={p.role} onChange={e => changeRole(p.id, e.target.value)}>
                  {Object.keys(ROLES).map(r => <option key={r} value={r}>{ROLES[r].label}</option>)}
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#1A1A1A", cursor: "pointer", marginTop: 18 }}>
                <input type="checkbox" checked={!!perm?.can_edit_km} onChange={() => toggleKm(p)} />
                🚗 Zapisovat kilometry v knize jízd
              </label>
              {savingId === p.id && <span style={{ fontSize: 11, color: "#94a3b8" }}>Ukládám…</span>}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>
              Viditelné záložky {jeVychozi ? "(výchozí podle role)" : "(vlastní nastavení)"}
              {!jeVychozi && <button onClick={() => resetNav(p)} style={{ ...S.btnGhost, marginLeft: 10, padding: "2px 8px", fontSize: 11 }}>↺ vrátit výchozí</button>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {NAV.map(n => (
                <label key={n.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: navSelected.includes(n.id) ? "#1A1A1A" : "#94a3b8", background: navSelected.includes(n.id) ? "#eff6ff" : "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>
                  <input type="checkbox" checked={navSelected.includes(n.id)} onChange={() => toggleNav(p, n.id)} />
                  <i className={`ti ${n.icon}`} aria-hidden="true"></i> {n.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KnihaJizd({ currentUser, employees, contracts }) {
  const isHR = ["admin", "hr", "manager"].includes(currentUser?.role);
  const canEditKm = currentUser?.role === "admin" || !!currentUser?.canEditKm;
  const [logs, setLogs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [filterEmp, setFilterEmp] = useState(isHR ? "" : String(currentUser?.employeeId || ""));
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

  // form state
  const [fDate, setFDate] = useState(fmt(new Date()));
  const [fVehicleId, setFVehicleId] = useState("");
  const [fKmStart, setFKmStart] = useState("");
  const [fKmEnd, setFKmEnd] = useState("");
  const [fUjeteKm, setFUjeteKm] = useState("");

  // Vzájemné dopočítávání — kterékoli dvě ze tří polí (start / konec / ujeto)
  // dopočítají to třetí, aby se nemuselo počítat ručně.
  const onKmStartChange = (v) => {
    setFKmStart(v);
    if (v !== "" && fKmEnd !== "") setFUjeteKm(String(Math.max(0, Number(fKmEnd) - Number(v))));
  };
  const onKmEndChange = (v) => {
    setFKmEnd(v);
    if (fKmStart !== "") setFUjeteKm(String(Math.max(0, Number(v) - Number(fKmStart))));
    else if (fUjeteKm !== "") setFKmStart(String(Math.max(0, Number(v) - Number(fUjeteKm))));
  };
  const onUjeteKmChange = (v) => {
    setFUjeteKm(v);
    if (fKmEnd !== "") setFKmStart(String(Math.max(0, Number(fKmEnd) - Number(v))));
  };
  const [fContractId, setFContractId] = useState("");
  const [fNote, setFNote] = useState("");
  const [fEmpId, setFEmpId] = useState(String(currentUser?.employeeId || ""));
  const [saving, setSaving] = useState(false);

  // nové vozidlo
  const [newVName, setNewVName] = useState("");
  const [newVSpz, setNewVSpz] = useState("");
  const [savingV, setSavingV] = useState(false);

  const [localContracts, setLocalContracts] = useState([]);
  const contractList = (contracts && contracts.length > 0) ? contracts : localContracts;
  const [editKmLog, setEditKmLog] = useState(null); // {id, km_end}

  useEffect(() => {
    supabase.from("vehicles").select("*").order("name").then(({ data }) => setVehicles(data || []));
    supabase.from("contracts").select("id, name").order("name").then(({ data }) => setLocalContracts(data || []));
    loadLogs();
  }, [filterEmp, filterMonth]);

  const addVehicle = async () => {
    if (!newVName.trim()) return;
    setSavingV(true);
    const { data: row } = await supabase.from("vehicles").insert({ name: newVName.trim(), spz: newVSpz.trim() || null }).select().single();
    if (row) { setVehicles(v => [...v, row]); setFVehicleId(String(row.id)); }
    setNewVName(""); setNewVSpz("");
    setShowAddVehicle(false);
    setSavingV(false);
  };

  const selectedVehicle = vehicles.find(v => String(v.id) === String(fVehicleId));
  const fVehicle = selectedVehicle ? `${selectedVehicle.name}${selectedVehicle.spz ? " (" + selectedVehicle.spz + ")" : ""}` : "";

  const RATE_PER_KM = 6.5; // Kč/km (paušál)

  const addDopravaCost = async (log, kmTotal) => {
    if (!log.contract_id) return;
    await supabase.from("contract_cost_entries").insert({
      contract_id: log.contract_id,
      cost_type: "doprava",
      is_extra: false,
      date: log.date,
      description: `Doprava – ${log.vehicle} (${log.employee_name})`,
      quantity: kmTotal,
      unit: "km",
      unit_price_cost: RATE_PER_KM,
      unit_price_client: RATE_PER_KM,
      employee_id: log.employee_id,
    });
  };

  // editKmLog: { id, km_start, km_end } — doplnění kilometrů (jen kdo má canEditKm)
  const saveKm = async () => {
    if (!editKmLog) return;
    const kmStart = Number(editKmLog.km_start);
    const kmEnd = Number(editKmLog.km_end);
    const log = logs.find(l => l.id === editKmLog.id);
    if (!log || kmEnd <= kmStart) { alert("Konečný stav km musí být větší než počáteční."); return; }
    const kmTotal = kmEnd - kmStart;
    const melKmDrive = log.km_start != null && log.km_end != null;
    await supabase.from("vehicle_log").update({ km_start: kmStart, km_end: kmEnd, km_total: kmTotal }).eq("id", editKmLog.id);
    setLogs(logs.map(l => l.id === editKmLog.id ? { ...l, km_start: kmStart, km_end: kmEnd, km_total: kmTotal } : l));
    if (!melKmDrive) await addDopravaCost(log, kmTotal); // náklad na dopravu se založí až teď, při prvním doplnění km
    setEditKmLog(null);
  };

  const loadLogs = async () => {
    setLoading(true);
    let q = supabase.from("vehicle_log").select("*").order("date", { ascending: false });
    if (filterEmp) q = q.eq("employee_id", Number(filterEmp));
    if (filterMonth) q = q.gte("date", filterMonth + "-01").lte("date", filterMonth + "-31");
    const { data } = await q;
    setLogs(data || []);
    setLoading(false);
  };

  const saveLog = async () => {
    if (!fDate || !fVehicleId) { alert("Vyberte datum a vozidlo."); return; }
    let kmTotal = null;
    if (canEditKm) {
      if (!fKmStart || !fKmEnd) { alert("Zadejte počáteční i konečný stav km."); return; }
      kmTotal = Number(fKmEnd) - Number(fKmStart);
      if (kmTotal <= 0) { alert("Konečný stav km musí být větší než počáteční."); return; }
    }
    setSaving(true);
    const empId = Number(fEmpId) || currentUser?.employeeId;
    const empName = employees.find(e => e.id === empId)?.name || currentUser?.name || "";
    const contractName = contractList.find(c => c.id === Number(fContractId))?.name || null;
    const row = {
      employee_id: empId,
      employee_name: empName,
      date: fDate,
      vehicle: fVehicle,
      km_start: canEditKm ? Number(fKmStart) : null,
      km_end: canEditKm ? Number(fKmEnd) : null,
      km_total: kmTotal,
      contract_id: fContractId ? Number(fContractId) : null,
      contract_name: contractName,
      note: fNote || null,
    };
    const { data: inserted } = await supabase.from("vehicle_log").insert(row).select().single();
    if (inserted) {
      setLogs(prev => [inserted, ...prev]);
      if (canEditKm && fContractId) await addDopravaCost(inserted, kmTotal);
    }
    setFDate(fmt(new Date())); setFVehicleId(""); setFKmStart(""); setFKmEnd(""); setFUjeteKm("");
    setFContractId(""); setFNote("");
    setShowForm(false);
    setSaving(false);
  };

  const deleteLog = async (id) => {
    if (!window.confirm("Smazat záznam?")) return;
    await supabase.from("vehicle_log").delete().eq("id", id);
    setLogs(prev => prev.filter(l => l.id !== id));
  };

  const totalKm = logs.reduce((s, l) => s + (l.km_total || 0), 0);
  const totalCost = totalKm * 6.5;

  return (
    <div>
      <div style={S.header}>
        <h1 style={S.h1}>🚗 Kniha jízd</h1>
        <button style={S.btn()} onClick={() => setShowForm(!showForm)}>+ Přidat jízdu</button>
      </div>

      {/* Filtry */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input type="month" style={{ ...S.input, width: 160, marginBottom: 0 }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)} />
        {isHR && (
          <select style={{ ...S.select, width: 200, marginBottom: 0 }} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
            <option value="">— všichni zaměstnanci —</option>
            {(employees || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
      </div>

      {/* Statistiky */}
      <div style={{ ...S.grid3, marginBottom: 20 }}>
        <div style={S.statCard("#2E9BE0")}><div style={S.statLabel}>Celkem km</div><div style={S.statValue("#2E9BE0")}>{totalKm.toLocaleString("cs-CZ")} km</div></div>
        <div style={S.statCard("#F5821F")}><div style={S.statLabel}>Odhadované náklady</div><div style={S.statValue("#F5821F")}>{fmtKc(totalCost)}</div></div>
        <div style={S.statCard("#34d399")}><div style={S.statLabel}>Počet jízd</div><div style={S.statValue("#34d399")}>{logs.length}</div></div>
      </div>

      {/* Formulář */}
      {showForm && (
        <div style={{ ...S.card, marginBottom: 20, borderLeft: "3px solid #2E9BE0" }}>
          <div style={{ fontWeight: 700, color: "#1A1A1A", marginBottom: 14, fontSize: 14 }}>Nová jízda</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div><label style={S.label}>Datum</label><input type="date" style={S.input} value={fDate} onChange={e => setFDate(e.target.value)} /></div>
            <div>
              <label style={S.label}>Vozidlo</label>
              <div style={{ display: "flex", gap: 6 }}>
                <select style={{ ...S.select, marginBottom: 0, flex: 1 }} value={fVehicleId} onChange={e => setFVehicleId(e.target.value)}>
                  <option value="">— vyberte vozidlo —</option>
                  {[...new Map(vehicles.map(v => [v.id, v])).values()].map(v => <option key={v.id} value={v.id}>{v.name}{v.spz ? " (" + v.spz + ")" : ""}</option>)}
                </select>
                <button type="button" style={{ ...S.btnGhost, padding: "0 10px", marginBottom: 0, fontSize: 18, lineHeight: 1 }} onClick={() => setShowAddVehicle(true)} title="Přidat vozidlo">+</button>
              </div>
            </div>
            {isHR && (
              <div>
                <label style={S.label}>Zaměstnanec</label>
                <select style={S.select} value={fEmpId} onChange={e => setFEmpId(e.target.value)}>
                  {(employees || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {canEditKm ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
              <div><label style={S.label}>Stav km – start</label><input type="number" style={S.input} placeholder="0" value={fKmStart} onChange={e => onKmStartChange(e.target.value)} /></div>
              <div><label style={S.label}>Stav km – konec</label><input type="number" style={S.input} placeholder="0" value={fKmEnd} onChange={e => onKmEndChange(e.target.value)} /></div>
              <div>
                <label style={S.label}>Ujeto km</label>
                <input type="number" style={{ ...S.input, background: "#e0f2fe", color: "#0369a1", fontWeight: 700 }} placeholder="0" value={fUjeteKm} onChange={e => onUjeteKmChange(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Zakázka</label>
                <select style={S.select} value={fContractId} onChange={e => setFContractId(e.target.value)}>
                  <option value="">— bez zakázky —</option>
                  {contractList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={S.label}>Zakázka</label>
                <select style={S.select} value={fContractId} onChange={e => setFContractId(e.target.value)}>
                  <option value="">— bez zakázky —</option>
                  {contractList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Kilometry doplní Šárlota nebo Roman.</div>
            </div>
          )}
          <div><label style={S.label}>Poznámka</label><input style={S.input} placeholder="Účel jízdy..." value={fNote} onChange={e => setFNote(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={S.btn()} onClick={saveLog} disabled={saving}>{saving ? "Ukládám…" : "Uložit jízdu"}</button>
            <button style={S.btnGhost} onClick={() => setShowForm(false)}>Zrušit</button>
          </div>
        </div>
      )}

      {/* Modal: přidat vozidlo */}
      {showAddVehicle && (
        <div style={S.modal}>
          <div style={{ ...S.modalBox, width: 360 }}>
            <ModalHeader title="Přidat vozidlo" onClose={() => setShowAddVehicle(false)} />
            <div><label style={S.label}>Název vozidla *</label><input style={S.input} placeholder="např. IVECO Daily" value={newVName} onChange={e => setNewVName(e.target.value)} /></div>
            <div><label style={S.label}>SPZ</label><input style={S.input} placeholder="např. 1AB 2345" value={newVSpz} onChange={e => setNewVSpz(e.target.value)} /></div>
            <ModalActions onSave={addVehicle} onClose={() => setShowAddVehicle(false)} saveLabel={savingV ? "Ukládám…" : "Přidat vozidlo"} />
          </div>
        </div>
      )}

      {/* Tabulka */}
      <div style={S.card}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Načítám…</div>
        ) : logs.length === 0 ? (
          <Empty />
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                {["Datum", "Zaměstnanec", "Vozidlo", "Km start", "Km konec", "Km celkem", "Zakázka", "Poznámka", ""].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td style={{ ...S.td, fontWeight: 600, color: "#1A1A1A" }}>{fmtDateCz(l.date)}</td>
                  <td style={S.td}>{l.employee_name || "—"}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{l.vehicle}</td>
                  <td style={S.td}>
                    {editKmLog?.id === l.id ? (
                      <input type="number" style={{ ...S.input, marginBottom: 0, width: 80, padding: "3px 6px", fontSize: 13 }}
                        value={editKmLog.km_start} onChange={e => setEditKmLog({ ...editKmLog, km_start: e.target.value })} autoFocus />
                    ) : canEditKm ? (
                      <span onClick={() => setEditKmLog({ id: l.id, km_start: l.km_start ?? "", km_end: l.km_end ?? "" })} style={{ cursor: "pointer", borderBottom: "1px dashed #94a3b8" }} title="Klikněte pro úpravu">
                        {l.km_start != null ? l.km_start.toLocaleString("cs-CZ") : <span style={{ color: "#F5821F" }}>doplnit</span>}
                      </span>
                    ) : (
                      l.km_start != null ? l.km_start.toLocaleString("cs-CZ") : <span style={{ color: "#cbd5e1" }}>čeká na doplnění</span>
                    )}
                  </td>
                  <td style={S.td}>
                    {editKmLog?.id === l.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input type="number" style={{ ...S.input, marginBottom: 0, width: 80, padding: "3px 6px", fontSize: 13 }}
                          value={editKmLog.km_end} onChange={e => setEditKmLog({ ...editKmLog, km_end: e.target.value })} />
                        <button style={{ ...S.btn("#16a34a"), padding: "3px 8px", fontSize: 11 }} onClick={saveKm}>✓</button>
                        <button style={{ ...S.btnGhost, padding: "3px 8px", fontSize: 11 }} onClick={() => setEditKmLog(null)}>✕</button>
                      </div>
                    ) : canEditKm ? (
                      <span onClick={() => setEditKmLog({ id: l.id, km_start: l.km_start ?? "", km_end: l.km_end ?? "" })} style={{ cursor: "pointer", borderBottom: "1px dashed #94a3b8" }} title="Klikněte pro úpravu">
                        {l.km_end != null ? l.km_end.toLocaleString("cs-CZ") : <span style={{ color: "#F5821F" }}>doplnit</span>}
                      </span>
                    ) : (
                      l.km_end != null ? l.km_end.toLocaleString("cs-CZ") : <span style={{ color: "#cbd5e1" }}>čeká na doplnění</span>
                    )}
                  </td>
                  <td style={{ ...S.td, fontWeight: 700, color: "#2E9BE0" }}>{l.km_total != null ? l.km_total?.toLocaleString("cs-CZ") + " km" : <span style={{ color: "#F5821F" }}>probíhá</span>}</td>
                  <td style={S.td}>{l.contract_name ? <span style={S.tag("#2E9BE0")}>{l.contract_name}</span> : <span style={{ color: "#cbd5e1" }}>—</span>}</td>
                  <td style={{ ...S.td, color: "#64748b" }}>{l.note || "—"}</td>
                  <td style={S.td}>
                    {isHR && <button style={{ ...S.btn("#ef4444"), padding: "3px 8px", fontSize: 11 }} onClick={() => deleteLog(l.id)}>✕</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginName, setLoginName] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [employees, setEmployees] = useState([]);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginDirectory, setLoginDirectory] = useState([]); // dynamický seznam pro přihlášení (jméno/email) — doplňuje AUTH_USERS
  const [needsPassword, setNeedsPassword] = useState(false); // po kliknutí na pozvánku/reset z e-mailu
  const [newPass1, setNewPass1] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [passErr, setPassErr] = useState("");
  const [passSaving, setPassSaving] = useState(false);

  // login_directory je veřejně čitelné (i bez přihlášení), aby šlo podle jména/uživatelského
  // jména dohledat email pro přihlášení. Nový přístup se sem přidá automaticky z HR.
  useEffect(() => {
    supabase.from("login_directory").select("*").then(({ data }) => setLoginDirectory(data || []));
  }, []);

  // Sloučený seznam pro přihlášení: nově založení lidé z HR (login_directory) + původní pevný seznam
  const ALL_LOGIN_USERS = [
    ...AUTH_USERS,
    ...loginDirectory
      .filter(d => !AUTH_USERS.some(u => u.username === d.username))
      .map(d => ({ username: d.username, email: d.email, name: d.name, role: d.role || "employee" })),
  ];

  // Sestaví currentUser z profilu podle přihlášeného Supabase Auth uživatele
  const loadProfileUser = async (authUser) => {
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", authUser.id).single();
    const { data: perm } = await supabase.from("user_permissions").select("*").eq("profile_id", authUser.id).maybeSingle();
    const fallback = ALL_LOGIN_USERS.find(u => u.email.toLowerCase() === (authUser.email || "").toLowerCase());
    const role = profile?.role || fallback?.role || "employee";
    const user = {
      id: profile?.employee_id ?? authUser.id,
      authId: authUser.id,
      name: profile?.name || fallback?.name || authUser.email,
      role,
      employeeId: profile?.employee_id ?? null,
      vacationDays: profile?.vacation_days ?? 20,
      vacationUsed: profile?.vacation_used ?? 0,
      canEditKm: role === "admin" || !!perm?.can_edit_km,
      navOverride: perm?.nav_override || null,
    };
    setCurrentUser(user);
    return user;
  };

  useEffect(() => {
    // Odkaz z pozvánky/resetu hesla v e-mailu appku přesměruje s "type=invite"
    // nebo "type=recovery" v URL — appka pak místo přihlášení nabídne nastavení hesla.
    if (window.location.hash.includes("type=invite") || window.location.hash.includes("type=recovery")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNeedsPassword(true);
    }

    // Obnov session, pokud je uživatel pořád přihlášený (Supabase si token drží sám)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) await loadProfileUser(session.user);
      setAuthChecking(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setNeedsPassword(true);
      if (!session?.user) setCurrentUser(null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  const setOwnPassword = async () => {
    setPassErr("");
    if (!newPass1 || newPass1.length < 6) { setPassErr("Heslo musí mít alespoň 6 znaků."); return; }
    if (newPass1 !== newPass2) { setPassErr("Hesla se neshodují."); return; }
    setPassSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPass1 });
    if (error) { setPassErr("Nepodařilo se nastavit heslo: " + error.message); setPassSaving(false); return; }
    window.history.replaceState({}, "", window.location.pathname);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await loadProfileUser(session.user);
    setNeedsPassword(false);
    setNewPass1(""); setNewPass2(""); setPassSaving(false); setAuthChecking(false);
  };

  // employees se smí číst jen po přihlášení (RLS) — natáhni je až jakmile je currentUser hotový
  useEffect(() => {
    if (!currentUser) return;
    supabase.from("employees").select("*").then(({ data }) => { if (data) setEmployees(data); });
  }, [currentUser]);

  const handleLogin = async () => {
    setLoginErr("");
    const name = loginName.trim();
    if (!name || !loginPass) { setLoginErr("Zadejte jméno i heslo."); return; }

    const match = ALL_LOGIN_USERS.find(u => u.name.toLowerCase() === name.toLowerCase() || u.username.toLowerCase() === name.toLowerCase());
    if (!match) { setLoginErr("Zaměstnanec nenalezen."); return; }

    const { data, error } = await supabase.auth.signInWithPassword({ email: match.email, password: loginPass });
    if (error || !data?.user) { setLoginErr("Nesprávné heslo."); return; }

    await loadProfileUser(data.user);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  };

  if (needsPassword) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: "40px 24px", width: 360, maxWidth: "92vw", boxSizing: "border-box", boxShadow: "0 8px 40px #0000001a", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <ProudOSMark size={48} />
            <div style={{ fontWeight: 800, fontSize: 22, textAlign: "center" }}>
              <span style={{ color: "#2E9BE0" }}>Proud</span><span style={{ color: "#F5821F" }}>OS</span>
            </div>
          </div>
          <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", marginBottom: 24 }}>Vítej! Nastav si vlastní heslo pro přihlášení.</div>
          {passErr && <div style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>{passErr}</div>}
          <label style={S.label}>Nové heslo</label>
          <input type="password" style={S.input} value={newPass1} onChange={e => setNewPass1(e.target.value)} onKeyDown={e => e.key === "Enter" && setOwnPassword()} placeholder="alespoň 6 znaků" />
          <label style={S.label}>Nové heslo znovu</label>
          <input type="password" style={S.input} value={newPass2} onChange={e => setNewPass2(e.target.value)} onKeyDown={e => e.key === "Enter" && setOwnPassword()} placeholder="zopakujte heslo" />
          <button style={{ ...S.btn(), width: "100%", padding: 12, fontSize: 15, marginTop: 6 }} disabled={passSaving} onClick={setOwnPassword}>
            {passSaving ? "Ukládám…" : "Nastavit heslo a pokračovat"}
          </button>
        </div>
      </div>
    );
  }

  if (authChecking) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <ProudOSMark size={40} />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: "40px 24px", width: 360, maxWidth: "92vw", boxSizing: "border-box", boxShadow: "0 8px 40px #0000001a", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <ProudOSMark size={48} />
            <div style={{ fontWeight: 800, fontSize: 22, textAlign: "center" }}>
              <span style={{ color: "#2E9BE0" }}>Proud</span><span style={{ color: "#F5821F" }}>OS</span>
            </div>
          </div>
          <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", marginBottom: 28 }}>Přihlaste se do systému</div>
          {loginErr && <div style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>{loginErr}</div>}
          <label style={S.label}>Jméno</label>
          <input style={S.input} value={loginName} onChange={e => setLoginName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Vaše jméno" />
          <label style={S.label}>Heslo</label>
          <input type="password" style={S.input} value={loginPass} onChange={e => setLoginPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Heslo" />
          <button style={{ ...S.btn(), width: "100%", padding: 12, fontSize: 15, marginTop: 6 }} onClick={handleLogin}>Přihlásit se</button>
          <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8, textAlign: "center" }}>Rychlé přihlášení</div>
            {ALL_LOGIN_USERS.map(u => (
              <button key={u.username} onClick={() => { setLoginName(u.name); setLoginPass(""); }}
                style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", width: "100%", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <span style={{ fontSize: 12, color: "#1A1A1A", fontWeight: 500 }}>{u.name}</span>
                <span style={{ ...S.tag(ROLES[u.role]?.color || "#2E9BE0"), fontSize: 10 }}>{ROLES[u.role]?.label}</span>
              </button>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 12, e: 12, color: "#94a3b8" }}>© 2026 ProudOS</div>
        </div>
      </div>
    );
  }

  return <MainApp currentUser={currentUser} setCurrentUser={setCurrentUser} onLogout={handleLogout} />;
}
