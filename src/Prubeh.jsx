import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase.js";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { nahratFotkuZakazky, pocetFotekText } from "./fotkyZakazky.js";
import { htmlSmlouvy, htmlProtokolu, htmlDodatku, stahnoutWord, specifikaceZNabidky } from "./dokumentyZakazky.js";
import { kontrolyZakazky, NAVOD } from "./prubehKontroly.js";
import { konecnaCenaNabidky } from "./slevaNabidky.js";
import { UZAVIRACI_EMAIL_KEY, VYCHOZI_UZAVIRACI_EMAIL, ZNACKY_UZAVIRACIHO_EMAILU, vyplnitSablonu } from "./uzaviraciEmail.js";
import { isConnected, connectSharedAccount, odkazNaSlozku } from "./onedrive.js";
import { STAVY_MATERIALU, JEDNOTKY_MATERIALU, stavMaterialu, VZTAHY_KONTAKTU, ROZPAD_KEY, polozkyZNabidky, prazdnaPolozka, souhrnMaterialu, stavSkladu, predvyplnitZeSkladu } from "./materialZakazky.js";
import { OneDriveThumb, StorageLink } from "./storageUrl.jsx";
import { NA_STAROSTI, naStarosti, umi, dovednost, seraditPodleDovednosti } from "./dovednosti.js";
import { pocetVyplnenych } from "./podkladyZakazky.js";
import { PodkladyNahled, PodkladyFormular } from "./PodkladyZakazky.jsx";
import {
  SEKCE, sekceById, FAZE, fazeById, PRVNI_FAZE, TYPY, normalizujTyp, DUVODY_CEKANI, nazevDuvodu,
  nazevFaze, ukolyPro, nazevCasti, CASTI_MONTAZE, fazeSekce, dalsiFaze, predchoziFaze, fazeKRozhodnuti, ukolHotovy, fazeHotova, prvniNehotovy,
  branaSekce, NAZEV_BRANY, postupSekce, FAZE_ZE_STAVU_ZAKAZKY, FAZE_ZE_STAGE, STAV_ZAKAZKY_ZE_SEKCE, STAGE_Z_FAZE,
  NASTAVENI_KEY, pouzijNastaveni, zakladFaze, pravidlo, PRAVIDLA_TYPU, terminFaze, planovaneMd,
} from "./prubehFaze.js";

// ─── Průběh zakázek (varianta D: přehled + panel dalšího kroku) ─────────────
// Každá zakázka od poptávky po archiv: v jaké je sekci a fázi, další krok,
// proč stojí, poznámky a kdo za co odpovídá. Posun do další fáze jde, až
// když jsou hotové úkoly fáze; do realizace až po splnění brány (záloha,
// materiál, termín…). Staré zakázky a obchodní případy se převezmou samy.

