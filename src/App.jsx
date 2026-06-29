import React, { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";
import Contracts from "./Contracts.jsx";

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
        <span style={{ color: "#1e293b", fontWeight: 700, fontSize: 13 }}>{CZ_MONTHS[view.month]} {view.year}</span>
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
                background: isSel ? "#2563eb" : isToday ? "#2563eb22" : "transparent",
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



// ─── AUTH & USERS ────────────────────────────────────────────────────────────

const USERS = [
  { id: 1, employeeId: 1, username: "roman",   password: "medvedelektro", role: "admin",    name: "Roman Jurenka",    vacationDays: 25, vacationUsed: 0 },
  { id: 5, employeeId: 5, username: "sarlota", password: "rozarka",       role: "employee", name: "Šarlota Jurenková", vacationDays: 20, vacationUsed: 0 },
  { id: 2, employeeId: 2, username: "vaclav",  password: "jajsemkral",    role: "employee", name: "Václav Jahn",      vacationDays: 20, vacationUsed: 0 },
  { id: 3, employeeId: 3, username: "david",   password: "autojecesta",   role: "employee", name: "David Winige",     vacationDays: 20, vacationUsed: 0 },
  { id: 4, employeeId: 4, username: "honza",   password: "mujusmev",      role: "employee", name: "Honza Vlček",      vacationDays: 20, vacationUsed: 0 },
];

const ROLES = {
  admin:    { label: "Administrátor", color: "#f87171", nav: ["dashboard","customers","deals","contracts","communication","tasks","invoices","warehouse","hr","projects","costs","reports","ai","attendance","calendar","knjiga","profile"] },
  manager:  { label: "Manažer",       color: "#f59e0b", nav: ["dashboard","customers","deals","contracts","communication","tasks","invoices","projects","costs","reports","ai","attendance","calendar","knjiga","profile"] },
  hr:       { label: "HR",            color: "#a78bfa", nav: ["dashboard","hr","costs","attendance","calendar","knjiga","profile"] },
  employee: { label: "Zaměstnanec",   color: "#60a5fa", nav: ["dashboard","attendance","calendar","knjiga","profile"] },
};

// Simulovaná docházka — záznamy příchod/odchod
const today = new Date();
const fmt = (d) => d.toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, "0");
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
const CAT_COLORS = { "Mzdy": "#2563eb", "Nájem": "#f59e0b", "Marketing": "#f87171", "IT & Software": "#60a5fa", "Logistika": "#34d399", "Ostatní": "#a78bfa" };
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
const STAGE_COLORS = { Nový: "#60a5fa", Jednání: "#f59e0b", Nabídka: "#a78bfa", Vyhráno: "#34d399", Prohráno: "#f87171" };
const TAG_COLORS = { VIP: "#f59e0b", Aktivní: "#34d399", Nový: "#60a5fa" };
const PRIO_COLORS = { Vysoká: "#f87171", Střední: "#f59e0b", Nízká: "#34d399" };
const INV_COLORS = { Zaplacena: "#34d399", Čeká: "#f59e0b", "Po splatnosti": "#f87171", Storno: "#64748b" };
const PROJ_COLORS = { Probíhá: "#2563eb", Plánováno: "#60a5fa", Dokončeno: "#34d399", Pozastaveno: "#f87171" };
const avatarColors = ["#2563eb", "#f59e0b", "#34d399", "#f87171", "#a78bfa", "#60a5fa"];

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "📊", group: "CRM" },
  { id: "customers", label: "Zákazníci", icon: "👥", group: "CRM" },
  { id: "deals", label: "Obchodní příp.", icon: "💼", group: "CRM" },
  { id: "communication", label: "Komunikace", icon: "💬", group: "CRM" },
  { id: "contracts", label: "Zakázky", icon: "🔧", group: "CRM" },
  { id: "tasks", label: "Úkoly", icon: "✅", group: "CRM" },
  { id: "invoices", label: "Fakturace", icon: "🧾", group: "ERP" },
  { id: "warehouse", label: "Sklad", icon: "📦", group: "ERP" },
  { id: "hr", label: "Zaměstnanci", icon: "👤", group: "ERP" },
  { id: "projects", label: "Projekty", icon: "🏗️", group: "ERP" },
  { id: "costs", label: "Náklady", icon: "📉", group: "ERP" },
  { id: "reports", label: "Reporty", icon: "📈", group: "Analytika" },
  { id: "ai", label: "AI Asistent", icon: "🤖", group: "Analytika" },
  { id: "attendance", label: "Docházka", icon: "🕐", group: "Osobní" },
  { id: "calendar", label: "Kalendář", icon: "📅", group: "Osobní" },
  { id: "knjiga", label: "Kniha jízd", icon: "🚗", group: "Osobní" },
  { id: "profile", label: "Můj profil", icon: "👤", group: "Osobní" },
];

// ─── STYLES ──────────────────────────────────────────────────────────────────

