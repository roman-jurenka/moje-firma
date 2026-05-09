import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase.js";

// ─── AUTH & USERS ────────────────────────────────────────────────────────────

const USERS = [
  { id: 1, employeeId: 1, username: "marketa", password: "1234", role: "manager", name: "Markéta Horáčková", vacationDays: 20, vacationUsed: 5 },
  { id: 2, employeeId: 2, username: "ondrej",  password: "1234", role: "employee", name: "Ondřej Beneš",      vacationDays: 25, vacationUsed: 3 },
  { id: 3, employeeId: 3, username: "lucie",   password: "1234", role: "hr",       name: "Lucie Marková",    vacationDays: 20, vacationUsed: 7 },
  { id: 4, employeeId: 4, username: "pavel",   password: "1234", role: "employee", name: "Pavel Šimánek",    vacationDays: 20, vacationUsed: 10 },
  { id: 99, employeeId: null, username: "admin", password: "admin", role: "admin", name: "Administrátor",    vacationDays: 0,  vacationUsed: 0 },
];

const ROLES = {
  admin:    { label: "Administrátor", color: "#f87171", nav: ["dashboard","customers","deals","communication","tasks","invoices","warehouse","hr","projects","costs","reports","ai","attendance","profile"] },
  manager:  { label: "Manažer",       color: "#f59e0b", nav: ["dashboard","customers","deals","communication","tasks","invoices","projects","costs","reports","ai","attendance","profile"] },
  hr:       { label: "HR",            color: "#a78bfa", nav: ["dashboard","hr","costs","attendance","profile"] },
  employee: { label: "Zaměstnanec",   color: "#60a5fa", nav: ["dashboard","attendance","profile"] },
};

// Simulovaná docházka — záznamy příchod/odchod
const today = new Date();
const fmt = (d) => d.toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, "0");
const initialAttendance = [
  // Markéta (emp 1)
  { id: 1, employeeId: 1, date: "2026-04-07", check_in: "08:02", check_out: "16:45" },
  { id: 2, employeeId: 1, date: "2026-04-08", check_in: "07:55", check_out: "17:10" },
  { id: 3, employeeId: 1, date: "2026-04-09", check_in: "08:10", check_out: "16:30" },
  { id: 4, employeeId: 1, date: "2026-04-10", check_in: "08:00", check_out: "17:00" },
  // Ondřej (emp 2)
  { id: 5, employeeId: 2, date: "2026-04-07", check_in: "09:00", check_out: "18:00" },
  { id: 6, employeeId: 2, date: "2026-04-08", check_in: "09:15", check_out: "18:30" },
  { id: 7, employeeId: 2, date: "2026-04-09", check_in: "08:45", check_out: "17:45" },
  { id: 8, employeeId: 2, date: "2026-04-10", check_in: "09:00", check_out: "18:00" },
  // Lucie (emp 3)
  { id: 9,  employeeId: 3, date: "2026-04-07", check_in: "08:30", check_out: "16:00" },
  { id: 10, employeeId: 3, date: "2026-04-08", check_in: "08:25", check_out: "16:10" },
  { id: 11, employeeId: 3, date: "2026-04-09", check_in: "08:30", check_out: "15:55" },
  // Pavel (emp 4)
  { id: 12, employeeId: 4, date: "2026-04-07", check_in: "06:00", check_out: "14:00" },
  { id: 13, employeeId: 4, date: "2026-04-08", check_in: "06:05", check_out: "14:15" },
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
const CAT_COLORS = { "Mzdy": "#6366f1", "Nájem": "#f59e0b", "Marketing": "#f87171", "IT & Software": "#60a5fa", "Logistika": "#34d399", "Ostatní": "#a78bfa" };
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
const PROJ_COLORS = { Probíhá: "#6366f1", Plánováno: "#60a5fa", Dokončeno: "#34d399", Pozastaveno: "#f87171" };
const avatarColors = ["#6366f1", "#f59e0b", "#34d399", "#f87171", "#a78bfa", "#60a5fa"];

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "📊", group: "CRM" },
  { id: "customers", label: "Zákazníci", icon: "👥", group: "CRM" },
  { id: "deals", label: "Obchodní příp.", icon: "💼", group: "CRM" },
  { id: "communication", label: "Komunikace", icon: "💬", group: "CRM" },
  { id: "tasks", label: "Úkoly", icon: "✅", group: "CRM" },
  { id: "invoices", label: "Fakturace", icon: "🧾", group: "ERP" },
  { id: "warehouse", label: "Sklad", icon: "📦", group: "ERP" },
  { id: "hr", label: "Zaměstnanci", icon: "👤", group: "ERP" },
  { id: "projects", label: "Projekty", icon: "🏗️", group: "ERP" },
  { id: "costs", label: "Náklady", icon: "📉", group: "ERP" },
  { id: "reports", label: "Reporty", icon: "📈", group: "Analytika" },
  { id: "ai", label: "AI Asistent", icon: "🤖", group: "Analytika" },
  { id: "attendance", label: "Docházka", icon: "🕐", group: "Osobní" },
  { id: "profile", label: "Můj profil", icon: "👤", group: "Osobní" },
];

// ─── STYLES ──────────────────────────────────────────────────────────────────

