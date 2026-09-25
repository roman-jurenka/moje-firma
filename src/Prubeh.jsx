import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase.js";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { isConnected, connectSharedAccount, uploadFileObject } from "./onedrive.js";
import { compressImage } from "./imageUtils.js";
import { OneDriveThumb, StorageLink } from "./storageUrl.jsx";
import {
  SEKCE, sekceById, FAZE, fazeById, PRVNI_FAZE, TYPY, normalizujTyp, DUVODY_CEKANI, nazevDuvodu,
  nazevFaze, fazeSekce, dalsiFaze, predchoziFaze, fazeKRozhodnuti, ukolHotovy, fazeHotova, prvniNehotovy,
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
const TYP_BARVY = { FVE: ["#fef3c7", "#92400e"], FVR: ["#ffedd5", "#9a3412"], SRV: ["#dcfce7", "#166534"], HRM: ["#ede9fe", "#5b21b6"], ELK: ["#e0f2fe", "#075985"] };

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

export default function Prubeh({
  customers = [], employees = [], currentUser, onOtevritZakazku, onOtevritNaceneni,
  tasks = [], setTasks, dealMsgs = [], setDealMsgs, contractMsgs = [], setContractMsgs,
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
    fotoCil.current = { zak, faze, ukol };
    fotoInput.current?.click();
  };
  const nahratFotky = async (files) => {
    const cil = fotoCil.current;
    if (!cil || !files?.length) return;
    const { zak, faze, ukol } = cil;
    const kategorie = ukol.fotky;
    setNahravam(kategorie);
    const nazevSlozky = (contractById(zak.contract_id)?.name || zak.nazev || String(zak.id)).replace(/[/\\?%*:|"<>]/g, "_");
    const pripojeno = isConnected() || await connectSharedAccount();
    let nahrano = 0;
    for (const puvodni of files) {
      try {
        const file = await compressImage(puvodni);
        let url, storagePath, itemId = null;
        if (pripojeno) {
          const r = await uploadFileObject(`FirmaCRM/Zakázky/${nazevSlozky}/Fotky`, file);
          url = r.webUrl; itemId = r.itemId; storagePath = "onedrive:" + file.name;
        } else {
          const ext = (file.name || "foto.jpg").split(".").pop();
          const path = `prubeh-${zak.id}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage.from("zakazky-fotky").upload(path, file);
          if (error) throw error;
          url = supabase.storage.from("zakazky-fotky").getPublicUrl(path).data.publicUrl;
          storagePath = path;
        }
        const { data: row, error } = await supabase.from("contract_photos").insert({
          contract_id: zak.contract_id || null, prubeh_id: zak.id, date: dnesIso(), url,
          storage_path: storagePath, item_id: itemId, category: kategorie, uploaded_by: currentUser?.employeeId || null,
        }).select().single();
        if (error) throw error;
        setFotkyZ((m) => ({ ...m, [zak.id]: [row, ...(m[zak.id] || [])] }));
        nahrano++;
      } catch (e) {
        alert(`Fotku „${puvodni.name}“ se nepodařilo nahrát: ${e.message}`);
      }
    }
    setNahravam(null);
    if (!nahrano) return;
    ukazHlasku(`✓ Nahráno ${nahrano} ${nahrano === 1 ? "fotka" : nahrano < 5 ? "fotky" : "fotek"}`);
    // Úkol „fotky uložené“ se po nahrání sám odškrtne.
    const aktualni = rows.find((r) => r.id === zak.id) || zak;
    if (!ukolHotovy(aktualni, faze, ukol, autoZ(aktualni))) await toggleUkol(aktualni, faze, ukol);
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

  // ── Smlouva z Word šablony (public/templates/smlouva_sablona.docx) ──
  const vygenerovatSmlouvu = async (zak) => {
    setGeneruji(true);
    try {
      const res = await fetch("/templates/smlouva_sablona.docx");
      const typ = res.headers.get("content-type") || "";
      if (!res.ok || typ.includes("text/html")) throw new Error("Šablona smlouvy zatím není v aplikaci nahraná (public/templates/smlouva_sablona.docx).");
      const doc = new Docxtemplater(new PizZip(await res.arrayBuffer()), { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
      const zak_ = zakaznik(zak.customer_id) || {};
      const k = contractById(zak.contract_id);
      const q = zak.quote_id ? quoteById(zak.quote_id) : null;
      const cena = Number(q?.data?.zakaznik?.cilovaCena) || Number(zak.hodnota) || Number(k?.price) || 0;
      const u = zak.udaje || {};
      doc.render({
        datum: new Date().toLocaleDateString("cs-CZ"),
        cisloZakazky: k?.code || "",
        nazevZakazky: zak.nazev || "",
        typZakazky: TYPY.find((t) => t.id === zak.typ)?.label || zak.typ || "",
        zakaznikJmeno: zak_.name || "",
        zakaznikFirma: zak_.company || "",
        zakaznikAdresa: zak_.address || "",
        zakaznikTelefon: zak_.phone || "",
        zakaznikEmail: zak_.email || "",
        mistoRealizace: zak.misto_adresa || zak_.address || "",
        ean: u.ean || "",
        jistic: u.jistic_a ? `${u.jistic_a} A` : "",
        pocetFazi: u.faze ? `${u.faze}f` : "",
        cena: cena ? Math.round(cena).toLocaleString("cs-CZ") : "",
        obchodnik: zak.vlastnik_obchod || ja || "",
      });
      const blob = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Smlouva ${k?.code || ""} ${zak_.name || zak.nazev || ""}.docx`.replace(/\s+/g, " ").trim();
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      await pridatPoznamku(zak, "Vygenerovaná smlouva k podpisu.", true);
    } catch (e) {
      alert(e.message);
    }
    setGeneruji(false);
  };

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
    const md = planovaneMd(qd, nabidka.type || zak.typ);
    const dny = (qd.denniPlan || []).filter((p) => p.datum);
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

  const posunDal = async (zak) => {
    const f = fazeById[zak.faze];
    if (!fazeHotova(zak, f, autoZ(zak))) { alert("Nejdřív dokonči úkoly této fáze."); return; }
    setPracuji(true);
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

  const vratit = async (zak) => {
    const cil = predchoziFaze(zak);
    if (!cil) return;
    if (!window.confirm(`Vrátit zakázku zpět do fáze „${nazevFaze(cil, zak.typ)}“?`)) return;
    setPracuji(true);
    await presun(zak, cil, `Vráceno zpět do fáze ${nazevFaze(cil, zak.typ)}.`);
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
    const duvod = window.prompt("Proč zakázka nevyšla? (cena, konkurence, zákazník si to rozmyslel…)");
    if (duvod === null) return;
    if (!duvod.trim()) { alert("Napiš prosím důvod — hodí se pro vyhodnocení."); return; }
    await uloz(zak, { stav: "prohrana", prohra_duvod: duvod.trim(), dalsi_krok: null, dalsi_krok_termin: null }, `Prohráno: ${duvod.trim()}`);
    if (zak.deal_id) await supabase.from("deals").update({ stage: "Prohráno", lost_reason: duvod.trim() }).eq("id", zak.deal_id);
    ukazHlasku("Zakázka označená jako prohraná");
  };

  const krokHotovo = async (zak) => {
    const f = fazeById[zak.faze];
    const auto = autoZ(zak);
    const ukol = f.ukoly.find((u) => u.text === zak.dalsi_krok && !ukolHotovy(zak, f, u, auto));
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
    const cena = Number(qq?.data?.zakaznik?.cilovaCena) || null;
    const ok = await uloz(zak, { quote_id: qq ? qq.id : null, ...(cena && !zak.hodnota ? { hodnota: cena } : {}) },
      qq ? `Propojeno s nabídkou ${qq.cislo || qq.name}.` : "Nabídka odpojená.");
    if (ok) ukazHlasku(qq ? "✓ Nabídka propojená" : "Nabídka odpojená");
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
    const m = { misto_adresa: editMisto.adresa.trim() || null, misto_kontakt: editMisto.kontakt.trim() || null, misto_telefon: editMisto.telefon.trim() || null };
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
    // Název zakázky se doplní sám ze zákazníka a typu, když ho nikdo nevyplní.
    const jmenoZak = novyZak?.name || zakaznik(Number(nova.customer_id))?.name || "";
    const typLabel = TYPY.find((t) => t.id === nova.typ)?.label || nova.typ;
    const nazev = nova.nazev.trim() || [jmenoZak, typLabel].filter(Boolean).join(" · ");
    setPracuji(true);
    let customerId = nova.customer_id ? Number(nova.customer_id) : null;
    if (novyZak) {
      const { data: c, error: cErr } = await supabase.from("customers").insert({
        name: novyZak.name, phone: novyZak.phone.trim() || null, email: novyZak.email.trim() || null,
        address: nova.adresa?.trim() || "", tag: "Nový",
      }).select().single();
      if (cErr) { setPracuji(false); alert("Zákazníka se nepodařilo založit: " + cErr.message); return; }
      customerId = c.id;
      if (onZakaznikZalozen) onZakaznikZalozen(c);
    }
    const { data: deal, error: dealErr } = await supabase.from("deals").insert({
      name: nazev, value: nova.hodnota ? Number(nova.hodnota) : null, stage: "Nový",
      customer_id: customerId, assigned_to: nova.obchodnik || ja || null, type: nova.typ,
      site_address: nova.adresa?.trim() || null,
    }).select().single();
    if (dealErr) { setPracuji(false); alert("Poptávku se nepodařilo založit: " + dealErr.message); return; }
    if (onDealZalozen) onDealZalozen(deal);
    const row = {
      deal_id: deal.id, misto_adresa: nova.adresa?.trim() || null,
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
      {/* Výběr fotek pro tlačítko „Nahrát fotky“ u úkolu fáze (na mobilu nabídne i fotoaparát). */}
      <input ref={fotoInput} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={(e) => { const files = [...e.target.files]; e.target.value = ""; nahratFotky(files); }} />

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
          <button type="button" style={btn("#0369a1")} onClick={() => setNova({ nazev: "", customer_id: "", typ: "", hodnota: "", obchodnik: ja, termin: "", adresa: "", zakRezim: null, zakHledat: "", novyZak: { name: "", phone: "", email: "" } })}>+ Nová poptávka</button>
        </div>
      </div>

      <div className="pr-kpi">
        <button type="button" onClick={() => setFronta("moje")} style={{ ...karta, padding: "12px 18px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}><div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Čeká na mě</div><div style={{ fontSize: 28, fontWeight: 800, color: "#b45309" }}>{kpi.naMe}</div></button>
        <div style={{ ...karta, padding: "12px 18px", borderColor: kpi.poTerminu ? "#fca5a5" : "#e2e8f0" }}><div style={{ fontSize: 13, color: kpi.poTerminu ? "#991b1b" : "#475569", fontWeight: 600 }}>Po termínu</div><div style={{ fontSize: 28, fontWeight: 800, color: kpi.poTerminu ? "#b91c1c" : "#0f172a" }}>{kpi.poTerminu}</div></div>
        <button type="button" onClick={() => setFronta("vse")} title="Zakázky, které jsou ve fázi déle, než je u ní obvyklé" style={{ ...karta, padding: "12px 18px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderColor: kpi.dlouho ? "#fdba74" : "#e2e8f0" }}><div style={{ fontSize: 13, color: kpi.dlouho ? "#9a3412" : "#475569", fontWeight: 600 }}>Déle než obvykle</div><div style={{ fontSize: 28, fontWeight: 800, color: kpi.dlouho ? "#c2410c" : "#0f172a" }}>{kpi.dlouho}</div></button>
        <div style={{ ...karta, padding: "12px 18px" }}><div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Připraveno k realizaci</div><div style={{ fontSize: 28, fontWeight: 800, color: "#15803d" }}>{kpi.pripraveno}</div></div>
        <div style={{ ...karta, padding: "12px 18px" }}><div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>Otevřené zakázky (hodnota)</div><div style={{ fontSize: 24, fontWeight: 800 }}>{fmtKc(kpi.hodnota)}</div></div>
      </div>

      <div className={jednaId ? "pr-grid pr-jedna" : "pr-grid"}>
        <div style={{ ...karta, padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid #e2e8f0", alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" style={btn("#0f172a")} onClick={() => { setVyberHledat(""); setVyberOkno(true); }} title="Vybrat jednu zakázku a zobrazit jen její průběh">🎯 Jedna zakázka</button>
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
                onClick={() => vybrat(r.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); vybrat(r.id); } }}
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
          {nacteno && viditelne.length > 0 && !z && <div style={{ padding: "12px 16px", fontSize: 13, color: "#64748b" }}>Klikni na zakázku: ukáže se její další krok, úkoly fáze, poznámky a brána.</div>}
        </div>

        {z ? vykresliPanel(!!jednaId) : (
          <div style={{ ...karta, color: "#64748b", fontSize: 14 }}>Vyber zakázku v seznamu.</div>
        )}
      </div>

      {vyberOkno && (() => {
        const hq = vyberHledat.trim().toLowerCase();
        const nalezene = rows
          .filter((r) => !hq || [r.nazev, zakaznik(r.customer_id)?.name, contractById(r.contract_id)?.code, r.typ, r.misto_adresa].some((t) => String(t || "").toLowerCase().includes(hq)))
          .sort((a, b) => ((a.stav !== "otevrena") - (b.stav !== "otevrena")) || String(a.nazev).localeCompare(String(b.nazev), "cs"));
        const vyber = (id) => { setJednaId(id); setVyberOkno(false); vybrat(id); };
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
                  <button type="button" style={btnGhost} onClick={() => setNova({ ...nova, ...bezZakaznika(nova) })}>Změnit</button>
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
                <div><label style={lbl} htmlFor="pr-nz-tel">Telefon</label>
                  <input id="pr-nz-tel" type="tel" style={inp} value={nova.novyZak.phone}
                    onChange={(e) => setNova({ ...nova, novyZak: { ...nova.novyZak, phone: e.target.value } })} /></div>
                <div><label style={lbl} htmlFor="pr-nz-mail">E-mail</label>
                  <input id="pr-nz-mail" type="email" style={inp} value={nova.novyZak.email}
                    onChange={(e) => setNova({ ...nova, novyZak: { ...nova.novyZak, email: e.target.value } })} /></div>
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
    const pred = predchoziFaze(z);
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
          </div>
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
                {f.ukoly.map((u, i) => {
                  const hot = ukolHotovy(z, f, u, auto);
                  const zAuto = u.auto && auto[u.auto];
                  const fotkyUkolu = u.fotky ? (fotkyZ[z.id] || []).filter((p) => p.category === u.fotky) : [];
                  const akce = (e, fn) => { e.preventDefault(); e.stopPropagation(); fn(); };
                  const tlAkce = { ...btnGhost, padding: "5px 10px", fontSize: 13, whiteSpace: "nowrap" };
                  return (
                    <div key={u.id} style={{ borderTop: i ? "1px solid #f1f5f9" : "none", background: hot ? "#fff" : "#fffbeb" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", fontSize: 14, cursor: zAuto ? "default" : "pointer", flexWrap: "wrap" }}>
                        <input type="checkbox" checked={hot} disabled={!!zAuto} onChange={() => toggleUkol(z, f, u)} style={{ width: 18, height: 18, accentColor: s.barva }} />
                        <span style={{ flexGrow: 1, fontWeight: hot ? 400 : 700 }}>{u.text}</span>
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
                      </label>

                      {u.udaje && zAuto && udajeForm?.id !== z.id && (
                        <div style={{ padding: "0 12px 10px 40px", fontSize: 13, color: "#475569" }}>
                          EAN {z.udaje.ean} · jistič {z.udaje.jistic_a} A · {z.udaje.faze}f
                        </div>
                      )}

                      {u.udaje && udajeForm?.id === z.id && (
                        <div style={{ padding: "4px 12px 12px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, alignItems: "end" }}>
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

                      {fotkyUkolu.length > 0 && (
                        <div style={{ display: "flex", gap: 6, padding: "0 12px 10px 40px", flexWrap: "wrap" }}>
                          {fotkyUkolu.slice(0, 6).map((p) => (
                            <StorageLink key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
                              style={{ display: "block", width: 56, height: 56, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                              <OneDriveThumb itemId={p.item_id} fallbackUrl={p.url} alt={p.category} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            </StorageLink>
                          ))}
                          {fotkyUkolu.length > 6 && <span style={{ alignSelf: "center", fontSize: 12, color: "#64748b" }}>+{fotkyUkolu.length - 6}</span>}
                        </div>
                      )}
                    </div>
                  );
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
              {pred && <button type="button" style={{ ...btnGhost, padding: "8px 11px" }} disabled={pracuji} onClick={() => vratit(z)}>← Zpět</button>}
              {f.sekce === "ob" && <button type="button" style={{ ...btnGhost, color: "#b91c1c", borderColor: "#fca5a5" }} onClick={() => prohrano(z)}>Prohráno</button>}
            </div>
            {!hotovaFaze && !rozhodnuti && <div style={{ fontSize: 12, color: "#64748b" }}>Dál to pustí, až budou všechny úkoly fáze hotové.</div>}
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
            {!editMisto && <button type="button" style={{ ...btnGhost, padding: "4px 10px", fontSize: 13 }} onClick={() => setEditMisto({ adresa: z.misto_adresa || zakZ?.address || "", kontakt: z.misto_kontakt || "", telefon: z.misto_telefon || "" })}>Upravit</button>}
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
                <div><label style={lbl} htmlFor="pr-mkon">Kontakt na místě</label><input id="pr-mkon" style={inp} value={editMisto.kontakt} onChange={(e) => setEditMisto({ ...editMisto, kontakt: e.target.value })} /></div>
                <div><label style={lbl} htmlFor="pr-mtel">Telefon</label><input id="pr-mtel" type="tel" style={inp} value={editMisto.telefon} onChange={(e) => setEditMisto({ ...editMisto, telefon: e.target.value })} /></div>
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
              {(z.misto_kontakt || z.misto_telefon) && <div>👷 Na místě: {z.misto_kontakt || ""}{z.misto_telefon && <> · <a href={`tel:${z.misto_telefon}`} style={{ color: "#0369a1" }}>{z.misto_telefon}</a></>}</div>}
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
          {kHlavicka}{kPrubeh}{kDalsiKrok}{kUkolyFaze}{kProc}{kMisto}{kUkoly}{kZpravy}{kHistorie}{kBrana}{kKdo}
        </div>
      );
    }
    // Zobrazená jedna zakázka: vše pod seznamem, na celou šířku, zleva doprava.
    return (
      <div className="pr-siroky" id="pr-panel">
        <div className="pr-cela">{kHlavicka}</div>
        <div className="pr-cela">{kPrubeh}</div>
        <div className="pr-sloupec">{kDalsiKrok}{kUkolyFaze}{kBrana}</div>
        <div className="pr-sloupec">{kProc}{kHistorie}</div>
        <div className="pr-sloupec">{kMisto}{kUkoly}{kZpravy}{kKdo}</div>
      </div>
    );
  }
}

// Seznam sekcí pro případné další použití (legenda apod.)
export const SEKCE_PRUBEHU = SEKCE;