const S = {
  app: { fontFamily: "'DM Sans', sans-serif", background: "#f0f4f8", minHeight: "100vh", color: "#1e293b", display: "flex" },
  sidebar: (open) => ({ width: 220, background: "#1e293b", padding: "0", display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0, left: 0, overflowY: "auto", boxShadow: "2px 0 8px #0000001a", zIndex: 200, transition: "transform 0.25s ease" }),
  logo: { padding: "22px 20px 16px", fontSize: 19, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", borderBottom: "1px solid #334155" },
  logoA: { color: "#60a5fa" },
  logoB: { color: "#f97316" },
  groupLabel: { padding: "16px 20px 4px", fontSize: 10, color: "#64748b", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 },
  navItem: (a) => ({ padding: "9px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, fontSize: 13, fontWeight: 500, color: a ? "#fff" : "#94a3b8", background: a ? "#2563eb" : "transparent", borderLeft: a ? "3px solid #f97316" : "3px solid transparent", transition: "all 0.12s" }),
  main: { marginLeft: 220, padding: "28px 32px", flex: 1, minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  h1: { fontSize: 24, fontWeight: 700, color: "#1e293b", margin: 0 },
  btn: (c = "#2563eb") => ({ background: c, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  btnGhost: { background: "transparent", color: "#2563eb", border: "1px solid #2563eb", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
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
  search: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 13px", color: "#1e293b", fontSize: 13, outline: "none", width: 240 },
  modal: { position: "fixed", inset: 0, background: "#0007", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  modalBox: { background: "#ffffff", borderRadius: 16, padding: 28, width: 440, border: "1px solid #e2e8f0", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px #0000001a" },
  input: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", color: "#1e293b", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box", marginBottom: 10 },
  select: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", color: "#1e293b", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box", marginBottom: 10 },
  label: { fontSize: 11, color: "#64748b", marginBottom: 3, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" },
  avatar: (c) => ({ width: 34, height: 34, borderRadius: "50%", background: c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }),
  progress: (pct, c) => ({ height: 6, borderRadius: 3, background: "#e2e8f0", overflow: "hidden", position: "relative" }),
  progressBar: (pct, c) => ({ height: "100%", width: `${pct}%`, background: c, borderRadius: 3, transition: "width 0.4s" }),
  kanbanCol: { background: "#f8fafc", borderRadius: 12, padding: 14, minWidth: 170, flex: 1, border: "1px solid #e2e8f0" },
  kanbanCard: { background: "#ffffff", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #e2e8f0", boxShadow: "0 1px 3px #0000000a" },
  commItem: { display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #f1f5f9" },
  commDot: (t) => ({ width: 9, height: 9, borderRadius: "50%", background: t === "Email" ? "#2563eb" : t === "Hovor" ? "#16a34a" : "#f97316", marginTop: 4, flexShrink: 0 }),
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
                onMouseEnter={e => e.currentTarget.style.borderColor = "#2563eb"}
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
      <div style={{ fontWeight: 700, fontSize: 17, color: "#1e293b" }}>{title}</div>
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

function MainApp({ currentUser, setCurrentUser }) {
  const [tab, setTab] = useState("dashboard");
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

  const closeModal = () => setModal(null);

  // ── Load all data from Supabase ──
  useEffect(() => {
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
        supabase.from("attendance").select("*").order("id"),
        supabase.from("contracts").select("id, name, status, customer_id, code, address").order("name"),
        supabase.from("contract_cost_entries").select("id, employee_id, amount_cost, amount_client, contract_id, attendance_id").order("id"),
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
  const allowedTabs = ROLES[currentUser.role]?.nav || [];
  const visibleNav = NAV.filter(n => allowedTabs.includes(n.id));
  const groups = [...new Set(visibleNav.map(n => n.group))];

  const todayStr = fmt(new Date());
  const myEmpId = currentUser.employeeId;
  const todayRecord = attendance.find(a => a.employeeId === myEmpId && a.date === todayStr);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 16 }}>Firma<span style={{ color: "#2563eb" }}>CRM</span><span style={{ color: "#f97316" }}>+ERP</span></div>
        <div style={{ color: "#475569", fontSize: 14 }}>Načítám data z databáze...</div>
        <div style={{ marginTop: 20, display: "flex", gap: 6, justifyContent: "center" }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563eb", animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
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
    <div style={S.app}>
      <style>{`
        @media (max-width: 768px) {
          .hamburger-btn { display: flex !important; }
          .sidebar-close { display: flex !important; }
          .main-content { margin-left: 0 !important; padding: 60px 14px 24px !important; }
          .sidebar-nav { transform: translateX(-100%); }
          .sidebar-nav.open { transform: translateX(0); }
        }
        @media (min-width: 769px) {
          .sidebar-nav { transform: translateX(0) !important; }
        }
      `}</style>
      <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} style={{ display: "none", position: "fixed", top: 10, left: 10, zIndex: 300, background: "#1e293b", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 22, color: "#fff", alignItems: "center", justifyContent: "center" }}>☰</button>
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "#0007", zIndex: 150 }} />}

      {/* SIDEBAR */}
      <div className={`sidebar-nav${sidebarOpen ? " open" : ""}`} style={S.sidebar()}>
        <div style={{ ...S.logo, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Firma<span style={S.logoA}>CRM</span><span style={S.logoB}>+ERP</span></span>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} style={{ display: "none", background: "none", border: "none", color: "#94a3b8", fontSize: 22, cursor: "pointer", padding: 0 }}>✕</button>
        </div>

        {/* User info + role */}
        <div style={{ padding: "12px 16px", margin: "0 12px 8px", background: "#f8fafc", borderRadius: 10, border: "1px solid #1a2035" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }}>
              {getInitial(currentUser.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.name}</div>
              <span style={{ ...S.tag(ROLES[currentUser.role]?.color || "#2563eb"), fontSize: 10 }}>{ROLES[currentUser.role]?.label}</span>
            </div>
          </div>
          {/* Quick checkin */}
          {myEmpId && (
            <button onClick={checkin} style={{ ...S.btn(todayRecord?.checkin && !todayRecord?.checkout ? "#f59e0b" : todayRecord?.checkout ? "#34d399" : "#2563eb"), width: "100%", marginTop: 10, fontSize: 11, padding: "7px" }}>
              {todayRecord?.checkout ? `✓ Odchod ${todayRecord.checkout}` : todayRecord?.checkin ? `⏱ Zapsat odchod (${todayRecord.checkin})` : "▶ Zapsat příchod"}
            </button>
          )}
        </div>

        {groups.map(g => (
          <div key={g}>
            <div style={S.groupLabel}>{g}</div>
            {visibleNav.filter(n => n.group === g).map(n => (
              <div key={n.id} style={S.navItem(tab === n.id)} onClick={() => { setTab(n.id); setSearch(""); setSidebarOpen(false); }}>
                <span style={{ fontSize: 15 }}>{n.icon}</span> {n.label}
              </div>
            ))}
          </div>
        ))}

        {/* Notifikace + Logout */}
        <div style={{ marginTop: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => setTab("notifications")} style={{ ...S.btnGhost, width: "100%", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>🔔 Oznámení</span>
            {notifications.filter(n => !n.read && n.user_name === currentUser?.name).length > 0 && (
              <span style={{ background: "#f87171", borderRadius: 10, padding: "1px 7px", color: "#fff", fontSize: 10, fontWeight: 700 }}>
                {notifications.filter(n => !n.read && n.user_name === currentUser?.name).length}
              </span>
            )}
          </button>
          <button onClick={() => setCurrentUser(null)} style={{ ...S.btnGhost, width: "100%", fontSize: 12, color: "#f87171", borderColor: "#f8717133" }}>
            ← Odhlásit se
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
            />
        )}

        {/* ── ZÁKAZNÍCI ── */}
        {tab === "customers" && <Customers
          customers={customers} setCustomers={setCustomers}
          invoices={invoices} deals={deals} communication={communication}
          search={search} setSearch={setSearch}
          modal={modal} setModal={setModal} closeModal={closeModal}
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
          employees={employees} contracts={contracts} products={products}
        />}

        {tab === "calendar" && <CalendarModule
          currentUser={currentUser} employees={employees} contracts={contracts}
          customers={customers}
          calendarEvents={calendarEvents} setCalendarEvents={setCalendarEvents}
        />}

        {tab === "knjiga" && <KnihaJizd
          currentUser={currentUser} employees={employees} contracts={contracts}
        />}

        {tab === "profile" && <Profile
          currentUser={currentUser} attendance={attendance} employees={employees}
        />}

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
                <div key={n.id} style={{ ...S.card, borderLeft: `3px solid ${n.read ? "#1e293b" : "#2563eb"}`, padding: "14px 18px" }}>
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
      </div>
    </div>
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
  const nowM = new Date().toISOString().slice(0, 7); // "2026-06"
  const myAtt = attendance.filter(a =>
    (a.employee_id === currentUser.employeeId || a.employee_name === myName) &&
    a.checkin?.startsWith(nowM) && a.checkout
  );
  const hoursThisMonth = myAtt.reduce((s, a) => s + Math.max(0, calcHours(a.checkin, a.checkout) - 1), 0);

  // Odpracováno tento týden
  const startOfWeek = (() => {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.toISOString().slice(0, 10);
  })();
  const hoursThisWeek = myAtt.filter(a => a.checkin >= startOfWeek)
    .reduce((s, a) => s + Math.max(0, calcHours(a.checkin, a.checkout) - 1), 0);

  // Poslední záznamy docházky
  const recentAtt = [...myAtt].sort((a, b) => b.checkin.localeCompare(a.checkin)).slice(0, 5);

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
        <div style={S.statCard("#2563eb")}>
          <div style={S.statLabel}>📅 Odpracováno tento měsíc</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: "#2563eb", lineHeight: 1.1 }}>{Math.floor(hoursThisMonth)}</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>hodin ({fmtH(hoursThisMonth)})</div>
          <div style={{ fontSize: 11, color: "#334155", marginTop: 8 }}>{myAtt.length} směn tento měsíc</div>
        </div>

        {/* Hodiny tento týden */}
        <div style={S.statCard("#3b82f6")}>
          <div style={S.statLabel}>📆 Odpracováno tento týden</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: "#3b82f6", lineHeight: 1.1 }}>{Math.floor(hoursThisWeek)}</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>hodin ({fmtH(hoursThisWeek)})</div>
          <div style={{ fontSize: 11, color: "#334155", marginTop: 8 }}>
            {myAtt.filter(a => a.checkin >= startOfWeek).length} směn tento týden
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
              <span style={{ color: "#2563eb", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("tasks")}>Vše →</span>
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
                <input type="checkbox" checked={false} onChange={() => toggleTask(t.id)} style={{ accentColor: "#2563eb", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#1e293b" }}>{t.title}</div>
                  {t.due && <div style={{ fontSize: 11, color: "#475569" }}>📅 {t.due}</div>}
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
            <span style={{ color: "#2563eb", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("attendance")}>Vše →</span>
          </div>
          {recentAtt.length === 0
            ? <div style={{ color: "#334155", fontSize: 13 }}>Žádné záznamy</div>
            : recentAtt.map((a, i) => {
              const h = Math.max(0, calcHours(a.checkin, a.checkout) - 1);
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 10, borderBottom: i < recentAtt.length - 1 ? "1px solid #1a2035" : "none" }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#1e293b" }}>{new Date(a.checkin).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}</div>
                    <div style={{ fontSize: 11, color: "#475569" }}>
                      {a.checkin?.slice(11, 16)} – {a.checkout?.slice(11, 16)}
                      {a.contract_name && <span style={{ color: "#2563eb", marginLeft: 6 }}>· {a.contract_name}</span>}
                    </div>
                  </div>
                  <span style={S.badge("#2563eb")}>{fmtH(h)}</span>
                </div>
              );
            })
          }
        </div>
      </div>
    </>
  );
}

function Dashboard({ customers, deals, tasks, invoices, products, employees, projects,
  totalRevenue, pendingRevenue, overdueRevenue, lowStock, totalPayroll, activeProjects, costs, toggleTask, setTab }) {
  const totalCosts = costs.reduce((s, c) => s + c.amount, 0);
  const thisMonthCosts = costs.filter(c => c.date.startsWith("2026-04")).reduce((s, c) => s + c.amount, 0);
  const stats = [
    { label: "Zákazníci", value: customers.length, color: "#2563eb" },
    { label: "Zaplaceno (příjmy)", value: fmtKc(totalRevenue), color: "#34d399" },
    { label: "Náklady celkem", value: fmtKc(totalCosts), color: "#f87171" },
    { label: "Náklady tento měsíc", value: fmtKc(thisMonthCosts), color: "#f59e0b" },
    { label: "Produkty skladu", value: products.length, color: "#60a5fa" },
    { label: "Zaměstnanci", value: employees.length, color: "#a78bfa" },
    { label: "Aktivní projekty", value: activeProjects, color: "#34d399" },
    { label: "Mzdové náklady", value: fmtKc(totalPayroll), color: "#f59e0b" },
  ];

  return (
    <>
      <div style={S.header}>
        <h1 style={S.h1}>Dashboard</h1>
        <span style={{ color: "#475569", fontSize: 13 }}>Sobota, 11. dubna 2026</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {stats.map(s => (
          <div key={s.label} style={S.statCard(s.color)}>
            <div style={S.statLabel}>{s.label}</div>
            <div style={S.statValue(s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={S.grid2}>
        {/* Nejbližší úkoly */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
            Nejbližší úkoly <span style={{ color: "#2563eb", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("tasks")}>Vše →</span>
          </div>
          {tasks.filter(t => !t.done).slice(0, 4).map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} style={{ accentColor: "#2563eb" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#1e293b" }}>{t.title}</div>
                <div style={{ fontSize: 11, color: "#475569" }}>{t.due}</div>
              </div>
              <span style={S.tag(PRIO_COLORS[t.priority] || "#64748b")}>{t.priority}</span>
            </div>
          ))}
        </div>

        {/* Varování skladu */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
            ⚠️ Nízký stav skladu <span style={{ color: "#2563eb", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("warehouse")}>Sklad →</span>
          </div>
          {lowStock.length === 0 ? <div style={{ color: "#475569", fontSize: 13 }}>Vše v pořádku ✓</div> :
            lowStock.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#1e293b" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>{p.sku}</div>
                </div>
                <span style={S.tag("#f87171")}>{p.stock} {p.unit}</span>
              </div>
            ))
          }
        </div>

        {/* Přehled projektů */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
            Projekty <span style={{ color: "#2563eb", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("projects")}>Vše →</span>
          </div>
          {projects.slice(0, 3).map(p => (
            <div key={p.id} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "#1e293b" }}>{p.name}</span>
                <span style={S.badge(PROJ_COLORS[p.status])}>{p.status}</span>
              </div>
              <div style={S.progress(p.progress)}>
                <div style={S.progressBar(p.progress, PROJ_COLORS[p.status])} />
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>{p.progress}% dokončeno</div>
            </div>
          ))}
        </div>

        {/* Poslední faktury */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
            Poslední faktury <span style={{ color: "#2563eb", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("invoices")}>Vše →</span>
          </div>
          {invoices.slice(-3).reverse().map(inv => {
            const cust = customers.find(c => c.id === inv.customerId);
            return (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#1e293b" }}>{inv.number}</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>{cust?.name}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmtKc(inv.amount)}</div>
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

function Customers({ customers, setCustomers, invoices, deals, communication, search, setSearch, modal, setModal, closeModal }) {
  const [newC, setNewC] = useState({ name: "", company: "", email: "", phone: "", tag: "Nový" });
  const filtered = customers.filter(c =>
    (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.company || "").toLowerCase().includes(search.toLowerCase())
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

  return (
    <>
      <div style={S.header}>
        <h1 style={S.h1}>Zákazníci</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <input style={S.search} placeholder="🔍 Hledat..." value={search} onChange={e => setSearch(e.target.value)} />
          <button style={S.btn()} onClick={() => setModal({ type: "addCustomer" })}>+ Přidat</button>
        </div>
      </div>
      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>{["Jméno", "Firma", "Email", "Telefon", "Faktury", "Štítek", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map((c, i) => {
              const custInvoices = invoices.filter(inv => inv.customerId === c.id);
              return (
                <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setModal({ type: "customerDetail", data: c })}>
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
                  <td style={S.td}><span style={S.tag(TAG_COLORS[c.tag] || "#2563eb")}>{c.tag}</span></td>
                  <td style={S.td}><span style={{ color: "#2563eb", fontSize: 12 }}>Detail →</span></td>
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
        const custComm = communication.filter(cm => cm.customerId === c.id);
        return (
          <div style={S.modal} onClick={closeModal}>
            <div style={{ ...S.modalBox, width: 560 }} onClick={e => e.stopPropagation()}>
              <ModalHeader title={c.name} onClose={closeModal} />
              <div style={{ color: "#475569", fontSize: 13, marginBottom: 8 }}>
                {c.company && <span>{c.company} · </span>}
                {c.email && <a href={`mailto:${c.email}`} style={{ color: "#2563eb" }}>{c.email}</a>}
                {c.phone && <span> · <a href={`tel:${c.phone}`} style={{ color: "#16a34a" }}>📞 {c.phone}</a></span>}
                {c.email_contact && c.email_contact !== c.email && <span> · <a href={`mailto:${c.email_contact}`} style={{ color: "#a78bfa" }}>✉️ {c.email_contact}</a></span>}
              </div>

              <SectionTitle>Faktury</SectionTitle>
              {custInv.length === 0 ? <Empty /> : custInv.map(inv => (
                <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a2035" }}>
                  <span style={{ color: "#1e293b", fontSize: 13 }}>{inv.number}</span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{fmtKc(inv.amount)}</span>
                    <span style={S.tag(INV_COLORS[inv.status])}>{inv.status}</span>
                  </div>
                </div>
              ))}

              <SectionTitle style={{ marginTop: 16 }}>Dealy</SectionTitle>
              {custDeals.length === 0 ? <Empty /> : custDeals.map(d => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a2035" }}>
                  <span style={{ color: "#1e293b", fontSize: 13 }}>{d.name}</span>
                  <span style={S.tag(STAGE_COLORS[d.stage])}>{d.stage}</span>
                </div>
              ))}

              <SectionTitle style={{ marginTop: 16 }}>Komunikace</SectionTitle>
              {custComm.length === 0 ? <Empty /> : custComm.map(cm => (
                <div key={cm.id} style={{ padding: "8px 0", borderBottom: "1px solid #1a2035" }}>
                  <div style={{ fontSize: 11, color: "#475569" }}>{cm.type} · {cm.date}</div>
                  <div style={{ fontSize: 13, color: "#1e293b" }}>{cm.note}</div>
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
  const [detailDeal, setDetailDeal] = useState(null);
  const [history, setHistory] = useState([]);
  const [dealMessages, setDealMessages] = useState([]);
  const [newMsg, setNewMsg] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDealPhotoPicker, setShowDealPhotoPicker] = useState(false);

  const save = async () => {
    if (!newD.name) return;
    const { data: row } = await supabase.from("deals").insert({
      name: newD.name, value: Number(newD.value), stage: newD.stage,
      customer_id: Number(newD.customerId), assigned_to: newD.assigned_to,
    }).select().single();
    if (row) {
      setDeals([...deals, { ...row, customerId: row.customer_id }]);
      await supabase.from("deal_history").insert({ deal_id: row.id, user_name: currentUser?.name || "Systém", action: "Deal vytvořen" });
    }
    setNewD({ name: "", value: "", stage: "Nový", customerId: "", assigned_to: "" });
    closeModal();
  };

  const openDetail = async (deal) => {
    setDetailDeal(deal);
    setHistoryLoading(true);
    const [h, m] = await Promise.all([
      supabase.from("deal_history").select("*").eq("deal_id", deal.id).order("created_at"),
      supabase.from("deal_messages").select("*").eq("deal_id", deal.id).order("created_at"),
    ]);
    setHistory(h.data || []);
    setDealMessages(m.data || []);
    setHistoryLoading(false);
  };

  const moveStage = async (deal, newStage) => {
    await supabase.from("deals").update({ stage: newStage }).eq("id", deal.id);
    await supabase.from("deal_history").insert({ deal_id: deal.id, user_name: currentUser?.name || "?", action: `Přesunuto: ${deal.stage} → ${newStage}` });
    setDeals(deals.map(d => d.id === deal.id ? { ...d, stage: newStage } : d));
    if (detailDeal?.id === deal.id) {
      setDetailDeal({ ...detailDeal, stage: newStage });
      const { data: h } = await supabase.from("deal_history").select("*").eq("deal_id", deal.id).order("created_at");
      setHistory(h || []);
    }
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !detailDeal) return;
    const { data: row } = await supabase.from("deal_messages").insert({
      deal_id: detailDeal.id, user_name: currentUser?.name || "?", message: newMsg.trim(),
    }).select().single();
    if (row) setDealMessages([...dealMessages, row]);
    setNewMsg("");
  };

  const uploadPhoto = async (file, dealId) => {
    if (!file) return;
    setUploading(true);
    const path = `deal_${dealId}_${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("deal-photos").upload(path, file, { upsert: true });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from("deal-photos").getPublicUrl(path);
      await supabase.from("deal_history").insert({ deal_id: dealId, user_name: currentUser?.name || "?", action: `Přidána fotka: ${publicUrl}` });
      const { data: h } = await supabase.from("deal_history").select("*").eq("deal_id", dealId).order("created_at");
      setHistory(h || []);
    }
    setUploading(false);
  };

  // Drag & drop
  const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; };
  const onDrop = async (e, stage) => {
    e.preventDefault();
    if (!dragId) return;
    const deal = deals.find(d => d.id === dragId);
    if (deal && deal.stage !== stage) await moveStage(deal, stage);
    setDragId(null);
  };

  if (detailDeal) {
    const cust = customers.find(c => c.id === detailDeal.customerId || c.id === detailDeal.customer_id);
    const assignedEmp = employees?.find(e => e.name === detailDeal.assigned_to);
    const dealTasks = (tasks || []).filter(t => t.deal_id === detailDeal.id);
    const photoEntries = history.filter(h => h.action?.startsWith("Přidána fotka:"));

    return (
      <div>
        <div style={{ marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => setDetailDeal(null)} style={{ ...S.btn("#334155"), padding: "7px 16px" }}>← Zpět</button>
          <span style={S.tag(STAGE_COLORS[detailDeal.stage])}>{detailDeal.stage}</span>
          {detailDeal.stage === "Vyhráno" && onConvertToContract && (
            <button style={{ ...S.btn("#0d9488"), padding: "7px 16px", fontWeight: 700 }}
              onClick={() => { onConvertToContract(detailDeal); setDetailDeal(null); }}>
              🔧 Převést na zakázku
            </button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Levý panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={S.card}>
              <h2 style={{ color: "#fff", fontWeight: 800, fontSize: 20, marginBottom: 6 }}>{detailDeal.name}</h2>
              <div style={{ color: "#475569", fontSize: 13, marginBottom: 14 }}>{cust?.name || "—"}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {STAGES.map(s => (
                  <button key={s} onClick={() => moveStage(detailDeal, s)}
                    style={{ ...S.btn(detailDeal.stage === s ? STAGE_COLORS[s] : "#1e293b"), padding: "5px 12px", fontSize: 11, opacity: detailDeal.stage === s ? 1 : 0.6 }}>
                    {s}
                  </button>
                ))}
              </div>
              {[
                ["Hodnota", fmtKc(detailDeal.value)],
                ["Zákazník", cust?.name || "—"],
                ["Vede případ", detailDeal.assigned_to || "—"],
              ].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #1e293b" }}>
                  <span style={{ color: "#64748b", fontSize: 12 }}>{l}</span>
                  <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Úkoly přiřazené k dealu */}
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 10 }}>ÚKOLY PŘÍPADU</div>
              {dealTasks.length === 0
                ? <div style={{ color: "#475569", fontSize: 12 }}>Žádné úkoly</div>
                : dealTasks.map(t => (
                  <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #1e293b" }}>
                    <span style={{ color: t.done ? "#34d399" : "#f59e0b", fontSize: 16 }}>{t.done ? "✅" : "⏳"}</span>
                    <span style={{ color: "#1e293b", fontSize: 13, flex: 1, textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
                    <span style={{ color: "#64748b", fontSize: 11 }}>{t.created_by || "?"}</span>
                  </div>
                ))
              }
            </div>

            {/* Fotky */}
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 10 }}>FOTOGRAFIE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {photoEntries.map((h, i) => {
                  const url = h.action.replace("Přidána fotka: ", "");
                  return <a key={i} href={url} target="_blank" rel="noreferrer"><img src={url} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "2px solid #334155" }} /></a>;
                })}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label style={{ ...S.btn("#334155"), padding: "7px 14px", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  {uploading ? "⏳ Nahrávám..." : "📷 Přidat foto"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => uploadPhoto(e.target.files[0], detailDeal.id)} />
                </label>
                <button style={{ ...S.btnGhost, padding: "7px 14px", fontSize: 13 }} onClick={() => setShowDealPhotoPicker(true)}>📁 Ze zakázek</button>
              </div>
              {showDealPhotoPicker && <ContractPhotoPicker onSelect={async url => {
                await supabase.from("deal_history").insert({ deal_id: detailDeal.id, action: "Přidána fotka: " + url, date: fmt(new Date()), user_name: "" });
                setDealHistory([...dealHistory, { deal_id: detailDeal.id, action: "Přidána fotka: " + url, date: fmt(new Date()), user_name: "" }]);
                setShowDealPhotoPicker(false);
              }} onClose={() => setShowDealPhotoPicker(false)} />}
            </div>
          </div>

          {/* Pravý panel — komunikace + historie */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Komunikace */}
            <div style={{ ...S.card, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", letterSpacing: 1, marginBottom: 10 }}>💬 KOMUNIKACE</div>
              <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                {dealMessages.length === 0 && <div style={{ color: "#475569", fontSize: 12 }}>Zatím žádné zprávy</div>}
                {dealMessages.map(m => (
                  <div key={m.id} style={{ background: "#1e293b", borderRadius: 10, padding: "8px 12px" }}>
                    <div style={{ fontSize: 11, color: "#2563eb", fontWeight: 600, marginBottom: 3 }}>{m.user_name} · {new Date(m.created_at).toLocaleString("cs")}</div>
                    <div style={{ color: "#1e293b", fontSize: 13 }}>{m.message}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...S.input, marginBottom: 0, flex: 1 }} placeholder="Napište zprávu..." value={newMsg} onChange={e => setNewMsg(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendMessage()} />
                <button style={{ ...S.btn(), padding: "0 14px" }} onClick={sendMessage}>Odeslat</button>
              </div>
            </div>

            {/* Historie */}
            <div style={{ ...S.card, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 10 }}>📋 HISTORIE PŘÍPADU</div>
              {historyLoading && <div style={{ color: "#475569", fontSize: 12 }}>Načítám...</div>}
              <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {history.filter(h => !h.action?.startsWith("Přidána fotka:")).map(h => (
                  <div key={h.id} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid #1e293b" }}>
                    <span style={{ fontSize: 10, color: "#475569", minWidth: 90 }}>{new Date(h.created_at).toLocaleString("cs", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span style={{ fontSize: 11, color: "#2563eb", minWidth: 70 }}>{h.user_name}</span>
                    <span style={{ color: "#1e293b", fontSize: 12 }}>{h.action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={S.header}><h1 style={S.h1}>Obchodní příležitosti</h1><button style={S.btn()} onClick={() => setModal({ type: "addDeal" })}>+ Přidat deal</button></div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 16 }}>
        {STAGES.map(stage => (
          <div key={stage} style={{ ...S.kanbanCol, minHeight: 300 }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => onDrop(e, stage)}>
            <div style={{ fontWeight: 700, color: STAGE_COLORS[stage], marginBottom: 12, fontSize: 11, letterSpacing: "0.08em" }}>
              {stage.toUpperCase()} <span style={{ color: "#475569" }}>({deals.filter(d => d.stage === stage).length})</span>
            </div>
            {deals.filter(d => d.stage === stage).map(d => {
              const cust = customers.find(c => c.id === d.customerId);
              return (
                <div key={d.id} style={{ ...S.kanbanCard, opacity: dragId === d.id ? 0.4 : 1, cursor: "grab" }}
                  draggable onDragStart={e => onDragStart(e, d.id)}
                  onClick={() => openDetail(d)}>
                  <div style={{ fontWeight: 600, color: "#fff", fontSize: 13, marginBottom: 3 }}>{d.name}</div>
                  {d.assigned_to && <div style={{ fontSize: 10, color: "#2563eb", marginBottom: 3 }}>👤 {d.assigned_to}</div>}
                  <div style={{ color: "#475569", fontSize: 11, marginBottom: 7 }}>{cust?.name || "—"}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ color: STAGE_COLORS[stage], fontWeight: 800, fontSize: 14 }}>{fmtKc(d.value)}</div>
                    {stage === "Vyhráno" && onConvertToContract && (
                      <button title="Převést na zakázku" onClick={e => { e.stopPropagation(); onConvertToContract(d); }}
                        style={{ background: "#0d948822", border: "1px solid #0d948855", borderRadius: 6, color: "#2dd4bf", fontSize: 10, padding: "3px 8px", cursor: "pointer", fontWeight: 700 }}>
                        🔧 Zakázka
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {modal?.type === "addDeal" && (
        <div style={S.modal}><div style={S.modalBox}>
          <ModalHeader title="Nový deal" onClose={closeModal} />
          <label style={S.label}>Název</label><input style={S.input} value={newD.name} onChange={e => setNewD({ ...newD, name: e.target.value })} />
          <label style={S.label}>Hodnota (Kč)</label><input style={S.input} type="number" value={newD.value} onChange={e => setNewD({ ...newD, value: e.target.value })} />
          <label style={S.label}>Fáze</label>
          <select style={S.select} value={newD.stage} onChange={e => setNewD({ ...newD, stage: e.target.value })}>{STAGES.map(s => <option key={s}>{s}</option>)}</select>
          <label style={S.label}>Zákazník</label>
          <select style={S.select} value={newD.customerId} onChange={e => setNewD({ ...newD, customerId: e.target.value })}>
            <option value="">— vyberte —</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={S.label}>Vede případ</label>
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
            style={{ ...S.btn(tab === t.id ? "#2563eb" : "#1e293b"), padding: "7px 16px", fontSize: 12 }}>
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
                <div style={{ fontSize: 11, color: "#2563eb", marginBottom: 4 }}>{msgs.length} zpráv</div>
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
                <div key={m.id} style={{ background: "#1e293b", borderRadius: 10, padding: "9px 13px" }}>
                  <div style={{ fontSize: 11, color: "#2563eb", fontWeight: 600, marginBottom: 3 }}>{m.user_name} · {new Date(m.created_at).toLocaleString("cs")}</div>
                  <div style={{ color: "#1e293b", fontSize: 13 }}>{m.message}</div>
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
                <div key={m.id} style={{ background: "#1e293b", borderRadius: 10, padding: "9px 13px" }}>
                  <div style={{ fontSize: 11, color: "#34d399", fontWeight: 600, marginBottom: 3 }}>{m.user_name} · {new Date(m.created_at).toLocaleString("cs")}</div>
                  <div style={{ color: "#1e293b", fontSize: 13 }}>{m.message}</div>
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
                    <span style={S.tag(c.type === "Email" ? "#2563eb" : c.type === "Hovor" ? "#34d399" : "#f59e0b")}>{c.type}</span>
                    <span style={{ color: "#475569", fontSize: 11, marginLeft: "auto" }}>{c.date}</span>
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
            style={{ ...S.btn(filter === k ? "#2563eb" : "#1e293b"), padding: "6px 14px", fontSize: 12 }}>{l}</button>
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
                  <td style={S.td} onClick={e => e.stopPropagation()}><input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} style={{ accentColor: "#2563eb" }} /></td>
                  <td style={{ ...S.td, textDecoration: t.done ? "line-through" : "none", color: "#fff", fontWeight: 500 }}>
                    {t.title}
                    {t.visible_to?.length > 0 && <span style={{ fontSize: 10, color: "#2563eb", marginLeft: 6 }}>👁 {t.visible_to.join(", ")}</span>}
                  </td>
                  <td style={S.td}>{cust?.name || "—"}</td>
                  <td style={S.td}>
                    {contr && <span style={S.tag("#34d399")}>🔧 {contr.name}</span>}
                    {deal && <span style={S.tag("#f59e0b")}>💼 {deal.name}</span>}
                    {!contr && !deal && "—"}
                  </td>
                  <td style={S.td}>{t.due}</td>
                  <td style={{ ...S.td, color: "#2563eb", fontSize: 11 }}>{t.created_by || "—"}</td>
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
              <div><div style={S.statLabel}>Termín</div><div style={{ color: "#fff", fontWeight: 600 }}>{detailTask.due || "—"}</div></div>
              <div><div style={S.statLabel}>Priorita</div><span style={S.tag(PRIO_COLORS[detailTask.priority] || "#64748b")}>{detailTask.priority}</span></div>
              <div><div style={S.statLabel}>Zadal</div><div style={{ color: "#94a3b8", fontSize: 13 }}>{detailTask.created_by || "—"}</div></div>
              <div><div style={S.statLabel}>Přiřazeno</div><div style={{ color: "#94a3b8", fontSize: 13 }}>{detailTask.assigned_to || "—"}</div></div>
            </div>
            {detailTask.description && (
              <div style={{ background: "#1e293b", borderRadius: 8, padding: "10px 14px", marginBottom: 12, color: "#cbd5e1", fontSize: 14, lineHeight: 1.6 }}>
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
                        {ph.name && <div style={{ padding: "3px 6px", fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: "#1e293b" }}>{ph.name}</div>}
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
                style={{ accentColor: "#2563eb" }} />
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
                    <input type="checkbox" checked={checked} onChange={toggle} style={{ accentColor: "#2563eb" }} />
                    <span style={{ fontSize: 13, color: checked ? "#e2e8f0" : "#64748b" }}>{e.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
          {/* Fotky */}
          <label style={S.label}>Fotky k úkolu</label>
          <button style={{ ...S.btn("#1e293b"), padding: "6px 14px", fontSize: 12, marginBottom: 8 }}
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

function Invoices({ invoices, setInvoices, customers, modal, setModal, closeModal }) {
  const [newInv, setNewInv] = useState({ customerId: "", amount: "", status: "Čeká", issued: "", due: "", items: [{ desc: "", qty: 1, price: 0 }], invoice_type: "vydaná" });
  const [invTab, setInvTab] = useState("vydané");

  const save = async () => {
    if (!newInv.customerId || !newInv.amount) return;
    const amount = Number(newInv.amount);
    const invNum = nextInvNum(invoices);
    const { data: row } = await supabase.from("invoices").insert({
      number: invNum, customer_id: Number(newInv.customerId), amount,
      tax: Math.round(amount * 0.21), status: newInv.status,
      issued: newInv.issued, due: newInv.due, items: newInv.items,
      invoice_type: newInv.invoice_type,
    }).select().single();
    if (row) setInvoices([...invoices, { ...row, customerId: row.customer_id }]);
    setNewInv({ customerId: "", amount: "", status: "Čeká", issued: "", due: "", items: [{ desc: "", qty: 1, price: 0 }], invoice_type: "vydaná" });
    closeModal();
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
                style={{ ...S.btn(invTab === t ? "#2563eb" : "#e2e8f0"), color: invTab === t ? "#fff" : "#475569", padding: "6px 18px", fontSize: 12, textTransform: "capitalize" }}>
                {t === "vydané" ? "📤 Vydané" : "📥 Přijaté"}
              </button>
            ))}
          </div>
        </div>
        <button style={S.btn()} onClick={() => setModal({ type: "addInvoice" })}>+ Nová faktura</button>
      </div>

      {/* Souhrn */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
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
          <thead><tr>{["Číslo", "Zákazník", "Částka", "DPH", "Vystavena", "Splatnost", "Stav", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {invoices.filter(i => (i.invoice_type || "vydaná") === (invTab === "vydané" ? "vydaná" : "přijatá")).map(inv => {
              const cust = customers.find(c => c.id === inv.customerId);
              return (
                <tr key={inv.id}>
                  <td style={{ ...S.td, color: "#fff", fontWeight: 600 }}>{inv.number}</td>
                  <td style={S.td}>{cust?.name || "—"}</td>
                  <td style={{ ...S.td, color: "#fff", fontWeight: 700 }}>{fmtKc(inv.amount)}</td>
                  <td style={S.td}>{fmtKc(inv.tax)}</td>
                  <td style={S.td}>{inv.issued}</td>
                  <td style={S.td}>{inv.due}</td>
                  <td style={S.td}><span style={S.tag(INV_COLORS[inv.status])}>{inv.status}</span></td>
                  <td style={S.td}>
                    <select style={{ ...S.select, marginBottom: 0, width: 130, padding: "5px 8px", fontSize: 12 }}
                      value={inv.status} onChange={e => changeStatus(inv.id, e.target.value)}>
                      {["Čeká", "Zaplacena", "Po splatnosti", "Storno"].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal?.type === "addInvoice" && (
        <div style={S.modal}><div style={S.modalBox}>
          <ModalHeader title="Nová faktura" onClose={closeModal} />
          <label style={S.label}>Zákazník</label>
          <select style={S.select} value={newInv.customerId} onChange={e => setNewInv({ ...newInv, customerId: e.target.value })}>
            <option value="">— vyberte —</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={S.label}>Částka (Kč bez DPH)</label><input style={S.input} type="number" value={newInv.amount} onChange={e => setNewInv({ ...newInv, amount: e.target.value })} />
          <label style={S.label}>Datum vystavení</label><input style={S.input} type="date" value={newInv.issued} onChange={e => setNewInv({ ...newInv, issued: e.target.value })} />
          <label style={S.label}>Datum splatnosti</label><input style={S.input} type="date" value={newInv.due} onChange={e => setNewInv({ ...newInv, due: e.target.value })} />
          <label style={S.label}>Typ faktury</label>
          <select style={S.select} value={newInv.invoice_type} onChange={e => setNewInv({ ...newInv, invoice_type: e.target.value })}>
            <option value="vydaná">📤 Vydaná (zákazníkovi)</option>
            <option value="přijatá">📥 Přijatá (od dodavatele)</option>
          </select>
          <label style={S.label}>Stav</label>
          <select style={S.select} value={newInv.status} onChange={e => setNewInv({ ...newInv, status: e.target.value })}>
            {["Čeká", "Zaplacena", "Po splatnosti"].map(s => <option key={s}>{s}</option>)}
          </select>
          <ModalActions onSave={save} onClose={closeModal} />
        </div></div>
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
    }
    setNewMov({ product_name: "", quantity: "", unit: "ks", movement_type: "in", contract_id: "", vehicle: "", from_location: "Sklad", to_location: "", note: "" });
  };

  const MOV_COLORS = { in: "#34d399", out: "#f87171", out_contract: "#f87171", out_vehicle: "#f59e0b", transfer: "#2563eb", transfer_vh: "#a78bfa" };
  const MOV_LABELS = Object.fromEntries(MOVE_TYPES.map(t => [t.value, t.label]));

  return (
    <>
      <div style={S.header}><h1 style={S.h1}>Sklad & zboží</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...S.btn(whTab === "stock" ? "#2563eb" : "#94a3b8"), padding: "7px 16px" }} onClick={() => setWhTab("stock")}>📦 Skladové zásoby</button>
          <button style={{ ...S.btn(whTab === "movements" ? "#2563eb" : "#94a3b8"), padding: "7px 16px" }} onClick={() => setWhTab("movements")}>🔄 Pohyby</button>
          <button style={S.btn()} onClick={() => setShowAddProduct(true)}>+ Přidat produkt</button>
        </div>
      </div>

      {whTab === "stock" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
            {[
              { label: "Produktů celkem", value: products.length, color: "#60a5fa" },
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
                      <td style={{ ...S.td, fontWeight: 600, color: "#1e293b" }}>{p.name}</td>
                      <td style={{ ...S.td, fontSize: 12, color: "#64748b" }}>{p.sku}</td>
                      <td style={{ ...S.td, fontSize: 12, color: "#64748b" }}>{p.category}</td>
                      <td style={S.td}>{fmtKc(p.price)}</td>
                      <td style={{ ...S.td, color: "#f97316", fontWeight: 600 }}>{p.price_sell ? fmtKc(p.price_sell) : "—"}</td>
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
                            <span style={{ color: "#1e293b", fontWeight: 500 }}>{p.name}</span>
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
                      <td style={{ ...S.td, fontSize: 11, color: "#2563eb" }}>{m.created_by}</td>
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
            <div style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", marginBottom: 6 }}>🖼 Obrázek produktu</div>
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
            <div style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", marginBottom: 6 }}>🖼 Obrázek produktu</div>
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

function HR({ employees, setEmployees, modal, setModal, closeModal, costEntries, attendance }) {
  const [newE, setNewE] = useState({ name: "", position: "", department: "", email: "", salary: "", status: "Aktivní", start: "" });
  const [detailEmp, setDetailEmp] = useState(null);
  const [editField, setEditField] = useState({});
  const [uploading, setUploading] = useState(false);

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

  const totalPayroll = employees.filter(e => e.status === "Aktivní").reduce((s, e) => s + (e.salary || 0), 0);

  // Barvy podle oddělení
  const deptColor = (dept) => {
    const map = { "IT": "#2563eb", "Obchod": "#f59e0b", "Výroba": "#34d399", "Management": "#a78bfa", "Finance": "#38bdf8", "HR": "#f87171" };
    return map[dept] || "#64748b";
  };

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
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setDetailEmp(null)} style={{ ...S.btn("#334155"), padding: "7px 16px", display: "flex", alignItems: "center", gap: 6 }}>
            ← Zpět na seznam
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>

          {/* Levý panel - foto + základní info */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Foto */}
            <div style={{ ...S.card, textAlign: "center", padding: 24 }}>
              <div style={{ position: "relative", display: "inline-block" }}>
                {emp.photo_url
                  ? <img src={emp.photo_url} alt={emp.name} style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover", border: "3px solid #6366f1" }} />
                  : <div style={{ width: 120, height: 120, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, color: "#fff", fontWeight: 800, margin: "0 auto" }}>{getInitial(emp.name)}</div>
                }
                <label style={{ position: "absolute", bottom: 0, right: 0, background: "#2563eb", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16 }} title="Nahrát foto">
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

            {/* Statistiky */}
            <div style={S.card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 12 }}>PŘEHLED</div>
              {[
                { label: "Plat/měs.", value: fmtKc(emp.salary || 0), color: "#f59e0b" },
                { label: "Sazba náklady", value: `${Number(editField.hourly_rate_cost || emp.hourly_rate_cost || 0)} Kč/h`, color: "#f87171" },
                { label: "Sazba fakturace", value: `${Number(editField.hourly_rate_client || emp.hourly_rate_client || 0)} Kč/h`, color: "#34d399" },
                { label: "Vyplaceno ze zakázek", value: fmtKc(totalPaid), color: "#f87171" },
                { label: "Fakturováno ze zakázek", value: fmtKc(totalBilled), color: "#34d399" },
                { label: `Hodiny tento měsíc (${thisMonth})`, value: fmtHours(monthHours), color: "#2563eb" },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1e293b" }}>
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
                {[
                  ["Jméno", "name"], ["Pozice", "position"], ["Oddělení", "department"],
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
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={S.header}><h1 style={S.h1}>Zaměstnanci & HR</h1><button style={S.btn()} onClick={() => setModal({ type: "addEmployee" })}>+ Přidat zaměstnance</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Celkem zaměstnanců", value: employees.length, color: "#a78bfa" },
          { label: "Aktivních", value: employees.filter(e => e.status === "Aktivní").length, color: "#34d399" },
          { label: "Mzdové náklady/měs.", value: fmtKc(totalPayroll), color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={S.statCard(s.color)}><div style={S.statLabel}>{s.label}</div><div style={S.statValue(s.color)}>{s.value}</div></div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
        {employees.map((e, i) => {
          const empPaid   = (costEntries || []).filter(c => c.employee_id === e.id).reduce((s, c) => s + Number(c.amount_cost || 0), 0);
          const empBilled = (costEntries || []).filter(c => c.employee_id === e.id).reduce((s, c) => s + Number(c.amount_client || 0), 0);
          return (
            <div key={e.id} style={{ ...S.card, cursor: "pointer", transition: "transform .15s", padding: 20 }}
              onClick={() => openDetail(e)}
              onMouseEnter={ev => ev.currentTarget.style.transform = "translateY(-3px)"}
              onMouseLeave={ev => ev.currentTarget.style.transform = "none"}>
              {/* Avatar + foto */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                {e.photo_url
                  ? <img src={e.photo_url} alt="" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "3px solid #6366f1", flexShrink: 0 }} />
                  : <div style={{ ...S.avatar(avatarColors[i % 6]), width: 52, height: 52, fontSize: 22, flexShrink: 0 }}>{getInitial(e.name)}</div>
                }
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{e.name}</div>
                  <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>{e.position}</div>
                  <div style={{ marginTop: 5 }}>
                    <span style={S.tag(e.status === "Aktivní" ? "#34d399" : "#f59e0b")}>{e.status}</span>
                    {e.department && <span style={{ ...S.tag(deptColor(e.department)), marginLeft: 4 }}>{e.department}</span>}
                  </div>
                </div>
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
          {[["Jméno", "name"], ["Pozice", "position"], ["Oddělení", "department"], ["Email", "email"], ["Plat (Kč)", "salary"], ["Datum nástupu", "start"]].map(([l, k]) => (
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Celkem projektů", value: projects.length, color: "#2563eb" },
          { label: "Probíhá", value: projects.filter(p => p.status === "Probíhá").length, color: "#60a5fa" },
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
                  <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>{cust?.name || "—"} · Deadline: {p.deadline}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={S.badge(PROJ_COLORS[p.status])}>{p.status}</span>
                  <button onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    style={{ background: "#e2e8f0", border: "1px solid #252d45", borderRadius: 8, padding: "5px 12px", color: "#475569", cursor: "pointer", fontSize: 12 }}>
                    {isExpanded ? "▲ Sbalit" : "▼ Kroky"}
                  </button>
                </div>
              </div>

              {/* Progress bary */}
              <div style={{ marginBottom: 10 }}>
                {steps.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569", marginBottom: 3 }}>
                      <span>Reálný postup dle kroků: {doneSteps}/{steps.length} kroků</span>
                      <span style={{ color: "#2563eb", fontWeight: 700 }}>{realProgress}%</span>
                    </div>
                    {/* Kroky vizuální progress */}
                    <div style={{ display: "flex", gap: 2 }}>
                      {steps.map(s => (
                        <div key={s.id} style={{ flex: 1, height: 6, borderRadius: 3, background: s.done ? "#2563eb" : "#e2e8f0", transition: "background 0.3s" }} title={s.title} />
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
                    <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 700 }}>{p.progress}%</span>
                  </div>
                )}
              </div>

              {/* Expandovaný panel kroků */}
              {isExpanded && (
                <div style={{ marginTop: 18, borderTop: "1px solid #1a2035", paddingTop: 18 }}>
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
                              <div style={{ width: 22, height: 22, borderRadius: "50%", background: step.done ? "#2563eb" : "#e2e8f0", border: step.done ? "none" : "1px solid #252d45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: step.done ? "#fff" : "#334155", flexShrink: 0, cursor: "pointer", fontWeight: 700 }}
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
                                <div style={{ fontSize: 11, color: "#1e293b", marginTop: 3, cursor: "pointer" }}
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
                    <button style={{ ...S.btn("#2563eb"), padding: "9px 16px", fontSize: 13 }} onClick={() => addStep(p.id)}>+ Přidat</button>
                  </div>
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
                style={{ fontSize: 20, padding: "6px 10px", borderRadius: 8, background: newTemplate.icon === ico ? "#2563eb33" : "#f8fafc", border: newTemplate.icon === ico ? "1px solid #6366f1" : "1px solid #252d45", cursor: "pointer" }}>
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
          ...quarters.map(q => ({ label: q.label, value: fmtKc(q.total), color: "#2563eb" })),
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
                <div style={{ fontSize: 10, color: i === 3 ? "#2563eb" : "#475569", fontWeight: i === 3 ? 700 : 400 }}>{m.month}</div>
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
                  <span style={{ fontSize: 13, color: "#1e293b" }}>{c.cat}</span>
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
            { label: "Pravidelné náklady", items: costs.filter(c => c.recurring), color: "#2563eb" },
            { label: "Jednorázové náklady", items: costs.filter(c => !c.recurring), color: "#f59e0b" },
          ].map(g => {
            const total = g.items.reduce((s, c) => s + c.amount, 0);
            return (
              <div key={g.label} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: "#1e293b" }}>{g.label}</span>
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
                style={{ ...S.btn(filterCat === cat ? CAT_COLORS[cat] || "#2563eb" : "#e2e8f0"), padding: "5px 12px", fontSize: 11, border: filterCat === cat ? "none" : "1px solid #252d45" }}>
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
                <td style={S.td}>{c.date}</td>
                <td style={S.td}><span style={S.tag(CAT_COLORS[c.category] || "#2563eb")}>{c.category}</span></td>
                <td style={{ ...S.td, color: "#1e293b" }}>{c.description}</td>
                <td style={{ ...S.td, color: "#fff", fontWeight: 700 }}>{fmtKc(c.amount)}</td>
                <td style={S.td}><span style={S.tag(c.recurring ? "#2563eb" : "#f59e0b")}>{c.recurring ? "Pravidelný" : "Jednorázový"}</span></td>
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
            <input type="checkbox" checked={newC.recurring} onChange={e => setNewC({ ...newC, recurring: e.target.checked })} style={{ accentColor: "#2563eb" }} />
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
            <button key={y} style={{ ...S.btn(period === y ? "#2563eb" : "#e2e8f0"), border: "1px solid #252d45" }} onClick={() => setPeriod(y)}>{y}</button>
          ))}
        </div>
      </div>

      {/* KPI řada */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Celkový zisk", value: fmtKc(profit), sub: `Marže ${margin}%`, color: profit >= 0 ? "#34d399" : "#f87171" },
          { label: "Příjmy", value: fmtKc(totalRevenue), sub: `${invoices.filter(i => i.status === "Zaplacena").length} faktur`, color: "#2563eb" },
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
                <div style={{ fontSize: 9, color: i === 3 ? "#2563eb" : "#334155" }}>{m.month}</div>
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
            <span style={{ fontSize: 14, fontWeight: 800, color: "#2563eb" }}>{fmtKc(totalPipeline)}</span>
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
                  <span style={{ fontSize: 13, color: "#1e293b" }}>{p.name}</span>
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
                    <span style={{ fontSize: 13, color: "#1e293b" }}>{d.dept}</span>
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
            onMouseEnter={e => { e.target.style.borderColor = "#2563eb"; e.target.style.color = "#fff"; }}
            onMouseLeave={e => { e.target.style.borderColor = "#e2e8f0"; e.target.style.color = "#94a3b8"; }}>
            {s}
          </button>
        ))}
      </div>

      {/* Chat okno */}
      <div style={{ ...S.card, height: 440, overflowY: "auto", marginBottom: 16, display: "flex", flexDirection: "column", gap: 16, padding: 20 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 12, flexDirection: m.role === "user" ? "row-reverse" : "row", alignItems: "flex-start" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.role === "user" ? "#2563eb" : "#e2e8f0", border: m.role === "assistant" ? "1px solid #252d45" : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
              {m.role === "user" ? "👤" : "🤖"}
            </div>
            <div style={{ maxWidth: "75%", background: m.role === "user" ? "#2563eb33" : "#e2e8f0", border: `1px solid ${m.role === "user" ? "#6366f155" : "#e2e8f0"}`, borderRadius: m.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px", padding: "12px 16px" }}>
              <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#e2e8f0", border: "1px solid #252d45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🤖</div>
            <div style={{ background: "#e2e8f0", border: "1px solid #252d45", borderRadius: "4px 16px 16px 16px", padding: "14px 18px" }}>
              <div style={{ display: "flex", gap: 5 }}>
                {[0, 1, 2].map(j => (
                  <div key={j} style={{ width: 7, height: 7, borderRadius: "50%", background: "#2563eb", animation: `pulse 1.2s ease-in-out ${j * 0.2}s infinite` }} />
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
  "Zakázka":     { color: "#2563eb", bg: "#dbeafe" },
  "Servis":      { color: "#f97316", bg: "#ffedd5" },
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
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>📅 Kalendář</h2>
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
            <span style={{ fontWeight: 700, fontSize: 16, color: "#1e293b", minWidth: 160, textAlign: "center" }}>
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
                <div style={{ fontSize: 13, fontWeight: isToday ? 800 : 500, color: isToday ? "#2563eb" : "#374151",
                  background: isToday ? "#2563eb" : "transparent", color: isToday ? "#fff" : "#374151",
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
            <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: 460, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <span style={{ background: wt.bg, color: wt.color, border: `1px solid ${wt.color}44`, borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 700 }}>{detailEvent.work_type}</span>
                <span style={{ fontSize: 14, color: "#64748b" }}>{detailEvent.date}</span>
              </div>

              {detailEvent.title && <div style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", marginBottom: 16 }}>{detailEvent.title}</div>}

              {(detailEvent.customer_name || detailEvent.customer_company) && (
                <div style={{ marginBottom: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Zákazník</div>
                  {detailEvent.customer_name && <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>{detailEvent.customer_name}</div>}
                  {detailEvent.customer_company && <div style={{ fontSize: 13, color: "#64748b" }}>{detailEvent.customer_company}</div>}
                </div>
              )}

              {detailEvent.address && (
                <div style={{ marginBottom: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Adresa</div>
                  <div style={{ fontSize: 14, color: "#1e293b", marginBottom: 8 }}>📍 {detailEvent.address}</div>
                  {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", background: "#dbeafe", color: "#2563eb", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>🗺 Otevřít v Mapy.cz →</a>}
                </div>
              )}

              {(detailEvent.contact_name || detailEvent.contact_phone) && (
                <div style={{ marginBottom: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Kontakt</div>
                  {detailEvent.contact_name && <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>👤 {detailEvent.contact_name}</div>}
                  {detailEvent.contact_phone && <a href={`tel:${detailEvent.contact_phone}`} style={{ fontSize: 14, color: "#2563eb", textDecoration: "none" }}>📞 {detailEvent.contact_phone}</a>}
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

function Attendance({ currentUser, attendance, setAttendance, employees, contracts, products }) {
  const isHR = ["admin", "hr", "manager"].includes(currentUser.role);
  const [viewEmpId, setViewEmpId] = useState(currentUser.employeeId);
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

  useEffect(() => {
    supabase.from("projects").select("id, name").order("name").then(({ data }) => { if (data) setProjects(data); });
    supabase.from("vehicles").select("*").order("name").then(({ data }) => setAttVehicles(data || []));
    supabase.from("contracts").select("id, name").order("name").then(({ data }) => setAttLocalContracts(data || []));
  }, []);

  const contractOpts = (contracts && contracts.length > 0) ? contracts : attLocalContracts;

  const empRecords = attendance.filter(a => a.employeeId === viewEmpId && (viewMonth === "all" || (a.date && a.date.startsWith(viewMonth)))).sort((a, b) => b.date.localeCompare(a.date));
  const viewMonthHours = empRecords.reduce((s, a) => s + calcHours(a.checkin, a.checkout), 0);
  const todayRecord = attendance.find(a => a.employeeId === viewEmpId && a.date === todayStr);

  const syncCostEntries = async () => {
    const toSync = attendance.filter(a =>
      (a.employee_id === viewEmpId || a.employeeId === viewEmpId) &&
      a.contract_id && a.checkin && a.checkout
    );
    let count = 0;
    for (const rec of toSync) {
      const emp = employees.find(e => e.id === (rec.employee_id || rec.employeeId));
      if (!emp) continue;
      const effH = calcEffectiveHours(rec.checkin, rec.checkout);
      if (effH <= 0) continue;
      if (!emp.hourly_rate_cost && !emp.hourly_rate_client) continue;
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
      count++;
    }
    alert(`Synchronizováno ${count} záznamů do nákladů zakázek.`);
  };

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
      .insert({ employee_id: viewEmpId, date: todayStr, checkin: time, checkout: null, contract_id: contractIdVal, activity: ciActivity || null })
      .select().single();
    if (row) setAttendance([...attendance, { ...row, employeeId: row.employee_id }]);
    // Zapis zahajeni jizdy pokud bylo zadano vozidlo + km
    if (ciVehicleId && ciKmStart) {
      const vehicle = attVehicles.find(v => String(v.id) === String(ciVehicleId));
      const vehicleStr = vehicle ? `${vehicle.name}${vehicle.spz ? " (" + vehicle.spz + ")" : ""}` : "";
      const tripContractId = ciTripContractId ? Number(ciTripContractId) : null;
      const tripContractName = contractOpts.find(c => c.id === tripContractId)?.name || null;
      await supabase.from("vehicle_log").insert({
        employee_id: viewEmpId,
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
  const addManual = async () => {
    if (!manualDate || !manualIn) return;
    const existing = attendance.find(a => a.employeeId === viewEmpId && a.date === manualDate);
    const contractIdVal = manualContractId ? Number(manualContractId) : null;
    if (existing) {
      await supabase.from("attendance").update({ checkin: manualIn, checkout: manualOut || null, contract_id: contractIdVal }).eq("id", existing.id);
      const updated = { ...existing, checkin: manualIn, checkout: manualOut || null, contract_id: contractIdVal };
      setAttendance(attendance.map(a => a.id === existing.id ? updated : a));
      if (manualOut && contractIdVal) await createCostEntryFromAttendance(updated, manualOut);
    } else {
      const { data: row } = await supabase.from("attendance")
        .insert({ employee_id: viewEmpId, date: manualDate, checkin: manualIn, checkout: manualOut || null, contract_id: contractIdVal })
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
  const weekHours = weekDates.reduce((s, d) => { const r = attendance.find(a => a.employeeId === viewEmpId && a.date === d); return s + (r ? calcHours(r.checkin, r.checkout) : 0); }, 0);
  const monthStr = todayStr.slice(0, 7);
  const monthHours = attendance.filter(a => a.employeeId === viewEmpId && a.date.startsWith(monthStr)).reduce((s, a) => s + calcHours(a.checkin, a.checkout), 0);
  const yearStr = todayStr.slice(0, 4);
  const yearHours = attendance.filter(a => a.employeeId === viewEmpId && a.date.startsWith(yearStr)).reduce((s, a) => s + calcHours(a.checkin, a.checkout), 0);
  const todayHours = todayRecord ? calcHours(todayRecord.checkin, todayRecord.checkout) : 0;
  const todayEffective = todayRecord ? calcEffectiveHours(todayRecord.checkin, todayRecord.checkout) : 0;
  const viewEmp = employees.find(e => e.id === viewEmpId);
  const vacDays = viewEmp?.vacation_days ?? currentUser?.vacationDays ?? 0;
  const vacUsed = viewEmp?.vacation_used ?? currentUser?.vacationUsed ?? 0;

  return (
    <>
      <div style={S.header}>
        <h1 style={S.h1}>🕐 Docházka</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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

      {viewEmp && (
        <div style={{ ...S.card, marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ ...S.avatar("#2563eb"), width: 48, height: 48, fontSize: 18 }}>{getInitial(viewEmp.name)}</div>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Dnes (bez pauzy)", value: todayEffective > 0 ? fmtHours(todayEffective) : todayRecord?.checkin ? "Probíhá..." : "—", color: "#2563eb" },
          { label: "Tento týden", value: fmtHours(weekHours), color: "#60a5fa" },
          { label: viewMonth === "all" ? "Celkem" : new Date(viewMonth+"-01").toLocaleString("cs-CZ",{month:"long",year:"numeric"}), value: fmtHours(viewMonth === "all" ? yearHours : viewMonthHours), color: "#34d399" },
          { label: "Tento rok", value: fmtHours(yearHours), color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={S.statCard(s.color)}>
            <div style={S.statLabel}>{s.label}</div>
            <div style={{ ...S.statValue(s.color), fontSize: 20 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Dnešní záznam — jeden blok */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 16, fontSize: 14 }}>📅 Dnešní záznam — {todayStr}</div>

        {/* Časy */}
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
              <div style={{ fontSize: 26, fontWeight: 800, color: "#2563eb" }}>{fmtHours(todayEffective)}</div>
            </div>
          )}
        </div>

        {/* Zakázka */}
        <label style={S.label}>Zakázka</label>
        <select style={S.select}
          value={todayRecord?.contract_id || ciContractId}
          onChange={async e => {
            const cid = e.target.value ? Number(e.target.value) : null;
            setCiContractId(e.target.value);
            if (todayRecord) {
              await supabase.from("attendance").update({ contract_id: cid }).eq("id", todayRecord.id);
              setAttendance(attendance.map(a => a.id === todayRecord.id ? { ...a, contract_id: cid } : a));
            }
          }}>
          <option value="">— bez zakázky —</option>
          {contractOpts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Popis práce */}
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

        {/* Vozidlo — jen pokud ještě není příchod */}
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
            <select style={S.select} value={ciTripContractId} onChange={e => setCiTripContractId(e.target.value)}>
              <option value="">— bez zakázky —</option>
              {contractOpts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </>)}
        </>)}

        {/* Tlačítko */}
        <button onClick={checkinNow}
          style={{ ...S.btn(todayRecord?.checkin && !todayRecord?.checkout ? "#f97316" : todayRecord?.checkout ? "#64748b" : "#16a34a"), width: "100%", padding: "13px", fontSize: 16, fontWeight: 700, marginTop: 8 }}>
          {todayRecord?.checkout ? "✓ Odešel/a" : todayRecord?.checkin ? "⏹ Zapsat odchod" : "▶ Zapsat příchod"}
        </button>
      </div>

      {/* Ruční zadání */}
      {isHR && (
        <div style={{ ...S.card, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 12, fontSize: 13 }}>✏️ Ruční záznam</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr auto", gap: 10, alignItems: "end" }}>
            <div><label style={S.label}>Datum</label><input type="date" style={S.input} value={manualDate} onChange={e => setManualDate(e.target.value)} /></div>
            <div><label style={S.label}>Příchod</label><input type="time" style={S.input} value={manualIn} onChange={e => setManualIn(e.target.value)} /></div>
            <div><label style={S.label}>Odchod</label><input type="time" style={S.input} value={manualOut} onChange={e => setManualOut(e.target.value)} /></div>
            <div>
              <label style={S.label}>Zakázka</label>
              <select style={{ ...S.select, marginBottom: 0 }} value={manualContractId} onChange={e => setManualContractId(e.target.value)}>
                <option value="">— bez zakázky —</option>
                {contractOpts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button style={{ ...S.btn(), marginBottom: 0 }} onClick={addManual}>Uložit</button>
          </div>
        </div>
      )}

      {/* Historie docházky */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 14 }}>Historie docházky</div>
          {isHR && <button onClick={syncCostEntries} style={{ ...S.btnGhost, fontSize: 12, padding: "5px 12px" }}>⚡ Sync do nákladů</button>}
        </div>
        <table style={S.table}>
          <thead><tr>{["Datum", "Příchod", "Odchod", "Odpracováno", "Zakázka", "Popis", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {empRecords.slice(0, 60).map(rec => {
              const hours = calcEffectiveHours(rec.checkin, rec.checkout);
              const contr = (contracts || []).find(c => c.id === rec.contract_id);
              const mats = recordMaterials[rec.id];
              const isExpanded = expandedMatRecord === rec.id;
              return (
                <React.Fragment key={rec.id}>
                  <tr>
                    <td style={{ ...S.td, fontWeight: 600, color: "#1e293b" }}>{rec.date}</td>
                    <td style={{ ...S.td, color: "#16a34a" }}>{rec.checkin || "—"}</td>
                    <td style={{ ...S.td, color: "#f97316" }}>{rec.checkout || (rec.checkin ? <span style={{ color: "#94a3b8" }}>probíhá</span> : "—")}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{rec.checkin && rec.checkout ? fmtHours(hours) : "—"}</td>
                    <td style={S.td}>
                      <select style={{ ...S.select, marginBottom: 0, fontSize: 11, padding: "3px 6px", minWidth: 120 }}
                        value={rec.contract_id || ""}
                        onChange={async e => {
                          const cid = e.target.value ? Number(e.target.value) : null;
                          await supabase.from("attendance").update({ contract_id: cid }).eq("id", rec.id);
                          setAttendance(attendance.map(a => a.id === rec.id ? { ...a, contract_id: cid } : a));
                        }}>
                        <option value="">— bez zakázky —</option>
                        {contractOpts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td style={S.td}>
                      <button style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 11 }}
                        onClick={() => {
                          if (!isExpanded) loadRecordMaterials(rec.id);
                          setExpandedMatRecord(isExpanded ? null : rec.id);
                        }}>
                        {isExpanded ? "▲ skrýt" : "✏️ detail"}
                      </button>
                    </td>
                    <td style={S.td}>
                      {isHR && <button style={{ ...S.btn("#ef4444"), padding: "3px 8px", fontSize: 11 }} onClick={() => deleteRecord(rec.id)}>✕</button>}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        {/* Popis práce */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", marginBottom: 6 }}>Popis práce</div>
                        <textarea
                          style={{ ...S.input, marginBottom: 0, minHeight: 54, fontSize: 12, resize: "vertical" }}
                          placeholder="Popis práce..."
                          defaultValue={rec.activity || ""}
                          onBlur={async e => {
                            await supabase.from("attendance").update({ activity: e.target.value }).eq("id", rec.id);
                            setAttendance(attendance.map(a => a.id === rec.id ? { ...a, activity: e.target.value } : a));
                          }} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", marginBottom: 8 }}>Spotřebovaný materiál</div>
                        {mats && mats.length > 0 && (
                          <table style={{ width: "100%", fontSize: 12, marginBottom: 10 }}>
                            <thead><tr>{["Položka", "Množství", "Jednotka"].map(h => <th key={h} style={{ ...S.th, fontSize: 11 }}>{h}</th>)}</tr></thead>
                            <tbody>
                              {mats.map(m => (
                                <tr key={m.id}>
                                  <td style={S.td}>{m.item_name}</td>
                                  <td style={S.td}>{m.quantity}</td>
                                  <td style={S.td}>{m.unit}</td>
                                </tr>
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
                                  const img = p.image_url || (p.emas_code ? `https://www.emas.cz/media/cache/product_image/img/product/${p.emas_code}.jpg` : null);
                                  return (
                                    <div key={p.id} style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 7, borderBottom: "1px solid #f1f5f9" }}
                                      onClick={() => { setMatItem(p.name); setMatUnit(p.unit); setMatSuggestions([]); }}>
                                      {img ? <img src={img} alt="" onError={e => e.target.style.display="none"} style={{ width: 24, height: 24, objectFit: "contain", borderRadius: 4 }} /> : <span>📦</span>}
                                      <span style={{ color: "#1e293b" }}>{p.name}</span>
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
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#2563eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#fff", fontWeight: 800 }}>{getInitial(myName)}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18, color: "#1e293b" }}>{myName}</div>
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
          <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 14 }}>Statistiky tento měsíc</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={S.statCard("#2563eb")}><div style={S.statLabel}>Odpracováno</div><div style={S.statValue("#2563eb")}>{fmtHours(totalH)}</div></div>
            <div style={S.statCard("#34d399")}><div style={S.statLabel}>Docházka</div><div style={S.statValue("#34d399")}>{thisMonth.length} dní</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KNIHA JÍZD ──────────────────────────────────────────────────────────────

function KnihaJizd({ currentUser, employees, contracts }) {
  const isHR = ["admin", "hr", "manager"].includes(currentUser?.role);
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

  const saveKmEnd = async () => {
    if (!editKmLog) return;
    const kmEnd = Number(editKmLog.km_end);
    const log = logs.find(l => l.id === editKmLog.id);
    if (!log || kmEnd <= 0) return;
    const kmTotal = kmEnd - Number(log.km_start);
    await supabase.from("vehicle_log").update({ km_end: kmEnd, km_total: kmTotal }).eq("id", editKmLog.id);
    setLogs(logs.map(l => l.id === editKmLog.id ? { ...l, km_end: kmEnd, km_total: kmTotal } : l));
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
    if (!fDate || !fVehicleId || !fKmStart || !fKmEnd) {
      alert("Vyberte datum, vozidlo a zadejte kilometry."); return;
    }
    const kmTotal = Number(fKmEnd) - Number(fKmStart);
    if (kmTotal <= 0) { alert("Konečný stav km musí být větší než počáteční."); return; }
    setSaving(true);
    const empId = Number(fEmpId) || currentUser?.employeeId;
    const empName = employees.find(e => e.id === empId)?.name || currentUser?.name || "";
    const contractName = contractList.find(c => c.id === Number(fContractId))?.name || null;
    const row = {
      employee_id: empId,
      employee_name: empName,
      date: fDate,
      vehicle: fVehicle,
      km_start: Number(fKmStart),
      km_end: Number(fKmEnd),
      contract_id: fContractId ? Number(fContractId) : null,
      contract_name: contractName,
      note: fNote || null,
    };
    const { data: inserted } = await supabase.from("vehicle_log").insert(row).select().single();
    if (inserted) {
      setLogs(prev => [inserted, ...prev]);
      // Auto-add transport cost to contract
      if (fContractId) {
        const RATE_PER_KM = 6.5; // Kč/km (paušal)
        await supabase.from("contract_cost_entries").insert({
          contract_id: Number(fContractId),
          cost_type: "doprava",
          is_extra: false,
          date: fDate,
          description: `Doprava – ${fVehicle} (${empName})`,
          quantity: kmTotal,
          unit: "km",
          unit_price_cost: RATE_PER_KM,
          unit_price_client: RATE_PER_KM,
          employee_id: empId,
        });
      }
    }
    setFDate(fmt(new Date())); setFVehicleId(""); setFKmStart(""); setFKmEnd("");
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
        <div style={S.statCard("#2563eb")}><div style={S.statLabel}>Celkem km</div><div style={S.statValue("#2563eb")}>{totalKm.toLocaleString("cs-CZ")} km</div></div>
        <div style={S.statCard("#f97316")}><div style={S.statLabel}>Odhadované náklady</div><div style={S.statValue("#f97316")}>{fmtKc(totalCost)}</div></div>
        <div style={S.statCard("#34d399")}><div style={S.statLabel}>Počet jízd</div><div style={S.statValue("#34d399")}>{logs.length}</div></div>
      </div>

      {/* Formulář */}
      {showForm && (
        <div style={{ ...S.card, marginBottom: 20, borderLeft: "3px solid #2563eb" }}>
          <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 14, fontSize: 14 }}>Nová jízda</div>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
            <div><label style={S.label}>Stav km – start</label><input type="number" style={S.input} placeholder="0" value={fKmStart} onChange={e => setFKmStart(e.target.value)} /></div>
            <div><label style={S.label}>Stav km – konec</label><input type="number" style={S.input} placeholder="0" value={fKmEnd} onChange={e => setFKmEnd(e.target.value)} /></div>
            <div>
              <label style={S.label}>Ujeto km</label>
              <div style={{ ...S.input, background: "#e0f2fe", color: "#0369a1", fontWeight: 700, display: "flex", alignItems: "center" }}>
                {fKmStart && fKmEnd ? Math.max(0, Number(fKmEnd) - Number(fKmStart)) : "—"} km
              </div>
            </div>
            <div>
              <label style={S.label}>Zakázka</label>
              <select style={S.select} value={fContractId} onChange={e => setFContractId(e.target.value)}>
                <option value="">— bez zakázky —</option>
                {contractList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
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
                  <td style={{ ...S.td, fontWeight: 600, color: "#1e293b" }}>{l.date}</td>
                  <td style={S.td}>{l.employee_name || "—"}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{l.vehicle}</td>
                  <td style={S.td}>{l.km_start?.toLocaleString("cs-CZ")}</td>
                  <td style={S.td}>
                    {editKmLog?.id === l.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <input type="number" style={{ ...S.input, marginBottom: 0, width: 90, padding: "3px 6px", fontSize: 13 }}
                          value={editKmLog.km_end} onChange={e => setEditKmLog({ ...editKmLog, km_end: e.target.value })} autoFocus />
                        <button style={{ ...S.btn("#16a34a"), padding: "3px 8px", fontSize: 11 }} onClick={saveKmEnd}>✓</button>
                        <button style={{ ...S.btnGhost, padding: "3px 8px", fontSize: 11 }} onClick={() => setEditKmLog(null)}>✕</button>
                      </div>
                    ) : (
                      <span onClick={() => setEditKmLog({ id: l.id, km_end: l.km_end })} style={{ cursor: "pointer", borderBottom: "1px dashed #94a3b8" }} title="Klikněte pro úpravu">
                        {l.km_end?.toLocaleString("cs-CZ")}
                      </span>
                    )}
                  </td>
                  <td style={{ ...S.td, fontWeight: 700, color: "#2563eb" }}>{l.km_total != null ? l.km_total?.toLocaleString("cs-CZ") + " km" : <span style={{ color: "#f97316" }}>probíhá</span>}</td>
                  <td style={S.td}>{l.contract_name ? <span style={S.tag("#2563eb")}>{l.contract_name}</span> : <span style={{ color: "#cbd5e1" }}>—</span>}</td>
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

  useEffect(() => {
    supabase.from("employees").select("*").then(({ data }) => { if (data) setEmployees(data); });
    const saved = localStorage.getItem("crm_user");
    if (saved) {
      try { setCurrentUser(JSON.parse(saved)); } catch {}
    }
  }, []);

  const handleLogin = async () => {
    setLoginErr("");
    const name = loginName.trim();
    // 1) Zkus Supabase employees
    const { data } = await supabase.from("employees").select("*").eq("name", name).single();
    if (data) {
      if (data.password && data.password !== loginPass) { setLoginErr("Nesprávné heslo."); return; }
      const user = {
        id: data.id, name: data.name, role: data.role || "employee",
        employeeId: data.id,
        vacationDays: data.vacation_days || 20,
        vacationUsed: data.vacation_used || 0,
      };
      setCurrentUser(user);
      localStorage.setItem("crm_user", JSON.stringify(user));
      return;
    }
    // 2) Fallback na USERS (pokud employees tabulka je prázdná)
    const local = USERS.find(u => u.name.toLowerCase() === name.toLowerCase() || u.username.toLowerCase() === name.toLowerCase());
    if (!local) { setLoginErr("Zaměstnanec nenalezen."); return; }
    if (local.password && loginPass && local.password !== loginPass) { setLoginErr("Nesprávné heslo."); return; }
    const user = { id: local.id, name: local.name, role: local.role, employeeId: local.employeeId, vacationDays: local.vacationDays, vacationUsed: local.vacationUsed };
    setCurrentUser(user);
    localStorage.setItem("crm_user", JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("crm_user");
  };

  if (!currentUser) {
    return (
      <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 40, width: 360, boxShadow: "0 8px 40px #0000001a", border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 800, fontSize: 22, color: "#1e293b", marginBottom: 6, textAlign: "center" }}>
            <span style={{ color: "#2563eb" }}>Firma</span><span style={{ color: "#f97316" }}>CRM</span>
          </div>
          <div style={{ color: "#64748b", fontSize: 13, textAlign: "center", marginBottom: 28 }}>Přihlaste se do systému</div>
          {loginErr && <div style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>{loginErr}</div>}
          <label style={S.label}>Jméno</label>
          <input style={S.input} value={loginName} onChange={e => setLoginName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Vaše jméno" />
          <label style={S.label}>Heslo</label>
          <input type="password" style={S.input} value={loginPass} onChange={e => setLoginPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Heslo (volitelné)" />
          <button style={{ ...S.btn(), width: "100%", padding: 12, fontSize: 15, marginTop: 6 }} onClick={handleLogin}>Přihlásit se</button>
          <div style={{ marginTop: 16, borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8, textAlign: "center" }}>Rychlé přihlášení</div>
            {USERS.map(u => (
              <button key={u.id} onClick={() => { setLoginName(u.name); setLoginPass(""); }}
                style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", width: "100%", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <span style={{ fontSize: 12, color: "#1e293b", fontWeight: 500 }}>{u.name}</span>
                <span style={{ ...S.tag(ROLES[u.role]?.color || "#2563eb"), fontSize: 10 }}>{ROLES[u.role]?.label}</span>
              </button>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: "#94a3b8" }}>© 2026 FirmaCRM+ERP</div>
        </div>
      </div>
    );
  }

  return <MainApp currentUser={currentUser} setCurrentUser={handleLogout} />;
}