const S = {
  app: { fontFamily: "'DM Sans', sans-serif", background: "#0a0d14", minHeight: "100vh", color: "#e2e8f0", display: "flex" },
  sidebar: { width: 220, background: "#0f1320", borderRight: "1px solid #1a2035", padding: "0", display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0, left: 0, overflowY: "auto" },
  logo: { padding: "22px 20px 16px", fontSize: 19, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px", borderBottom: "1px solid #1a2035" },
  logoA: { color: "#6366f1" },
  logoB: { color: "#34d399" },
  groupLabel: { padding: "16px 20px 4px", fontSize: 10, color: "#334155", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 },
  navItem: (a) => ({ padding: "9px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, fontSize: 13, fontWeight: 500, color: a ? "#fff" : "#475569", background: a ? "#1a2035" : "transparent", borderLeft: a ? "3px solid #6366f1" : "3px solid transparent", transition: "all 0.12s" }),
  main: { marginLeft: 220, padding: "28px 32px", flex: 1, minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  h1: { fontSize: 24, fontWeight: 700, color: "#fff", margin: 0 },
  btn: (c = "#6366f1") => ({ background: c, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  btnGhost: { background: "transparent", color: "#6366f1", border: "1px solid #6366f1", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  card: { background: "#0f1320", borderRadius: 12, padding: 22, border: "1px solid #1a2035" },
  grid4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  statCard: (c) => ({ background: "#0f1320", borderRadius: 12, padding: "18px 22px", border: `1px solid ${c}33` }),
  statLabel: { fontSize: 11, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" },
  statValue: (c) => ({ fontSize: 26, fontWeight: 800, color: c }),
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "9px 12px", fontSize: 11, color: "#475569", borderBottom: "1px solid #1a2035", textTransform: "uppercase", letterSpacing: "0.06em" },
  td: { padding: "11px 12px", fontSize: 13, borderBottom: "1px solid #1a2035", color: "#94a3b8" },
  tag: (c) => ({ background: c + "22", color: c, borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 700, display: "inline-block" }),
  search: { background: "#1a2035", border: "1px solid #252d45", borderRadius: 8, padding: "9px 13px", color: "#e2e8f0", fontSize: 13, outline: "none", width: 240 },
  modal: { position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  modalBox: { background: "#0f1320", borderRadius: 16, padding: 28, width: 440, border: "1px solid #252d45", maxHeight: "90vh", overflowY: "auto" },
  input: { background: "#0a0d14", border: "1px solid #252d45", borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box", marginBottom: 10 },
  select: { background: "#0a0d14", border: "1px solid #252d45", borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, width: "100%", outline: "none", boxSizing: "border-box", marginBottom: 10 },
  label: { fontSize: 11, color: "#475569", marginBottom: 3, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" },
  avatar: (c) => ({ width: 34, height: 34, borderRadius: "50%", background: c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }),
  progress: (pct, c) => ({ height: 6, borderRadius: 3, background: "#1a2035", overflow: "hidden", position: "relative" }),
  progressBar: (pct, c) => ({ height: "100%", width: `${pct}%`, background: c, borderRadius: 3, transition: "width 0.4s" }),
  kanbanCol: { background: "#0f1320", borderRadius: 12, padding: 14, minWidth: 170, flex: 1, border: "1px solid #1a2035" },
  kanbanCard: { background: "#0a0d14", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #1a2035" },
  commItem: { display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid #1a2035" },
  commDot: (t) => ({ width: 9, height: 9, borderRadius: "50%", background: t === "Email" ? "#6366f1" : t === "Hovor" ? "#34d399" : "#f59e0b", marginTop: 4, flexShrink: 0 }),
  divider: { height: 1, background: "#1a2035", margin: "12px 0" },
  badge: (c) => ({ background: c + "22", color: c, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }),
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const getInitial = (name) => name?.charAt(0).toUpperCase() || "?";
const fmtKc = (v) => `${Number(v).toLocaleString("cs-CZ")} Kč`;
const nextInvNum = (invoices) => `FAK-2026-${String(invoices.length + 1).padStart(3, "0")}`;

// ─── MAIN APP ────────────────────────────────────────────────────────────────

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);

  if (!currentUser) return <Login onLogin={setCurrentUser} />;

  return <MainApp currentUser={currentUser} setCurrentUser={setCurrentUser} />;
}

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
  const [templates, setTemplates] = useState(initialTemplates);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);

  const closeModal = () => setModal(null);

  // ── Load all data from Supabase ──
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [c, d, cm, t, inv, p, e, pr, co, att] = await Promise.all([
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
      ]);
      if (c.data) setCustomers(c.data.map(x => ({ ...x, customerId: x.customer_id })));
      if (d.data) setDeals(d.data.map(x => ({ ...x, customerId: x.customer_id })));
      if (cm.data) setCommunication(cm.data.map(x => ({ ...x, customerId: x.customer_id })));
      if (t.data) setTasks(t.data.map(x => ({ ...x, customerId: x.customer_id })));
      if (inv.data) setInvoices(inv.data.map(x => ({ ...x, customerId: x.customer_id })));
      if (p.data) setProducts(p.data.map(x => ({ ...x, minStock: x.min_stock })));
      if (e.data) setEmployees(e.data.map(x => ({ ...x, start: x.start_date })));
      if (pr.data) setProjects(pr.data.map(x => ({ ...x, customerId: x.customer_id, steps: (x.project_steps || []).map(s => ({ ...s, order: s.step_order })) })));
      if (co.data) setCosts(co.data);
      if (att.data) setAttendance(att.data.map(x => ({ ...x, employeeId: x.employee_id })));
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
  const todayRecord = attendance.find(a => a.employeeId === myEmpId && a.work_date === todayStr);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0d14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "DM Sans, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 16 }}>Firma<span style={{ color: "#6366f1" }}>CRM</span><span style={{ color: "#34d399" }}>+ERP</span></div>
        <div style={{ color: "#475569", fontSize: 14 }}>Načítám data z databáze...</div>
        <div style={{ marginTop: 20, display: "flex", gap: 6, justifyContent: "center" }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: "#6366f1", animation: `pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
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

  const check_in = async () => {
    const now = new Date();
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (todayRecord) {
      await supabase.from("attendance").update({ check_out: time }).eq("id", todayRecord.id);
      setAttendance(attendance.map(a => a.id === todayRecord.id ? { ...a, check_out: time } : a));
    } else {
      const { data: row } = await supabase.from("attendance")
      .upsert(
  {
    employee_id: myEmpId,
    work_date: todayStr,
    check_in: time,
    check_out: null
  },
  {
    onConflict: "employee_id,work_date"
  }
)
        .select().single();
      if (row) setAttendance([...attendance, { ...row, employeeId: row.employee_id }]);
    }
  };

  return (
    <div style={S.app}>
      {/* SIDEBAR */}
      <div style={S.sidebar}>
        <div style={S.logo}>
          Firma<span style={S.logoA}>CRM</span><span style={S.logoB}>+ERP</span>
        </div>

        {/* User info + role */}
        <div style={{ padding: "12px 16px", margin: "0 12px 8px", background: "#0a0d14", borderRadius: 10, border: "1px solid #1a2035" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#fff", flexShrink: 0 }}>
              {getInitial(currentUser.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.name}</div>
              <span style={{ ...S.tag(ROLES[currentUser.role]?.color || "#6366f1"), fontSize: 10 }}>{ROLES[currentUser.role]?.label}</span>
            </div>
          </div>
          {/* Quick check_in */}
          {myEmpId && (
            <button onClick={check_in} style={{ ...S.btn(todayRecord?.check_in && !todayRecord?.check_out ? "#f59e0b" : todayRecord?.check_out ? "#34d399" : "#6366f1"), width: "100%", marginTop: 10, fontSize: 11, padding: "7px" }}>
              {todayRecord?.check_out ? `✓ Odchod ${todayRecord.check_out}` : todayRecord?.check_in ? `⏱ Zapsat odchod (${todayRecord.check_in})` : "▶ Zapsat příchod"}
            </button>
          )}
        </div>

        {groups.map(g => (
          <div key={g}>
            <div style={S.groupLabel}>{g}</div>
            {visibleNav.filter(n => n.group === g).map(n => (
              <div key={n.id} style={S.navItem(tab === n.id)} onClick={() => { setTab(n.id); setSearch(""); }}>
                <span style={{ fontSize: 15 }}>{n.icon}</span> {n.label}
              </div>
            ))}
          </div>
        ))}

        {/* Logout */}
        <div style={{ marginTop: "auto", padding: "12px 16px" }}>
          <button onClick={() => setCurrentUser(null)} style={{ ...S.btnGhost, width: "100%", fontSize: 12, color: "#f87171", borderColor: "#f8717133" }}>
            ← Odhlásit se
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div style={S.main}>

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && <Dashboard
          customers={customers} deals={deals} tasks={tasks} invoices={invoices}
          products={products} employees={employees} projects={projects}
          totalRevenue={totalRevenue} pendingRevenue={pendingRevenue}
          overdueRevenue={overdueRevenue} lowStock={lowStock}
          totalPayroll={totalPayroll} activeProjects={activeProjects}
          costs={costs}
          toggleTask={(id) => setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t))}
          setTab={setTab}
        />}

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
          modal={modal} setModal={setModal} closeModal={closeModal}
        />}

        {/* ── KOMUNIKACE ── */}
        {tab === "communication" && <Communication
          communication={communication} setCommunication={setCommunication}
          customers={customers} modal={modal} setModal={setModal} closeModal={closeModal}
        />}

        {/* ── ÚKOLY ── */}
        {tab === "tasks" && <Tasks
          tasks={tasks} setTasks={setTasks} customers={customers}
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
          modal={modal} setModal={setModal} closeModal={closeModal}
        />}

        {/* ── HR ── */}
        {tab === "hr" && <HR
          employees={employees} setEmployees={setEmployees}
          modal={modal} setModal={setModal} closeModal={closeModal}
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
          employees={employees}
        />}

        {tab === "profile" && <Profile
          currentUser={currentUser} attendance={attendance} employees={employees}
        />}
      </div>
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

function Dashboard({ customers, deals, tasks, invoices, products, employees, projects,
  totalRevenue, pendingRevenue, overdueRevenue, lowStock, totalPayroll, activeProjects, costs, toggleTask, setTab }) {
  const totalCosts = costs.reduce((s, c) => s + c.amount, 0);
  const thisMonthCosts = costs.filter(c => c.date.startsWith("2026-04")).reduce((s, c) => s + c.amount, 0);
  const stats = [
    { label: "Zákazníci", value: customers.length, color: "#6366f1" },
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
            Nejbližší úkoly <span style={{ color: "#6366f1", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("tasks")}>Vše →</span>
          </div>
          {tasks.filter(t => !t.done).slice(0, 4).map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} style={{ accentColor: "#6366f1" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#e2e8f0" }}>{t.title}</div>
                <div style={{ fontSize: 11, color: "#475569" }}>{t.due}</div>
              </div>
              <span style={S.tag(PRIO_COLORS[t.priority] || "#64748b")}>{t.priority}</span>
            </div>
          ))}
        </div>

        {/* Varování skladu */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
            ⚠️ Nízký stav skladu <span style={{ color: "#6366f1", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("warehouse")}>Sklad →</span>
          </div>
          {lowStock.length === 0 ? <div style={{ color: "#475569", fontSize: 13 }}>Vše v pořádku ✓</div> :
            lowStock.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#e2e8f0" }}>{p.name}</div>
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
            Projekty <span style={{ color: "#6366f1", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("projects")}>Vše →</span>
          </div>
          {projects.slice(0, 3).map(p => (
            <div key={p.id} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "#e2e8f0" }}>{p.name}</span>
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
            Poslední faktury <span style={{ color: "#6366f1", fontSize: 12, cursor: "pointer" }} onClick={() => setTab("invoices")}>Vše →</span>
          </div>
          {invoices.slice(-3).reverse().map(inv => {
            const cust = customers.find(c => c.id === inv.customerId);
            return (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, color: "#e2e8f0" }}>{inv.number}</div>
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
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.company.toLowerCase().includes(search.toLowerCase())
  );

  const save = () => {
    if (!newC.name) return;
    setCustomers([...customers, { ...newC, id: Date.now() }]);
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
          <thead><tr>{["Jméno", "Firma", "Email", "Faktury", "Štítek", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
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
                  <td style={S.td}>{custInvoices.length} faktur</td>
                  <td style={S.td}><span style={S.tag(TAG_COLORS[c.tag] || "#6366f1")}>{c.tag}</span></td>
                  <td style={S.td}><span style={{ color: "#6366f1", fontSize: 12 }}>Detail →</span></td>
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
              <div style={{ color: "#475569", fontSize: 13, marginBottom: 16 }}>{c.company} · {c.email} · {c.phone}</div>

              <SectionTitle>Faktury</SectionTitle>
              {custInv.length === 0 ? <Empty /> : custInv.map(inv => (
                <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a2035" }}>
                  <span style={{ color: "#e2e8f0", fontSize: 13 }}>{inv.number}</span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{fmtKc(inv.amount)}</span>
                    <span style={S.tag(INV_COLORS[inv.status])}>{inv.status}</span>
                  </div>
                </div>
              ))}

              <SectionTitle style={{ marginTop: 16 }}>Dealy</SectionTitle>
              {custDeals.length === 0 ? <Empty /> : custDeals.map(d => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a2035" }}>
                  <span style={{ color: "#e2e8f0", fontSize: 13 }}>{d.name}</span>
                  <span style={S.tag(STAGE_COLORS[d.stage])}>{d.stage}</span>
                </div>
              ))}

              <SectionTitle style={{ marginTop: 16 }}>Komunikace</SectionTitle>
              {custComm.length === 0 ? <Empty /> : custComm.map(cm => (
                <div key={cm.id} style={{ padding: "8px 0", borderBottom: "1px solid #1a2035" }}>
                  <div style={{ fontSize: 11, color: "#475569" }}>{cm.type} · {cm.date}</div>
                  <div style={{ fontSize: 13, color: "#e2e8f0" }}>{cm.note}</div>
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

function Deals({ deals, setDeals, customers, modal, setModal, closeModal }) {
  const [newD, setNewD] = useState({ name: "", value: "", stage: "Nový", customerId: "" });
  const save = () => {
    if (!newD.name) return;
    setDeals([...deals, { ...newD, id: Date.now(), value: Number(newD.value), customerId: Number(newD.customerId) }]);
    setNewD({ name: "", value: "", stage: "Nový", customerId: "" });
    closeModal();
  };
  return (
    <>
      <div style={S.header}><h1 style={S.h1}>Obchodní příležitosti</h1><button style={S.btn()} onClick={() => setModal({ type: "addDeal" })}>+ Přidat deal</button></div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 16 }}>
        {STAGES.map(stage => (
          <div key={stage} style={S.kanbanCol}>
            <div style={{ fontWeight: 700, color: STAGE_COLORS[stage], marginBottom: 12, fontSize: 11, letterSpacing: "0.08em" }}>{stage.toUpperCase()}</div>
            {deals.filter(d => d.stage === stage).map(d => {
              const cust = customers.find(c => c.id === d.customerId);
              return (
                <div key={d.id} style={S.kanbanCard}>
                  <div style={{ fontWeight: 600, color: "#fff", fontSize: 13, marginBottom: 5 }}>{d.name}</div>
                  <div style={{ color: "#475569", fontSize: 11, marginBottom: 7 }}>{cust?.name || "—"}</div>
                  <div style={{ color: STAGE_COLORS[stage], fontWeight: 800, fontSize: 14 }}>{fmtKc(d.value)}</div>
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
          <ModalActions onSave={save} onClose={closeModal} />
        </div></div>
      )}
    </>
  );
}

// ─── KOMUNIKACE ───────────────────────────────────────────────────────────────

function Communication({ communication, setCommunication, customers, modal, setModal, closeModal }) {
  const [newC, setNewC] = useState({ type: "Email", date: "", note: "", customerId: "" });
  const save = () => {
    if (!newC.note) return;
    setCommunication([...communication, { ...newC, id: Date.now(), customerId: Number(newC.customerId) }]);
    setNewC({ type: "Email", date: "", note: "", customerId: "" });
    closeModal();
  };
  return (
    <>
      <div style={S.header}><h1 style={S.h1}>Historie komunikace</h1><button style={S.btn()} onClick={() => setModal({ type: "addComm" })}>+ Přidat</button></div>
      <div style={S.card}>
        {communication.map(c => {
          const cust = customers.find(cu => cu.id === c.customerId);
          return (
            <div key={c.id} style={S.commItem}>
              <div style={S.commDot(c.type)} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: "#fff", fontSize: 13 }}>{cust?.name || "—"}</span>
                  <span style={S.tag(c.type === "Email" ? "#6366f1" : c.type === "Hovor" ? "#34d399" : "#f59e0b")}>{c.type}</span>
                  <span style={{ color: "#475569", fontSize: 11, marginLeft: "auto" }}>{c.date}</span>
                </div>
                <div style={{ color: "#94a3b8", fontSize: 13 }}>{c.note}</div>
              </div>
            </div>
          );
        })}
      </div>
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

function Tasks({ tasks, setTasks, customers, modal, setModal, closeModal }) {
  const [newT, setNewT] = useState({ title: "", due: "", priority: "Střední", customerId: "" });
  const save = () => {
    if (!newT.title) return;
    setTasks([...tasks, { ...newT, id: Date.now(), done: false, customerId: Number(newT.customerId) }]);
    setNewT({ title: "", due: "", priority: "Střední", customerId: "" });
    closeModal();
  };
  const toggle = (id) => setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
  return (
    <>
      <div style={S.header}><h1 style={S.h1}>Úkoly & připomínky</h1><button style={S.btn()} onClick={() => setModal({ type: "addTask" })}>+ Přidat</button></div>
      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>{["", "Úkol", "Zákazník", "Termín", "Priorita"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {tasks.map(t => {
              const cust = customers.find(c => c.id === t.customerId);
              return (
                <tr key={t.id} style={{ opacity: t.done ? 0.4 : 1 }}>
                  <td style={S.td}><input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} style={{ accentColor: "#6366f1" }} /></td>
                  <td style={{ ...S.td, textDecoration: t.done ? "line-through" : "none", color: "#fff", fontWeight: 500 }}>{t.title}</td>
                  <td style={S.td}>{cust?.name || "—"}</td>
                  <td style={S.td}>{t.due}</td>
                  <td style={S.td}><span style={S.tag(PRIO_COLORS[t.priority] || "#64748b")}>{t.priority}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {modal?.type === "addTask" && (
        <div style={S.modal}><div style={S.modalBox}>
          <ModalHeader title="Nový úkol" onClose={closeModal} />
          <label style={S.label}>Název</label><input style={S.input} value={newT.title} onChange={e => setNewT({ ...newT, title: e.target.value })} />
          <label style={S.label}>Termín</label><input style={S.input} type="date" value={newT.due} onChange={e => setNewT({ ...newT, due: e.target.value })} />
          <label style={S.label}>Priorita</label>
          <select style={S.select} value={newT.priority} onChange={e => setNewT({ ...newT, priority: e.target.value })}>{["Vysoká", "Střední", "Nízká"].map(p => <option key={p}>{p}</option>)}</select>
          <label style={S.label}>Zákazník</label>
          <select style={S.select} value={newT.customerId} onChange={e => setNewT({ ...newT, customerId: e.target.value })}>
            <option value="">— vyberte —</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ModalActions onSave={save} onClose={closeModal} />
        </div></div>
      )}
    </>
  );
}

// ─── FAKTURACE ────────────────────────────────────────────────────────────────

function Invoices({ invoices, setInvoices, customers, modal, setModal, closeModal }) {
  const [newInv, setNewInv] = useState({ customerId: "", amount: "", status: "Čeká", issued: "", due: "", items: [{ desc: "", qty: 1, price: 0 }] });

  const save = () => {
    if (!newInv.customerId || !newInv.amount) return;
    const amount = Number(newInv.amount);
    setInvoices([...invoices, { ...newInv, id: Date.now(), number: nextInvNum(invoices), amount, tax: Math.round(amount * 0.21), customerId: Number(newInv.customerId) }]);
    setNewInv({ customerId: "", amount: "", status: "Čeká", issued: "", due: "", items: [{ desc: "", qty: 1, price: 0 }] });
    closeModal();
  };

  const changeStatus = (id, status) => setInvoices(invoices.map(i => i.id === id ? { ...i, status } : i));

  return (
    <>
      <div style={S.header}><h1 style={S.h1}>Fakturace & účetnictví</h1><button style={S.btn()} onClick={() => setModal({ type: "addInvoice" })}>+ Nová faktura</button></div>

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
            {invoices.map(inv => {
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

function Warehouse({ products, setProducts, modal, setModal, closeModal }) {
  const [newP, setNewP] = useState({ name: "", sku: "", category: "", price: "", stock: "", minStock: "", unit: "ks" });
  const save = () => {
    if (!newP.name) return;
    setProducts([...products, { ...newP, id: Date.now(), price: Number(newP.price), stock: Number(newP.stock), minStock: Number(newP.minStock) }]);
    setNewP({ name: "", sku: "", category: "", price: "", stock: "", minStock: "", unit: "ks" });
    closeModal();
  };
  const adjustStock = (id, delta) => setProducts(products.map(p => p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p));

  return (
    <>
      <div style={S.header}><h1 style={S.h1}>Sklad & zboží</h1><button style={S.btn()} onClick={() => setModal({ type: "addProduct" })}>+ Přidat produkt</button></div>
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
          <thead><tr>{["Produkt", "SKU", "Kategorie", "Cena/ks", "Skladem", "Min. stav", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {products.map(p => {
              const low = p.stock <= p.minStock;
              return (
                <tr key={p.id}>
                  <td style={{ ...S.td, color: "#fff", fontWeight: 600 }}>{p.name}</td>
                  <td style={S.td}>{p.sku}</td>
                  <td style={S.td}>{p.category}</td>
                  <td style={{ ...S.td, color: "#fff" }}>{fmtKc(p.price)}</td>
                  <td style={S.td}><span style={S.tag(low ? "#f87171" : "#34d399")}>{p.stock} {p.unit}</span></td>
                  <td style={S.td}>{p.minStock} {p.unit}</td>
                  <td style={S.td}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button style={{ ...S.btn("#34d399"), padding: "4px 10px" }} onClick={() => adjustStock(p.id, 1)}>+</button>
                      <button style={{ ...S.btn("#f87171"), padding: "4px 10px" }} onClick={() => adjustStock(p.id, -1)}>−</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {modal?.type === "addProduct" && (
        <div style={S.modal}><div style={S.modalBox}>
          <ModalHeader title="Nový produkt" onClose={closeModal} />
          {[["Název", "name"], ["SKU kód", "sku"], ["Kategorie", "category"], ["Cena (Kč)", "price"], ["Počet na skladě", "stock"], ["Minimální stav", "minStock"], ["Jednotka", "unit"]].map(([l, k]) => (
            <div key={k}><label style={S.label}>{l}</label><input style={S.input} value={newP[k]} onChange={e => setNewP({ ...newP, [k]: e.target.value })} /></div>
          ))}
          <ModalActions onSave={save} onClose={closeModal} />
        </div></div>
      )}
    </>
  );
}

// ─── HR ──────────────────────────────────────────────────────────────────────

function HR({ employees, setEmployees, modal, setModal, closeModal }) {
  const [newE, setNewE] = useState({ name: "", position: "", department: "", email: "", salary: "", status: "Aktivní", start: "" });
  const save = () => {
    if (!newE.name) return;
    setEmployees([...employees, { ...newE, id: Date.now(), salary: Number(newE.salary) }]);
    setNewE({ name: "", position: "", department: "", email: "", salary: "", status: "Aktivní", start: "" });
    closeModal();
  };
  const depts = [...new Set(employees.map(e => e.department))];
  const totalPayroll = employees.filter(e => e.status === "Aktivní").reduce((s, e) => s + e.salary, 0);

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
      <div style={S.card}>
        <table style={S.table}>
          <thead><tr>{["Zaměstnanec", "Pozice", "Oddělení", "Email", "Plat/měs.", "Stav", "Od"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {employees.map((e, i) => (
              <tr key={e.id}>
                <td style={S.td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div style={S.avatar(avatarColors[i % 6])}>{getInitial(e.name)}</div>
                    <span style={{ color: "#fff", fontWeight: 600 }}>{e.name}</span>
                  </div>
                </td>
                <td style={S.td}>{e.position}</td>
                <td style={S.td}><span style={S.tag("#6366f1")}>{e.department}</span></td>
                <td style={S.td}>{e.email}</td>
                <td style={{ ...S.td, color: "#fff", fontWeight: 700 }}>{fmtKc(e.salary)}</td>
                <td style={S.td}><span style={S.tag(e.status === "Aktivní" ? "#34d399" : "#f59e0b")}>{e.status}</span></td>
                <td style={S.td}>{e.start}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

  const toggleStep = (projectId, stepId) => {
    setProjects(projects.map(p => {
      if (p.id !== projectId) return p;
      const steps = p.steps.map(s => s.id === stepId ? { ...s, done: !s.done } : s);
      const progress = calcProgress(steps);
      const status = progress === 100 ? "Dokončeno" : progress > 0 ? "Probíhá" : p.status;
      return { ...p, steps, progress, status };
    }));
  };

  const addStep = (projectId) => {
    const title = newStep[projectId]?.trim();
    if (!title) return;
    setProjects(projects.map(p => {
      if (p.id !== projectId) return p;
      const steps = [...(p.steps || []), { id: Date.now(), title, done: false, note: "", order: (p.steps?.length || 0) + 1 }];
      return { ...p, steps, progress: calcProgress(steps) };
    }));
    setNewStep({ ...newStep, [projectId]: "" });
  };

  const deleteStep = (projectId, stepId) => {
    setProjects(projects.map(p => {
      if (p.id !== projectId) return p;
      const steps = p.steps.filter(s => s.id !== stepId);
      return { ...p, steps, progress: calcProgress(steps) };
    }));
  };

  const saveNote = (projectId, stepId, note) => {
    setProjects(projects.map(p => {
      if (p.id !== projectId) return p;
      return { ...p, steps: p.steps.map(s => s.id === stepId ? { ...s, note } : s) };
    }));
    setEditingNote({});
  };

  const applyTemplate = (projectId, template) => {
    setProjects(projects.map(p => {
      if (p.id !== projectId) return p;
      const steps = template.steps.map((title, i) => ({ id: Date.now() + i, title, done: false, note: "", order: i + 1 }));
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

  const save = () => {
    if (!newP.name) return;
    const steps = selectedTemplate
      ? selectedTemplate.steps.map((title, i) => ({ id: Date.now() + i, title, done: false, note: "", order: i + 1 }))
      : [];
    const progress = calcProgress(steps);
    setProjects([...projects, { ...newP, id: Date.now(), budget: Number(newP.budget), progress, customerId: Number(newP.customerId), steps }]);
    setNewP({ name: "", customerId: "", status: "Plánováno", progress: 0, budget: "", spent: 0, deadline: "", assignees: [], steps: [] });
    setSelectedTemplate(null);
    closeModal();
  };

  const updateProgress = (id, progress) => setProjects(projects.map(p => p.id === id ? { ...p, progress: Number(progress) } : p));
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
              <div key={t.id} style={{ background: "#0a0d14", border: "1px solid #1a2035", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{t.icon}</div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 13, marginBottom: 8 }}>{t.name}</div>
                <div style={{ marginBottom: 10 }}>
                  {t.steps.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: "1px solid #1a2035" }}>
                      <div style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid #252d45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#475569", flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{s}</span>
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
          { label: "Celkem projektů", value: projects.length, color: "#6366f1" },
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
                    style={{ background: "#1a2035", border: "1px solid #252d45", borderRadius: 8, padding: "5px 12px", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>
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
                      <span style={{ color: "#6366f1", fontWeight: 700 }}>{realProgress}%</span>
                    </div>
                    {/* Kroky vizuální progress */}
                    <div style={{ display: "flex", gap: 2 }}>
                      {steps.map(s => (
                        <div key={s.id} style={{ flex: 1, height: 6, borderRadius: 3, background: s.done ? "#6366f1" : "#1a2035", transition: "background 0.3s" }} title={s.title} />
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
                    <span style={{ fontSize: 11, color: "#6366f1", fontWeight: 700 }}>{p.progress}%</span>
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
                              <div style={{ width: 22, height: 22, borderRadius: "50%", background: step.done ? "#6366f1" : "#1a2035", border: step.done ? "none" : "1px solid #252d45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: step.done ? "#fff" : "#334155", flexShrink: 0, cursor: "pointer", fontWeight: 700 }}
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
                                <div style={{ fontSize: 11, color: "#252d45", marginTop: 3, cursor: "pointer" }}
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
                    <button style={{ ...S.btn("#6366f1"), padding: "9px 16px", fontSize: 13 }} onClick={() => addStep(p.id)}>+ Přidat</button>
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
            <div style={{ background: "#0a0d14", borderRadius: 8, padding: 10, marginBottom: 10, border: "1px solid #252d45" }}>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>Kroky které budou přidány:</div>
              {selectedTemplate.steps.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: "#94a3b8", padding: "2px 0" }}>
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
                style={{ fontSize: 20, padding: "6px 10px", borderRadius: 8, background: newTemplate.icon === ico ? "#6366f133" : "#0a0d14", border: newTemplate.icon === ico ? "1px solid #6366f1" : "1px solid #252d45", cursor: "pointer" }}>
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

  const save = () => {
    if (!newC.description || !newC.amount) return;
    setCosts([...costs, { ...newC, id: Date.now(), amount: Number(newC.amount) }]);
    setNewC({ date: "", category: "Mzdy", description: "", amount: "", recurring: false });
    closeModal();
  };

  const deleteCost = (id) => setCosts(costs.filter(c => c.id !== id));

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
          ...quarters.map(q => ({ label: q.label, value: fmtKc(q.total), color: "#6366f1" })),
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
                  <div style={{ width: "100%", display: "flex", flexDirection: "column-reverse", borderRadius: 4, overflow: "hidden", height: barH || 3, minHeight: m.total > 0 ? 8 : 3, background: m.total > 0 ? "transparent" : "#1a2035" }}>
                    {COST_CATEGORIES.map(cat => {
                      const catH = maxMonthly > 0 ? (m.byCategory[cat] / maxMonthly) * 150 : 0;
                      if (catH < 1) return null;
                      return <div key={cat} style={{ width: "100%", height: catH, background: CAT_COLORS[cat], opacity: 0.85 }} title={`${cat}: ${fmtKc(m.byCategory[cat])}`} />;
                    })}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: i === 3 ? "#6366f1" : "#475569", fontWeight: i === 3 ? 700 : 400 }}>{m.month}</div>
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
                  <span style={{ fontSize: 13, color: "#e2e8f0" }}>{c.cat}</span>
                  <span style={{ fontSize: 11, color: "#334155" }}>({c.count}×)</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmtKc(c.total)}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "#1a2035", overflow: "hidden" }}>
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
            { label: "Pravidelné náklady", items: costs.filter(c => c.recurring), color: "#6366f1" },
            { label: "Jednorázové náklady", items: costs.filter(c => !c.recurring), color: "#f59e0b" },
          ].map(g => {
            const total = g.items.reduce((s, c) => s + c.amount, 0);
            return (
              <div key={g.label} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: "#e2e8f0" }}>{g.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: g.color }}>{fmtKc(total)}</span>
                </div>
                {g.items.slice(0, 3).map(item => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #1a2035" }}>
                    <span style={{ fontSize: 12, color: "#475569" }}>{item.description}</span>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>{fmtKc(item.amount)}</span>
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
                style={{ ...S.btn(filterCat === cat ? CAT_COLORS[cat] || "#6366f1" : "#1a2035"), padding: "5px 12px", fontSize: 11, border: filterCat === cat ? "none" : "1px solid #252d45" }}>
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
                <td style={S.td}><span style={S.tag(CAT_COLORS[c.category] || "#6366f1")}>{c.category}</span></td>
                <td style={{ ...S.td, color: "#e2e8f0" }}>{c.description}</td>
                <td style={{ ...S.td, color: "#fff", fontWeight: 700 }}>{fmtKc(c.amount)}</td>
                <td style={S.td}><span style={S.tag(c.recurring ? "#6366f1" : "#f59e0b")}>{c.recurring ? "Pravidelný" : "Jednorázový"}</span></td>
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
            <input type="checkbox" checked={newC.recurring} onChange={e => setNewC({ ...newC, recurring: e.target.checked })} style={{ accentColor: "#6366f1" }} />
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
            <button key={y} style={{ ...S.btn(period === y ? "#6366f1" : "#1a2035"), border: "1px solid #252d45" }} onClick={() => setPeriod(y)}>{y}</button>
          ))}
        </div>
      </div>

      {/* KPI řada */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Celkový zisk", value: fmtKc(profit), sub: `Marže ${margin}%`, color: profit >= 0 ? "#34d399" : "#f87171" },
          { label: "Příjmy", value: fmtKc(totalRevenue), sub: `${invoices.filter(i => i.status === "Zaplacena").length} faktur`, color: "#6366f1" },
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
                <div style={{ fontSize: 9, color: i === 3 ? "#6366f1" : "#334155" }}>{m.month}</div>
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
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : "#cd7c2f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#0a0d14", flexShrink: 0 }}>{i + 1}</div>
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
              <div style={{ height: 5, borderRadius: 3, background: "#1a2035", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(p.value / totalPipeline) * 100}%`, background: STAGE_COLORS[p.stage], borderRadius: 3 }} />
              </div>
            </div>
          ))}
          <div style={{ ...S.divider, margin: "14px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "#475569" }}>Celková pipeline hodnota</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#6366f1" }}>{fmtKc(totalPipeline)}</span>
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
                  <span style={{ fontSize: 13, color: "#e2e8f0" }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: over ? "#f87171" : "#34d399", fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#1a2035", overflow: "hidden" }}>
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
                    <span style={{ fontSize: 13, color: "#e2e8f0" }}>{d.dept}</span>
                    <span style={{ fontSize: 11, color: "#334155" }}>{d.count} os.</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{fmtKc(d.salary)}</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: "#1a2035", overflow: "hidden" }}>
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
            style={{ background: "#0f1320", border: "1px solid #252d45", borderRadius: 20, padding: "6px 14px", fontSize: 12, color: "#94a3b8", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => { e.target.style.borderColor = "#6366f1"; e.target.style.color = "#fff"; }}
            onMouseLeave={e => { e.target.style.borderColor = "#252d45"; e.target.style.color = "#94a3b8"; }}>
            {s}
          </button>
        ))}
      </div>

      {/* Chat okno */}
      <div style={{ ...S.card, height: 440, overflowY: "auto", marginBottom: 16, display: "flex", flexDirection: "column", gap: 16, padding: 20 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 12, flexDirection: m.role === "user" ? "row-reverse" : "row", alignItems: "flex-start" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.role === "user" ? "#6366f1" : "#1a2035", border: m.role === "assistant" ? "1px solid #252d45" : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
              {m.role === "user" ? "👤" : "🤖"}
            </div>
            <div style={{ maxWidth: "75%", background: m.role === "user" ? "#6366f133" : "#1a2035", border: `1px solid ${m.role === "user" ? "#6366f155" : "#252d45"}`, borderRadius: m.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px", padding: "12px 16px" }}>
              <div style={{ fontSize: 13, color: "#e2e8f0", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1a2035", border: "1px solid #252d45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🤖</div>
            <div style={{ background: "#1a2035", border: "1px solid #252d45", borderRadius: "4px 16px 16px 16px", padding: "14px 18px" }}>
              <div style={{ display: "flex", gap: 5 }}>
                {[0, 1, 2].map(j => (
                  <div key={j} style={{ width: 7, height: 7, borderRadius: "50%", background: "#6366f1", animation: `pulse 1.2s ease-in-out ${j * 0.2}s infinite` }} />
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

// ─── LOGIN ────────────────────────────────────────────────────────────────────

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  const submit = () => {
    const user = USERS.find(u => u.username === username && u.password === password);
    if (user) { onLogin(user); }
    else { setError("Špatné uživatelské jméno nebo heslo."); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0d14", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: 380, background: "#0f1320", borderRadius: 20, padding: 40, border: "1px solid #1a2035", boxShadow: "0 24px 80px #000a" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-1px" }}>
            Firma<span style={{ color: "#6366f1" }}>CRM</span><span style={{ color: "#34d399" }}>+ERP</span>
          </div>
          <div style={{ color: "#334155", fontSize: 13, marginTop: 6 }}>Přihlaste se do firemního systému</div>
        </div>

        <label style={S.label}>Uživatelské jméno</label>
        <input style={S.input} value={username} onChange={e => { setUsername(e.target.value); setError(""); }}
          placeholder="např. marketa" onKeyDown={e => e.key === "Enter" && submit()} />

        <label style={S.label}>Heslo</label>
        <div style={{ position: "relative", marginBottom: 10 }}>
          <input style={{ ...S.input, marginBottom: 0, paddingRight: 40 }} type={showPass ? "text" : "password"}
            value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
            placeholder="••••••••" onKeyDown={e => e.key === "Enter" && submit()} />
          <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 14 }}>
            {showPass ? "🙈" : "👁"}
          </button>
        </div>

        {error && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 10 }}>⚠ {error}</div>}

        <button onClick={submit} style={{ ...S.btn(), width: "100%", padding: "12px", fontSize: 14, marginBottom: 20 }}>
          Přihlásit se →
        </button>

        <div style={{ borderTop: "1px solid #1a2035", paddingTop: 16 }}>
          <div style={{ fontSize: 11, color: "#334155", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Testovací účty (heslo: 1234)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {USERS.filter(u => u.username !== "admin").map(u => (
              <button key={u.id} onClick={() => { setUsername(u.username); setPassword(u.username === "admin" ? "admin" : "1234"); setError(""); }}
                style={{ background: "#0a0d14", border: "1px solid #1a2035", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>{u.name}</span>
                <span style={{ ...S.tag(ROLES[u.role]?.color || "#6366f1"), fontSize: 10 }}>{ROLES[u.role]?.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HELPERS PRO ČAS ─────────────────────────────────────────────────────────

const calcHours = (check_in, check_out) => {
  if (!check_in || !check_out) return 0;
  const [h1, m1] = check_in.split(":").map(Number);
  const [h2, m2] = check_out.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
};

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

function Attendance({ currentUser, attendance, setAttendance, employees }) {
  const isHR = ["admin", "hr", "manager"].includes(currentUser.role);
  const [viewEmpId, setViewEmpId] = useState(currentUser.employeeId);
  const [manualDate, setManualDate] = useState(fmt(new Date()));
  const [manualIn, setManualIn] = useState("");
  const [manualOut, setManualOut] = useState("");
  const todayStr = fmt(new Date());

  const empRecords = attendance.filter(a => a.employeeId === viewEmpId).sort((a, b) => b.date.localeCompare(a.date));
  const todayRecord = attendance.find(a => a.employeeId === viewEmpId && a.date === todayStr);

  const check_inNow = () => {
    const now = new Date();
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (todayRecord) {
      setAttendance(attendance.map(a => a.employeeId === viewEmpId && a.date === todayStr ? { ...a, check_out: time } : a));
    } else {
      setAttendance([...attendance, { id: Date.now(), employeeId: viewEmpId, date: todayStr, check_in: time, check_out: null }]);
    }
  };

  const addManual = () => {
    if (!manualDate || !manualIn) return;
    const existing = attendance.find(a => a.employeeId === viewEmpId && a.date === manualDate);
    if (existing) {
      setAttendance(attendance.map(a => a.employeeId === viewEmpId && a.date === manualDate ? { ...a, check_in: manualIn, check_out: manualOut || null } : a));
    } else {
      setAttendance([...attendance, { id: Date.now(), employeeId: viewEmpId, date: manualDate, check_in: manualIn, check_out: manualOut || null }]);
    }
    setManualIn(""); setManualOut("");
  };

  const deleteRecord = (id) => setAttendance(attendance.filter(a => a.id !== id));

  // Stats
  const weekDates = getWeekDates();
  const weekHours = weekDates.reduce((s, d) => { const r = attendance.find(a => a.employeeId === viewEmpId && a.date === d); return s + (r ? calcHours(r.check_in, r.check_out) : 0); }, 0);
  const monthStr = todayStr.slice(0, 7);
  const monthHours = attendance.filter(a => a.employeeId === viewEmpId && a.date.startsWith(monthStr)).reduce((s, a) => s + calcHours(a.check_in, a.check_out), 0);
  const yearStr = todayStr.slice(0, 4);
  const yearHours = attendance.filter(a => a.employeeId === viewEmpId && a.date.startsWith(yearStr)).reduce((s, a) => s + calcHours(a.check_in, a.check_out), 0);
  const todayHours = todayRecord ? calcHours(todayRecord.check_in, todayRecord.check_out) : 0;
  const viewEmp = employees.find(e => e.id === viewEmpId);
  const viewUser = USERS.find(u => u.employeeId === viewEmpId);

  return (
    <>
      <div style={S.header}>
        <h1 style={S.h1}>🕐 Docházka</h1>
        {isHR && (
          <select style={{ ...S.select, marginBottom: 0, width: 200 }} value={viewEmpId} onChange={e => setViewEmpId(Number(e.target.value))}>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
      </div>

      {/* Zaměstnanec info */}
      {viewEmp && (
        <div style={{ ...S.card, marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ ...S.avatar("#6366f1"), width: 48, height: 48, fontSize: 18 }}>{getInitial(viewEmp.name)}</div>
          <div>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{viewEmp.name}</div>
            <div style={{ color: "#475569", fontSize: 12 }}>{viewEmp.position} · {viewEmp.department}</div>
          </div>
          {viewUser && (
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#475569" }}>Dovolená</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>{viewUser.vacationDays - viewUser.vacationUsed} dní</div>
              <div style={{ fontSize: 11, color: "#334155" }}>zbývá z {viewUser.vacationDays} dní</div>
            </div>
          )}
        </div>
      )}

      {/* Statistiky hodin */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Dnes", value: todayHours > 0 ? fmtHours(todayHours) : todayRecord?.check_in ? "Probíhá..." : "—", color: "#6366f1" },
          { label: "Tento týden", value: fmtHours(weekHours), color: "#60a5fa" },
          { label: "Tento měsíc", value: fmtHours(monthHours), color: "#34d399" },
          { label: "Tento rok", value: fmtHours(yearHours), color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={S.statCard(s.color)}>
            <div style={S.statLabel}>{s.label}</div>
            <div style={{ ...S.statValue(s.color), fontSize: 20 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Dnešní stav + quick check-in */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, fontSize: 14 }}>Dnešní záznam — {todayStr}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ flex: 1, display: "flex", gap: 20 }}>
            <div>
              <div style={S.statLabel}>Příchod</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: todayRecord?.check_in ? "#34d399" : "#334155" }}>
                {todayRecord?.check_in || "—"}
              </div>
            </div>
            <div>
              <div style={S.statLabel}>Odchod</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: todayRecord?.check_out ? "#f59e0b" : "#334155" }}>
                {todayRecord?.check_out || (todayRecord?.check_in ? "probíhá..." : "—")}
              </div>
            </div>
            {todayRecord?.check_in && todayRecord?.check_out && (
              <div>
                <div style={S.statLabel}>Odpracováno</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#6366f1" }}>{fmtHours(calcHours(todayRecord.check_in, todayRecord.check_out))}</div>
              </div>
            )}
          </div>
          {(viewEmpId === currentUser.employeeId || isHR) && (
            <button onClick={check_inNow} style={{ ...S.btn(todayRecord?.check_in && !todayRecord?.check_out ? "#f59e0b" : todayRecord?.check_out ? "#34d399" : "#6366f1"), padding: "14px 24px", fontSize: 14 }}>
              {todayRecord?.check_out ? "✓ Záznam dokončen" : todayRecord?.check_in ? "⏹ Zapsat odchod" : "▶ Zapsat příchod"}
            </button>
          )}
        </div>
      </div>

      {/* Vizuální týdenní přehled */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, fontSize: 14 }}>Týdenní přehled</div>
        <div style={{ display: "flex", gap: 8 }}>
          {weekDates.map(d => {
            const r = attendance.find(a => a.employeeId === viewEmpId && a.date === d);
            const h = r ? calcHours(r.check_in, r.check_out) : 0;
            const isToday = d === todayStr;
            const dayName = ["Po", "Út", "St", "Čt", "Pá"][weekDates.indexOf(d)];
            return (
              <div key={d} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: isToday ? "#6366f1" : "#475569", fontWeight: isToday ? 700 : 400, marginBottom: 6 }}>{dayName}</div>
                <div style={{ height: 80, background: "#0a0d14", borderRadius: 8, border: `1px solid ${isToday ? "#6366f155" : "#1a2035"}`, display: "flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden", position: "relative" }}>
                  {h > 0 && <div style={{ background: isToday ? "#6366f1" : "#34d399", height: `${Math.min((h / 10) * 100, 100)}%`, opacity: 0.7, transition: "height 0.3s" }} />}
                </div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{h > 0 ? fmtHours(h) : "—"}</div>
                {r?.check_in && <div style={{ fontSize: 9, color: "#334155" }}>{r.check_in}{r.check_out ? `–${r.check_out}` : "–..."}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Manuální záznam (HR/admin) */}
      {isHR && (
        <div style={{ ...S.card, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, fontSize: 14 }}>✏️ Ruční záznam</div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}><label style={S.label}>Datum</label><input style={{ ...S.input, marginBottom: 0 }} type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={S.label}>Příchod</label><input style={{ ...S.input, marginBottom: 0 }} type="time" value={manualIn} onChange={e => setManualIn(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={S.label}>Odchod</label><input style={{ ...S.input, marginBottom: 0 }} type="time" value={manualOut} onChange={e => setManualOut(e.target.value)} /></div>
            <button style={{ ...S.btn(), padding: "9px 18px", flexShrink: 0 }} onClick={addManual}>Uložit</button>
          </div>
        </div>
      )}

      {/* Historie */}
      <div style={S.card}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, fontSize: 14 }}>Historie docházky</div>
        <table style={S.table}>
          <thead><tr>{["Datum", "Příchod", "Odchod", "Odpracováno", ""].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {empRecords.slice(0, 30).map(r => {
              const h = calcHours(r.check_in, r.check_out);
              const isToday = r.date === todayStr;
              return (
                <tr key={r.id}>
                  <td style={{ ...S.td, color: isToday ? "#6366f1" : "#e2e8f0", fontWeight: isToday ? 700 : 400 }}>{r.date}{isToday ? " (dnes)" : ""}</td>
                  <td style={{ ...S.td, color: "#34d399", fontWeight: 600 }}>{r.check_in || "—"}</td>
                  <td style={{ ...S.td, color: "#f59e0b", fontWeight: 600 }}>{r.check_out || <span style={{ color: "#334155" }}>probíhá</span>}</td>
                  <td style={{ ...S.td, color: "#fff", fontWeight: 700 }}>{h > 0 ? fmtHours(h) : "—"}</td>
                  <td style={S.td}>{isHR && <button onClick={() => deleteRecord(r.id)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 15 }}>×</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── PROFIL ───────────────────────────────────────────────────────────────────

function Profile({ currentUser, attendance, employees }) {
  const emp = employees.find(e => e.id === currentUser.employeeId);
  const todayStr = fmt(new Date());
  const monthStr = todayStr.slice(0, 7);
  const yearStr = todayStr.slice(0, 4);
  const weekDates = getWeekDates();

  const myRecords = attendance.filter(a => a.employeeId === currentUser.employeeId);
  const todayRec = myRecords.find(a => a.date === todayStr);
  const weekHours = weekDates.reduce((s, d) => { const r = myRecords.find(a => a.date === d); return s + (r ? calcHours(r.check_in, r.check_out) : 0); }, 0);
  const monthHours = myRecords.filter(a => a.date.startsWith(monthStr)).reduce((s, a) => s + calcHours(a.check_in, a.check_out), 0);
  const yearHours = myRecords.filter(a => a.date.startsWith(yearStr)).reduce((s, a) => s + calcHours(a.check_in, a.check_out), 0);
  const todayHours = todayRec ? calcHours(todayRec.check_in, todayRec.check_out) : 0;
  const vacLeft = currentUser.vacationDays - currentUser.vacationUsed;
  const vacPct = Math.round((currentUser.vacationUsed / currentUser.vacationDays) * 100);

  // Měsíční přehled (posledních 6 měsíců)
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
    const ms = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const h = myRecords.filter(a => a.date.startsWith(ms)).reduce((s, a) => s + calcHours(a.check_in, a.check_out), 0);
    return { label: MONTHS[d.getMonth()], hours: h };
  });
  const maxH = Math.max(...last6.map(m => m.hours), 1);

  return (
    <>
      <div style={S.header}><h1 style={S.h1}>👤 Můj profil</h1></div>

      {/* Profilová karta */}
      <div style={{ ...S.card, marginBottom: 20, display: "flex", gap: 24, alignItems: "center" }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
          {getInitial(currentUser.name)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{currentUser.name}</div>
          {emp && <div style={{ color: "#475569", fontSize: 13, marginTop: 2 }}>{emp.position} · {emp.department}</div>}
          {emp && <div style={{ color: "#334155", fontSize: 12, marginTop: 1 }}>{emp.email} · od {emp.start}</div>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <span style={S.badge(ROLES[currentUser.role]?.color || "#6366f1")}>{ROLES[currentUser.role]?.label}</span>
          {emp && <span style={S.badge(emp.status === "Aktivní" ? "#34d399" : "#f59e0b")}>{emp.status}</span>}
        </div>
      </div>

      {/* Hodiny přehled */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { label: "Dnes", value: todayHours > 0 ? fmtHours(todayHours) : todayRec?.check_in ? "Probíhá" : "—", color: "#6366f1" },
          { label: "Tento týden", value: fmtHours(weekHours), color: "#60a5fa" },
          { label: "Tento měsíc", value: fmtHours(monthHours), color: "#34d399" },
          { label: "Tento rok", value: fmtHours(yearHours), color: "#f59e0b" },
        ].map(s => (
          <div key={s.label} style={S.statCard(s.color)}>
            <div style={S.statLabel}>{s.label}</div>
            <div style={{ ...S.statValue(s.color), fontSize: 22 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={S.grid2}>
        {/* Dovolená */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 16, fontSize: 14 }}>🏖️ Dovolená {new Date().getFullYear()}</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div><div style={S.statLabel}>Zbývá</div><div style={{ fontSize: 32, fontWeight: 800, color: "#34d399" }}>{vacLeft} <span style={{ fontSize: 14 }}>dní</span></div></div>
            <div style={{ textAlign: "right" }}><div style={S.statLabel}>Čerpáno</div><div style={{ fontSize: 32, fontWeight: 800, color: "#f59e0b" }}>{currentUser.vacationUsed} <span style={{ fontSize: 14 }}>dní</span></div></div>
            <div style={{ textAlign: "right" }}><div style={S.statLabel}>Nárok celkem</div><div style={{ fontSize: 32, fontWeight: 800, color: "#fff" }}>{currentUser.vacationDays} <span style={{ fontSize: 14 }}>dní</span></div></div>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "#1a2035", overflow: "hidden", marginTop: 8 }}>
            <div style={{ height: "100%", width: `${vacPct}%`, background: vacPct > 75 ? "#f87171" : "#f59e0b", borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>{vacPct}% dovolené čerpáno</div>
        </div>

        {/* Graf hodin posledních 6 měsíců */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, fontSize: 14 }}>📊 Odpracované hodiny (posledních 6 měsíců)</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
            {last6.map(m => {
              const barH = Math.round((m.hours / maxH) * 100);
              return (
                <div key={m.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 10, color: "#475569" }}>{m.hours > 0 ? `${Math.round(m.hours)}h` : ""}</div>
                  <div style={{ width: "100%", height: barH || 3, background: m.hours > 0 ? "#6366f1" : "#1a2035", borderRadius: 4, opacity: 0.85 }} />
                  <div style={{ fontSize: 10, color: "#475569" }}>{m.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dnešní příchod/odchod */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, fontSize: 14 }}>📅 Dnešní docházka</div>
          <div style={{ display: "flex", gap: 24 }}>
            <div><div style={S.statLabel}>Příchod</div><div style={{ fontSize: 28, fontWeight: 800, color: todayRec?.check_in ? "#34d399" : "#334155" }}>{todayRec?.check_in || "—"}</div></div>
            <div><div style={S.statLabel}>Odchod</div><div style={{ fontSize: 28, fontWeight: 800, color: todayRec?.check_out ? "#f59e0b" : "#334155" }}>{todayRec?.check_out || "—"}</div></div>
          </div>
          {todayRec?.check_in && todayRec?.check_out && (
            <div style={{ marginTop: 12 }}>
              <div style={S.statLabel}>Celkem dnes</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#6366f1" }}>{fmtHours(calcHours(todayRec.check_in, todayRec.check_out))}</div>
            </div>
          )}
          {todayRec?.check_in && !todayRec?.check_out && (
            <div style={{ marginTop: 10, color: "#f59e0b", fontSize: 12 }}>⏱ Směna probíhá...</div>
          )}
        </div>

        {/* Poslední záznamy */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14, fontSize: 14 }}>🕐 Poslední záznamy</div>
          {myRecords.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(r => {
            const h = calcHours(r.check_in, r.check_out);
            return (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1a2035" }}>
                <div>
                  <div style={{ fontSize: 13, color: r.date === todayStr ? "#6366f1" : "#e2e8f0", fontWeight: 500 }}>{r.date}{r.date === todayStr ? " (dnes)" : ""}</div>
                  <div style={{ fontSize: 11, color: "#475569" }}>{r.check_in} → {r.check_out || "probíhá"}</div>
                </div>
                <div style={{ fontWeight: 700, color: h > 0 ? "#fff" : "#334155", fontSize: 13 }}>{h > 0 ? fmtHours(h) : "—"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function ModalHeader({ title, onClose }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 17, color: "#fff" }}>{title}</div>
      <button style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 18 }} onClick={onClose}>✕</button>
    </div>
  );
}

function ModalActions({ onSave, onClose }) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
      <button style={S.btn()} onClick={onSave}>Uložit</button>
      <button style={S.btnGhost} onClick={onClose}>Zrušit</button>
    </div>
  );
}

function SectionTitle({ children, style }) {
  return <div style={{ fontWeight: 700, color: "#fff", marginBottom: 8, fontSize: 13, ...style }}>{children}</div>;
}

function Empty() {
  return <div style={{ color: "#334155", fontSize: 13, padding: "6px 0" }}>Žádné záznamy</div>;
}