const fmtKc = (n) => Math.round(Number(n) || 0).toLocaleString("cs-CZ") + " Kč";
const dnesIso = () => new Date().toLocaleDateString("sv-SE");
const tedIso = () => new Date().toISOString();
const dnyOd = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : 0);
const fmtDatum = (iso) => { if (!iso) return ""; const [r, m, d] = String(iso).slice(0, 10).split("-").map(Number); return `${d}. ${m}.${r !== new Date().getFullYear() ? " " + r : ""}`; };
const fmtCas = (iso) => new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const dny = (n) => `${n} ${n === 1 ? "den" : n >= 2 && n <= 4 ? "dny" : "dní"}`;
const noveIdUkolu = () => `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const inicialy = (jmeno) => String(jmeno || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

// Kód zakázky stejně jako v Contracts.jsx: TYP-YYM-INICIÁLY-0001.
async function kodZakazky(typ, jmeno) {
  if (!typ) return "";
  const now = new Date();
  const { data: c, error } = await supabase.rpc("next_contract_code_number", { p_type: typ, p_year: now.getFullYear() % 100, p_month: now.getMonth() + 1 });
  if (error || c == null) return "";
  return `${typ}-${now.getFullYear() % 100}${now.getMonth() + 1}-${inicialy(jmeno).padEnd(2, "X")}-${String(c).padStart(4, "0")}`;
}

const CSS = `
.pr-wrap { padding: 20px 28px; box-sizing: border-box; font-family: 'DM Sans', system-ui, sans-serif; color: #0f172a; }
.pr-grid { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 18px; align-items: start; }
.pr-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.05fr) minmax(0, 1.05fr) minmax(0, 1.05fr) minmax(0, 2fr) 48px; align-items: center; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
.pr-row.pr-klik { cursor: pointer; }
.pr-row.pr-klik:hover { filter: brightness(0.985); }
.pr-panel { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 14px; max-height: calc(100vh - 24px); overflow: auto; padding-bottom: 8px; }
.pr-kpi { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.pr-grid.pr-jedna { grid-template-columns: minmax(0, 1fr); }
.pr-siroky { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
.pr-siroky > .pr-cela { grid-column: 1 / -1; }
.pr-siroky > .pr-cela > div { height: 100%; box-sizing: border-box; }
.pr-sloupec { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.pr-prubeh-radek { display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px !important; }
@media (max-width: 1150px) { .pr-grid { grid-template-columns: 1fr; } .pr-panel { position: static; max-height: none; } }
@media (max-width: 1150px) {
  .pr-siroky, .pr-prubeh-radek { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pr-siroky > .pr-sloupec:last-child { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
}
@media (max-width: 760px) {
  .pr-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 40px; }
  .pr-row > .pr-sek { display: none; }
  .pr-kpi { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pr-wrap { padding: 16px; }
  .pr-siroky, .pr-prubeh-radek, .pr-siroky > .pr-sloupec:last-child { grid-template-columns: minmax(0, 1fr); }
}
`;

const karta = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "16px 20px" };
const btn = (bg, fg = "#fff", extra = {}) => ({ background: bg, color: fg, border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", ...extra });
const btnGhost = { background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 10, padding: "8px 13px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 10, padding: "8px 10px", fontSize: 14, fontFamily: "inherit", color: "#0f172a", background: "#fff" };
const lbl = { fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 4 };
const TYP_BARVY = { FVE: ["#fef3c7", "#92400e"], FVR: ["#ffedd5", "#9a3412"], FVO: ["#fef9c3", "#854d0e"], REA: ["#f1f5f9", "#334155"], SRV: ["#dcfce7", "#166534"], HRM: ["#ede9fe", "#5b21b6"], ELK: ["#e0f2fe", "#075985"] };

function Fajfka({ barva = "#15803d", size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={barva} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>;
}
function Kolecko({ barva = "#b45309", size = 16 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={barva} strokeWidth="2.4" aria-hidden="true"><circle cx="12" cy="12" r="8" /></svg>;
}

// Buňka s postupem v sekci (proužky fází + název aktuální fáze).
function BunkaSekce({ z, sekceIds }) {
  const p = postupSekce(z, sekceIds);
  if (p === null) return <span style={{ fontSize: 12, color: "#94a3b8" }}>—</span>;
  if (p === "hotovo") return <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: "#15803d" }}><Fajfka size={14} />hotovo</span>;
  const s = sekceById[p.sekce];
  return (
    <div>
      <div style={{ display: "flex", gap: 3, width: 96 }}>
        {Array.from({ length: p.celkem }, (_, i) => (
          <div key={i} style={{ flex: 1, height: 7, borderRadius: 3, background: i + 1 <= p.poradi ? s.barva : "#e2e8f0", opacity: i + 1 === p.poradi ? 0.5 : 1 }} />
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>{p.sekce === "uz" ? "Uzavření · " : ""}{p.poradi} {p.nazev}</div>
    </div>
  );
}

// Pole s nabídkou hodnot — vlastní rozbalovací seznam přímo pod polem (místo
// <datalist>, který některé prohlížeče vykreslí mimo pole). Dá se psát i vlastní
// hodnota; šipky ↑↓ + Enter vyberou, Esc zavře, ▾ rozbalí celý seznam.
function PoleSNabidkou({ id, value, onChange, moznosti, placeholder, style }) {
  const [otevreno, setOtevreno] = useState(false);
  const [aktivni, setAktivni] = useState(-1);
  const pole = useRef(null);
  const q = String(value || "").trim().toLowerCase();
  const presna = moznosti.some((m) => m.toLowerCase() === q);
  const seznam = !q || presna ? moznosti : moznosti.filter((m) => m.toLowerCase().includes(q));
  const vybrat = (m) => { onChange(m); setOtevreno(false); setAktivni(-1); };
  return (
    <div style={{ position: "relative" }}>
      <input id={id} ref={pole} role="combobox" aria-expanded={otevreno && seznam.length > 0} aria-autocomplete="list" aria-controls={`${id}-seznam`}
        autoComplete="off" style={{ ...style, paddingRight: 34 }} value={value} placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOtevreno(true); setAktivni(-1); }}
        onFocus={() => setOtevreno(true)}
        onBlur={() => setTimeout(() => setOtevreno(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOtevreno(true); setAktivni((a) => Math.min(a + 1, seznam.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAktivni((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && otevreno && aktivni >= 0 && seznam[aktivni]) { e.preventDefault(); vybrat(seznam[aktivni]); }
          else if (e.key === "Escape") setOtevreno(false);
        }} />
      <button type="button" tabIndex={-1} aria-label="Zobrazit nabídku" onMouseDown={(e) => { e.preventDefault(); setOtevreno((o) => !o); pole.current?.focus(); }}
        style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#64748b", fontSize: 14, cursor: "pointer", padding: "4px 8px" }}>▾</button>
      {otevreno && seznam.length > 0 && (
        <ul id={`${id}-seznam`} role="listbox"
          style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 60, margin: "4px 0 0", padding: 4, listStyle: "none", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,.15)", maxHeight: 220, overflowY: "auto", textAlign: "left" }}>
          {seznam.map((m, i) => (
            <li key={m} role="option" aria-selected={i === aktivni || m.toLowerCase() === q}
              onMouseDown={(e) => { e.preventDefault(); vybrat(m); }} onMouseEnter={() => setAktivni(i)}
              style={{ padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 14, background: i === aktivni ? "#e0f2fe" : m.toLowerCase() === q ? "#f1f5f9" : "transparent", fontWeight: m.toLowerCase() === q ? 700 : 400 }}>
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Prohlížeč fotek přes celou obrazovku: šipky / klávesy ← → / tažení prstem,
// Esc zavře. fotky = řádky contract_photos, i = index zobrazené fotky.
function ProhlizecFotek({ fotky, i, onI, onClose }) {
  const p = fotky[i];
  const tah = useRef(null);
  useEffect(() => {
    const klavesa = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && i > 0) onI(i - 1);
      else if (e.key === "ArrowRight" && i < fotky.length - 1) onI(i + 1);
    };
    window.addEventListener("keydown", klavesa);
    return () => window.removeEventListener("keydown", klavesa);
  }, [i, fotky.length, onI, onClose]);
  if (!p) return null;
  const sipka = { position: "absolute", top: "50%", transform: "translateY(-50%)", width: 48, height: 48, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.9)", color: "#0f172a", fontSize: 26, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <div role="dialog" aria-modal="true" aria-label="Prohlížeč fotek" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={(e) => { tah.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (tah.current == null) return;
        const dx = e.changedTouches[0].clientX - tah.current;
        tah.current = null;
        if (dx > 50 && i > 0) onI(i - 1);
        else if (dx < -50 && i < fotky.length - 1) onI(i + 1);
      }}
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(15,23,42,.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, gap: 10 }}>
      <div style={{ position: "absolute", top: 12, left: 16, right: 16, display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{i + 1} / {fotky.length} · {p.category || "Bez kategorie"}{p.date ? ` · ${new Date(p.date + "T00:00:00").toLocaleDateString("cs-CZ")}` : ""}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <StorageLink href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", fontSize: 13, fontWeight: 600, border: "1px solid rgba(255,255,255,.5)", borderRadius: 8, padding: "6px 10px", textDecoration: "none" }}>Otevřít originál</StorageLink>
          <button type="button" aria-label="Zavřít prohlížeč" onClick={onClose} style={{ background: "rgba(255,255,255,.15)", color: "#fff", border: "none", borderRadius: 8, width: 36, height: 34, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
      </div>
      <OneDriveThumb key={p.id} itemId={p.item_id} fallbackUrl={p.url} alt={`${p.category || "Fotka"} ${i + 1} z ${fotky.length}`}
        style={{ maxWidth: "min(1200px, 92vw)", maxHeight: "80vh", objectFit: "contain", borderRadius: 8, background: "#0f172a", minWidth: 120, minHeight: 120 }} />
      {i > 0 && <button type="button" aria-label="Předchozí fotka" onClick={() => onI(i - 1)} style={{ ...sipka, left: 16 }}>‹</button>}
      {i < fotky.length - 1 && <button type="button" aria-label="Další fotka" onClick={() => onI(i + 1)} style={{ ...sipka, right: 16 }}>›</button>}
    </div>
  );
}

// Panáček průvodce — elektrikář v helmě. Nálada podle stavu zakázky:
// ok = úsměv, pozor = nejistý, chyba = lekl se (otevřená pusa).
function Panacek({ nalada = "ok", size = 48 }) {
  const pusa = nalada === "chyba"
    ? <ellipse cx="32" cy="45" rx="4" ry="5" fill="#7c2d12" />
    : nalada === "pozor"
      ? <path d="M25 46 L39 44" stroke="#7c2d12" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      : <path d="M24 42 Q32 50 40 42" stroke="#7c2d12" strokeWidth="2.6" strokeLinecap="round" fill="none" />;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="38" r="17" fill="#fcd9b6" />
      {/* helma */}
      <path d="M13 31 Q13 13 32 13 Q51 13 51 31 Z" fill="#F5821F" />
      <rect x="10" y="29" width="44" height="5" rx="2.5" fill="#d9690e" />
      <rect x="29" y="11" width="6" height="12" rx="3" fill="#ffb36b" />
      {/* blesk na helmě */}
      <path d="M33 16 L28 24 L32 24 L30 30 L36 21 L32 21 Z" fill="#0369a1" />
      {/* oči */}
      {nalada === "chyba"
        ? <><circle cx="25" cy="38" r="3" fill="#1e293b" /><circle cx="39" cy="38" r="3" fill="#1e293b" /></>
        : <><circle cx="25" cy="38" r="2.2" fill="#1e293b" /><circle cx="39" cy="38" r="2.2" fill="#1e293b" /></>}
      {nalada === "pozor" && <path d="M21 33 L28 34 M43 33 L36 34" stroke="#1e293b" strokeWidth="1.8" strokeLinecap="round" />}
      {pusa}
    </svg>
  );
}

export default function Prubeh({
  customers = [], employees = [], currentUser, onOtevritZakazku, onOtevritNaceneni,
  tasks = [], setTasks, dealMsgs = [], setDealMsgs, contractMsgs = [], setContractMsgs,
  calendarEvents = [], setCalendarEvents,
  initialId, onClearInitial, onDealZalozen, onZakaznikZalozen,
}) {
  const ja = currentUser?.name || "";
  const [rows, setRows] = useState([]);
  const [poznamky, setPoznamky] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [nacteno, setNacteno] = useState(false);
  const [vybrano, setVybrano] = useState(null);
  const [fronta, setFronta] = useState("vse");
  const [uzavrene, setUzavrene] = useState(false);
  const [hledat, setHledat] = useState("");
  const [nova, setNova] = useState(null);
  const [editKrok, setEditKrok] = useState(null);
  const [draft, setDraft] = useState("");
  const [pracuji, setPracuji] = useState(false);
  const [, setVerzeNastaveni] = useState(0);
  const [nastaveniForm, setNastaveniForm] = useState(null);
  const [jednaId, setJednaId] = useState(null);       // zobrazit jen jednu konkrétní zakázku
  const [vyberOkno, setVyberOkno] = useState(false);  // vyskakovací okno s výběrem zakázky
  const [vyberHledat, setVyberHledat] = useState("");
  const [editMisto, setEditMisto] = useState(null);
  const [novyUkol, setNovyUkol] = useState(null);
  const [zprava, setZprava] = useState("");
  const [vsechnyZpravy, setVsechnyZpravy] = useState(false);
  const smiNastavit = ["admin", "manager"].includes(currentUser?.role);
  const [hlaska, setHlaska] = useState(null);
  const hlaskaTimer = useRef(null);
  const ukazHlasku = (text) => {
    clearTimeout(hlaskaTimer.current);
    setHlaska(text);
    hlaskaTimer.current = setTimeout(() => setHlaska(null), 4500);
  };
  useEffect(() => () => clearTimeout(hlaskaTimer.current), []);

  // Fotky zakázky (i z obhlídky, kdy ještě neexistuje zakázka — vazba přes prubeh_id).
  const [fotkyZ, setFotkyZ] = useState({});          // { [prubehId]: [...] }
  const [nahravam, setNahravam] = useState(null);     // kategorie, která se právě nahrává
  const [udajeForm, setUdajeForm] = useState(null);   // { id, ean, jistic_a, faze }
  const [generuji, setGeneruji] = useState(false);
  // Průvodce (malé okno vpravo dole) — zmenšený stav si pamatuje prohlížeč.
  const [pruvodceMin, setPruvodceMin] = useState(() => { try { return localStorage.getItem("proudos-pruvodce-min") === "1"; } catch { return false; } });
  const prepnoutPruvodce = () => setPruvodceMin((m) => { try { localStorage.setItem("proudos-pruvodce-min", m ? "0" : "1"); } catch { /* bez úložiště */ } return !m; });
  const [dodatekForm, setDodatekForm] = useState(null); // { popis, cena_nova, termin, aktualizovatCenu }
  const [viceForm, setViceForm] = useState(null); // víc zakázek z jedné nabídky: { radky: [{ id?, nazev, misto, hodnota }] }
  const [galerieKat, setGalerieKat] = useState({ zakId: null, kat: "vse" }); // filtr karty Fotky zakázky
  const [prohlizec, setProhlizec] = useState(null);   // { fotky, i } — prohlížeč fotek přes celou obrazovku
  const zmenitFotku = useCallback((i) => setProhlizec((p) => (p ? { ...p, i } : p)), []);
  const zavritProhlizec = useCallback(() => setProhlizec(null), []);
  // Vlastní dotaz v appce místo window.confirm/prompt — ty některá prostředí
  // (vložený prohlížeč, aplikace) potichu blokují a tlačítko pak „nic nedělá“.
  // zeptat({ titulek, text, vstup, popisek, potvrdit }) → true / text, při zrušení null.
  const [dotaz, setDotaz] = useState(null);
  const zeptat = (o) => new Promise((resolve) => setDotaz({ ...o, hodnota: "", resolve }));
  const zavritDotaz = (vysledek) => { dotaz?.resolve(vysledek); setDotaz(null); };
  const [materialForm, setMaterialForm] = useState(null); // checklist materiálu: { zakId, polozky, sklad, zNabidky }
  const [uzavEmail, setUzavEmail] = useState(null); // uzavírací e-mail objednateli: { zakId, komu, predmet, text, sablona, nacitam, … }
  const fotoInput = useRef(null);
  const fotoCil = useRef(null);                       // { z, faze, ukol } pro vybrané soubory
  const vybranyRadek = rows.find((r) => r.id === vybrano);
  const vybranyContract = vybranyRadek?.contract_id;
  useEffect(() => {
    if (!vybrano) return;
    let zruseno = false;
    const podminka = `prubeh_id.eq.${vybrano}${vybranyContract ? `,contract_id.eq.${vybranyContract}` : ""}`;
    supabase.from("contract_photos").select("*").or(podminka).order("created_at", { ascending: false })
      .then(({ data }) => { if (!zruseno) setFotkyZ((m) => ({ ...m, [vybrano]: data || [] })); });
    return () => { zruseno = true; };
  }, [vybrano, vybranyContract]);

  const zakaznik = (id) => customers.find((c) => c.id === id);
  // Zrušení výběru zákazníka v nové poptávce — adresa předvyplněná z něj jde pryč taky.
  const bezZakaznika = (n) => {
    const puvodni = zakaznik(Number(n.customer_id));
    return { customer_id: "", adresa: puvodni && n.adresa === (puvodni.address || "") ? "" : n.adresa };
  };
  const lide = employees.filter((e) => !e.status || e.status === "Aktivní").map((e) => e.name).filter(Boolean);
  if (ja && !lide.includes(ja)) lide.unshift(ja);

  // ── Načtení + převzetí starých zakázek a obchodních případů ──
  useEffect(() => {
    let zruseno = false;
    const nacti = async () => {
      const [pr, pz, q, c, d, nast] = await Promise.all([
        supabase.from("zakazky_prubeh").select("*").order("updated_at", { ascending: false }),
        supabase.from("zakazky_poznamky").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("quotes").select("id, name, cislo, status, customer_id, type, data, deal_id, updated_at"),
        supabase.from("contracts").select("id, code, name, status, price, type, customer_id, deal_id, address"),
        supabase.from("deals").select("id, name, value, stage, customer_id, type, assigned_to, site_address, site_contact_name, site_contact_phone"),
        supabase.from("app_settings").select("value").eq("key", NASTAVENI_KEY).maybeSingle(),
      ]);
      if (zruseno) return;
      pouzijNastaveni(nast.data?.value || null);
      if (pr.error) { alert("Průběh zakázek se nepodařilo načíst: " + pr.error.message); setNacteno(true); return; }
      let prubeh = pr.data || [];
      const kontrakty = c.data || [];
      // Co ještě v průběhu chybí: zakázky a otevřené obchodní případy.
      const maContract = new Set(prubeh.map((r) => r.contract_id).filter(Boolean));
      const maDeal = new Set(prubeh.map((r) => r.deal_id).filter(Boolean));
      const dealSeZakazkou = new Set(kontrakty.map((k) => k.deal_id).filter(Boolean));
      const nove = [
        ...kontrakty.filter((k) => !maContract.has(k.id)).map((k) => {
          const faze = FAZE_ZE_STAVU_ZAKAZKY[k.status] || "zaloha";
          return {
            nazev: k.name || k.code || "Zakázka", customer_id: k.customer_id, typ: normalizujTyp(k.type) || null,
            hodnota: k.price, contract_id: k.id, deal_id: maDeal.has(k.deal_id) ? null : k.deal_id, faze, misto_adresa: k.address || null,
            stav: k.status === "Fakturována" ? "uzavrena" : "otevrena",
            dalsi_krok: `Zkontrolovat fázi (převzato ze stavu „${k.status || "?"}“)`, dalsi_krok_kdo: ja || null,
            _pozn: `Převzato ze seznamu zakázek (${k.code || k.name}, stav „${k.status || "?"}“) — zkontroluj, jestli fáze sedí.`,
          };
        }),
        ...(d.data || []).filter((x) => !maDeal.has(x.id) && !dealSeZakazkou.has(x.id) && x.stage !== "Prohráno").map((x) => ({
          nazev: x.name || "Obchodní případ", customer_id: x.customer_id, typ: normalizujTyp(x.type) || null, hodnota: x.value,
          deal_id: x.id, faze: FAZE_ZE_STAGE[x.stage] || PRVNI_FAZE, stav: "otevrena", vlastnik_obchod: x.assigned_to || null,
          misto_adresa: x.site_address || null, misto_kontakt: x.site_contact_name || null, misto_telefon: x.site_contact_phone || null,
          dalsi_krok: "Zkontrolovat fázi (převzato z obchodních případů)", dalsi_krok_kdo: x.assigned_to || ja || null,
          _pozn: `Převzato z obchodních případů (stav „${x.stage}“).`,
        })),
      ];
      let novePozn = [];
      if (nove.length) {
        const { data: vlozene, error } = await supabase.from("zakazky_prubeh")
          .insert(nove.map((r) => { const radek = { ...r }; delete radek._pozn; return radek; })).select();
        if (!error && vlozene) {
          prubeh = [...vlozene, ...prubeh];
          const pozn = vlozene.map((r, i) => ({ prubeh_id: r.id, kdo: "Systém", text: nove[i]._pozn, system: true }));
          const { data: pzv } = await supabase.from("zakazky_poznamky").insert(pozn).select();
          novePozn = pzv || [];
          if (!zruseno) ukazHlasku(`Do průběhu jsem převzal ${vlozene.length} ${vlozene.length === 1 ? "zakázku" : vlozene.length < 5 ? "zakázky" : "zakázek"} — zkontroluj jejich fáze.`);
        } else if (error && error.code !== "23505") {
          console.warn("Převzetí zakázek do průběhu selhalo:", error.message);
        }
      }
      // Otevřená zakázka v kroku, který její typ už nepoužívá (např. FVE v
      // „Montáž“ po rozdělení na střechu a elektro) → přesunout do dalšího
      // platného kroku a zapsat to.
      const presunute = prubeh.filter((r) => r.stav === "otevrena" && fazeById[r.faze] && pravidlo(fazeById[r.faze], r.typ) === "-")
        .map((r) => ({ r, cil: dalsiFaze(r) })).filter((x) => x.cil);
      for (const { r, cil } of presunute) {
        const patch = { faze: cil.id, faze_od: tedIso(), updated_at: tedIso() };
        const { error } = await supabase.from("zakazky_prubeh").update(patch).eq("id", r.id);
        if (error) continue;
        const puvodni = nazevFaze(fazeById[r.faze], r.typ);
        Object.assign(r, patch);
        const { data: pzp } = await supabase.from("zakazky_poznamky").insert({ prubeh_id: r.id, kdo: "Systém", system: true,
          text: `Krok „${puvodni}“ se u tohoto typu zakázky už nepoužívá (montáž je rozdělená) — zakázka pokračuje krokem ${nazevFaze(cil, r.typ)}.` }).select();
        novePozn = [...(pzp || []), ...novePozn];
      }
      if (zruseno) return;
      setRows(prubeh);
      setPoznamky([...novePozn, ...(pz.data || [])]);
      setQuotes(q.data || []);
      setContracts(kontrakty);
      setNacteno(true);
      // Přišli jsme odjinud (např. z Nacenění) s konkrétní zakázkou → rovnou ji otevřít.
      if (initialId && prubeh.some((r) => r.id === initialId)) { setVybrano(initialId); setJednaId(initialId); }
      if (initialId && onClearInitial) onClearInitial();
    };
    nacti();
    return () => { zruseno = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Odvozené hodnoty ──
  const quoteById = (id) => quotes.find((q) => q.id === id);
  const contractById = (id) => contracts.find((k) => k.id === id);
  const autoZ = (z) => {
    const q = z.quote_id ? quoteById(z.quote_id) : null;
    return {
      nabidkaPropojena: !!q,
      nabidkaOdeslana: !!q && ["Odesláno", "Schváleno"].includes(q.status),
      nabidkaRozhodnuta: !!q && ["Schváleno", "Zamítnuto"].includes(q.status),
      udajeVyplnene: !!(z.udaje?.ean && z.udaje?.jistic_a && z.udaje?.faze),
    };
  };
  const dnes = dnesIso();
  const poTerminu = (z) => z.stav === "otevrena" && z.dalsi_krok_termin && z.dalsi_krok_termin < dnes;
  const sekceZ = (z) => fazeById[z.faze]?.sekce || "ob";
  const dlouho = (z) => z.stav === "otevrena" && dnyOd(z.faze_od) > (fazeById[z.faze]?.dny || 999);
  const posledniPozn = (id) => poznamky.find((p) => p.prubeh_id === id && !p.system);

  const otevrene = rows.filter((z) => z.stav === "otevrena");
  const kpi = {
    naMe: otevrene.filter((z) => z.dalsi_krok_kdo && z.dalsi_krok_kdo === ja).length,
    poTerminu: otevrene.filter(poTerminu).length,
    pripraveno: otevrene.filter((z) => z.faze === "material" && fazeHotova(z, fazeById.material, autoZ(z))).length,
    dlouho: otevrene.filter(dlouho).length,
    hodnota: otevrene.reduce((s, z) => s + (Number(z.hodnota) || 0), 0),
  };

  const q = hledat.trim().toLowerCase();
  const viditelne = jednaId ? rows.filter((z) => z.id === jednaId) : rows
    .filter((z) => (uzavrene ? z.stav !== "otevrena" : z.stav === "otevrena"))
    .filter((z) => {
      if (fronta === "vse") return true;
      if (fronta === "moje") return [z.dalsi_krok_kdo, z.vlastnik_obchod, z.vlastnik_bo, z.vlastnik_re].includes(ja);
      if (fronta === "bo") return ["bo", "uz"].includes(sekceZ(z));
      return sekceZ(z) === fronta;
    })
    .filter((z) => !q || [z.nazev, zakaznik(z.customer_id)?.name, contractById(z.contract_id)?.code].some((t) => String(t || "").toLowerCase().includes(q)))
    .sort((a, b) => (poTerminu(b) - poTerminu(a)) || String(a.dalsi_krok_termin || "9999").localeCompare(String(b.dalsi_krok_termin || "9999")));

  const z = rows.find((r) => r.id === vybrano) || null;
  // Na užší obrazovce je panel pod seznamem — po kliknutí na něj rovnou sjedeme.
  // V okně zakázky posunout řadu kroků tak, aby byl aktuální krok vidět.
  const fazeOkna = jednaId ? rows.find((r) => r.id === jednaId)?.faze : null;
  useEffect(() => {
    if (!fazeOkna) return;
    const krok = document.querySelector('.pr-kroky [aria-current="step"]');
    const rada = krok?.parentElement;
    if (rada) rada.scrollLeft = krok.offsetLeft - rada.offsetLeft - rada.clientWidth / 2 + krok.clientWidth / 2;
  }, [jednaId, fazeOkna]);
  // Otevřít okno zakázky (místo seznamu) — kroky nahoře, pod nimi přehled.
  const otevritOkno = (id) => {
    setVybrano(id); setJednaId(id); setEditKrok(null); setDraft(""); setEditMisto(null); setNovyUkol(null); setZprava(""); setVsechnyZpravy(false);
    window.scrollTo({ top: 0 });
  };
  const vybrat = (id) => {
    setVybrano(id); setEditKrok(null); setDraft(""); setEditMisto(null); setNovyUkol(null); setZprava(""); setVsechnyZpravy(false);
    if (window.innerWidth <= 1150) setTimeout(() => document.getElementById("pr-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  // ── Zápis do databáze ──
  const uloz = async (zak, patch, poznamka) => {
    const plny = { ...patch, updated_at: tedIso() };
    const { error } = await supabase.from("zakazky_prubeh").update(plny).eq("id", zak.id);
    if (error) { alert("Změnu se nepodařilo uložit: " + error.message); return false; }
    setRows((rs) => rs.map((r) => (r.id === zak.id ? { ...r, ...plny } : r)));
    if (poznamka) await pridatPoznamku(zak, poznamka, true);
    return true;
  };
  const pridatPoznamku = async (zak, text, system = false) => {
    const row = { prubeh_id: zak.id, kdo: system ? (ja || "Systém") : ja, duvod: system ? null : (nazevDuvodu(zak.duvod_cekani) || null), text, system };
    const { data, error } = await supabase.from("zakazky_poznamky").insert(row).select().single();
    if (error) { alert("Poznámku se nepodařilo uložit: " + error.message); return false; }
    setPoznamky((p) => [data, ...p]);
    return true;
  };

  const krokProFazi = (zak, faze) => {
    if (fazeKRozhodnuti(faze, zak)) return `Rozhodnout: je potřeba fáze ${nazevFaze(faze, zak.typ)}?`;
    const u = prvniNehotovy(zak, faze, autoZ(zak));
    return u ? u.text : `Posunout do další fáze`;
  };
  const vlastnikSekce = (zak, sekce) => ({ ob: zak.vlastnik_obchod, bo: zak.vlastnik_bo, re: zak.vlastnik_re, uz: zak.vlastnik_bo }[sekce]) || ja || null;

  // ── Fotky k úkolu (obhlídka, realizace) ──
  const vybratFotky = (zak, faze, ukol) => {
    fotoCil.current = { zak, faze, ukol, kategorie: ukol.fotky };
    fotoInput.current?.click();
  };
  // Fotky / sken do kategorie bez vazby na úkol (průvodce: podepsaná smlouva, protokol…).
  // Když je v aktuální fázi úkol s fotkami té kategorie, po nahrání se odškrtne.
  const vybratFotkyKategorie = (zak, kategorie) => {
    const f = fazeById[zak.faze];
    const ukol = (f ? ukolyPro(f, zak.typ) : []).find((u) => u.fotky === kategorie && !ukolHotovy(zak, f, u, autoZ(zak))) || (f ? ukolyPro(f, zak.typ) : []).find((u) => u.fotky === kategorie) || null;
    fotoCil.current = { zak, faze: ukol ? f : null, ukol, kategorie };
    fotoInput.current?.click();
  };
  const nahratFotky = async (files) => {
    const cil = fotoCil.current;
    if (!cil || !files?.length) return;
    const { zak, faze, ukol, kategorie } = cil;
    setNahravam(kategorie);
    let nahrano = 0;
    for (const puvodni of files) {
      try {
        const row = await nahratFotkuZakazky(puvodni, {
          slozka: contractById(zak.contract_id)?.name || zak.nazev || String(zak.id),
          contractId: zak.contract_id || null, prubehId: zak.id, kategorie, nahral: currentUser?.employeeId || null,
        });
        setFotkyZ((m) => ({ ...m, [zak.id]: [row, ...(m[zak.id] || [])] }));
        nahrano++;
      } catch (e) {
        alert(`Fotku „${puvodni.name}“ se nepodařilo nahrát: ${e.message}`);
      }
    }
    setNahravam(null);
    if (!nahrano) return;
    ukazHlasku(`✓ Nahráno ${pocetFotekText(nahrano)}`);
    // Úkol „fotky uložené“ se po nahrání sám odškrtne.
    const aktualni = rows.find((r) => r.id === zak.id) || zak;
    if (ukol && !ukolHotovy(aktualni, faze, ukol, autoZ(aktualni))) await toggleUkol(aktualni, faze, ukol);
  };

  // ── Technické údaje odběrného místa ──
  const ulozitUdaje = async (zak) => {
    const ean = String(udajeForm.ean || "").replace(/\s/g, "");
    if (ean && !/^\d{18}$/.test(ean)) { alert("EAN má mít 18 číslic (začíná obvykle 8591824…)."); return; }
    const udaje = { ...(zak.udaje || {}), ean, jistic_a: udajeForm.jistic_a ? Number(udajeForm.jistic_a) : null, faze: udajeForm.faze ? Number(udajeForm.faze) : null };
    const patch = { udaje };
    // Další krok se posune, když byl na tomhle úkolu.
    const nz = { ...zak, udaje };
    const f = fazeById[zak.faze];
    if (f && (!zak.dalsi_krok || zak.dalsi_krok === krokProFazi(zak, f))) patch.dalsi_krok = krokProFazi(nz, f);
    if (await uloz(zak, patch)) { setUdajeForm(null); ukazHlasku("✓ Technické údaje uložené"); }
  };

  // ── Dokumenty zakázky: návrh smlouvy, předávací protokol, dodatek ──
  // Smlouva: když je v appce firemní Word šablona (public/templates/smlouva_sablona.docx),
  // vyplní se ta; jinak obecný návrh z dokumentyZakazky.js. Vše se stáhne jako
  // Word a zapíše do z.dokumenty (podle toho pak kontroly ve fázích poznají, že existuje).
  const podkladyDokumentu = (zak) => {
    const zak_ = zakaznik(zak.customer_id) || {};
    const k = contractById(zak.contract_id);
    const q = zak.quote_id ? quoteById(zak.quote_id) : null;
    // Víc zakázek z jedné nabídky → do dokumentů jde cena téhle zakázky, ne celé nabídky.
    const castNabidky = zakazkyNabidky(zak).length > 1 && Number(zak.hodnota) > 0;
    return {
      datum: new Date().toLocaleDateString("cs-CZ"),
      cisloZakazky: k?.code || (q?.cislo ? `SOD-${q.cislo}` : ""),
      nazev: zak.nazev || "",
      typ: zak.typ,
      predmet: TYPY.find((t) => t.id === zak.typ)?.label.replace(/^[A-Z]+ — /, "") || zak.nazev || "",
      misto: zak.misto_adresa || zak_.address || "",
      zakaznik: zak_,
      udaje: zak.udaje || {},
      cena: castNabidky
        ? { bezDph: Number(zak.hodnota), dphPct: Number(q?.data?.zakaznik?.dph ?? 21), sDph: null }
        : { bezDph: konecnaCenaNabidky(q?.data).bez || Number(zak.hodnota) || Number(k?.price) || 0, dphPct: Number(q?.data?.zakaznik?.dph ?? 21), sDph: konecnaCenaNabidky(q?.data).s || null },
      nabidka: q ? { cislo: q.cislo || q.name } : null,
      cisloOP: q?.data?.fve?.cisloOP || "",
      specifikace: specifikaceZNabidky(q?.data, TYPY.find((t) => t.id === zak.typ)?.label.replace(/^[A-Z]+ — /, "")),
      zastupce: zak.vlastnik_obchod || ja || "",
    };
  };
  const zapsatDokument = async (zak, klic, hodnota, poznamka) => {
    const dokumenty = { ...(zak.dokumenty || {}), [klic]: hodnota };
    await uloz(zak, { dokumenty }, poznamka);
  };
  // Firemní Word šablona, když v appce je — nejdřív pro typ zakázky
  // (public/templates/<druh>_<typ>_sablona.docx, FVE i rozšíření FVE = „fve“),
  // pak obecná <druh>_sablona.docx. Vyplní se značkami {zakaznikJmeno}, {specifikace}…
  // Vrací false, když šablona není (pak se použije obecný návrh).
  const SABLONA_TYPU = { FVE: "fve", FVR: "fve", FVO: "fve" };
  // Název systému v protokolu podle typu zakázky (1. a 2. pád).
  const ELEKTRARNA_TYPU = {
    FVE: ["SOLÁRNÍ ELEKTRÁRNA", "SOLÁRNÍ ELEKTRÁRNY"],
    FVR: ["SOLÁRNÍ ELEKTRÁRNA", "SOLÁRNÍ ELEKTRÁRNY"],
    FVO: ["SOLÁRNÍ ELEKTRÁRNA NA OHŘEV VODY", "SOLÁRNÍ ELEKTRÁRNY NA OHŘEV VODY"],
  };
  const nactiSablonu = async (soubor) => {
    const res = await fetch(`/templates/${soubor}`);
    return res.ok && !(res.headers.get("content-type") || "").includes("text/html") ? res : null;
  };
  const zVlastniSablony = async (druh, hodnoty, nazevSouboru, typ) => {
    const res = (SABLONA_TYPU[typ] && await nactiSablonu(`${druh}_${SABLONA_TYPU[typ]}_sablona.docx`))
      || await nactiSablonu(`${druh}_sablona.docx`);
    if (!res) return false;
    const doc = new Docxtemplater(new PizZip(await res.arrayBuffer()), { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
    doc.render(hodnoty);
    const blob = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${nazevSouboru}.docx`.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return true;
  };
  // Značky dostupné ve firemních šablonách (stejné pro všechny dokumenty).
  const znackySablony = (d, dod) => {
    const kc = (n) => (n ? Math.round(Number(n)).toLocaleString("cs-CZ") : "");
    const bez = Math.round(Number(d.cena.bezDph) || 0);
    const puvodni = Math.round(Number(dod?.cena_puvodni) || 0);
    const nova = dod && dod.cena_nova !== "" && dod.cena_nova != null ? Math.round(Number(dod.cena_nova)) : null;
    const rozdil = nova != null ? nova - puvodni : 0;
    return {
      datum: d.datum, cisloZakazky: d.cisloZakazky, nazevZakazky: d.nazev, typZakazky: d.predmet,
      zakaznikJmeno: d.zakaznik.name || "", zakaznikFirma: d.zakaznik.company || "", zakaznikAdresa: d.zakaznik.address || "",
      zakaznikTelefon: d.zakaznik.phone || "", zakaznikEmail: d.zakaznik.email || "", mistoRealizace: d.misto,
      ean: d.udaje.ean || "", jistic: d.udaje.jistic_a ? `${d.udaje.jistic_a} A` : "", pocetFazi: d.udaje.faze ? `${d.udaje.faze}f` : "",
      cena: kc(bez), dph: String(d.cena.dphPct), cenaSDph: kc(d.cena.sDph || bez * (1 + d.cena.dphPct / 100)),
      cisloNabidky: d.nabidka?.cislo || "", obchodnik: d.zastupce,
      cisloOP: d.cisloOP || d.cisloZakazky, specifikace: d.specifikace,
      dodatekCislo: dod ? String(dod.cislo) : "", dodatekPopis: dod?.popis || "",
      cenaPuvodni: dod ? kc(dod.cena_puvodni) || "…………" : "", cenaNova: dod ? kc(dod.cena_nova) : "",
      // Věta v předávacím protokolu FVE („… JE PŘEDÁNA A PŘEVZATA / PŘEVZETÍ … BYLO ODMÍTNUTO“)
      elektrarna: ELEKTRARNA_TYPU[d.typ]?.[0] || "SOLÁRNÍ ELEKTRÁRNA",
      elektrarny: ELEKTRARNA_TYPU[d.typ]?.[1] || "SOLÁRNÍ ELEKTRÁRNY",
      zmenaCeny: nova != null && rozdil !== 0,
      cenaRozdil: rozdil ? `${rozdil > 0 ? "+" : "−"}${kc(Math.abs(rozdil))}` : "",
      novyTermin: dod?.termin ? new Date(dod.termin + "T00:00:00").toLocaleDateString("cs-CZ") : "",
    };
  };
  const vygenerovatDokument = async (zak, druh, dodatek) => {
    setGeneruji(true);
    try {
      const d = podkladyDokumentu(zak);
      const jmeno = d.zakaznik.name || zak.nazev || "";
      const zaznam = { at: new Date().toISOString(), kdo: ja || null };
      if (druh === "smlouva") {
        const nazev = `Smlouva o dílo ${d.cisloOP || d.cisloZakazky} ${jmeno}`;
        if (!(await zVlastniSablony("smlouva", znackySablony(d), nazev, zak.typ))) stahnoutWord(nazev, htmlSmlouvy(d));
        await zapsatDokument(zak, "smlouva", zaznam, "Vygenerovaný návrh smlouvy o dílo.");
      } else if (druh === "protokol") {
        const nazev = `Předávací protokol ${d.cisloOP || d.cisloZakazky} ${jmeno}`;
        if (!(await zVlastniSablony("protokol", znackySablony(d), nazev, zak.typ))) stahnoutWord(nazev, htmlProtokolu(d));
        await zapsatDokument(zak, "protokol", zaznam, "Vygenerovaný předávací protokol.");
      } else if (druh === "dodatek") {
        const dodatky = zak.dokumenty?.dodatky || [];
        const { aktualizovatCenu, ...udajeDodatku } = dodatek;
        const dod = { ...udajeDodatku, cislo: dodatky.length + 1, cena_puvodni: d.cena.bezDph, ...zaznam };
        const nazev = `Dodatek ${dod.cislo} ${d.cisloZakazky} ${jmeno}`;
        if (!(await zVlastniSablony("dodatek", znackySablony(d, dod), nazev, zak.typ))) stahnoutWord(nazev, htmlDodatku(d, dod));
        const patch = { dokumenty: { ...(zak.dokumenty || {}), dodatky: [...dodatky, dod] } };
        if (aktualizovatCenu && dod.cena_nova !== "" && dod.cena_nova != null) patch.hodnota = Number(dod.cena_nova);
        await uloz(zak, patch, `Dodatek č. ${dod.cislo}: ${dodatek.popis || "změna"}${patch.hodnota != null ? ` (nová cena ${fmtKc(patch.hodnota)})` : ""}.`);
      }
      ukazHlasku("✓ Dokument stažený — najdeš ho ve Stažených souborech");
    } catch (e) {
      alert("Dokument se nepodařilo vygenerovat: " + e.message);
    }
    setGeneruji(false);
  };
  const vygenerovatSmlouvu = (zak) => vygenerovatDokument(zak, "smlouva");

  const toggleUkol = async (zak, faze, ukol) => {
    const klic = `${faze.id}.${ukol.id}`;
    const hotove = { ...(zak.hotove_ukoly || {}), [klic]: !zak.hotove_ukoly?.[klic] };
    const nz = { ...zak, hotove_ukoly: hotove };
    const patch = { hotove_ukoly: hotove };
    // další krok se sám posune na první nehotový úkol (když byl předvyplněný)
    const puvodniKrok = krokProFazi(zak, faze);
    if (!zak.dalsi_krok || zak.dalsi_krok === puvodniKrok) patch.dalsi_krok = krokProFazi(nz, faze);
    await uloz(zak, patch);
  };

  // Zajistí zakázku (contracts) při vstupu do back office — náklady, docházka,
  // fotky a faktury se dál vedou u ní jako dosud.
  const zajistitZakazku = async (zak) => {
    if (zak.contract_id) return zak.contract_id;
    const kod = await kodZakazky(zak.typ, vlastnikSekce(zak, "ob"));
    const { data: k, error } = await supabase.from("contracts").insert({
      name: zak.nazev, customer_id: zak.customer_id, type: zak.typ, price: zak.hodnota || null,
      status: "Nová", code: kod || null, deal_id: zak.deal_id || null, address: zak.misto_adresa || zakaznik(zak.customer_id)?.address || null,
    }).select().single();
    if (error) { alert("Zakázku se nepodařilo založit: " + error.message); return null; }
    setContracts((ks) => [k, ...ks]);
    await zalozitProjektZNabidky(zak, k);
    return k.id;
  };

  // Stejně jako dřív převod obchodního případu na zakázku: z nabídky se založí
  // projekt s plánovanými MD a rozvrhem po dnech (plán vs. skutečná docházka).
  const zalozitProjektZNabidky = async (zak, k) => {
    const nabidka = (zak.quote_id && quoteById(zak.quote_id))
      || quotes.filter((x) => zak.deal_id && x.deal_id === zak.deal_id).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
    const qd = nabidka?.data;
    if (!qd) return;
    // Víc zakázek z jedné nabídky: každá dostane podíl plánu podle své ceny
    // a rozvrh po dnech se nepřebírá (platil pro celou nabídku).
    const celkem = cenaNabidky(nabidka);
    const podil = celkem > 0 && Number(zak.hodnota) > 0 && Number(zak.hodnota) < celkem ? Number(zak.hodnota) / celkem : 1;
    const md = planovaneMd(qd, nabidka.type || zak.typ) * podil;
    const dny = podil < 1 ? [] : (qd.denniPlan || []).filter((p) => p.datum);
    if (!md && !dny.length) return;
    try {
      const { data: proj, error } = await supabase.from("projects").insert({
        name: k.name, customer_id: k.customer_id, status: "Plánování", progress: 0,
        budget: Number(k.price) || 0, spent: 0, deadline: null, assignees: [],
        contract_id: k.id, planned_md: md || null,
      }).select().single();
      if (error) throw error;
      if (dny.length) {
        const { error: e2 } = await supabase.from("project_day_plan").insert(dny.map((p) => ({
          contract_id: k.id, project_id: proj?.id || null, date: p.datum, planned_people: Number(p.pocetLidi) || 1, note: p.poznamka || null,
        })));
        if (e2) throw e2;
      }
      await pridatPoznamku(zak, `Založen projekt z nabídky ${nabidka.cislo || nabidka.name}: plán ${Math.round(md * 100) / 100} MD${dny.length ? `, rozvrh ${dny.length} ${dny.length === 1 ? "den" : dny.length < 5 ? "dny" : "dní"}` : ""}.`, true);
    } catch (e) {
      // Zakázka je hlavní a je uložená; projekt je doplněk — jen upozornit.
      console.warn("Projekt z nabídky se nepodařilo založit:", e);
      ukazHlasku("Zakázka založená, ale projekt s plánem MD se nepodařilo vytvořit");
    }
  };

  const synchronizovatStare = async (zak, novaFaze, contractId) => {
    const sekce = fazeById[novaFaze]?.sekce;
    if (contractId && STAV_ZAKAZKY_ZE_SEKCE[sekce]) {
      await supabase.from("contracts").update({ status: STAV_ZAKAZKY_ZE_SEKCE[sekce] }).eq("id", contractId);
      setContracts((ks) => ks.map((k) => (k.id === contractId ? { ...k, status: STAV_ZAKAZKY_ZE_SEKCE[sekce] } : k)));
    }
    if (zak.deal_id) {
      const stage = sekce === "ob" ? STAGE_Z_FAZE[novaFaze] : "Vyhráno";
      if (stage) await supabase.from("deals").update({ stage }).eq("id", zak.deal_id);
    }
  };

  const presun = async (zak, cil, textPoznamky) => {
    const staraSekce = sekceZ(zak);
    let contractId = zak.contract_id;
    if (staraSekce === "ob" && cil.sekce !== "ob") {
      contractId = await zajistitZakazku(zak);
      if (!contractId) return false;
    }
    const nz = { ...zak, faze: cil.id, contract_id: contractId };
    const ok = await uloz(zak, {
      faze: cil.id, faze_od: tedIso(), contract_id: contractId, duvod_cekani: null,
      dalsi_krok: krokProFazi(nz, cil), dalsi_krok_termin: terminFaze(cil), dalsi_krok_kdo: vlastnikSekce(zak, cil.sekce),
    }, textPoznamky);
    if (ok) await synchronizovatStare(zak, cil.id, contractId);
    return ok;
  };

  const kontrolyZ = (zak) => kontrolyZakazky(zak, {
    quote: zak.quote_id ? quoteById(zak.quote_id) : null, fotky: fotkyZ[zak.id] || [], zakaznik: zakaznik(zak.customer_id),
  });
  const posunDal = async (zak) => {
    const f = fazeById[zak.faze];
    if (!fazeHotova(zak, f, autoZ(zak))) { alert("Nejdřív dokonči úkoly této fáze."); return; }
    const kontroly = kontrolyZ(zak);
    const chyby = kontroly.filter((x) => x.blokuje);
    if (chyby.length) { alert("Než zakázku posuneš dál, oprav:\n\n" + chyby.map((x) => "• " + x.text).join("\n")); return; }
    // Upozornění (oranžová, hlavně z dřívějších fází) posun natvrdo neblokují — u starších
    // převzatých zakázek by jinak nešlo nic posunout — ale musí se vědomě odkliknout.
    const pozor = kontroly.filter((x) => x.uroven === "pozor");
    if (pozor.length && !(await zeptat({
      titulek: "Posunout zakázku i přes upozornění?",
      text: `Zakázka má ještě ${pozor.length === 1 ? "nevyřešené upozornění" : `${pozor.length} nevyřešená upozornění`}:\n\n${pozor.map((x) => "• " + x.text).join("\n")}`,
      potvrdit: "Posunout dál i tak",
    }))) return;
    setPracuji(true);
    if (pozor.length) await pridatPoznamku(zak, `Posunuto dál přes upozornění: ${pozor.map((x) => x.text).join("; ")}`, true);
    const cil = dalsiFaze(zak);
    if (!cil) {
      await uloz(zak, { stav: "uzavrena", dalsi_krok: null, dalsi_krok_termin: null, duvod_cekani: null }, "Zakázka uzavřená.");
      if (zak.contract_id) {
        await supabase.from("contracts").update({ status: "Fakturována" }).eq("id", zak.contract_id);
      }
      ukazHlasku("✓ Zakázka uzavřená a přesunutá do archivu");
      setPracuji(false);
      return;
    }
    const zmenaSekce = cil.sekce !== f.sekce;
    const ok = await presun(zak, cil, `Hotovo: ${nazevFaze(f, zak.typ)} → ${nazevFaze(cil, zak.typ)}${zmenaSekce ? ` (předáno do: ${sekceById[cil.sekce].nazev})` : ""}`);
    if (ok) ukazHlasku(zmenaSekce ? `✓ Předáno do: ${sekceById[cil.sekce].nazev}` : `✓ Posunuto do fáze ${nazevFaze(cil, zak.typ)}`);
    setPracuji(false);
  };

  // Předchozí fáze včetně kroku přeskočeného tlačítkem „Přeskočit krok“
  // (volitelné fáze vyřazené jako nepotřebné se dál přeskakují).
  const jePreskocenyKrok = (zak, f) => !!(zak.hotove_ukoly || {})[`${f.id}.__preskoceno`];
  const predchozi = (zak) => {
    const i = FAZE.findIndex((f) => f.id === zak.faze);
    return FAZE.slice(0, Math.max(0, i)).reverse()
      .find((f) => pravidlo(f, zak.typ) !== "-" && (!(zak.preskocene || []).includes(f.id) || jePreskocenyKrok(zak, f))) || predchoziFaze(zak);
  };
  const vratit = async (zak) => {
    const cil = predchozi(zak);
    if (!cil) return;
    if (!(await zeptat({ titulek: "Vrátit zakázku zpět?", text: `Zakázka se vrátí do fáze „${nazevFaze(cil, zak.typ)}“.`, potvrdit: "Vrátit zpět" }))) return;
    setPracuji(true);
    let nz = zak;
    if (jePreskocenyKrok(zak, cil)) {
      // vrácení do přeskočeného kroku → krok zase platí
      const hotove = { ...(zak.hotove_ukoly || {}) };
      delete hotove[`${cil.id}.__preskoceno`];
      nz = { ...zak, preskocene: (zak.preskocene || []).filter((id) => id !== cil.id), hotove_ukoly: hotove };
      if (!(await uloz(zak, { preskocene: nz.preskocene, hotove_ukoly: hotove }))) { setPracuji(false); return; }
    }
    await presun(nz, cil, `Vráceno zpět do fáze ${nazevFaze(cil, zak.typ)}.`);
    setPracuji(false);
  };

  // Přeskočit (ignorovat) krok: zakázka jde dál, i když úkoly fáze nejsou hotové
  // nebo průvodce hlásí chyby. Fáze se zapíše jako přeskočená (v průběhu
  // přeškrtnutá) a značka "<faze>.__preskoceno" umožní se do ní vrátit.
  const preskocitKrok = async (zak) => {
    const f = fazeById[zak.faze];
    const auto = autoZ(zak);
    const nedodelane = [
      ...ukolyPro(f, zak.typ).filter((u) => !ukolHotovy(zak, f, u, auto)).map((u) => u.text),
      ...kontrolyZ(zak).filter((x) => x.blokuje).map((x) => x.text),
    ];
    const nz = { ...zak, preskocene: [...new Set([...(zak.preskocene || []), f.id])] };
    const cil = dalsiFaze(nz);
    const duvod = await zeptat({
      titulek: `Přeskočit krok „${nazevFaze(f, zak.typ)}“?`,
      text: `Zakázka bude pokračovat ${cil ? `do fáze „${nazevFaze(cil, zak.typ)}“` : "uzavřením"}.`
        + (nedodelane.length ? `\n\nZůstane nedodělané:\n${nedodelane.map((t) => "• " + t).join("\n")}` : ""),
      vstup: true, popisek: "Důvod — zapíše se do historie zakázky", placeholder: "např. obhlídku dělal kolega, fotky doplní",
      potvrdit: "⏭ Přeskočit krok",
    });
    if (duvod == null || !String(duvod).trim()) return;
    setPracuji(true);
    const poznamka = `Krok ${nazevFaze(f, zak.typ)} přeskočen: ${duvod.trim()}${nedodelane.length ? ` (nedodělané: ${nedodelane.join("; ")})` : ""}.`;
    const hotove = { ...(zak.hotove_ukoly || {}), [`${f.id}.__preskoceno`]: true };
    const ok = await uloz(zak, { preskocene: nz.preskocene, hotove_ukoly: hotove }, poznamka);
    if (ok) {
      if (cil) {
        const nz2 = { ...nz, hotove_ukoly: hotove };
        if (await presun(nz2, cil, null)) ukazHlasku(`⏭ Krok přeskočen — teď ${nazevFaze(cil, zak.typ)}`);
      } else {
        await uloz(zak, { stav: "uzavrena", dalsi_krok: null, dalsi_krok_termin: null, duvod_cekani: null }, "Zakázka uzavřená.");
        if (zak.contract_id) await supabase.from("contracts").update({ status: "Fakturována" }).eq("id", zak.contract_id);
        ukazHlasku("✓ Zakázka uzavřená a přesunutá do archivu");
      }
    }
    setPracuji(false);
  };

  const rozhodnout = async (zak, potreba) => {
    const f = fazeById[zak.faze];
    if (potreba) {
      const nz = { ...zak, potrebne: [...(zak.potrebne || []), f.id] };
      await uloz(zak, { potrebne: nz.potrebne, dalsi_krok: krokProFazi(nz, f) }, `Fáze ${nazevFaze(f, zak.typ)} je u této zakázky potřeba.`);
      return;
    }
    const nz = { ...zak, preskocene: [...(zak.preskocene || []), f.id] };
    const cil = dalsiFaze(nz);
    setPracuji(true);
    const ok = await uloz(zak, { preskocene: nz.preskocene }, `Fáze ${nazevFaze(f, zak.typ)} se u této zakázky přeskakuje.`);
    if (ok && cil) await presun(nz, cil, null);
    setPracuji(false);
  };

  const prohrano = async (zak) => {
    const duvod = await zeptat({
      titulek: "Zakázka nevyšla?", text: "Důvod se hodí pro vyhodnocení obchodu.",
      vstup: true, popisek: "Proč zakázka nevyšla", placeholder: "cena, konkurence, zákazník si to rozmyslel…", potvrdit: "Označit jako prohranou",
    });
    if (duvod == null || !String(duvod).trim()) return;
    await uloz(zak, { stav: "prohrana", prohra_duvod: duvod.trim(), dalsi_krok: null, dalsi_krok_termin: null }, `Prohráno: ${duvod.trim()}`);
    if (zak.deal_id) await supabase.from("deals").update({ stage: "Prohráno", lost_reason: duvod.trim() }).eq("id", zak.deal_id);
    ukazHlasku("Zakázka označená jako prohraná");
  };

  const krokHotovo = async (zak) => {
    const f = fazeById[zak.faze];
    const auto = autoZ(zak);
    const ukol = ukolyPro(f, zak.typ).find((u) => u.text === zak.dalsi_krok && !ukolHotovy(zak, f, u, auto));
    let nz = zak;
    const patch = {};
    if (ukol) {
      patch.hotove_ukoly = { ...(zak.hotove_ukoly || {}), [`${f.id}.${ukol.id}`]: true };
      nz = { ...zak, hotove_ukoly: patch.hotove_ukoly };
    }
    patch.dalsi_krok = krokProFazi(nz, f);
    patch.dalsi_krok_termin = null;
    patch.duvod_cekani = null;
    await uloz(zak, patch, `Hotovo: ${zak.dalsi_krok}`);
    ukazHlasku("✓ Krok hotový");
  };

  const ulozKrok = async () => {
    if (!editKrok.text.trim()) { alert("Napiš, co je další krok."); return; }
    const ok = await uloz(z, { dalsi_krok: editKrok.text.trim(), dalsi_krok_termin: editKrok.termin || null, dalsi_krok_kdo: editKrok.kdo || null });
    if (ok) { setEditKrok(null); ukazHlasku("✓ Další krok uložený"); }
  };

  const propojitNabidku = async (zak, quoteId) => {
    const qq = quoteById(Number(quoteId));
    const cena = konecnaCenaNabidky(qq?.data).bez || null;
    const ok = await uloz(zak, { quote_id: qq ? qq.id : null, ...(cena && !zak.hodnota ? { hodnota: cena } : {}) },
      qq ? `Propojeno s nabídkou ${qq.cislo || qq.name}.` : "Nabídka odpojená.");
    if (ok) ukazHlasku(qq ? "✓ Nabídka propojená" : "Nabídka odpojená");
  };

  // ── Podklady pro realizaci (předávací list) ──
  const [podkladyForm, setPodkladyForm] = useState(null); // { zakId, podklady }
  const otevritPodklady = (zak) => {
    const p = JSON.parse(JSON.stringify(zak.podklady || {}));
    // předvyplnit, co appka už ví (obchodník, konstrukce a back-up z nabídky)
    const fve = zak.quote_id ? quoteById(zak.quote_id)?.data?.fve : null;
    p.obecne = { ...(p.obecne || {}) };
    if (!p.obecne.oz && zak.vlastnik_obchod) p.obecne.oz = zak.vlastnik_obchod;
    p.technicka = { ...(p.technicka || {}) };
    if (!p.technicka.konstrukce && fve?.konstrukce?.name && !/^bez\b/i.test(fve.konstrukce.name)) p.technicka.konstrukce = fve.konstrukce.name;
    if (!p.technicka.backup && fve?.backup?.name && !/^bez\b/i.test(fve.backup.name)) p.technicka.backup = fve.backup.name;
    setPodkladyForm({ zakId: zak.id, podklady: p });
  };
  const ulozitPodklady = async (zak) => {
    if (await uloz(zak, { podklady: podkladyForm.podklady }, "Podklady pro realizaci upravené.")) {
      setPodkladyForm(null);
      ukazHlasku("✓ Podklady pro realizaci uložené — zaměstnanci je uvidí v kalendáři");
    }
  };

  // ── Plánování lidí do kalendáře (kdo dělá střechu / elektro / uzemnění) ──
  // Akce v kalendáři patří k zakázce přes prubeh_id (nebo contract_id u starších).
  const [planForm, setPlanForm] = useState(null); // { zakId, na_starosti, date, employee_id, poznamka }
  const akceZakazky = (zak) => calendarEvents.filter((e) => e.prubeh_id === zak.id || (zak.contract_id && e.contract_id === zak.contract_id));
  const otevritPlan = (zak, naStarostiId) => {
    const aktivni = employees.filter((e) => !e.archived);
    const prvni = seraditPodleDovednosti(aktivni, naStarostiId)[0];
    const zitra = new Date(Date.now() + 86400000).toLocaleDateString("sv-SE");
    setPlanForm({ zakId: zak.id, na_starosti: naStarostiId || "cela", date: zitra, employee_id: prvni ? String(prvni.id) : "", poznamka: "" });
  };
  const ulozitPlan = async (zak) => {
    const p = planForm;
    const emp = employees.find((e) => String(e.id) === String(p.employee_id));
    if (!emp || !p.date) { alert("Vyber zaměstnance a datum."); return; }
    const ns = naStarosti(p.na_starosti);
    const zk = zakaznik(zak.customer_id) || {};
    const payload = {
      date: p.date, work_type: "Zakázka", title: `${ns ? ns.label + " – " : ""}${zak.nazev}`,
      customer_name: zk.name || "", customer_company: zk.company || "", address: zak.misto_adresa || zk.address || "",
      contact_name: zak.misto_kontakt || zk.name || "", contact_phone: zak.misto_telefon || zk.phone || "",
      work_description: p.poznamka.trim() || null, contract_id: zak.contract_id || null, prubeh_id: zak.id,
      employee_id: emp.id, employee_name: emp.name, na_starosti: p.na_starosti || null,
    };
    setPracuji(true);
    const { data, error } = await supabase.from("calendar_events").insert(payload).select().single();
    setPracuji(false);
    if (error) { alert("Do kalendáře se nepodařilo uložit: " + error.message); return; }
    if (setCalendarEvents) setCalendarEvents((prev) => [...prev, data]);
    const kdy = new Date(p.date + "T00:00:00").toLocaleDateString("cs-CZ");
    await pridatPoznamku(zak, `Naplánováno do kalendáře: ${ns ? `${ns.ikona} ${ns.label}` : "práce"} — ${emp.name}, ${kdy}.`, true);
    // zaměstnanec dostane upozornění, co má na starosti
    if (emp.name !== ja) {
      await supabase.from("notifications").insert({ user_name: emp.name, title: "Práce v kalendáři", message: `${ja || "?"} ti naplánoval ${kdy}: ${ns ? ns.label : "práce"} – ${zak.nazev}`, link_type: "calendar", link_id: data.id });
    }
    setPlanForm(null);
    ukazHlasku(`✓ ${emp.name} naplánován na ${kdy}${ns ? ` (${ns.label})` : ""}`);
  };

  // ── Checklist materiálu (úkol „Materiál objednaný“) ──
  // Komponenty z nabídky; u každé appka podle modulu Sklad (products) řekne,
  // jestli je na skladě, a nový seznam podle toho předvyplní (Na skladě /
  // Objednat). Stav jde ručně změnit (Objednáno, jiný počet…).
  const otevritMaterial = async (zak, znovuZNabidky = false) => {
    const ulozene = !znovuZNabidky && Array.isArray(zak.material) && zak.material.length ? zak.material : null;
    setMaterialForm((f) => ({ zakId: zak.id, polozky: ulozene || (f?.zakId === zak.id ? f.polozky : []), produkty: null, nacitam: true, zNabidky: false }));
    // sklad + šablony rozpadu (konstrukce na díly)
    const [{ data: prod, error: pe }, { data: nast }] = await Promise.all([
      supabase.from("products").select("id, name, sku, stock, unit"),
      supabase.from("app_settings").select("value").eq("key", ROZPAD_KEY).maybeSingle(),
    ]);
    const produkty = pe ? [] : (prod || []);
    const zNabidky = ulozene ? null : polozkyZNabidky(zak.quote_id ? quoteById(zak.quote_id) : null, nast?.value?.sablony || []);
    setMaterialForm((f) => (f && f.zakId === zak.id ? {
      ...f, produkty, nacitam: false,
      // nový seznam (ne uložený) se předvyplní podle skladu
      polozky: ulozene || (zNabidky.length ? predvyplnitZeSkladu(zNabidky, produkty) : [prazdnaPolozka()]),
      zNabidky: !ulozene && zNabidky.length > 0,
    } : f));
  };

  // ── Šablony rozpadu materiálu (admin / vedoucí) ──
  const [rozpadForm, setRozpadForm] = useState(null); // { sablony, nazvy } — null = zavřeno
  const otevritRozpad = async () => {
    setRozpadForm({ sablony: null, nazvy: [] });
    const [{ data: nast }, { data: cenik }] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", ROZPAD_KEY).maybeSingle(),
      supabase.from("fve_cenik_items").select("name, category").neq("active", false),
    ]);
    const nazvy = [...new Set((cenik || []).filter((c) => !/^bez\b/i.test(c.name || "")).sort((a, b) => (a.category === "konstrukce" ? -1 : 0) - (b.category === "konstrukce" ? -1 : 0)).map((c) => c.name))];
    setRozpadForm({ sablony: nast?.value?.sablony || [], nazvy });
  };
  const ulozitRozpad = async () => {
    const sablony = rozpadForm.sablony
      .map((s) => ({ ...s, komponenta: String(s.komponenta || "").trim(), polozky: (s.polozky || []).filter((p) => String(p.nazev || "").trim()) }))
      .filter((s) => s.komponenta);
    const { error } = await supabase.from("app_settings").upsert({ key: ROZPAD_KEY, value: { sablony }, updated_at: new Date().toISOString() });
    if (error) { alert("Šablony se nepodařilo uložit: " + error.message); return; }
    setRozpadForm(null);
    ukazHlasku("✓ Rozpad materiálu uložený — použije se v checklistu materiálu");
  };
  const ulozitMaterial = async (zak, odskrtnout) => {
    const polozky = materialForm.polozky.filter((p) => String(p.nazev || "").trim()).map((p) => ({ ...p, nazev: p.nazev.trim() }));
    const s = souhrnMaterialu(polozky);
    const nevyresene = polozky.filter((p) => !stavMaterialu(p.stav) || stavMaterialu(p.stav).druh !== "vyreseno");
    if (odskrtnout && nevyresene.length && !(await zeptat({
      titulek: "Označit materiál jako objednaný?",
      text: `Ještě není vyřešené:\n${nevyresene.map((p) => `• ${p.nazev} — ${stavMaterialu(p.stav)?.label || "bez stavu"}`).join("\n")}`,
      potvrdit: "Přesto odškrtnout",
    }))) return;
    const patch = { material: polozky };
    if (odskrtnout) {
      const f = fazeById.material;
      const hotove = { ...(zak.hotove_ukoly || {}), "material.objednan": true };
      patch.hotove_ukoly = hotove;
      if (f && zak.faze === "material" && (!zak.dalsi_krok || zak.dalsi_krok === krokProFazi(zak, f))) patch.dalsi_krok = krokProFazi({ ...zak, hotove_ukoly: hotove }, f);
    }
    // Poznámka do historie: počty podle stavů + co se u položek změnilo
    const puvodni = Object.fromEntries((zak.material || []).map((p) => [p.id, p.stav]));
    const zmeny = polozky.filter((p) => puvodni[p.id] !== undefined && puvodni[p.id] !== p.stav && p.stav)
      .map((p) => `${p.nazev}: ${stavMaterialu(p.stav)?.label}`);
    const text = `Materiál: ${s.celkem} ${s.celkem === 1 ? "položka" : s.celkem < 5 ? "položky" : "položek"} — `
      + STAVY_MATERIALU.filter((st) => s.pocty[st.id]).map((st) => `${st.label.toLowerCase()} ${s.pocty[st.id]}`).join(", ")
      + (s.nevyplneno ? `, bez stavu ${s.nevyplneno}` : "") + "."
      + (zmeny.length ? ` Změny: ${zmeny.join("; ")}.` : "");
    if (await uloz(zak, patch, text)) {
      setMaterialForm(null);
      ukazHlasku(odskrtnout ? "✓ Materiál zapsaný a úkol odškrtnutý" : "✓ Checklist materiálu uložený");
    }
  };

  // ── Uzavírací e-mail objednateli (realizace na objednávku) ──
  // Předvyplní se ze šablony: odkaz na složku s fotkami na OneDrivu (sdílený
  // „jen pro čtení“), místo, datum, podpis. Otevře se v poště (mailto),
  // předávací protokol se přikládá ručně.
  const FOTKY_REALIZACE = ["Před montáží", "Průběh montáže", "Střecha", "Uzemnění", "Po montáži", "Detail střídač/baterie"];
  const otevritUzaviraciEmail = async (zak) => {
    const zk = zakaznik(zak.customer_id) || {};
    const k = contractById(zak.contract_id);
    const fotky = (fotkyZ[zak.id] || []).filter((p) => FOTKY_REALIZACE.includes(p.category));
    const protokol = (fotkyZ[zak.id] || []).find((p) => p.category === "Předávací protokol") || null;
    const zaklad = { zakId: zak.id, komu: zk.email || zk.email_contact || "", predmet: "", text: "", nacitam: true, fotek: fotky.length, protokol, upravaSablony: null };
    setUzavEmail(zaklad);
    const { data: nast } = await supabase.from("app_settings").select("value").eq("key", UZAVIRACI_EMAIL_KEY).maybeSingle();
    const sablona = { ...VYCHOZI_UZAVIRACI_EMAIL, ...Object.fromEntries(Object.entries(nast?.value || {}).filter(([, v]) => String(v ?? "").trim())) };
    // Fotky jsou ve složce zakázky na OneDrivu (stejná cesta jako při nahrávání).
    const slozka = String(k?.name || zak.nazev || zak.id).replace(/[/\\?%*:|"<>]/g, "_");
    let odkaz = null;
    try { if (isConnected() || await connectSharedAccount()) odkaz = await odkazNaSlozku(`FirmaCRM/Zakázky/${slozka}/Fotky`); } catch { /* bez OneDrivu */ }
    if (!odkaz) {
      const odkazy = fotky.map((p) => p.url).filter((u) => u && !u.includes("/storage/v1/object/"));
      odkaz = odkazy.length ? odkazy.join("\n") : "[doplň odkaz na fotky]";
    }
    const hodnoty = {
      objednatel: zk.name || "", zakazka: zak.nazev || "", cislo: k?.code ? ` (${k.code})` : "",
      misto: zak.misto_adresa || zk.address || "", datum: new Date().toLocaleDateString("cs-CZ"),
      odkaz_fotky: odkaz, pocet_fotek: pocetFotekText(fotky.length), podpis: ja,
    };
    setUzavEmail({ ...zaklad, predmet: vyplnitSablonu(sablona.predmet, hodnoty), text: vyplnitSablonu(sablona.text, hodnoty), sablona, nacitam: false, bezOdkazu: odkaz.startsWith("[") });
  };
  const uzavEmailOdeslan = async (zak) => {
    const hotove = { ...(zak.hotove_ukoly || {}), "odeslani.email": true };
    if (await uloz(zak, { hotove_ukoly: hotove }, `Uzavírací e-mail odeslaný objednateli${uzavEmail.komu ? ` (${uzavEmail.komu})` : ""}.`)) {
      setUzavEmail(null);
      ukazHlasku("✓ Uzavírací e-mail zapsaný jako odeslaný");
    }
  };
  const ulozitSablonuEmailu = async () => {
    const s = uzavEmail.upravaSablony;
    const { error } = await supabase.from("app_settings").upsert({ key: UZAVIRACI_EMAIL_KEY, value: { predmet: s.predmet, text: s.text }, updated_at: new Date().toISOString() });
    if (error) { alert("Šablonu se nepodařilo uložit: " + error.message); return; }
    setUzavEmail({ ...uzavEmail, sablona: s, upravaSablony: null });
    ukazHlasku("✓ Šablona uzavíracího e-mailu uložená — použije se u dalších zakázek");
  };

  // ── Víc zakázek z jedné nabídky ──
  // Zákazník schválí jednu nabídku, ale dělá se víc stejných zakázek (např. FVE
  // na dvou domech). Každá má vlastní průběh, místo, cenu a později i vlastní
  // číslo zakázky; spojuje je společná nabídka (quote_id).
  const zakazkyNabidky = (zak) => (zak?.quote_id
    ? rows.filter((r) => r.quote_id === zak.quote_id && r.stav !== "prohrana").sort((a, b) => a.id - b.id)
    : []);
  const cenaNabidky = (q) => konecnaCenaNabidky(q?.data).bez;
  const otevritVice = (zak) => {
    const stavajici = zakazkyNabidky(zak);
    const radky = (stavajici.length ? stavajici : [zak]).map((r) => ({
      id: r.id, nazev: r.nazev || "", misto: r.misto_adresa || "", hodnota: r.hodnota != null ? String(Math.round(r.hodnota)) : "",
    }));
    const zaklad = radky[0].nazev.replace(/ · \d+$/, "");
    radky.push({ nazev: `${zaklad} · ${radky.length + 1}`, misto: "", hodnota: radky[0].hodnota });
    setViceForm({ radky });
  };
  const zapsatVice = async (zak) => {
    const radky = viceForm.radky.map((r) => ({ ...r, nazev: r.nazev.trim(), misto: r.misto.trim() }));
    if (radky.some((r) => !r.nazev)) { alert("Každá zakázka musí mít název."); return; }
    const nove = radky.filter((r) => !r.id);
    if (!nove.length) { setViceForm(null); return; }
    const q = quoteById(zak.quote_id);
    const oznaceni = q?.cislo || q?.name || "";
    setPracuji(true);
    // Stávající zakázky: změněný název, místo nebo cena
    for (const r of radky.filter((x) => x.id)) {
      const puv = rows.find((x) => x.id === r.id);
      const patch = {};
      if (puv.nazev !== r.nazev) patch.nazev = r.nazev;
      if ((puv.misto_adresa || "") !== r.misto) patch.misto_adresa = r.misto || null;
      const h = r.hodnota === "" ? null : Math.round(Number(r.hodnota));
      if ((puv.hodnota == null ? null : Math.round(puv.hodnota)) !== h) patch.hodnota = h;
      if (Object.keys(patch).length && !(await uloz(puv, patch))) { setPracuji(false); return; }
    }
    // Nové zakázky: stejná fáze a hotové úkoly jako tahle, vlastní obchodní případ
    const zalozene = [];
    for (const r of nove) {
      const hodnota = r.hodnota === "" ? null : Math.round(Number(r.hodnota));
      const { data: d, error: dErr } = await supabase.from("deals").insert({
        name: r.nazev, value: hodnota, stage: STAGE_Z_FAZE[zak.faze] || (sekceZ(zak) === "ob" ? "Nový" : "Vyhráno"),
        customer_id: zak.customer_id || null, assigned_to: zak.vlastnik_obchod || ja || null, type: zak.typ || null,
        site_address: r.misto || null,
      }).select().single();
      if (dErr) { setPracuji(false); alert("Zakázku „" + r.nazev + "“ se nepodařilo založit: " + dErr.message); break; }
      if (onDealZalozen) onDealZalozen(d);
      const { data: row, error } = await supabase.from("zakazky_prubeh").insert({
        nazev: r.nazev, customer_id: zak.customer_id, typ: zak.typ, hodnota, deal_id: d.id, quote_id: zak.quote_id,
        faze: zak.faze, stav: "otevrena", hotove_ukoly: zak.hotove_ukoly || {}, preskocene: zak.preskocene || [], potrebne: zak.potrebne || [],
        dalsi_krok: zak.dalsi_krok, dalsi_krok_termin: zak.dalsi_krok_termin, dalsi_krok_kdo: zak.dalsi_krok_kdo,
        vlastnik_obchod: zak.vlastnik_obchod, vlastnik_bo: zak.vlastnik_bo, vlastnik_re: zak.vlastnik_re,
        misto_adresa: r.misto || null,
      }).select().single();
      if (error) { setPracuji(false); alert("Zakázku „" + r.nazev + "“ se nepodařilo založit: " + error.message); break; }
      zalozene.push(row);
      setRows((rs) => [row, ...rs]);
      // Už za obchodem (back office a dál) → hned i vlastní zakázka s číslem, jako při přesunu.
      if (sekceZ(zak) !== "ob") {
        const contractId = await zajistitZakazku(row);
        if (contractId && await uloz(row, { contract_id: contractId })) await synchronizovatStare(row, row.faze, contractId);
      }
      await pridatPoznamku(row, `Zapsáno z nabídky ${oznaceni} spolu se zakázkou „${zak.nazev}“.`, true);
    }
    setPracuji(false);
    if (!zalozene.length) return;
    await pridatPoznamku(zak, `Z nabídky ${oznaceni} zapsané další zakázky: ${zalozene.map((x) => x.nazev).join(", ")}.`, true);
    setViceForm(null);
    ukazHlasku(`✓ Zapsáno ${zalozene.length === 1 ? "1 další zakázka" : `${zalozene.length} další zakázky`} z nabídky ${oznaceni}`);
  };

  // Obchodní případ (deals) běží pod průběhem dál kvůli úkolům, zprávám a
  // přehledům — když ho zakázka ještě nemá, založí se potichu.
  const zajistitDeal = async (zak) => {
    if (zak.deal_id) return zak.deal_id;
    const { data: d, error } = await supabase.from("deals").insert({
      name: zak.nazev, value: zak.hodnota || null, stage: STAGE_Z_FAZE[zak.faze] || (sekceZ(zak) === "ob" ? "Nový" : "Vyhráno"),
      customer_id: zak.customer_id || null, assigned_to: zak.vlastnik_obchod || ja || null, type: zak.typ || null,
      site_address: zak.misto_adresa || null, site_contact_name: zak.misto_kontakt || null, site_contact_phone: zak.misto_telefon || null,
    }).select().single();
    if (error) { alert("Nepodařilo se připravit zakázku pro úkoly a zprávy: " + error.message); return null; }
    await supabase.from("zakazky_prubeh").update({ deal_id: d.id }).eq("id", zak.id);
    setRows((rs) => rs.map((r) => (r.id === zak.id ? { ...r, deal_id: d.id } : r)));
    if (onDealZalozen) onDealZalozen(d);
    return d.id;
  };

  const ulozMisto = async () => {
    const m = { misto_adresa: editMisto.adresa.trim() || null, misto_kontakt: editMisto.kontakt.trim() || null, misto_telefon: editMisto.telefon.trim() || null, misto_vztah: (editMisto.vztah || "").trim() || null };
    const ok = await uloz(z, m);
    if (!ok) return;
    // ať sedí i obchodní případ a zakázka (adresa pro technika, docházku…)
    if (z.deal_id) await supabase.from("deals").update({ site_address: m.misto_adresa, site_contact_name: m.misto_kontakt, site_contact_phone: m.misto_telefon }).eq("id", z.deal_id);
    if (z.contract_id && m.misto_adresa) {
      await supabase.from("contracts").update({ address: m.misto_adresa }).eq("id", z.contract_id);
      setContracts((ks) => ks.map((k) => (k.id === z.contract_id ? { ...k, address: m.misto_adresa } : k)));
    }
    setEditMisto(null);
    ukazHlasku("✓ Místo realizace uložené");
  };

  const ukolyZakazky = (zak) => tasks
    .filter((t) => (zak.deal_id && t.deal_id === zak.deal_id) || (zak.contract_id && t.contract_id === zak.contract_id))
    .sort((a, b) => (a.done - b.done) || String(a.due || "9999").localeCompare(String(b.due || "9999")));

  const pridatUkol = async () => {
    if (!novyUkol.title.trim()) { alert("Napiš, co je potřeba udělat."); return; }
    setPracuji(true);
    const dealId = z.contract_id ? z.deal_id : await zajistitDeal(z);
    if (!z.contract_id && !dealId) { setPracuji(false); return; }
    const { data: row, error } = await supabase.from("tasks").insert({
      title: novyUkol.title.trim(), due: novyUkol.due || "", priority: "Střední", done: false,
      customer_id: z.customer_id || null, contract_id: z.contract_id || null, deal_id: dealId || null,
      created_by: ja || "?", assigned_to: novyUkol.kdo || "", visible_to: [],
    }).select().single();
    setPracuji(false);
    if (error) { alert("Úkol se nepodařilo uložit: " + error.message); return; }
    if (setTasks) setTasks((prev) => [...prev, { ...row, customerId: row.customer_id }]);
    if (novyUkol.kdo && novyUkol.kdo !== ja) {
      await supabase.from("notifications").insert({ user_name: novyUkol.kdo, title: "Nový úkol", message: `${ja || "?"} ti zadal: ${row.title} (${z.nazev})`, link_type: "task", link_id: row.id });
    }
    setNovyUkol(null);
    ukazHlasku("✓ Úkol přidaný — najdeš ho i v Úkolech");
  };
  const prepnoutUkol = async (t) => {
    const { error } = await supabase.from("tasks").update({ done: !t.done }).eq("id", t.id);
    if (error) { alert("Úkol se nepodařilo změnit: " + error.message); return; }
    if (setTasks) setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)));
  };

  const zpravyZakazky = (zak) => [
    ...dealMsgs.filter((m) => zak.deal_id && m.deal_id === zak.deal_id),
    ...contractMsgs.filter((m) => zak.contract_id && m.contract_id === zak.contract_id),
  ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const poslatZpravu = async () => {
    const text = zprava.trim();
    if (!text) return;
    setPracuji(true);
    let row = null;
    let error = null;
    if (z.contract_id) {
      ({ data: row, error } = await supabase.from("contract_messages").insert({ contract_id: z.contract_id, user_name: ja || "?", message: text }).select().single());
      if (row && setContractMsgs) setContractMsgs((prev) => [row, ...prev]);
    } else {
      const dealId = await zajistitDeal(z);
      if (dealId) {
        ({ data: row, error } = await supabase.from("deal_messages").insert({ deal_id: dealId, user_name: ja || "?", message: text }).select().single());
        if (row && setDealMsgs) setDealMsgs((prev) => [row, ...prev]);
      }
    }
    setPracuji(false);
    if (error) { alert("Zprávu se nepodařilo odeslat: " + error.message); return; }
    if (row) setZprava("");
  };

  const zalozitPoptavku = async () => {
    if (!nova.typ) { alert("Vyber typ zakázky — podle něj se nastaví fáze."); return; }
    const novyZak = nova.zakRezim === "novy" ? { ...nova.novyZak, name: nova.novyZak.name.trim() } : null;
    if (novyZak && !novyZak.name) { alert("Zadej jméno nového zákazníka."); return; }
    if (novyZak && !novyZak.phone.trim()) { alert("Zadej telefon zákazníka."); return; }
    const kontakt = nova.kontakt || {};
    // Stávající zákazník bez telefonu (nebo s opraveným) — uložit k zákazníkovi.
    if (nova.zakRezim === "stavajici" && nova.customer_id && nova.telefonZak != null) {
      const puvodniTel = zakaznik(Number(nova.customer_id))?.phone || "";
      if (nova.telefonZak.trim() && nova.telefonZak.trim() !== puvodniTel) {
        const { error: tErr } = await supabase.from("customers").update({ phone: nova.telefonZak.trim() }).eq("id", Number(nova.customer_id));
        if (tErr) { alert("Telefon zákazníka se nepodařilo uložit: " + tErr.message); return; }
      }
    }
    // Název zakázky se doplní sám ze zákazníka a typu, když ho nikdo nevyplní.
    const jmenoZak = novyZak?.name || zakaznik(Number(nova.customer_id))?.name || "";
    const typLabel = TYPY.find((t) => t.id === nova.typ)?.label || nova.typ;
    const nazev = nova.nazev.trim() || [jmenoZak, typLabel].filter(Boolean).join(" · ");
    setPracuji(true);
    let customerId = nova.customer_id ? Number(nova.customer_id) : null;
    if (novyZak) {
      const { data: c, error: cErr } = await supabase.from("customers").insert({
        name: novyZak.name, phone: novyZak.phone.trim() || null, email: novyZak.email.trim() || null,
        address: (novyZak.adresa || "").trim() || nova.adresa?.trim() || "", tag: "Nový",
      }).select().single();
      if (cErr) { setPracuji(false); alert("Zákazníka se nepodařilo založit: " + cErr.message); return; }
      customerId = c.id;
      if (onZakaznikZalozen) onZakaznikZalozen(c);
    }
    const { data: deal, error: dealErr } = await supabase.from("deals").insert({
      name: nazev, value: nova.hodnota ? Number(nova.hodnota) : null, stage: "Nový",
      customer_id: customerId, assigned_to: nova.obchodnik || ja || null, type: nova.typ,
      site_address: nova.adresa?.trim() || null,
      site_contact_name: kontakt.jmeno?.trim() || null, site_contact_phone: kontakt.telefon?.trim() || null,
    }).select().single();
    if (dealErr) { setPracuji(false); alert("Poptávku se nepodařilo založit: " + dealErr.message); return; }
    if (onDealZalozen) onDealZalozen(deal);
    const row = {
      deal_id: deal.id, misto_adresa: nova.adresa?.trim() || null,
      misto_kontakt: kontakt.jmeno?.trim() || null, misto_telefon: kontakt.telefon?.trim() || null, misto_vztah: kontakt.vztah?.trim() || null,
      nazev, customer_id: customerId, typ: nova.typ,
      hodnota: nova.hodnota ? Number(nova.hodnota) : null, faze: PRVNI_FAZE, stav: "otevrena",
      vlastnik_obchod: nova.obchodnik || ja || null, dalsi_krok: FAZE[0].ukoly[0].text, dalsi_krok_kdo: nova.obchodnik || ja || null,
      dalsi_krok_termin: nova.termin || terminFaze(FAZE[0]),
    };
    const { data, error } = await supabase.from("zakazky_prubeh").insert(row).select().single();
    setPracuji(false);
    if (error) { alert("Poptávku se nepodařilo založit: " + error.message); return; }
    setRows((rs) => [data, ...rs]);
    setNova(null);
    setVybrano(data.id);
    setUzavrene(false);
    await pridatPoznamku(data, "Poptávka založená.", true);
    ukazHlasku("✓ Poptávka založená");
  };

  // ── Průvodce: malé okno vpravo dole u otevřené zakázky ──
  // Co teď dělat, kontroly (chyby brání posunu), tlačítka k nápravě,
  // dokumenty a přepnutí do další fáze.
  const vykresliPruvodce = () => {
    const z = vybranyRadek;
    if (!z || z.stav !== "otevrena") return null;
    const f = fazeById[z.faze];
    if (!f) return null;
    const s = sekceById[f.sekce];
    const kontroly = kontrolyZ(z);
    const chyby = kontroly.filter((x) => x.uroven === "chyba");
    const upozorneni = kontroly.filter((x) => x.uroven === "pozor");
    const auto = autoZ(z);
    const rozhodnout = fazeKRozhodnuti(f, z);
    const nehotovy = prvniNehotovy(z, f, auto);
    const dalsi = dalsiFaze(z);
    const iTed = FAZE.findIndex((x) => x.id === z.faze);
    const odSmlouvy = iTed >= FAZE.findIndex((x) => x.id === "smlouva");
    const odPredani = iTed >= FAZE.findIndex((x) => x.id === "montaz");

    const tl = { ...btnGhost, padding: "3px 8px", fontSize: 12, whiteSpace: "nowrap" };
    const akceTlacitka = (akce) => {
      if (!akce) return null;
      if (akce.startsWith("fotky:") || akce.startsWith("sken:")) {
        const kat = akce.split(":")[1];
        return <button type="button" style={tl} disabled={!!nahravam} onClick={() => vybratFotkyKategorie(z, kat)}><i className="ti ti-camera" aria-hidden="true"></i> {akce.startsWith("sken:") ? "Nahrát sken" : "Nahrát"}</button>;
      }
      if (akce === "udaje") return <button type="button" style={tl} onClick={() => {
        setUdajeForm({ id: z.id, ean: z.udaje?.ean || "", jistic_a: z.udaje?.jistic_a || "", faze: z.udaje?.faze || "" });
        setTimeout(() => document.getElementById("pr-udaje")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
      }}>Vyplnit</button>;
      if (akce === "nabidka") return onOtevritNaceneni ? <button type="button" style={tl} onClick={() => onOtevritNaceneni(z.quote_id)}>Nacenění</button> : null;
      if (akce === "smlouva") return <span style={{ display: "flex", gap: 4 }}>
        <button type="button" style={tl} disabled={generuji} onClick={() => vygenerovatDokument(z, "smlouva")}>Vygenerovat</button>
        <button type="button" style={tl} disabled={!!nahravam} onClick={() => vybratFotkyKategorie(z, "Smlouva")}>Sken</button></span>;
      if (akce === "protokol") return <span style={{ display: "flex", gap: 4 }}>
        <button type="button" style={tl} disabled={generuji} onClick={() => vygenerovatDokument(z, "protokol")}>Vygenerovat</button>
        <button type="button" style={tl} disabled={!!nahravam} onClick={() => vybratFotkyKategorie(z, "Předávací protokol")}>Sken</button></span>;
      if (akce === "podklady") return <button type="button" style={tl} onClick={() => otevritPodklady(z)}>Vyplnit</button>;
      if (akce === "misto") return <button type="button" style={tl} onClick={() => setEditMisto({ adresa: z.misto_adresa || zakaznik(z.customer_id)?.address || "", kontakt: z.misto_kontakt || "", telefon: z.misto_telefon || "", vztah: z.misto_vztah || "" })}>Doplnit</button>;
      return null;
    };
    const ikona = { chyba: ["ti-circle-x", "#dc2626"], pozor: ["ti-alert-triangle", "#d97706"], ok: ["ti-circle-check", "#16a34a"] };

    const nalada = chyby.length ? "chyba" : upozorneni.length ? "pozor" : "ok";
    if (pruvodceMin) {
      // Schovaný průvodce = panáček vpravo dole; v bublině hlásí, co je teď nejdůležitější.
      const pocet = chyby.length || upozorneni.length;
      const hlaseni = chyby.length ? chyby[0].text
        : rozhodnout ? `Rozhodni o fázi ${nazevFaze(f, z.typ)}`
          : nehotovy ? `Dokonči: ${nehotovy.text}`
            : upozorneni.length ? upozorneni[0].text
              : dalsi ? `Hotovo — můžeš do fáze ${nazevFaze(dalsi, z.typ)}` : "Hotovo — můžeš zakázku uzavřít";
      const barvaOdznaku = chyby.length ? "#dc2626" : "#d97706";
      return (
        <div className="pr-pruvodce-mini" style={{ position: "fixed", right: 16, zIndex: 900, display: "flex", alignItems: "flex-end", gap: 8 }}>
          <button type="button" onClick={prepnoutPruvodce} className="pr-bublina"
            style={{ maxWidth: 230, background: "#fff", border: `1px solid ${chyby.length ? "#fecaca" : "#e2e8f0"}`, borderRadius: "12px 12px 2px 12px", padding: "7px 10px", fontSize: 12, lineHeight: 1.3, color: chyby.length ? "#991b1b" : "#1e293b", fontWeight: chyby.length ? 700 : 500, textAlign: "left", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 14px rgba(0,0,0,.15)", marginBottom: 30 }}>
            {hlaseni}
          </button>
          <button type="button" onClick={prepnoutPruvodce} className={chyby.length ? "pr-panacek pr-panacek-hlasi" : "pr-panacek"}
            aria-label={`Otevřít průvodce${chyby.length ? ` — ${chyby.length} ${chyby.length === 1 ? "chyba" : "chyby"}` : upozorneni.length ? ` — ${upozorneni.length} upozornění` : ""}`}
            title="Otevřít průvodce"
            style={{ position: "relative", width: 64, height: 64, borderRadius: "50%", background: "#fff", border: `3px solid ${chyby.length ? "#dc2626" : s.barva}`, padding: 0, cursor: "pointer", boxShadow: "0 6px 20px rgba(0,0,0,.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Panacek nalada={nalada} size={54} />
            {pocet > 0 && (
              <span aria-hidden="true" style={{ position: "absolute", top: -6, right: -6, minWidth: 22, height: 22, borderRadius: 999, background: barvaOdznaku, color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", border: "2px solid #fff" }}>{pocet}</span>
            )}
          </button>
        </div>
      );
    }
    return (
      <div className="pr-pruvodce" role="complementary" aria-label="Průvodce zakázkou"
        style={{ position: "fixed", right: 16, width: 360, maxHeight: "60vh", overflowY: "auto", zIndex: 900, background: "#fff", border: `2px solid ${s.barva}`, borderRadius: 14, boxShadow: "0 12px 36px rgba(0,0,0,.22)", textAlign: "left", fontSize: 13 }}>
        <div style={{ background: s.svetla, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, position: "sticky", top: 0 }}>
          <Panacek nalada={nalada} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: s.tmava }}>Průvodce · {nazevFaze(f, z.typ)}</div>
            <div style={{ fontSize: 11, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.nazev} · {z.nazev}</div>
          </div>
          <button type="button" aria-label="Schovat průvodce do panáčka" title="Schovat do panáčka" onClick={prepnoutPruvodce}
            style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
            <i className="ti ti-chevron-down" aria-hidden="true"></i> Schovat
          </button>
        </div>
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div><b>Co teď:</b> {rozhodnout ? `Rozhodni, jestli je u zakázky potřeba fáze „${nazevFaze(f, z.typ)}“ (v Úkolech fáze).` : NAVOD[f.id] || "Dokonči úkoly fáze."}</div>

          {kontroly.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {kontroly.map((k, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 8, background: k.uroven === "chyba" ? "#fef2f2" : k.uroven === "pozor" ? "#fffbeb" : "transparent" }}>
                  <i className={`ti ${ikona[k.uroven][0]}`} aria-hidden="true" style={{ color: ikona[k.uroven][1], fontSize: 16, flexShrink: 0 }}></i>
                  <span style={{ flex: 1, fontWeight: k.uroven === "chyba" ? 700 : 400, color: k.uroven === "ok" ? "#475569" : "#1e293b" }}>{k.text}</span>
                  {k.uroven !== "ok" && akceTlacitka(k.akce)}
                </div>
              ))}
            </div>
          )}

          {odSmlouvy && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#64748b", width: "100%" }}>Dokumenty:</span>
              <button type="button" style={tl} disabled={generuji} onClick={() => vygenerovatDokument(z, "smlouva")}><i className="ti ti-file-text" aria-hidden="true"></i> Návrh smlouvy</button>
              <button type="button" style={tl} onClick={() => setDodatekForm({ popis: "", cena_nova: "", termin: "", aktualizovatCenu: true })}><i className="ti ti-file-plus" aria-hidden="true"></i> Dodatek o změně</button>
              {odPredani && <button type="button" style={tl} disabled={generuji} onClick={() => vygenerovatDokument(z, "protokol")}><i className="ti ti-clipboard-check" aria-hidden="true"></i> Předávací protokol</button>}
            </div>
          )}

          <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
            {chyby.length ? (
              <div style={{ color: "#b91c1c", fontWeight: 700 }}><i className="ti ti-lock" aria-hidden="true"></i> Dál to pustí, až opravíš {chyby.length === 1 ? "chybu" : `${chyby.length} chyby`} výše.</div>
            ) : rozhodnout ? (
              <div style={{ color: "#475569" }}>Nejdřív rozhodni o fázi v kartě Úkoly fáze.</div>
            ) : nehotovy ? (
              <div style={{ color: "#475569" }}>Ještě zbývá úkol: <b>{nehotovy.text}</b>{upozorneni.length ? " · a projdi upozornění výše" : ""}</div>
            ) : (
              <button type="button" disabled={pracuji} onClick={() => posunDal(z)}
                style={btn(s.barva, "#fff", { width: "100%", display: "flex", justifyContent: "center", gap: 6 })}>
                {dalsi ? <>Hotovo → {dalsi.sekce !== f.sekce ? sekceById[dalsi.sekce].nazev : nazevFaze(dalsi, z.typ)} <i className="ti ti-arrow-right" aria-hidden="true"></i></> : "Uzavřít zakázku"}
              </button>
            )}
            {!rozhodnout && (chyby.length > 0 || nehotovy) && (
              <button type="button" disabled={pracuji} onClick={() => preskocitKrok(z)}
                style={{ ...btnGhost, width: "100%", marginTop: 6, padding: "6px 10px", fontSize: 12 }}>⏭ Přeskočit krok a pokračovat</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Dodatek o změně (popis, nová cena, nový termín) ──
  const vykresliDodatek = () => {
    if (!dodatekForm || !vybranyRadek) return null;
    const z = vybranyRadek;
    const d = dodatekForm;
    const set = (patch) => setDodatekForm({ ...d, ...patch });
    const cislo = (z.dokumenty?.dodatky || []).length + 1;
    return (
      <div role="dialog" aria-modal="true" aria-label="Dodatek o změně" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        onClick={(e) => { if (e.target === e.currentTarget) setDodatekForm(null); }}>
        <div style={{ ...karta, width: "min(520px, 100%)", display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Dodatek č. {cislo} ke smlouvě</div>
          <div><label style={lbl} htmlFor="pr-dod-popis">Co se mění *</label>
            <textarea id="pr-dod-popis" style={{ ...inp, minHeight: 90, resize: "vertical" }} autoFocus value={d.popis} placeholder="např. rozšíření o 2 panely navíc, přesun rozvaděče…" onChange={(e) => set({ popis: e.target.value })} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl} htmlFor="pr-dod-cena">Nová cena bez DPH (Kč)</label>
              <input id="pr-dod-cena" type="number" min="0" style={inp} value={d.cena_nova} placeholder={z.hodnota ? `teď ${Math.round(z.hodnota)}` : "beze změny"} onChange={(e) => set({ cena_nova: e.target.value })} /></div>
            <div><label style={lbl} htmlFor="pr-dod-termin">Nový termín dokončení</label>
              <input id="pr-dod-termin" type="date" style={inp} value={d.termin} onChange={(e) => set({ termin: e.target.value })} /></div>
          </div>
          {d.cena_nova !== "" && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={d.aktualizovatCenu} onChange={(e) => set({ aktualizovatCenu: e.target.checked })} /> Upravit i hodnotu zakázky na novou cenu
            </label>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={btnGhost} onClick={() => setDodatekForm(null)}>Zrušit</button>
            <button type="button" style={btn("#0369a1")} disabled={generuji} onClick={async () => {
              if (!d.popis.trim()) { alert("Popiš, co se mění."); return; }
              await vygenerovatDokument(z, "dodatek", { popis: d.popis.trim(), cena_nova: d.cena_nova, termin: d.termin || null, aktualizovatCenu: d.aktualizovatCenu });
              setDodatekForm(null);
            }}>{generuji ? "Generuji…" : "Vygenerovat dodatek"}</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Formulář podkladů pro realizaci ──
  const vykresliPodklady = () => {
    if (!podkladyForm) return null;
    const z = rows.find((r) => r.id === podkladyForm.zakId);
    if (!z) return null;
    return (
      <div role="dialog" aria-modal="true" aria-label="Podklady pro realizaci" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        onClick={(e) => { if (e.target === e.currentTarget) setPodkladyForm(null); }}>
        <div style={{ ...karta, width: "min(820px, 100%)", maxHeight: "92vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>📋 Podklady pro realizaci — {z.nazev}</div>
          <div style={{ fontSize: 13, color: "#475569" }}>Předávací list od obchodníka. Zaměstnanec naplánovaný v kalendáři ho uvidí v detailu akce — pokyny pro jeho část (střecha / elektro) nahoře. Panely, střídač, baterie a regulace se berou z nabídky, sem dopiš jen to, co v ní není. Kontakty a technické údaje odběrného místa (EAN, jistič) jsou u zakázky.</div>
          <PodkladyFormular podklady={podkladyForm.podklady} onChange={(p) => setPodkladyForm({ ...podkladyForm, podklady: p })} inp={inp} lbl={lbl} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", position: "sticky", bottom: -16, background: "#fff", padding: "8px 0" }}>
            <button type="button" style={btnGhost} onClick={() => setPodkladyForm(null)}>Zrušit</button>
            <button type="button" style={btn("#0369a1")} disabled={pracuji} onClick={() => ulozitPodklady(z)}>Uložit podklady</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Naplánovat do kalendáře: kdo, kdy, co má na starosti ──
  const vykresliPlan = () => {
    if (!planForm) return null;
    const z = rows.find((r) => r.id === planForm.zakId);
    if (!z) return null;
    const p = planForm;
    const set = (patch) => setPlanForm({ ...p, ...patch });
    const aktivni = employees.filter((e) => !e.archived);
    const serazeni = seraditPodleDovednosti(aktivni, p.na_starosti);
    const vybrany = employees.find((e) => String(e.id) === String(p.employee_id));
    const potreba = naStarosti(p.na_starosti)?.dovednost;
    const uzMaj = akceZakazky(z).filter((e) => e.na_starosti === p.na_starosti);
    return (
      <div role="dialog" aria-modal="true" aria-label="Naplánovat do kalendáře" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        onClick={(e) => { if (e.target === e.currentTarget) setPlanForm(null); }}>
        <div style={{ ...karta, width: "min(520px, 100%)", display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>📅 Naplánovat do kalendáře</div>
          <div style={{ fontSize: 13, color: "#475569" }}>{z.nazev}{z.misto_adresa ? ` · ${z.misto_adresa}` : ""}</div>
          <div><label style={lbl} htmlFor="pr-plan-ns">Na starosti</label>
            <select id="pr-plan-ns" style={inp} value={p.na_starosti} onChange={(e) => set({ na_starosti: e.target.value })}>
              {NA_STAROSTI.map((x) => <option key={x.id} value={x.id}>{x.ikona} {x.label}</option>)}
            </select></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl} htmlFor="pr-plan-kdo">Kdo</label>
              <select id="pr-plan-kdo" style={inp} value={p.employee_id} onChange={(e) => set({ employee_id: e.target.value })}>
                <option value="">— vyber —</option>
                {serazeni.map((e) => <option key={e.id} value={e.id}>{umi(e, p.na_starosti) === true ? "✓ " : ""}{e.name}</option>)}
              </select></div>
            <div><label style={lbl} htmlFor="pr-plan-den">Kdy</label>
              <input id="pr-plan-den" type="date" style={inp} value={p.date} onChange={(e) => set({ date: e.target.value })} /></div>
          </div>
          {vybrany && umi(vybrany, p.na_starosti) === false && (
            <div style={{ fontSize: 12, color: "#b45309" }}>⚠️ {vybrany.name} nemá v profilu dovednost „{dovednost(potreba).label}“.{serazeni.some((e) => umi(e, p.na_starosti)) ? " Lidé s ✓ ji mají." : " Nikdo ji zatím v profilu nemá — doplň ji v Zaměstnancích."}</div>
          )}
          {uzMaj.length > 0 && <div style={{ fontSize: 12, color: "#475569" }}>Už naplánováno: {uzMaj.map((e) => `${e.employee_name} (${new Date(e.date + "T00:00:00").toLocaleDateString("cs-CZ")})`).join(", ")}</div>}
          <div><label style={lbl} htmlFor="pr-plan-pozn">Poznámka pro zaměstnance</label>
            <textarea id="pr-plan-pozn" style={{ ...inp, minHeight: 60, resize: "vertical" }} value={p.poznamka} placeholder="např. vzít lešení, klíče u souseda…" onChange={(e) => set({ poznamka: e.target.value })} /></div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Zaměstnanec akci uvidí ve svém kalendáři (i v Outlooku) s tím, co má na starosti, a dostane upozornění.</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={btnGhost} onClick={() => setPlanForm(null)}>Zrušit</button>
            <button type="button" style={btn("#0369a1")} disabled={pracuji || !p.employee_id || !p.date} onClick={() => ulozitPlan(z)}>Naplánovat</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Checklist materiálu: komponenty, potřeba, stav (sklad / objednáno / objednat) ──
  const vykresliMaterial = () => {
    if (!materialForm) return null;
    const z = rows.find((r) => r.id === materialForm.zakId);
    if (!z) return null;
    const m = materialForm;
    const setPolozka = (i, patch) => setMaterialForm({ ...m, polozky: m.polozky.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
    const vse = (stav) => setMaterialForm({ ...m, polozky: m.polozky.map((p) => ({ ...p, stav })) });
    const s = souhrnMaterialu(m.polozky);
    const maNabidku = !!(z.quote_id && quoteById(z.quote_id));
    return (
      <div role="dialog" aria-modal="true" aria-label="Checklist materiálu" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        onClick={(e) => { if (e.target === e.currentTarget) setMaterialForm(null); }}>
        <div style={{ ...karta, width: "min(860px, 100%)", maxHeight: "92vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>📦 Checklist materiálu — {z.nazev}</div>
          <div style={{ fontSize: 13, color: "#475569" }}>
            {m.zNabidky ? "Komponenty jsou načtené z nabídky. " : maNabidku ? "" : "Zakázka nemá propojenou nabídku — položky dopiš ručně. "}
            U každé položky appka podle modulu Sklad ukáže, jestli <b>je na skladě</b>, a stav předvyplní. Co už je objednané, přepni na <b>Objednáno</b>.
          </div>
          {/* Stav podle skladu (modul Sklad) — počítá se pořád znovu z aktuálních názvů a počtů */}
          {m.nacitam ? <div style={{ fontSize: 13, color: "#64748b" }}>Načítám komponenty a kontroluji sklad…</div> : m.produkty == null ? null : (() => {
            const st = m.polozky.filter((p) => String(p.nazev || "").trim()).map((p) => stavSkladu(p, m.produkty).druh);
            const pocet = (d) => st.filter((x) => x === d).length;
            return (
              <div style={{ fontSize: 13, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 10px" }}>
                <b>Podle skladu:</b>
                <span style={{ color: "#15803d", fontWeight: 700 }}>✓ na skladě {pocet("dost")}</span>
                <span style={{ color: "#b45309", fontWeight: 700 }}>◐ málo {pocet("malo")}</span>
                <span style={{ color: "#b91c1c", fontWeight: 700 }}>✕ není {pocet("neni")}</span>
                <span style={{ color: "#64748b" }}>? sklad nevede {pocet("nevede")}</span>
                {pocet("nevede") > 0 && <span style={{ fontSize: 12, color: "#64748b" }}>— položky, které Sklad nevede, zapiš do modulu Sklad, ať je appka příště pozná.</span>}
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
            <span style={{ color: "#64748b" }}>Označit vše:</span>
            <select aria-label="Označit všechny položky" value="" style={{ ...inp, width: "auto", padding: "4px 8px", fontSize: 12 }} onChange={(e) => { if (e.target.value) vse(e.target.value); }}>
              <option value="">— vyber stav —</option>
              {STAVY_MATERIALU.map((st) => <option key={st.id} value={st.id}>{st.ikona} {st.label}</option>)}
            </select>
          </div>
          <div className="pr-mat-radek pr-mat-hlavicka" style={{ display: "grid", gridTemplateColumns: "1fr 150px 240px 90px 32px", gap: 8, fontSize: 12, fontWeight: 700, color: "#64748b" }}>
            <span>Komponenta</span><span>Potřeba</span><span className="pr-mat-stav">Stav</span><span>Skladem ks</span><span />
          </div>
          {m.polozky.map((p, i) => {
            const sk = m.produkty && String(p.nazev || "").trim() ? stavSkladu(p, m.produkty) : null;
            const skladStitek = sk && {
              dost: { text: `✓ Na skladě — ${sk.stock} ${sk.unit}`, barva: "#15803d", pozadi: "#dcfce7" },
              malo: { text: `◐ Na skladě jen ${sk.stock} ${sk.unit} z ${p.ks} — chybí ${Math.round((Number(p.ks) - sk.stock) * 100) / 100}`, barva: "#b45309", pozadi: "#fef3c7" },
              neni: { text: "✕ Není na skladě (0)", barva: "#b91c1c", pozadi: "#fee2e2" },
              nevede: { text: "? Sklad tuhle položku nevede", barva: "#64748b", pozadi: "#f1f5f9" },
            }[sk.druh];
            const castecne = p.skladem !== "" && Number(p.skladem) < Number(p.ks) && p.stav !== "objednano";
            return (
              <div key={p.id} style={{ borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
                <div className="pr-mat-radek" style={{ display: "grid", gridTemplateColumns: "1fr 150px 240px 90px 32px", gap: 8, alignItems: "center" }}>
                  <input aria-label={`Komponenta ${i + 1}`} style={inp} value={p.nazev} placeholder="název komponenty" onChange={(e) => setPolozka(i, { nazev: e.target.value })} />
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input aria-label={`Potřeba ${i + 1}`} type="number" min="0" step="any" style={{ ...inp, padding: "8px 6px" }} value={p.ks} onChange={(e) => setPolozka(i, { ks: e.target.value })} />
                    <select aria-label={`Jednotka položky ${i + 1}`} style={{ ...inp, width: 62, padding: "8px 4px", fontSize: 12 }} value={p.jednotka || "ks"} onChange={(e) => setPolozka(i, { jednotka: e.target.value })}>{[...new Set([...JEDNOTKY_MATERIALU, p.jednotka || "ks"])].map((j) => <option key={j} value={j}>{j}</option>)}</select>
                  </div>
                  {(() => {
                    const st = stavMaterialu(p.stav);
                    return (
                      <select className="pr-mat-stav" aria-label={`Stav položky ${i + 1}`} value={p.stav || ""}
                        onChange={(e) => setPolozka(i, { stav: e.target.value, ...(e.target.value === "sklad" && p.skladem === "" ? { skladem: String(p.ks) } : {}) })}
                        style={{ ...inp, padding: "7px 8px", fontSize: 13, fontWeight: 700, border: `1px solid ${st ? st.barva : "#cbd5e1"}`, background: st ? st.svetla : "#fff", color: st ? st.barva : "#64748b" }}>
                        <option value="">— vyber stav —</option>
                        {STAVY_MATERIALU.map((x) => <option key={x.id} value={x.id}>{x.ikona} {x.label}</option>)}
                      </select>
                    );
                  })()}
                  <input aria-label={`Skladem kusů ${i + 1}`} type="number" min="0" step="any" style={{ ...inp, padding: "8px 6px" }} value={p.skladem} placeholder="—"
                    onChange={(e) => setPolozka(i, { skladem: e.target.value })} />
                  <button type="button" aria-label={`Odebrat položku ${i + 1}`} style={{ ...btnGhost, padding: "4px 8px" }} onClick={() => setMaterialForm({ ...m, polozky: m.polozky.filter((_, j) => j !== i) })}>✕</button>
                </div>
                {(skladStitek || castecne || p.zRozpadu) && (
                  <div style={{ fontSize: 12, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {p.zRozpadu && <span style={{ color: "#64748b" }}>🧩 z rozpadu: {p.zRozpadu}</span>}
                    {skladStitek && <span style={{ color: skladStitek.barva, background: skladStitek.pozadi, borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>{skladStitek.text}</span>}
                    {castecne && <span style={{ color: "#b45309", fontWeight: 600 }}>Skladem {p.skladem} z {p.ks} — objednat {Math.round((Number(p.ks) - Number(p.skladem)) * 100) / 100} {p.jednotka || "ks"}.</span>}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btnGhost} onClick={() => setMaterialForm({ ...m, polozky: [...m.polozky, prazdnaPolozka()] })}>+ Přidat položku</button>
            {maNabidku && <button type="button" style={btnGhost} onClick={() => otevritMaterial(z, true)} title="Zahodí rozpracovaný seznam a načte komponenty znovu z nabídky (i podle šablon rozpadu)">↻ Načíst znovu z nabídky</button>}
            {smiNastavit && <button type="button" style={btnGhost} onClick={otevritRozpad} title="Šablony: z čeho se skládá konstrukce na 1 panel">🧩 Rozpad materiálu</button>}
          </div>
          <div style={{ fontSize: 13, display: "flex", gap: 12, flexWrap: "wrap", background: "#f8fafc", borderRadius: 8, padding: "8px 10px" }}>
            <b>{s.celkem} {s.celkem === 1 ? "položka" : s.celkem < 5 ? "položky" : "položek"}</b>
            {STAVY_MATERIALU.filter((st) => s.pocty[st.id]).map((st) => <span key={st.id} style={{ color: st.barva, fontWeight: st.druh === "vyreseno" ? 400 : 700 }}>{st.ikona} {st.label.toLowerCase()} {s.pocty[st.id]}</span>)}
            {s.nevyplneno > 0 && <span style={{ color: "#94a3b8" }}>bez stavu {s.nevyplneno}</span>}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" style={btnGhost} onClick={() => setMaterialForm(null)}>Zavřít</button>
            <button type="button" style={btnGhost} disabled={pracuji} onClick={() => ulozitMaterial(z, false)}>Uložit</button>
            <button type="button" style={btn("#15803d")} disabled={pracuji} onClick={() => ulozitMaterial(z, true)}>Uložit a odškrtnout „Materiál objednaný“</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Šablony rozpadu materiálu: komponenta → díly na 1 kus (panel) + pevně ──
  const vykresliRozpad = () => {
    if (!rozpadForm) return null;
    const r = rozpadForm;
    const setSablony = (sablony) => setRozpadForm({ ...r, sablony });
    const setSablona = (i, patch) => setSablony(r.sablony.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    const setDil = (i, k, patch) => setSablona(i, { polozky: r.sablony[i].polozky.map((p, j) => (j === k ? { ...p, ...patch } : p)) });
    const novyDil = () => ({ id: Math.random().toString(36).slice(2, 10), nazev: "", naKus: "", pevne: "", jednotka: "ks" });
    return (
      <div role="dialog" aria-modal="true" aria-label="Rozpad materiálu" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        onClick={(e) => { if (e.target === e.currentTarget) setRozpadForm(null); }}>
        <div style={{ ...karta, width: "min(820px, 100%)", maxHeight: "92vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>🧩 Rozpad materiálu</div>
          <div style={{ fontSize: 13, color: "#475569" }}>
            Nadefinuj, z čeho se komponenta skládá. U <b>konstrukce</b> se množství zadává <b>na 1 panel</b> — checklist materiálu ho vynásobí počtem panelů z nabídky.
            „Pevně“ = navíc jednou na celou instalaci. Kusy se zaokrouhlují nahoru, metry a kilogramy na setiny.
          </div>
          {r.sablony == null ? <div style={{ color: "#64748b" }}>Načítám…</div> : <>
            {r.sablony.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8" }}>Zatím žádná šablona.</div>}
            {r.sablony.map((sab, i) => (
              <div key={sab.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl} htmlFor={`pr-roz-k-${sab.id}`}>Komponenta z nabídky (název přesně jako v ceníku)</label>
                    <PoleSNabidkou id={`pr-roz-k-${sab.id}`} moznosti={r.nazvy} style={inp} value={sab.komponenta || ""} placeholder="např. Šikmá střecha"
                      onChange={(v) => setSablona(i, { komponenta: v })} />
                  </div>
                  <button type="button" style={{ ...btnGhost, color: "#b91c1c" }} onClick={() => setSablony(r.sablony.filter((_, j) => j !== i))}>Smazat šablonu</button>
                </div>
                <div className="pr-roz-radek pr-roz-hlavicka" style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 90px 32px", gap: 8, fontSize: 12, fontWeight: 700, color: "#64748b" }}>
                  <span>Díl</span><span>Na 1 panel / ks</span><span>Pevně navíc</span><span>Jednotka</span><span />
                </div>
                {(sab.polozky || []).map((p, k) => (
                  <div key={p.id} className="pr-roz-radek" style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 90px 32px", gap: 8, alignItems: "center" }}>
                    <input aria-label={`Díl ${k + 1}`} style={inp} value={p.nazev} placeholder="např. Kolejnice 2,1 m" onChange={(e) => setDil(i, k, { nazev: e.target.value })} />
                    <input aria-label={`Na 1 panel ${k + 1}`} type="number" min="0" step="any" style={inp} value={p.naKus} placeholder="na 1 panel" title="Množství na 1 panel (1 kus komponenty)" onChange={(e) => setDil(i, k, { naKus: e.target.value })} />
                    <input aria-label={`Pevně navíc ${k + 1}`} type="number" min="0" step="any" style={inp} value={p.pevne} placeholder="pevně navíc" title="Navíc jednou na celou instalaci" onChange={(e) => setDil(i, k, { pevne: e.target.value })} />
                    <select aria-label={`Jednotka ${k + 1}`} style={{ ...inp, padding: "8px 6px" }} value={p.jednotka || "ks"} onChange={(e) => setDil(i, k, { jednotka: e.target.value })}>{[...new Set([...JEDNOTKY_MATERIALU, p.jednotka || "ks"])].map((j) => <option key={j} value={j}>{j}</option>)}</select>
                    <button type="button" aria-label={`Odebrat díl ${k + 1}`} style={{ ...btnGhost, padding: "4px 8px" }} onClick={() => setSablona(i, { polozky: sab.polozky.filter((_, j) => j !== k) })}>✕</button>
                  </div>
                ))}
                <button type="button" style={{ ...btnGhost, alignSelf: "flex-start", padding: "4px 10px", fontSize: 13 }} onClick={() => setSablona(i, { polozky: [...(sab.polozky || []), novyDil()] })}>+ Přidat díl</button>
              </div>
            ))}
            <button type="button" style={{ ...btnGhost, alignSelf: "flex-start" }}
              onClick={() => setSablony([...r.sablony, { id: Math.random().toString(36).slice(2, 10), komponenta: "", polozky: [novyDil()] }])}>+ Nová šablona</button>
          </>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={btnGhost} onClick={() => setRozpadForm(null)}>Zrušit</button>
            <button type="button" style={btn("#0369a1")} disabled={r.sablony == null} onClick={ulozitRozpad}>Uložit šablony</button>
          </div>
        </div>
      </div>
    );
  };

  // ── Uzavírací e-mail: úprava, otevření v poště, zápis odeslání ──
  const vykresliUzavEmail = () => {
    if (!uzavEmail) return null;
    const z = rows.find((r) => r.id === uzavEmail.zakId);
    if (!z) return null;
    const e = uzavEmail;
    const set = (patch) => setUzavEmail({ ...e, ...patch });
    const mailto = `mailto:${encodeURIComponent(e.komu.trim()).replace(/%40/g, "@").replace(/%2C/gi, ",")}?subject=${encodeURIComponent(e.predmet)}&body=${encodeURIComponent(e.text)}`;
    const kopirovat = async () => {
      try { await navigator.clipboard.writeText(`${e.predmet}\n\n${e.text}`); ukazHlasku("✓ Předmět a text zkopírované"); }
      catch { alert("Kopírování se nepovedlo — označ text ručně."); }
    };
    return (
      <div role="dialog" aria-modal="true" aria-label="Uzavírací e-mail objednateli" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        onClick={(ev) => { if (ev.target === ev.currentTarget) setUzavEmail(null); }}>
        <div style={{ ...karta, width: "min(720px, 100%)", maxHeight: "92vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>✉️ Uzavírací e-mail objednateli</div>
          {e.nacitam ? <div style={{ color: "#475569", fontSize: 14 }}>Připravuji e-mail a odkaz na fotky…</div> : <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 13 }}>
              <span style={{ background: e.fotek ? "#dcfce7" : "#fef2f2", color: e.fotek ? "#166534" : "#991b1b", borderRadius: 7, padding: "3px 8px", fontWeight: 700 }}>
                {e.fotek ? `📷 ${pocetFotekText(e.fotek)} z realizace` : "📷 Žádné fotky z realizace"}
              </span>
              <span style={{ background: e.protokol ? "#dcfce7" : "#fffbeb", color: e.protokol ? "#166534" : "#92400e", borderRadius: 7, padding: "3px 8px", fontWeight: 700 }}>
                {e.protokol ? "📄 Sken protokolu nahraný" : "📄 Sken podepsaného protokolu chybí"}
              </span>
              {e.protokol && <StorageLink href={e.protokol.url} target="_blank" rel="noopener noreferrer" style={{ color: "#0369a1", fontWeight: 600 }}>Otevřít sken (k přiložení)</StorageLink>}
            </div>
            {e.bezOdkazu && <div style={{ fontSize: 12, color: "#b45309" }}>Odkaz na složku s fotkami se nepodařilo vytvořit (OneDrive nepřipojený nebo fotky ve složce nejsou) — doplň ho do textu ručně.</div>}
            <div><label style={lbl} htmlFor="pr-ue-komu">Komu</label>
              <input id="pr-ue-komu" style={inp} value={e.komu} placeholder="e-mail objednatele" onChange={(ev) => set({ komu: ev.target.value })} /></div>
            <div><label style={lbl} htmlFor="pr-ue-predmet">Předmět</label>
              <input id="pr-ue-predmet" style={inp} value={e.predmet} onChange={(ev) => set({ predmet: ev.target.value })} /></div>
            <div><label style={lbl} htmlFor="pr-ue-text">Text</label>
              <textarea id="pr-ue-text" style={{ ...inp, minHeight: 260, resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }} value={e.text} onChange={(ev) => set({ text: ev.target.value })} /></div>
            <div style={{ fontSize: 12, color: "#475569" }}>„Otevřít v poště“ spustí tvůj poštovní program s vyplněným e-mailem — podepsaný předávací protokol k němu přilož a odešli. Pak klikni „Odesláno“.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {smiNastavit && !e.upravaSablony && <button type="button" style={{ ...btnGhost, marginRight: "auto" }} onClick={() => set({ upravaSablony: { ...e.sablona } })}>Upravit výchozí šablonu</button>}
              <button type="button" style={btnGhost} onClick={() => setUzavEmail(null)}>Zavřít</button>
              <button type="button" style={btnGhost} onClick={kopirovat}>Kopírovat text</button>
              <a href={mailto} style={{ ...btn("#0369a1"), textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Otevřít v poště</a>
              <button type="button" style={btn("#15803d")} onClick={() => uzavEmailOdeslan(z)}>✓ Odesláno</button>
            </div>
            {e.upravaSablony && (
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 800 }}>Výchozí šablona uzavíracího e-mailu</div>
                <div style={{ fontSize: 12, color: "#475569" }}>Značky se doplní samy: {ZNACKY_UZAVIRACIHO_EMAILU.map(([k, popis]) => <span key={k} title={popis} style={{ fontFamily: "monospace", background: "#f1f5f9", borderRadius: 4, padding: "0 4px", marginRight: 4 }}>{`{${k}}`}</span>)}</div>
                <input aria-label="Předmět šablony" style={inp} value={e.upravaSablony.predmet} onChange={(ev) => set({ upravaSablony: { ...e.upravaSablony, predmet: ev.target.value } })} />
                <textarea aria-label="Text šablony" style={{ ...inp, minHeight: 200, resize: "vertical", fontFamily: "inherit" }} value={e.upravaSablony.text} onChange={(ev) => set({ upravaSablony: { ...e.upravaSablony, text: ev.target.value } })} />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" style={btnGhost} onClick={() => set({ upravaSablony: { ...VYCHOZI_UZAVIRACI_EMAIL } })}>Vrátit původní znění</button>
                  <button type="button" style={btnGhost} onClick={() => set({ upravaSablony: null })}>Zrušit</button>
                  <button type="button" style={btn("#0369a1")} onClick={ulozitSablonuEmailu}>Uložit šablonu</button>
                </div>
              </div>
            )}
          </>}
        </div>
      </div>
    );
  };

  // ── Víc zakázek z jedné nabídky: seznam zakázek (stávající + nové) ──
  const vykresliVice = () => {
    if (!viceForm || !vybranyRadek) return null;
    const z = vybranyRadek;
    const q = quoteById(z.quote_id);
    const celkem = cenaNabidky(q);
    const radky = viceForm.radky;
    const setRadek = (i, patch) => setViceForm({ radky: radky.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
    const zaklad = (radky[0]?.nazev || z.nazev).replace(/ · \d+$/, "");
    const soucet = radky.reduce((s, r) => s + (Number(r.hodnota) || 0), 0);
    const nastavCeny = (fn) => setViceForm({ radky: radky.map((r, i) => ({ ...r, hodnota: String(fn(i)) })) });
    const novych = radky.filter((r) => !r.id).length;
    return (
      <div role="dialog" aria-modal="true" aria-label="Víc zakázek z jedné nabídky" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        onClick={(e) => { if (e.target === e.currentTarget && !pracuji) setViceForm(null); }}>
        <div style={{ ...karta, width: "min(760px, 100%)", maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Víc zakázek z nabídky {q?.cislo || q?.name}</div>
          <div style={{ fontSize: 13, color: "#475569" }}>
            Každá zakázka pojede samostatně — vlastní průběh, místo realizace, cena, fotky, smlouva i číslo zakázky. Nové začnou ve stejné fázi jako tahle ({nazevFaze(fazeById[z.faze], z.typ)}).
          </div>
          <div className="pr-vice-hlavicka" style={{ display: "grid", gridTemplateColumns: "28px 1.3fr 1.3fr 120px 32px", gap: 8, fontSize: 12, fontWeight: 700, color: "#64748b" }}>
            <span>#</span><span>Název zakázky</span><span>Místo realizace</span><span>Cena bez DPH</span><span />
          </div>
          {radky.map((r, i) => (
            <div key={r.id || `n${i}`} className="pr-vice-radek" style={{ display: "grid", gridTemplateColumns: "28px 1.3fr 1.3fr 120px 32px", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 800, color: r.id ? "#334155" : "#0369a1" }} title={r.id ? "Už zapsaná zakázka" : "Nová zakázka"}>{i + 1}.</span>
              <input aria-label={`Název zakázky ${i + 1}`} style={inp} value={r.nazev} onChange={(e) => setRadek(i, { nazev: e.target.value })} />
              <input aria-label={`Místo realizace ${i + 1}`} style={inp} value={r.misto} placeholder={zakaznik(z.customer_id)?.address || "adresa"} onChange={(e) => setRadek(i, { misto: e.target.value })} />
              <input aria-label={`Cena zakázky ${i + 1}`} type="number" min="0" style={inp} value={r.hodnota} onChange={(e) => setRadek(i, { hodnota: e.target.value })} />
              {r.id ? <span /> : (
                <button type="button" aria-label={`Odebrat zakázku ${i + 1}`} title="Odebrat" style={{ ...btnGhost, padding: "4px 8px" }}
                  onClick={() => setViceForm({ radky: radky.filter((_, j) => j !== i) })}>✕</button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" style={btnGhost} onClick={() => setViceForm({ radky: [...radky, { nazev: `${zaklad} · ${radky.length + 1}`, misto: "", hodnota: radky[radky.length - 1]?.hodnota || "" }] })}>+ Další zakázka</button>
            {celkem > 0 && <>
              <button type="button" style={btnGhost} onClick={() => nastavCeny((i) => Math.round(celkem / radky.length) + (i === 0 ? celkem - Math.round(celkem / radky.length) * radky.length : 0))}>Rozpočítat cenu nabídky</button>
              <button type="button" style={btnGhost} onClick={() => nastavCeny(() => Math.round(celkem))}>Každá za cenu nabídky</button>
            </>}
          </div>
          <div style={{ fontSize: 13, color: "#475569" }}>
            Součet: <b>{fmtKc(soucet)}</b>{celkem > 0 && <> · nabídka: {fmtKc(celkem)}{Math.round(soucet) !== Math.round(celkem) && ` (${soucet > celkem ? "o " + fmtKc(soucet - celkem) + " víc" : "o " + fmtKc(celkem - soucet) + " míň"})`}</>}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" style={btnGhost} disabled={pracuji} onClick={() => setViceForm(null)}>Zrušit</button>
            <button type="button" style={btn("#0369a1")} disabled={pracuji || !novych} onClick={() => zapsatVice(z)}>
              {pracuji ? "Zapisuji…" : novych ? `Zapsat ${novych === 1 ? "1 novou zakázku" : `${novych} nové zakázky`}` : "Přidej další zakázku"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Vykreslení ──
  const hlaskaEl = hlaska && (
    <div role="status" onClick={() => setHlaska(null)} style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#15803d", color: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, boxShadow: "0 6px 20px rgba(0,0,0,.2)", maxWidth: "90vw" }}>{hlaska}</div>
  );
  const frontaBtn = (id, label, barva) => (
    <button key={id} type="button" onClick={() => setFronta(id)} aria-pressed={fronta === id}
      style={{ background: fronta === id ? (barva || "#0f172a") : "#fff", color: fronta === id ? "#fff" : "#334155", border: "none", borderRadius: 9, padding: "8px 13px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
  );

  return (
    <div className="pr-wrap" style={{ background: "#f0f4f8", minHeight: "100vh", display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{CSS}</style>
      {hlaskaEl}
      <style>{`
        .pr-pruvodce, .pr-pruvodce-mini { bottom: 16px; }
        .pr-panacek:hover { transform: scale(1.06); }
        .pr-panacek-hlasi { animation: pr-hlasi 1.6s ease-in-out infinite; }
        @keyframes pr-hlasi { 0%, 70%, 100% { transform: translateY(0); } 80% { transform: translateY(-7px); } 90% { transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) { .pr-panacek-hlasi { animation: none; } }
        @media (max-width: 768px) {
          .pr-pruvodce, .pr-pruvodce-mini { bottom: calc(84px + env(safe-area-inset-bottom)); right: 8px !important; }
          .pr-bublina { max-width: 170px !important; }
          div.pr-pruvodce { left: 8px; width: auto !important; }
          .pr-vice-hlavicka { display: none !important; }
          .pr-kontakt-radek { grid-template-columns: 1fr !important; }
          .pr-podklady-pole { grid-template-columns: 1fr !important; }
          .pr-mat-radek { grid-template-columns: 1fr 150px !important; }
          .pr-mat-radek > .pr-mat-stav { grid-column: 1 / -1; }
          .pr-mat-hlavicka { display: none !important; }
          .pr-roz-hlavicka > span:first-child { display: none; }
          .pr-roz-radek { grid-template-columns: 1fr 1fr 64px 36px !important; }
          .pr-roz-radek > input:first-child { grid-column: 1 / -1; }
          .pr-vice-radek { grid-template-columns: 28px 1fr 32px !important; }
          .pr-vice-radek > input:nth-of-type(2), .pr-vice-radek > input:nth-of-type(3) { grid-column: 2 / 3; }
        }
      `}</style>
      {vykresliPruvodce()}
      {vykresliDodatek()}
      {vykresliVice()}
      {vykresliUzavEmail()}
      {vykresliMaterial()}
      {vykresliPlan()}
      {vykresliPodklady()}
      {vykresliRozpad()}
      {dotaz && (
        <div role="dialog" aria-modal="true" aria-label={dotaz.titulek} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) zavritDotaz(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") zavritDotaz(null); }}>
          <div style={{ ...karta, width: "min(480px, 100%)", display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{dotaz.titulek}</div>
            {dotaz.text && <div style={{ fontSize: 14, color: "#334155", whiteSpace: "pre-line", lineHeight: 1.45 }}>{dotaz.text}</div>}
            {dotaz.vstup && (
              <div>
                <label style={lbl} htmlFor="pr-dotaz-vstup">{dotaz.popisek || "Text"} *</label>
                <textarea id="pr-dotaz-vstup" autoFocus style={{ ...inp, minHeight: 70, resize: "vertical" }} value={dotaz.hodnota} placeholder={dotaz.placeholder || ""}
                  onChange={(e) => setDotaz({ ...dotaz, hodnota: e.target.value })} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={btnGhost} onClick={() => zavritDotaz(null)}>Zrušit</button>
              <button type="button" autoFocus={!dotaz.vstup} style={btn("#0369a1")} disabled={dotaz.vstup && !dotaz.hodnota.trim()}
                onClick={() => zavritDotaz(dotaz.vstup ? dotaz.hodnota.trim() : true)}>{dotaz.potvrdit || "OK"}</button>
            </div>
          </div>
        </div>
      )}
      {prohlizec && <ProhlizecFotek fotky={prohlizec.fotky} i={prohlizec.i} onI={zmenitFotku} onClose={zavritProhlizec} />}
      {/* Výběr fotek pro tlačítko „Nahrát fotky“ u úkolu fáze (na mobilu nabídne i fotoaparát). */}
      <input ref={fotoInput} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={(e) => { const files = [...e.target.files]; e.target.value = ""; nahratFotky(files); }} />

      {jednaId && z ? (
        // Okno zakázky: kroky nahoře, pod nimi přehled a karty zakázky.
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button type="button" style={btnGhost} onClick={() => setJednaId(null)}>← Zpět na přehled zakázek</button>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{z.nazev}</h1>
          </div>
          {vykresliPanel(true)}
        </div>
      ) : <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>🧭 Průběh zakázek</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div role="group" aria-label="Fronta" style={{ display: "flex", gap: 4, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 4, flexWrap: "wrap" }}>
            {frontaBtn("vse", "Všechny")}
            {frontaBtn("moje", "Moje")}
            {frontaBtn("ob", "Obchod", "#0369a1")}
            {frontaBtn("bo", "Kancelář", "#b45309")}
            {frontaBtn("re", "Realizace", "#15803d")}
          </div>
          {smiNastavit && <button type="button" style={btnGhost} onClick={() => setNastaveniForm(Object.fromEntries(FAZE.map((f) => [f.id, { dny: f.dny, typy: Object.fromEntries(TYPY.map((t) => [t.id, pravidlo(f, t.id)])), ukoly: f.ukoly.map((u) => ({ ...u })) }])))}>⚙️ Nastavení fází</button>}
          {smiNastavit && <button type="button" style={btnGhost} onClick={otevritRozpad} title="Šablony rozpadu materiálu (konstrukce na 1 panel)">🧩 Rozpad materiálu</button>}
          <button type="button" style={btn("#0369a1")} onClick={() => setNova({ nazev: "", customer_id: "", typ: "", hodnota: "", obchodnik: ja, termin: "", adresa: "", zakRezim: null, zakHledat: "", novyZak: { name: "", phone: "", email: "", adresa: "" }, telefonZak: null, kontakt: { jmeno: "", telefon: "", vztah: "" } })}>+ Nová poptávka</button>
        </div>
      </div>

      <div className="pr-kpi">
        <button type="button" onClick={() => setFronta("moje")} style={{ ...karta, padding: "12px 18px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}><div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Čeká na mě</div><div style={{ fontSize: 28, fontWeight: 800, color: "#b45309" }}>{kpi.naMe}</div></button>
        <div style={{ ...karta, padding: "12px 18px", borderColor: kpi.poTerminu ? "#fca5a5" : "#e2e8f0" }}><div style={{ fontSize: 13, color: kpi.poTerminu ? "#991b1b" : "#475569", fontWeight: 600 }}>Po termínu</div><div style={{ fontSize: 28, fontWeight: 800, color: kpi.poTerminu ? "#b91c1c" : "#0f172a" }}>{kpi.poTerminu}</div></div>
        <button type="button" onClick={() => setFronta("vse")} title="Zakázky, které jsou ve fázi déle, než je u ní obvyklé" style={{ ...karta, padding: "12px 18px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderColor: kpi.dlouho ? "#fdba74" : "#e2e8f0" }}><div style={{ fontSize: 13, color: kpi.dlouho ? "#9a3412" : "#475569", fontWeight: 600 }}>Déle než obvykle</div><div style={{ fontSize: 28, fontWeight: 800, color: kpi.dlouho ? "#c2410c" : "#0f172a" }}>{kpi.dlouho}</div></button>
        <div style={{ ...karta, padding: "12px 18px" }}><div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Připraveno k realizaci</div><div style={{ fontSize: 28, fontWeight: 800, color: "#15803d" }}>{kpi.pripraveno}</div></div>
        <div style={{ ...karta, padding: "12px 18px" }}><div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Otevřené zakázky (hodnota)</div><div style={{ fontSize: 24, fontWeight: 800 }}>{fmtKc(kpi.hodnota)}</div></div>
      </div>

      <div className="pr-grid pr-jedna">
        <div style={{ ...karta, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid #e2e8f0", alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={btn("#0f172a")} onClick={() => { setVyberHledat(""); setVyberOkno(true); }} title="Najít zakázku a otevřít ji">🎯 Najít zakázku</button>
            {!jednaId && <input type="search" aria-label="Hledat zakázku" placeholder="Hledat zákazníka, název nebo kód…" value={hledat} onChange={(e) => setHledat(e.target.value)} style={{ ...inp, maxWidth: 320 }} />}
            {!jednaId && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#334155" }}>
                <input type="checkbox" checked={uzavrene} onChange={(e) => setUzavrene(e.target.checked)} /> Uzavřené a prohrané
              </label>
            )}
          </div>
          {jednaId && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 16px", background: "#eff6ff", borderBottom: "1px solid #bfdbfe", fontSize: 14, color: "#1e3a8a" }}>
              <span>Zobrazena jen zakázka <b>{rows.find((r) => r.id === jednaId)?.nazev || ""}</b></span>
              <button type="button" style={{ ...btnGhost, padding: "5px 11px", fontSize: 13 }} onClick={() => setJednaId(null)}>✕ Zobrazit všechny</button>
            </div>
          )}
          <div className="pr-row" style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: "#475569" }}>
            <div style={{ padding: "11px 16px" }}>ZAKÁZKA</div>
            <div className="pr-sek" style={{ padding: "11px 8px", color: "#0369a1" }}>OBCHOD</div>
            <div className="pr-sek" style={{ padding: "11px 8px", color: "#92400e" }}>BACK OFFICE</div>
            <div className="pr-sek" style={{ padding: "11px 8px", color: "#15803d" }}>REALIZACE</div>
            <div style={{ padding: "11px 8px" }}>DALŠÍ KROK</div>
            <div style={{ padding: "11px 12px", textAlign: "right" }}>KDO</div>
          </div>
          {!nacteno && <div style={{ padding: 20, color: "#64748b" }}>Načítám…</div>}
          {nacteno && viditelne.length === 0 && (
            <div style={{ padding: 24, color: "#64748b", fontSize: 14 }}>
              {rows.length === 0 ? "Zatím žádné zakázky. Začni tlačítkem „+ Nová poptávka“." : "V téhle frontě teď nic není."}
            </div>
          )}
          {viditelne.map((r) => {
            const sel = r.id === vybrano;
            const po = poTerminu(r);
            const pz = posledniPozn(r.id);
            const dni = dnyOd(r.faze_od);
            const k = contractById(r.contract_id);
            return (
              <div key={r.id} className="pr-row pr-klik" role="button" tabIndex={0} aria-pressed={sel}
                onClick={() => otevritOkno(r.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); otevritOkno(r.id); } }}
                style={{ background: sel ? "#fffbeb" : po ? "#fef2f2" : "#fff", boxShadow: sel ? "inset 4px 0 0 #b45309" : "none" }}>
                <div style={{ padding: "11px 16px", minWidth: 0 }}>
                  <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nazev}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{[k?.code, zakaznik(r.customer_id)?.name, r.typ].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="pr-sek" style={{ padding: "11px 8px" }}><BunkaSekce z={r} sekceIds={["ob"]} /></div>
                <div className="pr-sek" style={{ padding: "11px 8px" }}><BunkaSekce z={r} sekceIds={["bo", "uz"]} /></div>
                <div className="pr-sek" style={{ padding: "11px 8px" }}><BunkaSekce z={r} sekceIds={["re"]} /></div>
                <div style={{ padding: "11px 8px", minWidth: 0 }}>
                  {r.stav === "prohrana" ? <div style={{ fontWeight: 700, color: "#64748b" }}>Prohráno: {r.prohra_duvod}</div>
                    : r.stav === "uzavrena" ? <div style={{ fontWeight: 700, color: "#15803d" }}>Uzavřeno</div>
                      : <>
                        <div style={{ fontWeight: 700, color: po ? "#991b1b" : "#0f172a" }}>{r.dalsi_krok || "— doplnit další krok —"}</div>
                        <div style={{ fontSize: 12, color: po ? "#991b1b" : "#64748b" }}>
                          {r.dalsi_krok_termin ? (po ? `po termínu ${dny(dnyOd(r.dalsi_krok_termin))}` : `do ${fmtDatum(r.dalsi_krok_termin)}`) : "bez termínu"}
                        </div>
                        {dlouho(r) && <div style={{ display: "inline-flex", marginTop: 5, marginRight: 6, background: "#ffedd5", color: "#9a3412", borderRadius: 999, padding: "2px 9px", fontSize: 12, fontWeight: 700 }}>déle než obvykle · {dni} / {fazeById[r.faze]?.dny} dní</div>}
                        {r.duvod_cekani && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 5, background: "#fef3c7", color: "#78350f", borderRadius: 999, padding: "2px 9px", fontSize: 12, fontWeight: 700 }}>{nazevDuvodu(r.duvod_cekani).toLowerCase()} · {dny(dni)}</div>}
                        {pz && <div style={{ fontSize: 12, color: "#475569", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>💬 {pz.text}</div>}
                      </>}
                </div>
                <div style={{ padding: "11px 12px", display: "flex", justifyContent: "flex-end" }}>
                  {r.stav === "otevrena" && r.dalsi_krok_kdo && <span title={r.dalsi_krok_kdo} style={{ width: 30, height: 30, borderRadius: "50%", background: sekceById[sekceZ(r)].svetla, color: sekceById[sekceZ(r)].tmava, fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{inicialy(r.dalsi_krok_kdo)}</span>}
                </div>
              </div>
            );
          })}
          {nacteno && viditelne.length > 0 && <div style={{ padding: "12px 16px", fontSize: 13, color: "#64748b" }}>Klikni na zakázku: otevře se její okno s kroky, úkoly fáze, fotkami a poznámkami.</div>}
        </div>
      </div>
      </>}

      {vyberOkno && (() => {
        const hq = vyberHledat.trim().toLowerCase();
        const nalezene = rows
          .filter((r) => !hq || [r.nazev, zakaznik(r.customer_id)?.name, contractById(r.contract_id)?.code, r.typ, r.misto_adresa].some((t) => String(t || "").toLowerCase().includes(hq)))
          .sort((a, b) => ((a.stav !== "otevrena") - (b.stav !== "otevrena")) || String(a.nazev).localeCompare(String(b.nazev), "cs"));
        const vyber = (id) => { setVyberOkno(false); otevritOkno(id); };
        return (
          <div role="dialog" aria-modal="true" aria-label="Vybrat zakázku" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px" }}
            onClick={(e) => { if (e.target === e.currentTarget) setVyberOkno(false); }}
            onKeyDown={(e) => { if (e.key === "Escape") setVyberOkno(false); if (e.key === "Enter" && nalezene.length > 0) vyber(nalezene[0].id); }}>
            <div style={{ ...karta, width: "min(560px, 100%)", display: "flex", flexDirection: "column", gap: 12, maxHeight: "calc(100vh - 80px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>🎯 Zobrazit průběh jedné zakázky</div>
                <button type="button" aria-label="Zavřít" style={{ ...btnGhost, padding: "4px 10px" }} onClick={() => setVyberOkno(false)}>✕</button>
              </div>
              <input type="search" autoFocus aria-label="Hledat zakázku podle názvu" placeholder="Začni psát název, zákazníka, kód nebo adresu…" value={vyberHledat} onChange={(e) => setVyberHledat(e.target.value)} style={inp} />
              <div style={{ fontSize: 12, color: "#64748b" }}>{nalezene.length} {nalezene.length === 1 ? "zakázka" : nalezene.length >= 2 && nalezene.length <= 4 ? "zakázky" : "zakázek"} · včetně uzavřených a prohraných · Enter vybere první</div>
              <div style={{ display: "flex", flexDirection: "column", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "auto", minHeight: 0 }}>
                {nalezene.length === 0 && <div style={{ padding: 14, fontSize: 14, color: "#64748b" }}>Nic nenalezeno.</div>}
                {nalezene.map((r, i) => {
                  const fr = fazeById[r.faze];
                  const sr = sekceById[fr?.sekce] || sekceById.ob;
                  return (
                    <button key={r.id} type="button" onClick={() => vyber(r.id)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", border: "none", borderTop: i ? "1px solid #f1f5f9" : "none", background: r.id === jednaId ? "#eff6ff" : "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "#0f172a" }}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontWeight: 800, fontSize: 14 }}>{r.nazev}</span>
                        <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>{[contractById(r.contract_id)?.code, zakaznik(r.customer_id)?.name, r.typ].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "3px 9px", ...(r.stav === "otevrena" ? { background: sr.svetla, color: sr.tmava } : r.stav === "prohrana" ? { background: "#f1f5f9", color: "#64748b" } : { background: "#dcfce7", color: "#166534" }) }}>
                        {r.stav === "otevrena" ? `${sr.nazev} · ${nazevFaze(fr, r.typ)}` : r.stav === "prohrana" ? "Prohráno" : "Uzavřeno"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {nova && (
        <div role="dialog" aria-modal="true" aria-label="Nová poptávka" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setNova(null); }}>
          <div style={{ ...karta, width: "min(520px, 100%)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Nová poptávka</div>

            {/* Zákazník — nejdřív volba stávající / nový, ať se nemusí nic zakládat jinde */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[["stavajici", "ti-user-search", "Stávající zákazník"], ["novy", "ti-user-plus", "Nový zákazník"]].map(([id, icon, label]) => {
                const aktivni = nova.zakRezim === id;
                return (
                  <button key={id} type="button" aria-pressed={aktivni}
                    onClick={() => setNova({ ...nova, zakRezim: id, ...(id === "novy" ? bezZakaznika(nova) : {}) })}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "14px 8px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 700,
                      border: `2px solid ${aktivni ? "#0369a1" : "#e2e8f0"}`, background: aktivni ? "#e0f2fe" : "#fff", color: aktivni ? "#0369a1" : "#334155" }}>
                    <i className={`ti ${icon}`} aria-hidden="true" style={{ fontSize: 24 }}></i>{label}
                  </button>
                );
              })}
            </div>

            {nova.zakRezim === "stavajici" && (() => {
              const vybrany = zakaznik(Number(nova.customer_id));
              if (vybrany) return (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "10px 12px" }}>
                  <i className="ti ti-user-check" aria-hidden="true" style={{ fontSize: 20, color: "#0369a1" }}></i>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{vybrany.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{[vybrany.phone, vybrany.address].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div style={{ width: 160 }}>
                    <label style={lbl} htmlFor="pr-zak-tel">Telefon zákazníka</label>
                    <input id="pr-zak-tel" type="tel" style={inp} value={nova.telefonZak ?? (vybrany.phone || "")} placeholder="doplň telefon"
                      onChange={(e) => setNova({ ...nova, telefonZak: e.target.value })} />
                  </div>
                  <button type="button" style={btnGhost} onClick={() => setNova({ ...nova, ...bezZakaznika(nova), telefonZak: null })}>Změnit</button>
                </div>
              );
              const q = nova.zakHledat.trim().toLowerCase();
              const nalezeni = customers
                .filter((c) => !c.archived)
                .filter((c) => !q || [c.name, c.company, c.phone, c.email].some((t) => String(t || "").toLowerCase().includes(q)))
                .slice(0, 6);
              return (
                <div>
                  <input style={inp} autoFocus value={nova.zakHledat} placeholder="Hledat podle jména, telefonu nebo firmy…"
                    onChange={(e) => setNova({ ...nova, zakHledat: e.target.value })} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, maxHeight: 220, overflowY: "auto" }}>
                    {nalezeni.length === 0 && <div style={{ fontSize: 13, color: "#64748b", padding: 6 }}>Nikdo nenalezen — zkus „Nový zákazník“.</div>}
                    {nalezeni.map((c) => (
                      <button key={c.id} type="button"
                        onClick={() => setNova({ ...nova, customer_id: String(c.id), adresa: nova.adresa || c.address || "" })}
                        style={{ textAlign: "left", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{[c.company, c.phone, c.address].filter(Boolean).join(" · ")}</div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {nova.zakRezim === "novy" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ gridColumn: "1 / -1" }}><label style={lbl} htmlFor="pr-nz-jmeno">Jméno zákazníka *</label>
                  <input id="pr-nz-jmeno" style={inp} autoFocus value={nova.novyZak.name} placeholder="Jan Novák"
                    onChange={(e) => setNova({ ...nova, novyZak: { ...nova.novyZak, name: e.target.value } })} /></div>
                <div><label style={lbl} htmlFor="pr-nz-tel">Telefon *</label>
                  <input id="pr-nz-tel" type="tel" style={inp} value={nova.novyZak.phone}
                    onChange={(e) => setNova({ ...nova, novyZak: { ...nova.novyZak, phone: e.target.value } })} /></div>
                <div><label style={lbl} htmlFor="pr-nz-mail">E-mail</label>
                  <input id="pr-nz-mail" type="email" style={inp} value={nova.novyZak.email}
                    onChange={(e) => setNova({ ...nova, novyZak: { ...nova.novyZak, email: e.target.value } })} /></div>
                {/* Adresa zákazníka — předvyplní i místo realizace (dá se níž přepsat) */}
                <div style={{ gridColumn: "1 / -1" }}><label style={lbl} htmlFor="pr-nz-adr">Adresa zákazníka</label>
                  <input id="pr-nz-adr" style={inp} value={nova.novyZak.adresa || ""} placeholder="ulice, obec"
                    onChange={(e) => setNova({ ...nova, novyZak: { ...nova.novyZak, adresa: e.target.value },
                      adresa: nova.adresa === (nova.novyZak.adresa || "") ? e.target.value : nova.adresa })} /></div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={lbl} htmlFor="pr-typ">Typ zakázky *</label>
                <select id="pr-typ" style={inp} value={nova.typ} onChange={(e) => setNova({ ...nova, typ: e.target.value })}>
                  <option value="">— vyber —</option>{TYPY.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select></div>
              <div><label style={lbl} htmlFor="pr-nazev">Název zakázky</label>
                <input id="pr-nazev" style={inp} value={nova.nazev} placeholder="doplní se sám (jméno · typ)" onChange={(e) => setNova({ ...nova, nazev: e.target.value })} /></div>
              <div><label style={lbl} htmlFor="pr-hod">Odhad hodnoty bez DPH (Kč)</label><input id="pr-hod" type="number" min="0" style={inp} value={nova.hodnota} onChange={(e) => setNova({ ...nova, hodnota: e.target.value })} /></div>
              <div><label style={lbl} htmlFor="pr-ob">Obchodník</label>
                <select id="pr-ob" style={inp} value={nova.obchodnik} onChange={(e) => setNova({ ...nova, obchodnik: e.target.value })}>
                  {lide.map((j) => <option key={j} value={j}>{j}</option>)}
                </select></div>
              <div><label style={lbl} htmlFor="pr-ter">Ozvat se zákazníkovi do</label><input id="pr-ter" type="date" style={inp} value={nova.termin} onChange={(e) => setNova({ ...nova, termin: e.target.value })} /></div>
            </div>
            <div><label style={lbl} htmlFor="pr-adr">Místo realizace (adresa)</label><input id="pr-adr" style={inp} value={nova.adresa} placeholder="předvyplní se ze zákazníka, jde přepsat" onChange={(e) => setNova({ ...nova, adresa: e.target.value })} /></div>
            {/* Kontaktní osoba na místě — když to není přímo zákazník (manželka, soused, stavbyvedoucí…) */}
            <div className="pr-kontakt-radek" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 10 }}>
              <div><label style={lbl} htmlFor="pr-kon-jm">Kontaktní osoba na místě</label>
                <input id="pr-kon-jm" style={inp} value={nova.kontakt?.jmeno || ""} placeholder="jen když to není zákazník"
                  onChange={(e) => setNova({ ...nova, kontakt: { ...(nova.kontakt || {}), jmeno: e.target.value } })} /></div>
              <div><label style={lbl} htmlFor="pr-kon-tel">Její telefon</label>
                <input id="pr-kon-tel" type="tel" style={inp} value={nova.kontakt?.telefon || ""}
                  onChange={(e) => setNova({ ...nova, kontakt: { ...(nova.kontakt || {}), telefon: e.target.value } })} /></div>
              <div><label style={lbl} htmlFor="pr-kon-vz">Vztah k zákazníkovi</label>
                <PoleSNabidkou id="pr-kon-vz" moznosti={VZTAHY_KONTAKTU} style={inp} value={nova.kontakt?.vztah || ""} placeholder="manželka, syn, soused…"
                  onChange={(v) => setNova({ ...nova, kontakt: { ...(nova.kontakt || {}), vztah: v } })} /></div>
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{nova.zakRezim === "novy" ? "Zákazník se založí spolu s poptávkou (najdeš ho pak i v Zákaznících). " : ""}Zakázka se sama založí, až poptávka projde do back office.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={btnGhost} onClick={() => setNova(null)}>Zrušit</button>
              <button type="button" style={btn("#0369a1")} disabled={pracuji} onClick={zalozitPoptavku}>{pracuji ? "Ukládám…" : "Založit poptávku"}</button>
            </div>
          </div>
        </div>
      )}

      {nastaveniForm && vykresliNastaveni()}
    </div>
  );

  // ── Nastavení fází (admin, manažer): běžná doba, fáze podle typu, úkoly ──
  function vykresliNastaveni() {
    const form = nastaveniForm;
    const zmen = (id, patch) => setNastaveniForm({ ...form, [id]: { ...form[id], ...patch } });
    const zmenUkol = (id, i, patch) => zmen(id, { ukoly: form[id].ukoly.map((u, j) => (j === i ? { ...u, ...patch } : u)) });
    const ulozit = async () => {
      // uloží jen to, co se liší od základu (ať budoucí úpravy základu nepřepíše zbytečně)
      const faze = {};
      FAZE.forEach((f) => {
        const zk = zakladFaze(f.id);
        const v = form[f.id];
        const typy = Object.fromEntries(TYPY.map((t) => [t.id, v.typy[t.id]]).filter(([t, p]) => p !== pravidlo(zk, t)));
        const ukoly = v.ukoly.filter((u) => String(u.text || "").trim()).map((u) => ({ ...u, text: u.text.trim() }));
        const ukolyJine = JSON.stringify(ukoly.map((u) => [u.id, u.text, !!u.brana])) !== JSON.stringify(zk.ukoly.map((u) => [u.id, u.text, !!u.brana]));
        const zaznam = {};
        if (Number(v.dny) > 0 && Number(v.dny) !== zk.dny) zaznam.dny = Number(v.dny);
        if (Object.keys(typy).length) zaznam.typy = typy;
        if (ukolyJine) zaznam.ukoly = ukoly;
        if (Object.keys(zaznam).length) faze[f.id] = zaznam;
      });
      const hodnota = { faze };
      const { error } = await supabase.from("app_settings").upsert({ key: NASTAVENI_KEY, value: hodnota, updated_at: tedIso() });
      if (error) { alert("Nastavení se nepodařilo uložit: " + error.message); return; }
      pouzijNastaveni(hodnota);
      setVerzeNastaveni((v) => v + 1);
      setNastaveniForm(null);
      ukazHlasku("✓ Nastavení fází uložené — platí pro všechny zakázky");
    };
    return (
      <div role="dialog" aria-modal="true" aria-label="Nastavení fází" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflow: "auto" }}>
        <div style={{ ...karta, width: "min(1100px, 100%)", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>⚙️ Nastavení fází</div>
              <div style={{ fontSize: 13, color: "#475569" }}>Běžná doba = za kolik dní má být fáze hotová (předvyplní termín, po ní zakázka svítí „déle než obvykle“). U typu: <b>vždy</b> / <b>někdy</b> (appka se zeptá) / <b>ne</b> (přeskočí se).</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={btnGhost} onClick={() => setNastaveniForm(null)}>Zrušit</button>
              <button type="button" style={btn("#0369a1")} onClick={ulozit}>Uložit nastavení</button>
            </div>
          </div>
          {SEKCE.map((sk) => (
            <div key={sk.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ background: sk.svetla, color: sk.tmava, fontWeight: 800, padding: "8px 14px" }}>{sk.nazev}</div>
              {FAZE.filter((f) => f.sekce === sk.id).map((f) => {
                const v = form[f.id];
                return (
                  <div key={f.id} style={{ padding: "10px 14px", borderTop: "1px solid #f1f5f9", display: "grid", gridTemplateColumns: "150px 110px minmax(0, 1fr)", gap: 14, alignItems: "start" }}>
                    <div style={{ fontWeight: 800, paddingTop: 8 }}>{f.nazev}</div>
                    <div><label style={lbl} htmlFor={`dny-${f.id}`}>Běžná doba (dní)</label><input id={`dny-${f.id}`} type="number" min="1" style={inp} value={v.dny} onChange={(e) => zmen(f.id, { dny: e.target.value })} /></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {TYPY.map((t) => (
                          <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700 }}>{t.id}
                            <select value={v.typy[t.id]} onChange={(e) => zmen(f.id, { typy: { ...v.typy, [t.id]: e.target.value } })} style={{ ...inp, width: "auto", padding: "4px 6px", fontSize: 13 }}>
                              {PRAVIDLA_TYPU.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {v.ukoly.map((u, i) => (
                          <div key={u.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input aria-label="Úkol" style={{ ...inp, padding: "6px 8px" }} value={u.text} onChange={(e) => zmenUkol(f.id, i, { text: e.target.value })} />
                            {(u.jenTypy || u.krome || u.cast) && (
                              <span style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }} title="Pro které typy zakázek úkol platí">
                                {u.cast ? `${CASTI_MONTAZE[u.cast]?.ikona || ""} ` : ""}{u.jenTypy ? u.jenTypy.join(", ") : `kromě ${u.krome.join(", ")}`}
                              </span>
                            )}
                            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, whiteSpace: "nowrap" }} title="Podmínka brány do další sekce">
                              <input type="checkbox" checked={!!u.brana} onChange={(e) => zmenUkol(f.id, i, { brana: e.target.checked })} />brána
                            </label>
                            <button type="button" aria-label="Smazat úkol" style={{ ...btnGhost, padding: "4px 9px", color: "#b91c1c" }} onClick={() => zmen(f.id, { ukoly: v.ukoly.filter((_, j) => j !== i) })}>✕</button>
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 13 }} onClick={() => zmen(f.id, { ukoly: [...v.ukoly, { id: noveIdUkolu(), text: "" }] })}>+ úkol</button>
                          <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 13 }} onClick={() => { const zk = zakladFaze(f.id); zmen(f.id, { dny: zk.dny, typy: Object.fromEntries(TYPY.map((t) => [t.id, pravidlo(zk, t.id)])), ukoly: zk.ukoly.map((x) => ({ ...x })) }); }}>↺ výchozí</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ fontSize: 12, color: "#64748b" }}>Fáze, která je u typu „ne“, se u rozpracovaných zakázek přeskočí při dalším posunu. Úkoly označené „brána“ musí být hotové, než zakázka projde do další sekce.</div>
        </div>
      </div>
    );
  }

  // ── Pravý panel vybrané zakázky ──
  function vykresliPanel(siroky = false) {
    const f = fazeById[z.faze];
    const s = sekceById[f.sekce];
    const auto = autoZ(z);
    const hotovaFaze = fazeHotova(z, f, auto);
    const rozhodnuti = fazeKRozhodnuti(f, z);
    const dalsi = dalsiFaze(z);
    const pred = predchozi(z);
    const brana = branaSekce(z, auto);
    const k = contractById(z.contract_id);
    const qq = z.quote_id ? quoteById(z.quote_id) : null;
    const dniFaze = dnyOd(z.faze_od);
    const pzZ = poznamky.filter((p) => p.prubeh_id === z.id);
    const tb = TYP_BARVY[z.typ] || ["#f1f5f9", "#334155"];
    const otevrena = z.stav === "otevrena";
    const nabidkyZakaznika = quotes.filter((x) => !z.customer_id || x.customer_id === z.customer_id);
    const po = poTerminu(z);
    const zakZ = zakaznik(z.customer_id);
    const ukolyZ = ukolyZakazky(z);
    const zpravyZ = zpravyZakazky(z);
    const zNabidky = zakazkyNabidky(z);

    // Celý průběh: všechny fáze, které se zakázky týkají, a kde je teď.
    const iTed = FAZE.findIndex((x) => x.id === z.faze);
    const kdyHotovo = (fx) => pzZ.find((p) => p.system && String(p.text).startsWith(`Hotovo: ${nazevFaze(fx, z.typ)} →`));
    const stavFaze = (fx, i) => {
      if ((z.preskocene || []).includes(fx.id)) return "preskoceno";
      if (z.stav === "uzavrena") return "hotovo";
      if (i < iTed) return "hotovo";
      if (i === iTed) return z.stav === "prohrana" ? "prohrano" : "ted";
      return fazeKRozhodnuti(fx, z) ? "mozna" : "ceka";
    };
    const prubehSekci = ["ob", "bo", "re", "uz"].map((sid) => ({
      s: sekceById[sid],
      faze: FAZE.map((fx, i) => ({ fx, i })).filter(({ fx }) => fx.sekce === sid && pravidlo(fx, z.typ) !== "-"),
    })).filter((x) => x.faze.length);
    const cip = {
      hotovo: { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" },
      ted: { background: s.barva, color: "#fff", border: `1px solid ${s.barva}` },
      prohrano: { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" },
      ceka: { background: "#fff", color: "#64748b", border: "1px solid #e2e8f0" },
      mozna: { background: "#fff", color: "#94a3b8", border: "1px dashed #cbd5e1" },
      preskoceno: { background: "#f8fafc", color: "#94a3b8", border: "1px solid #f1f5f9", textDecoration: "line-through" },
    };

    const kHlavicka = <div style={{ ...karta, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{z.nazev}</div>
            {z.typ && <span style={{ background: tb[0], color: tb[1], borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>{z.typ}</span>}
          </div>
          <div style={{ fontSize: 13, color: "#475569" }}>{[k?.code, zakaznik(z.customer_id)?.name, z.hodnota ? fmtKc(z.hodnota) : null].filter(Boolean).join(" · ")}</div>
          <div style={{ fontSize: 13, color: "#334155", marginTop: 2 }}>
            {otevrena ? <>Teď: <b style={{ color: s.tmava }}>{s.nazev} · {nazevFaze(f, z.typ)}</b> · ve fázi {dny(dniFaze)} <span style={{ color: dniFaze > f.dny ? "#c2410c" : "#64748b" }}>(obvykle {dny(f.dny)})</span></>
              : z.stav === "prohrana" ? <b>Prohráno: {z.prohra_duvod}</b> : <b style={{ color: "#15803d" }}>Uzavřená zakázka</b>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {k && onOtevritZakazku && <button type="button" style={{ ...btnGhost, padding: "5px 10px", fontSize: 13 }} onClick={() => onOtevritZakazku(k.id)}>Otevřít zakázku {k.code || ""}</button>}
            {onOtevritNaceneni && <button type="button" style={{ ...btnGhost, padding: "5px 10px", fontSize: 13 }} onClick={() => onOtevritNaceneni(z.quote_id)}>{qq ? `Nabídka ${qq.cislo || qq.name}` : "Nacenění"}</button>}
            {otevrena && qq && (qq.status === "Schváleno" || iTed >= FAZE.findIndex((x) => x.id === "smlouva")) && (
              <button type="button" style={{ ...btnGhost, padding: "5px 10px", fontSize: 13 }} onClick={() => otevritVice(z)}
                title="Zákazník schválil jednu nabídku, ale bude se dělat víc stejných zakázek (každá s vlastním průběhem, místem a cenou)">➕ Zapsat víc zakázek z nabídky</button>
            )}
          </div>
          {zNabidky.length > 1 && (
            <div style={{ marginTop: 6, fontSize: 13, color: "#475569", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <span>Z nabídky {qq?.cislo || qq?.name} je {zNabidky.length} {zNabidky.length < 5 ? "zakázky" : "zakázek"}:</span>
              {zNabidky.map((r, i) => (
                <button key={r.id} type="button" onClick={() => { vybrat(r.id); if (jednaId) setJednaId(r.id); }} aria-current={r.id === z.id ? "true" : undefined}
                  style={{ border: "1px solid #cbd5e1", borderRadius: 7, padding: "3px 8px", fontSize: 12, fontFamily: "inherit", cursor: r.id === z.id ? "default" : "pointer",
                    background: r.id === z.id ? "#0369a1" : "#fff", color: r.id === z.id ? "#fff" : "#334155", fontWeight: 700 }}>
                  {i + 1}. {r.nazev}{r.hodnota ? ` · ${fmtKc(r.hodnota)}` : ""}
                </button>
              ))}
            </div>
          )}
          {otevrena && f.sekce === "ob" && (
            <div style={{ marginTop: 6 }}>
              <label style={lbl} htmlFor="pr-nab">Propojená nabídka {qq ? "" : "(úkoly nabídky se pak odškrtnou samy)"}</label>
              <select id="pr-nab" style={inp} value={z.quote_id || ""} onChange={(e) => propojitNabidku(z, e.target.value)}>
                <option value="">— bez nabídky —</option>
                {nabidkyZakaznika.map((x) => <option key={x.id} value={x.id}>{x.cislo ? x.cislo + " · " : ""}{x.name} ({x.status})</option>)}
              </select>
            </div>
          )}
        </div>;
    const kPrubeh = <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Celý průběh zakázky</div>
          <div className={siroky ? "pr-prubeh-radek" : undefined} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {prubehSekci.map(({ s: ss, faze: fz }) => (
            <div key={ss.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: ss.tmava, letterSpacing: 0.4 }}>{ss.nazev.toUpperCase()}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {fz.map(({ fx, i }) => {
                  const st = stavFaze(fx, i);
                  const h = st === "hotovo" ? kdyHotovo(fx) : null;
                  return (
                    <span key={fx.id} title={st === "mozna" ? "Volitelná — appka se zeptá, jestli je potřeba" : st === "preskoceno" ? "Přeskočeno" : h ? `Hotovo ${fmtCas(h.created_at)}` : ""}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 8, padding: "3px 8px", fontSize: 12, fontWeight: st === "ted" ? 800 : 600, ...cip[st] }}>
                      {st === "hotovo" && <Fajfka size={12} />}{st === "ted" && "● "}{nazevFaze(fx, z.typ)}{st === "mozna" && " ?"}
                      {h && <span style={{ fontWeight: 400, opacity: 0.8 }}>{fmtDatum(h.created_at.slice(0, 10))}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
          </div>
        </div>;
    // Kroky zakázky po sobě (okno zakázky): očíslovaná cesta zleva doprava,
    // nad krokem název sekce, hotové ✓, aktuální zvýrazněný, přeskočené přeškrtnuté.
    const kroky = prubehSekci.flatMap(({ s: ss, faze: fz }) => fz.map(({ fx, i }, j) => ({ fx, i, ss, prvniVSekci: j === 0 })));
    const kKroky = <div style={{ ...karta, padding: "14px 16px" }}>
          <div className="pr-kroky" role="list" aria-label="Kroky zakázky" style={{ display: "flex", overflowX: "auto", paddingBottom: 4 }}>
            {kroky.map(({ fx, i, ss, prvniVSekci }, n) => {
              const st = stavFaze(fx, i);
              const h = st === "hotovo" ? kdyHotovo(fx) : null;
              const kruh = st === "hotovo" ? { background: "#16a34a", color: "#fff", border: "2px solid #16a34a" }
                : st === "ted" ? { background: ss.barva, color: "#fff", border: `2px solid ${ss.barva}`, boxShadow: `0 0 0 4px ${ss.svetla}` }
                  : st === "prohrano" ? { background: "#fee2e2", color: "#991b1b", border: "2px solid #fca5a5" }
                    : st === "preskoceno" ? { background: "#f8fafc", color: "#94a3b8", border: "2px dashed #cbd5e1" }
                      : st === "mozna" ? { background: "#fff", color: "#94a3b8", border: "2px dashed #cbd5e1" }
                        : { background: "#fff", color: "#64748b", border: "2px solid #cbd5e1" };
              const caraHotova = n > 0 && ["hotovo", "ted", "preskoceno"].includes(st);
              return (
                <div key={fx.id} role="listitem" aria-current={st === "ted" ? "step" : undefined}
                  title={st === "mozna" ? "Volitelný krok — appka se zeptá, jestli je potřeba" : st === "preskoceno" ? "Přeskočeno" : h ? `Hotovo ${fmtCas(h.created_at)}` : ""}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 92, flex: "1 0 92px", position: "relative" }}>
                  <div style={{ height: 16, fontSize: 10, fontWeight: 800, color: ss.tmava, letterSpacing: 0.4, whiteSpace: "nowrap", alignSelf: "flex-start", paddingLeft: 4 }}>
                    {prvniVSekci ? ss.nazev.toUpperCase() : ""}
                  </div>
                  <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center", alignItems: "center", height: 36 }}>
                    {n > 0 && <div aria-hidden="true" style={{ position: "absolute", left: 0, right: "50%", top: "50%", height: 3, marginTop: -1.5, background: caraHotova ? "#86efac" : "#e2e8f0" }} />}
                    {n < kroky.length - 1 && <div aria-hidden="true" style={{ position: "absolute", left: "50%", right: 0, top: "50%", height: 3, marginTop: -1.5, background: st === "hotovo" || st === "preskoceno" ? "#86efac" : "#e2e8f0" }} />}
                    <div style={{ position: "relative", width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, ...kruh }}>
                      {st === "hotovo" ? "✓" : st === "preskoceno" ? "⏭" : n + 1}
                    </div>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 12, fontWeight: st === "ted" ? 800 : 600, textAlign: "center", lineHeight: 1.2, padding: "0 4px",
                    color: st === "ted" ? ss.tmava : st === "hotovo" ? "#166534" : "#64748b", textDecoration: st === "preskoceno" ? "line-through" : "none" }}>
                    {nazevFaze(fx, z.typ)}{st === "mozna" && " ?"}
                  </div>
                  {h && <div style={{ fontSize: 10, color: "#64748b" }}>{fmtDatum(h.created_at.slice(0, 10))}</div>}
                  {st === "ted" && <div style={{ fontSize: 10, color: ss.tmava, fontWeight: 700 }}>teď · {dny(dniFaze)}</div>}
                </div>
              );
            })}
          </div>
        </div>;
    const kDalsiKrok = otevrena && (
          <div style={{ background: "#0f172a", color: "#fff", borderRadius: 16, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#fcd34d" }}>DALŠÍ KROK</div>
            {editKrok ? (
              <>
                <input aria-label="Další krok" style={inp} value={editKrok.text} onChange={(e) => setEditKrok({ ...editKrok, text: e.target.value })} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input aria-label="Termín" type="date" style={inp} value={editKrok.termin} onChange={(e) => setEditKrok({ ...editKrok, termin: e.target.value })} />
                  <select aria-label="Kdo" style={inp} value={editKrok.kdo} onChange={(e) => setEditKrok({ ...editKrok, kdo: e.target.value })}>
                    <option value="">— kdo —</option>{lide.map((j) => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" style={btn("#fcd34d", "#0f172a")} onClick={ulozKrok}>Uložit</button>
                  <button type="button" style={{ ...btnGhost, background: "transparent", color: "#fff", borderColor: "#475569" }} onClick={() => setEditKrok(null)}>Zrušit</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{z.dalsi_krok || "Doplň další krok"}</div>
                <div style={{ fontSize: 14, color: po ? "#fca5a5" : "#cbd5e1" }}>
                  {[z.dalsi_krok_kdo, z.dalsi_krok_termin ? (po ? `po termínu (${fmtDatum(z.dalsi_krok_termin)})` : `do ${fmtDatum(z.dalsi_krok_termin)}`) : "bez termínu"].filter(Boolean).join(" · ")}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button type="button" style={btn("#fcd34d", "#0f172a")} disabled={!z.dalsi_krok} onClick={() => krokHotovo(z)}>Hotovo</button>
                  <button type="button" style={{ ...btnGhost, background: "transparent", color: "#fff", borderColor: "#475569" }}
                    onClick={() => setEditKrok({ text: z.dalsi_krok || "", termin: z.dalsi_krok_termin || "", kdo: z.dalsi_krok_kdo || ja })}>Upravit / termín</button>
                </div>
              </>
            )}
          </div>
        );
    const kUkolyFaze = otevrena && (
          <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>Úkoly fáze {nazevFaze(f, z.typ)}</span>
              <span style={{ fontSize: 12, color: "#64748b" }}>{fazeSekce(z, f.sekce).findIndex((x) => x.id === f.id) + 1} / {fazeSekce(z, f.sekce).length} v sekci</span>
            </div>
            {rozhodnuti ? (
              <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Je u této zakázky potřeba fáze „{nazevFaze(f, z.typ)}“?</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" style={btn("#b45309")} disabled={pracuji} onClick={() => rozhodnout(z, true)}>Ano, je potřeba</button>
                  <button type="button" style={btnGhost} disabled={pracuji} onClick={() => rozhodnout(z, false)}>Ne, přeskočit</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                {/* Montáž bez částí (elektroinstalace, servis…): kdo je naplánovaný + Naplánovat */}
                {f.id === "montaz" && !ukolyPro(f, z.typ).some((u) => u.cast) && (() => {
                  const vychozi = z.typ === "ELK" ? "elektroinstalace" : z.typ === "SRV" ? "servis" : "cela";
                  const lide = akceZakazky(z).sort((a, b) => String(a.date).localeCompare(String(b.date)));
                  return (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 12px", background: "#f1f5f9", fontSize: 13 }}>
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                        <b>👷 Kdo:</b>
                        {lide.length ? lide.map((e) => (
                          <span key={e.id} style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: 999, padding: "1px 8px", fontSize: 12, fontWeight: 600 }}>
                            {naStarosti(e.na_starosti)?.ikona || ""} {e.employee_name} · {new Date(e.date + "T00:00:00").toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })}
                          </span>
                        )) : <span style={{ color: "#94a3b8" }}>zatím nikdo naplánovaný</span>}
                      </span>
                      {otevrena && <button type="button" style={{ ...btnGhost, padding: "3px 9px", fontSize: 12 }} onClick={() => otevritPlan(z, vychozi)}>📅 Naplánovat</button>}
                    </div>
                  );
                })()}
                {ukolyPro(f, z.typ).map((u, i, vsechny) => {
                  const hot = ukolHotovy(z, f, u, auto);
                  // Nadpis části montáže (Střecha / Elektro / Uzemnění) před jejím prvním úkolem
                  const castUkoly = u.cast ? vsechny.filter((x) => x.cast === u.cast) : [];
                  const nadpisCasti = u.cast && vsechny[i - 1]?.cast !== u.cast ? (
                    <div key={`cast-${u.cast}`} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 12px", background: "#f1f5f9", borderTop: i ? "1px solid #e2e8f0" : "none", fontSize: 13, color: "#334155" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800 }}>{CASTI_MONTAZE[u.cast]?.ikona} {nazevCasti(u.cast, z.typ)}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 600, color: castUkoly.every((x) => ukolHotovy(z, f, x, auto)) ? "#15803d" : "#64748b" }}>{castUkoly.filter((x) => ukolHotovy(z, f, x, auto)).length}/{castUkoly.length} hotovo</span>
                          {otevrena && <button type="button" style={{ ...btnGhost, padding: "3px 9px", fontSize: 12 }} onClick={() => otevritPlan(z, u.cast)}>📅 Naplánovat</button>}
                        </span>
                      </div>
                      {/* Kdo je na tuhle část naplánovaný v kalendáři */}
                      {(() => {
                        const lide = akceZakazky(z).filter((e) => e.na_starosti === u.cast).sort((a, b) => String(a.date).localeCompare(String(b.date)));
                        return lide.length ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {lide.map((e) => (
                              <span key={e.id} style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: 999, padding: "1px 8px", fontSize: 12, fontWeight: 600 }}>
                                👷 {e.employee_name} · {new Date(e.date + "T00:00:00").toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })}
                              </span>
                            ))}
                          </div>
                        ) : <div style={{ fontSize: 12, color: "#94a3b8" }}>Zatím nikdo naplánovaný</div>;
                      })()}
                    </div>
                  ) : null;
                  const zAuto = u.auto && auto[u.auto];
                  const fotkyUkolu = u.fotky ? (fotkyZ[z.id] || []).filter((p) => p.category === u.fotky) : [];
                  const akce = (e, fn) => { e.preventDefault(); e.stopPropagation(); fn(); };
                  const tlAkce = { ...btnGhost, padding: "5px 10px", fontSize: 13, whiteSpace: "nowrap" };
                  return [nadpisCasti, (
                    <div key={u.id} style={{ borderTop: i && !nadpisCasti ? "1px solid #f1f5f9" : "none", background: hot ? "#fff" : "#fffbeb" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", fontSize: 14, cursor: zAuto ? "default" : "pointer", flexWrap: "wrap" }}>
                        <input type="checkbox" checked={hot} disabled={!!zAuto} onChange={() => (u.material && !hot ? otevritMaterial(z) : toggleUkol(z, f, u))} style={{ width: 18, height: 18, accentColor: s.barva }} />
                        <span style={{ flex: "1 1 0%", minWidth: 0, fontWeight: hot ? 400 : 700 }}>{u.text}</span>
                        {zAuto && <span style={{ fontSize: 11, color: "#64748b" }}>{u.udaje ? "vyplněno" : "z nabídky"}</span>}
                        {u.brana && <span title="Podmínka brány" style={{ fontSize: 11, color: "#15803d", fontWeight: 700 }}>brána</span>}
                        {u.fotky && (
                          <button type="button" style={tlAkce} disabled={!!nahravam} onClick={(e) => akce(e, () => vybratFotky(z, f, u))}>
                            <i className="ti ti-camera" aria-hidden="true"></i> {nahravam === u.fotky ? "Nahrávám…" : `Nahrát fotky${fotkyUkolu.length ? ` (${fotkyUkolu.length})` : ""}`}
                          </button>
                        )}
                        {u.udaje && udajeForm?.id !== z.id && (
                          <button type="button" style={tlAkce} onClick={(e) => akce(e, () => setUdajeForm({ id: z.id, ean: z.udaje?.ean || "", jistic_a: z.udaje?.jistic_a || "", faze: z.udaje?.faze || "" }))}>
                            <i className="ti ti-bolt" aria-hidden="true"></i> {zAuto ? "Upravit" : "Vyplnit"}
                          </button>
                        )}
                        {u.smlouva && (
                          <button type="button" style={tlAkce} disabled={generuji} onClick={(e) => akce(e, () => vygenerovatSmlouvu(z))}>
                            <i className="ti ti-file-text" aria-hidden="true"></i> {generuji ? "Generuji…" : "Vygenerovat smlouvu"}
                          </button>
                        )}
                        {u.material && (
                          <button type="button" style={tlAkce} onClick={(e) => akce(e, () => otevritMaterial(z))}>
                            📦 Checklist materiálu{(z.material || []).length ? ` (${z.material.length})` : ""}
                          </button>
                        )}
                        {u.email && (
                          <button type="button" style={tlAkce} onClick={(e) => akce(e, () => otevritUzaviraciEmail(z))}>
                            <i className="ti ti-mail" aria-hidden="true"></i> Připravit uzavírací e-mail
                          </button>
                        )}
                      </label>

                      {u.udaje && zAuto && udajeForm?.id !== z.id && (
                        <div style={{ padding: "0 12px 10px 40px", fontSize: 13, color: "#475569" }}>
                          EAN {z.udaje.ean} · jistič {z.udaje.jistic_a} A · {z.udaje.faze}f
                        </div>
                      )}

                      {u.udaje && udajeForm?.id === z.id && (
                        <div id="pr-udaje" style={{ padding: "4px 12px 12px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, alignItems: "end" }}>
                          <div><label style={lbl} htmlFor="pr-ean">EAN odběrného místa</label>
                            <input id="pr-ean" style={inp} inputMode="numeric" autoFocus value={udajeForm.ean} placeholder="8591824…"
                              onChange={(e) => setUdajeForm({ ...udajeForm, ean: e.target.value })} /></div>
                          <div><label style={lbl} htmlFor="pr-jistic">Hlavní jistič (A)</label>
                            <input id="pr-jistic" style={inp} type="number" min="1" inputMode="numeric" value={udajeForm.jistic_a} placeholder="25"
                              onChange={(e) => setUdajeForm({ ...udajeForm, jistic_a: e.target.value })} /></div>
                          <div><label style={lbl} htmlFor="pr-faze">Počet fází</label>
                            <select id="pr-faze" style={inp} value={udajeForm.faze} onChange={(e) => setUdajeForm({ ...udajeForm, faze: e.target.value })}>
                              <option value="">—</option><option value="1">1 fáze</option><option value="3">3 fáze</option>
                            </select></div>
                          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button type="button" style={btnGhost} onClick={() => setUdajeForm(null)}>Zrušit</button>
                            <button type="button" style={btn("#0369a1")} disabled={pracuji} onClick={() => ulozitUdaje(z)}>Uložit údaje</button>
                          </div>
                        </div>
                      )}

                      {u.material && (z.material || []).length > 0 && (() => {
                        const sm = souhrnMaterialu(z.material);
                        return (
                          <div style={{ padding: "0 12px 10px 40px", fontSize: 13, color: "#475569", display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <span>📦 {sm.celkem} {sm.celkem === 1 ? "položka" : sm.celkem < 5 ? "položky" : "položek"}</span>
                            {STAVY_MATERIALU.filter((st) => sm.pocty[st.id]).map((st) => <span key={st.id} style={{ color: st.barva, fontWeight: st.druh === "vyreseno" ? 600 : 700 }}>{st.ikona} {sm.pocty[st.id]} {st.label.toLowerCase()}</span>)}
                            {sm.nevyplneno > 0 && <span style={{ color: "#94a3b8" }}>{sm.nevyplneno} bez stavu</span>}
                          </div>
                        );
                      })()}
                      {fotkyUkolu.length > 0 && (
                        <div style={{ display: "flex", gap: 6, padding: "0 12px 10px 40px", flexWrap: "wrap" }}>
                          {fotkyUkolu.slice(0, 6).map((p, j) => (
                            <button key={p.id} type="button" onClick={() => setProhlizec({ fotky: fotkyUkolu, i: j })} aria-label={`Zobrazit fotku ${j + 1} z ${fotkyUkolu.length}`}
                              style={{ display: "block", width: 56, height: 56, padding: 0, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0", cursor: "zoom-in", background: "#f1f5f9" }}>
                              <OneDriveThumb itemId={p.item_id} fallbackUrl={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            </button>
                          ))}
                          {fotkyUkolu.length > 6 && (
                            <button type="button" onClick={() => setProhlizec({ fotky: fotkyUkolu, i: 6 })}
                              style={{ ...btnGhost, alignSelf: "center", padding: "4px 10px", fontSize: 12 }}>+{fotkyUkolu.length - 6} další</button>
                          )}
                        </div>
                      )}
                    </div>
                  )];
                })}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {!rozhodnuti && (
                <button type="button" disabled={!hotovaFaze || pracuji} onClick={() => posunDal(z)}
                  style={btn(hotovaFaze ? s.barva : "#cbd5e1", hotovaFaze ? "#fff" : "#475569", { cursor: hotovaFaze ? "pointer" : "not-allowed" })}>
                  {dalsi ? `Hotovo → ${dalsi.sekce !== f.sekce ? sekceById[dalsi.sekce].nazev : nazevFaze(dalsi, z.typ)}` : "Uzavřít zakázku"}
                </button>
              )}
              {!rozhodnuti && otevrena && (!hotovaFaze || kontrolyZ(z).some((x) => x.blokuje)) && (
                <button type="button" style={{ ...btnGhost, padding: "8px 11px" }} disabled={pracuji} onClick={() => preskocitKrok(z)}
                  title="Pustit zakázku dál, i když krok není hotový — zeptá se na důvod a zapíše ho do historie">⏭ Přeskočit krok</button>
              )}
              {pred && <button type="button" style={{ ...btnGhost, padding: "8px 11px" }} disabled={pracuji} onClick={() => vratit(z)}>← Zpět</button>}
              {f.sekce === "ob" && <button type="button" style={{ ...btnGhost, color: "#b91c1c", borderColor: "#fca5a5" }} onClick={() => prohrano(z)}>Prohráno</button>}
            </div>
            {!hotovaFaze && !rozhodnuti && <div style={{ fontSize: 12, color: "#64748b" }}>Dál to pustí, až budou všechny úkoly fáze hotové — nebo krok přeskoč (⏭).</div>}
            {dalsi && dalsi.sekce !== f.sekce && f.sekce === "ob" && !z.contract_id && <div style={{ fontSize: 12, color: "#64748b" }}>Předáním do back office se založí zakázka (kód, náklady, docházka).</div>}
          </div>
        );
    const kProc = otevrena && (
          <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontWeight: 800, fontSize: 16 }}>Proč to stojí · poznámky</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: dniFaze > f.dny ? "#c2410c" : "#475569" }}>ve fázi {dny(dniFaze)} z obvyklých {f.dny}</span>
            </div>
            <div role="group" aria-label="Na co se čeká" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {DUVODY_CEKANI.map((d) => {
                const akt = z.duvod_cekani === d.id;
                return (
                  <button key={d.id} type="button" aria-pressed={akt}
                    onClick={() => uloz(z, { duvod_cekani: akt ? null : d.id }, akt ? null : `Stav: ${d.label.toLowerCase()}`)}
                    style={{ borderRadius: 999, padding: "6px 11px", fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", border: `1px solid ${akt ? "#b45309" : "#cbd5e1"}`, background: akt ? "#fef3c7" : "#fff", color: akt ? "#78350f" : "#334155" }}>{d.label}</button>
                );
              })}
            </div>
            <label style={{ ...lbl, marginBottom: 0 }}>Poznámka
              <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Na co se čeká, co je potřeba doplnit, co jsme domluvili…"
                style={{ ...inp, marginTop: 4, fontWeight: 400, resize: "vertical" }} />
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button type="button" disabled={!draft.trim()} style={btn(draft.trim() ? "#b45309" : "#e2e8f0", draft.trim() ? "#fff" : "#64748b")}
                onClick={async () => { if (await pridatPoznamku(z, draft.trim())) { setDraft(""); ukazHlasku("✓ Poznámka uložená"); } }}>Přidat poznámku</button>
              <span style={{ fontSize: 12, color: "#64748b" }}>uloží se s datem a jménem</span>
            </div>
          </div>
        );
    const kMisto = <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 16 }}>Zákazník a místo realizace</span>
            {!editMisto && <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 13 }} onClick={() => setEditMisto({ adresa: z.misto_adresa || zakZ?.address || "", kontakt: z.misto_kontakt || "", telefon: z.misto_telefon || "", vztah: z.misto_vztah || "" })}>Upravit</button>}
          </div>
          {zakZ ? (
            <div style={{ lineHeight: 1.5 }}>
              <b>{zakZ.name}</b>
              {zakZ.phone && <> · <a href={`tel:${zakZ.phone}`} style={{ color: "#0369a1" }}>{zakZ.phone}</a></>}
              {zakZ.email && <> · <a href={`mailto:${zakZ.email}`} style={{ color: "#0369a1" }}>{zakZ.email}</a></>}
            </div>
          ) : <div style={{ color: "#94a3b8" }}>Bez zákazníka</div>}
          {editMisto ? (
            <>
              <div><label style={lbl} htmlFor="pr-madr">Adresa realizace</label><input id="pr-madr" style={inp} value={editMisto.adresa} onChange={(e) => setEditMisto({ ...editMisto, adresa: e.target.value })} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><label style={lbl} htmlFor="pr-mkon">Kontaktní osoba na místě</label><input id="pr-mkon" style={inp} value={editMisto.kontakt} onChange={(e) => setEditMisto({ ...editMisto, kontakt: e.target.value })} /></div>
                <div><label style={lbl} htmlFor="pr-mtel">Telefon</label><input id="pr-mtel" type="tel" style={inp} value={editMisto.telefon} onChange={(e) => setEditMisto({ ...editMisto, telefon: e.target.value })} /></div>
                <div style={{ gridColumn: "1 / -1" }}><label style={lbl} htmlFor="pr-mvz">Vztah k zákazníkovi</label><PoleSNabidkou id="pr-mvz" moznosti={VZTAHY_KONTAKTU} style={inp} value={editMisto.vztah || ""} placeholder="manželka, syn, soused, stavbyvedoucí…" onChange={(v) => setEditMisto({ ...editMisto, vztah: v })} /></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={btn("#0369a1")} onClick={ulozMisto}>Uložit</button>
                <button type="button" style={btnGhost} onClick={() => setEditMisto(null)}>Zrušit</button>
              </div>
            </>
          ) : (
            <div style={{ lineHeight: 1.5, color: "#334155" }}>
              {z.misto_adresa
                ? <div>📍 {z.misto_adresa} · <a href={`https://maps.google.com/?q=${encodeURIComponent(z.misto_adresa)}`} target="_blank" rel="noreferrer" style={{ color: "#0369a1" }}>mapa</a></div>
                : <div style={{ color: "#b45309" }}>📍 Chybí adresa realizace — doplň ji tlačítkem Upravit.</div>}
              {(z.misto_kontakt || z.misto_telefon) && <div>👷 Na místě: <b>{z.misto_kontakt || ""}</b>{z.misto_vztah && <span style={{ color: "#64748b" }}> ({z.misto_vztah})</span>}{z.misto_telefon && <> · <a href={`tel:${z.misto_telefon}`} style={{ color: "#0369a1" }}>{z.misto_telefon}</a></>}</div>}
            </div>
          )}
        </div>;
    const kUkoly = <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 16 }}>Úkoly k zakázce {ukolyZ.length > 0 && <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>({ukolyZ.filter((t) => !t.done).length} otevřených)</span>}</span>
            {!novyUkol && <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 13 }} onClick={() => setNovyUkol({ title: "", due: "", kdo: ja })}>+ Úkol</button>}
          </div>
          {novyUkol && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "#f8fafc", borderRadius: 10, padding: 10 }}>
              <input aria-label="Co je potřeba udělat" autoFocus placeholder="Co je potřeba udělat…" style={inp} value={novyUkol.title} onChange={(e) => setNovyUkol({ ...novyUkol, title: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") pridatUkol(); }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input aria-label="Termín úkolu" type="date" style={inp} value={novyUkol.due} onChange={(e) => setNovyUkol({ ...novyUkol, due: e.target.value })} />
                <select aria-label="Komu" style={inp} value={novyUkol.kdo} onChange={(e) => setNovyUkol({ ...novyUkol, kdo: e.target.value })}>
                  <option value="">— komu —</option>{lide.map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={btn("#0369a1")} disabled={pracuji} onClick={pridatUkol}>Přidat úkol</button>
                <button type="button" style={btnGhost} onClick={() => setNovyUkol(null)}>Zrušit</button>
              </div>
            </div>
          )}
          {ukolyZ.length === 0 && !novyUkol && <div style={{ fontSize: 13, color: "#94a3b8" }}>Zatím žádné úkoly.</div>}
          {ukolyZ.map((t) => {
            const poT = !t.done && t.due && t.due < dnes;
            return (
              <label key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" }}>
                <input type="checkbox" checked={!!t.done} onChange={() => prepnoutUkol(t)} style={{ width: 17, height: 17, marginTop: 2 }} />
                <span style={{ flexGrow: 1, minWidth: 0 }}>
                  <span style={{ display: "block", textDecoration: t.done ? "line-through" : "none", color: t.done ? "#94a3b8" : "#0f172a", fontWeight: t.done ? 400 : 600 }}>{t.title}</span>
                  <span style={{ display: "block", fontSize: 12, color: poT ? "#b91c1c" : "#64748b" }}>{[t.assigned_to, t.due ? (poT ? `po termínu (${fmtDatum(t.due)})` : `do ${fmtDatum(t.due)}`) : null].filter(Boolean).join(" · ") || "bez termínu"}</span>
                </span>
              </label>
            );
          })}
        </div>;
    const kZpravy = <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Zprávy k zakázce</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input aria-label="Nová zpráva" placeholder="Napiš zprávu kolegům…" style={inp} value={zprava} onChange={(e) => setZprava(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") poslatZpravu(); }} />
            <button type="button" style={btn(zprava.trim() ? "#0369a1" : "#cbd5e1", zprava.trim() ? "#fff" : "#475569")} disabled={!zprava.trim() || pracuji} onClick={poslatZpravu}>Odeslat</button>
          </div>
          {zpravyZ.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8" }}>Zatím žádné zprávy.</div>}
          {(vsechnyZpravy ? zpravyZ : zpravyZ.slice(0, 5)).map((m) => (
            <div key={(m.contract_id ? "c" : "d") + m.id} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{ fontSize: 12, color: "#64748b" }}><b style={{ color: "#334155" }}>{m.user_name}</b> · {fmtCas(m.created_at)}</div>
              <div style={{ lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{m.message}</div>
            </div>
          ))}
          {zpravyZ.length > 5 && <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 13, alignSelf: "flex-start" }} onClick={() => setVsechnyZpravy((v) => !v)}>{vsechnyZpravy ? "Jen posledních 5" : `Zobrazit všech ${zpravyZ.length}`}</button>}
        </div>;
    const kHistorie = <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Historie a poznámky</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflow: "auto" }}>
            {pzZ.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8" }}>Zatím bez poznámek.</div>}
            {pzZ.map((p) => (
              <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 2, opacity: p.system ? 0.8 : 1 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#64748b", flexWrap: "wrap" }}>
                  <b style={{ color: "#334155" }}>{p.kdo || "—"}</b><span>{fmtCas(p.created_at)}</span>
                  {p.duvod && <span style={{ background: "#fef3c7", color: "#78350f", borderRadius: 6, padding: "0 6px" }}>{p.duvod}</span>}
                  {p.system && <span style={{ background: "#f1f5f9", borderRadius: 6, padding: "0 6px" }}>systém</span>}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.4 }}>{p.text}</div>
              </div>
            ))}
          </div>
        </div>;
    // Všechny nahrané fotky zakázky (obhlídka, montáž, protokol…) podle kategorie;
    // klik otevře prohlížeč přes celou obrazovku.
    const vsechnyFotky = fotkyZ[z.id] || [];
    const poradiKat = ["Obhlídka", "Smlouva", "Před montáží", "Průběh montáže", "Střecha", "Uzemnění", "Po montáži", "Detail střídač/baterie", "Předávací protokol", "Servis"];
    const katFotek = [...new Set(vsechnyFotky.map((p) => p.category || "Bez kategorie"))]
      .sort((a, b) => ((poradiKat.indexOf(a) + 1) || 99) - ((poradiKat.indexOf(b) + 1) || 99));
    const vybranaKat = galerieKat.zakId === z.id && katFotek.includes(galerieKat.kat) ? galerieKat.kat : "vse";
    const zobrazeneFotky = vybranaKat === "vse" ? vsechnyFotky : vsechnyFotky.filter((p) => (p.category || "Bez kategorie") === vybranaKat);
    const cipKat = (id, text, pocet) => (
      <button key={id} type="button" aria-pressed={vybranaKat === id} onClick={() => setGalerieKat({ zakId: z.id, kat: id })}
        style={{ border: "1px solid " + (vybranaKat === id ? "#0369a1" : "#cbd5e1"), background: vybranaKat === id ? "#0369a1" : "#fff", color: vybranaKat === id ? "#fff" : "#334155", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        {text} ({pocet})
      </button>
    );
    const pv = pocetVyplnenych(z.podklady);
    const kPodklady = <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>📋 Podklady pro realizaci <span style={{ fontSize: 12, fontWeight: 600, color: pv.hotovo ? "#475569" : "#b45309" }}>· vyplněno {pv.hotovo}/{pv.celkem}</span></div>
            <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 13 }} onClick={() => otevritPodklady(z)}>{pv.hotovo ? "Upravit" : "Vyplnit"}</button>
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Takhle to uvidí zaměstnanec v detailu akce v kalendáři:</div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <PodkladyNahled zak={z} quote={z.quote_id ? quoteById(z.quote_id) : null} zakaznik={zakZ}
              tym={akceZakazky(z).map((e) => ({ id: e.id, na_starosti: e.na_starosti, employee_name: e.employee_name, date: e.date }))} />
          </div>
        </div>;
    const kFotky = <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>📷 Fotky zakázky{vsechnyFotky.length ? ` (${vsechnyFotky.length})` : ""}</div>
            {otevrena && (
              <select aria-label="Nahrát fotky do kategorie" value="" disabled={!!nahravam} style={{ ...inp, width: "auto", padding: "5px 8px", fontSize: 13 }}
                onChange={(e) => { if (e.target.value) vybratFotkyKategorie(z, e.target.value); }}>
                <option value="">{nahravam ? "Nahrávám…" : "+ Nahrát fotky do…"}</option>
                {poradiKat.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            )}
          </div>
          {vsechnyFotky.length === 0 ? (
            <div style={{ fontSize: 13, color: "#94a3b8" }}>Zatím žádné fotky — nahrávají se u úkolů fází (obhlídka, montáž) nebo tady.</div>
          ) : <>
            {katFotek.length > 1 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {cipKat("vse", "Vše", vsechnyFotky.length)}
                {katFotek.map((k) => cipKat(k, k, vsechnyFotky.filter((p) => (p.category || "Bez kategorie") === k).length))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 6, maxHeight: 380, overflowY: "auto" }}>
              {zobrazeneFotky.map((p, i) => (
                <button key={p.id} type="button" onClick={() => setProhlizec({ fotky: zobrazeneFotky, i })}
                  aria-label={`Zobrazit fotku ${i + 1} z ${zobrazeneFotky.length}${p.category ? ` (${p.category})` : ""}`} title={p.category || ""}
                  style={{ padding: 0, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", aspectRatio: "1 / 1", cursor: "zoom-in", background: "#f1f5f9" }}>
                  <OneDriveThumb itemId={p.item_id} fallbackUrl={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
          </>}
        </div>;
    const kBrana = otevrena && brana.length > 0 && (
          <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
              <span style={{ fontWeight: 800, fontSize: 16 }}>{NAZEV_BRANY[f.sekce]}</span>
            </div>
            {brana.map((b) => (
              <div key={b.text} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>{b.hotovo ? <Fajfka size={18} /> : <Kolecko size={18} />}{b.text}</div>
            ))}
          </div>
        );
    const kKdo = <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Kdo za co odpovídá</div>
          {[["vlastnik_obchod", "Obchod", "#0369a1"], ["vlastnik_bo", "Back office", "#92400e"], ["vlastnik_re", "Realizace", "#15803d"]].map(([key, label, barva]) => (
            <div key={key} style={{ display: "grid", gridTemplateColumns: "110px 1fr", alignItems: "center", gap: 8 }}>
              <label htmlFor={`pr-${key}`} style={{ color: barva, fontWeight: 700 }}>{label}</label>
              <select id={`pr-${key}`} style={{ ...inp, padding: "6px 8px" }} value={z[key] || ""} onChange={(e) => uloz(z, { [key]: e.target.value || null })}>
                <option value="">— nevybráno —</option>{lide.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
          ))}
        </div>;

    if (!siroky) {
      return (
        <div className="pr-panel" id="pr-panel">
          {kHlavicka}{kPrubeh}{kDalsiKrok}{kUkolyFaze}{kPodklady}{kFotky}{kProc}{kMisto}{kUkoly}{kZpravy}{kHistorie}{kBrana}{kKdo}
        </div>
      );
    }
    // Zobrazená jedna zakázka: vše pod seznamem, na celou šířku, zleva doprava.
    return (
      <div className="pr-siroky" id="pr-panel">
        <div className="pr-cela">{kKroky}</div>
        <div className="pr-cela">{kHlavicka}</div>
        <div className="pr-sloupec">{kDalsiKrok}{kUkolyFaze}{kBrana}</div>
        <div className="pr-sloupec">{kFotky}{kProc}{kHistorie}</div>
        <div className="pr-sloupec">{kMisto}{kPodklady}{kUkoly}{kZpravy}{kKdo}</div>
      </div>
    );
  }
}

// Seznam sekcí pro případné další použití (legenda apod.)
export const SEKCE_PRUBEHU = SEKCE;
