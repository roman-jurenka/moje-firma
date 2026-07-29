import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { uploadFileObject, zakazkaFolderPath, toDirectImageUrl, isConnected } from "./onedrive.js";

const STAV_DOC = { ceka: { label: "Čeká", color: "#475569" }, vyplnen: { label: "Vyplněn", color: "#f59e0b" }, odeslan: { label: "Odeslán", color: "#2563eb" }, podepsan: { label: "Podepsán", color: "#16a34a" } };
export const FOTO_KATEGORIE = ["Před montáží","Průběh montáže","Po montáži","Detail střídač/baterie","Předávací protokol","Servis"];
const SEKCE = [
  { id: "zakaznik",  icon: "👤", label: "Zákazník",         barva: "#6366f1" },
  { id: "nabidka",   icon: "📋", label: "Nabídka",          barva: "#2563eb" },
  { id: "smlouva",   icon: "✍️", label: "Smlouva",          barva: "#7c3aed" },
  { id: "system",    icon: "⚡", label: "Systém",             barva: "#f59e0b" },
  { id: "zaruky",    icon: "🛡️", label: "Záruky",             barva: "#06b6d4" },
  { id: "montaz",    icon: "🔧", label: "Montáž",           barva: "#ef4444" },
  { id: "predani",   icon: "✅", label: "Předání",          barva: "#16a34a" },
  { id: "dotace",    icon: "🏛️", label: "Dotace",           barva: "#0ea5e9" },
  { id: "fakturace", icon: "💰", label: "Fakturace",        barva: "#f97316" },
  { id: "bilance",   icon: "📊", label: "Ekonomika",        barva: "#10b981" },
  { id: "rozsireni", icon: "🔩", label: "Rozšíření",        barva: "#8b5cf6" },
  { id: "fotky",     icon: "📷", label: "Fotodokumentace",  barva: "#06b6d4" },
  { id: "dokumenty", icon: "📄", label: "Dokumenty",        barva: "#64748b" },
  { id: "servis",    icon: "🔨", label: "Servis",           barva: "#ec4899" },
];

export const PRAZDNA_DATA = {
  zakaznik:  { jmeno:"", adresa:"", telefon:"", email:"", datumNarozeni:"", ean:"", distributor:"ČEZ", pocetVlastniku:"1", poznamka:"" },
  nabidka:   { cisloOP:"", sestava:"", cenaSDph:"", dotace:"", cenaPoOdecteni:"", oz:"", datumNabidky:"", platnostDo:"", poznamka:"" },
  smlouva:   { datumPodpisu:"", zaloha:"", datumZalohy:"", terminRealizace:"", poznamka:"" },
  system:    { typZakazky:"fve", panelTyp:"", panelPocet:"", panelKwp:"", stridacTyp:"", stridacSN:"", stridacFirmware:"", baterieTyp:"", bateriePocet:"", baterieKwh:"", baterieSN:"", bms:"", backup:"", regulace:"", elmr:"", rozvadecDC:"", bojlerTyp:"", bojlerObjem:"", bojlerKw:"", bojlerSN:"", rozvadecTyp:"", rozvadecOkruhy:"", rozvadecProud:"", hromoJimac:"", hromoSvody:"", hromoUzemneni:"", elektroPolozky:[], hromoPolozky:[], poznamka:"" },
  zaruky: [
    { id:1, nazev:"Solární panely",  datumInstalace:"", delkaLet:15, poznamka:"Výkon panelů" },
    { id:2, nazev:"Střídač",         datumInstalace:"", delkaLet:5,  poznamka:"Standardní záruka" },
    { id:3, nazev:"Baterie",         datumInstalace:"", delkaLet:10, poznamka:"" },
    { id:4, nazev:"Montáž/dílo",     datumInstalace:"", delkaLet:2,  poznamka:"Zákonná záruka" },
  ],
  montaz:    { datumMontaze:"", technici:"", elektroHodiny:"", strechaHodiny:"", instalater:"", doprava:"", prubezhPoznamky:"", poznamka:"" },
  predani:   { datumPredani:"", technik:"", stavElektrarny:"", vadyBraniciUzivani:"", vadyNebraniciUzivani:"", protokolCislo:"", poznamka:"" },
  dotace:    { typ:"", kraj:"Ostatní kraje", datumPodani:"", stav:"", datumSchvaleni:"", datumVyplaceni:"", poznamka:"" },
  fakturace: { zalohaFaktura:"", zalohaKc:"", zalohaDatum:"", zalohaUhrazena:"ne", doplatekFaktura:"", doplatekKc:"", doplatekDatum:"", doplatekUhrazen:"ne", poznamka:"" },
  bilance:   { planMaterialNaklad:"", planPraceNaklad:"", planDopravaNaklad:"", planSluzbyNaklad:"", planCelkemNaklad:"", planProdejBezDph:"", planMarzeKc:"", planMarzePct:"", skutMaterialNaklad:"", skutPraceNaklad:"", skutDopravaNaklad:"", skutSluzbyNaklad:"", skutCelkemNaklad:"", skutProdejBezDph:"", skutMarzeKc:"", skutMarzePct:"", odchylkaPoznamka:"", poznamka:"" },
  rozsireni: [],
  fotky:     { onedrive:"", poznamka:"", nahrane:[] },
  dokumenty: {
    smlouva:         { stav:"ceka", datum:"", poznamka:"" },
    plnaMoc:         { stav:"ceka", datum:"", poznamka:"" },
    predavaci:       { stav:"ceka", datum:"", poznamka:"" },
    protokolOchr:    { stav:"ceka", datum:"", poznamka:"" },
    instalacniVM:    { stav:"ceka", datum:"", poznamka:"" },
    revize:          { stav:"ceka", datum:"", poznamka:"" },
    zadostPripojeni: { stav:"ceka", datum:"", poznamka:"" },
    extra: [],
  },
  servis: [],
  stavy: { zakaznik:"Čeká", nabidka:"Čeká", smlouva:"Čeká", system:"Čeká", zaruky:"Čeká", montaz:"Čeká", predani:"Čeká", dotace:"Čeká", fakturace:"Čeká", bilance:"Čeká", rozsireni:"Čeká", fotky:"Čeká", dokumenty:"Čeká", servis:"Čeká" },
};

const S = {
  app: { fontFamily:"'DM Sans',sans-serif", background:"#0a0d14", minHeight:"100vh", color:"#e2e8f0" },
  topBar: { background:"#0f1117", borderBottom:"1px solid #1a2035", padding:"12px 20px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:100 },
  scroll: { display:"flex", gap:14, padding:"16px 20px", overflowX:"auto", alignItems:"flex-start", minHeight:"calc(100vh - 110px)" },
  card: (a,barva) => ({ minWidth:310, maxWidth:310, background:"#0f1117", borderRadius:14, border:`1px solid ${a?barva:"#1a2035"}`, overflow:"hidden", flexShrink:0, transition:"border-color 0.15s" }),
  cH: (barva) => ({ background:barva+"18", padding:"12px 14px", borderBottom:"1px solid #1a2035", display:"flex", alignItems:"center", justifyContent:"space-between" }),
  body: { padding:14 },
  lbl: { fontSize:10, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:3 },
  val: { fontSize:13, color:"#e2e8f0", lineHeight:1.5 },
  inp: { background:"#080b12", border:"1px solid #252d45", borderRadius:7, padding:"6px 10px", color:"#e2e8f0", fontSize:13, width:"100%", outline:"none", boxSizing:"border-box", resize:"none", fontFamily:"inherit" },
  btn: (c="#2563eb") => ({ background:c, color:"#fff", border:"none", borderRadius:7, padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }),
  div: { borderBottom:"1px solid #1a2035", margin:"10px 0" },
  mono: { fontFamily:"monospace", fontSize:12, color:"#60a5fa", background:"#1e3a5f22", borderRadius:4, padding:"2px 6px" },
  sCard: { background:"#080b12", borderRadius:8, padding:12, marginBottom:10, border:"1px solid #1a2035" },
};

function EF({ label, value, onChange, multi, mono }) {
  const [ed, setEd] = useState(false);
  const [dr, setDr] = useState(value);
  const save = () => { onChange(dr); setEd(false); };
  return (
    <div style={{ marginBottom:10 }}>
      <label style={S.lbl}>{label}</label>
      {ed ? (
        <div>
          {multi
            ? <textarea rows={3} style={S.inp} value={dr} onChange={e=>setDr(e.target.value)} autoFocus onKeyDown={e=>e.key==="Escape"&&setEd(false)}/>
            : <input style={S.inp} value={dr} onChange={e=>setDr(e.target.value)} autoFocus onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape")setEd(false);}}/>
          }
          <div style={{display:"flex",gap:6,marginTop:5}}>
            <button style={S.btn()} onClick={save}>✓</button>
            <button style={{...S.btn("#334155")}} onClick={()=>{setDr(value);setEd(false);}}>✕</button>
          </div>
        </div>
      ) : (
        <div style={{display:"flex",alignItems:"flex-start",gap:6,cursor:"pointer"}} onClick={()=>{setDr(value);setEd(true);}}>
          <div style={mono?S.mono:{...S.val,flex:1}}>{value||<span style={{color:"#334155",fontStyle:"italic"}}>— klikni pro zápis —</span>}</div>
          <span style={{color:"#334155",fontSize:11,flexShrink:0,paddingTop:2}}>✏️</span>
        </div>
      )}
    </div>
  );
}

function StavSekce({ val, onChange }) {
  const cols = {"Čeká":"#475569","Probíhá":"#f59e0b","Hotovo":"#16a34a"};
  return (
    <select value={val} onChange={e=>onChange(e.target.value)}
      style={{background:cols[val]+"22",color:cols[val],border:`1px solid ${cols[val]}44`,borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700,cursor:"pointer",outline:"none"}}>
      {["Čeká","Probíhá","Hotovo"].map(s=><option key={s}>{s}</option>)}
    </select>
  );
}

function SekceHeader({ sekce, stav, onStav }) {
  return (
    <div style={S.cH(sekce.barva)}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:18}}>{sekce.icon}</span>
        <span style={{fontWeight:800,fontSize:14,color:"#fff"}}>{sekce.label}</span>
      </div>
      <StavSekce val={stav} onChange={onStav}/>
    </div>
  );
}

export default function ZakazkaSheet({ customers, currentUser, initialContractId, initialContractName, onClearInitial }) {
  const [sheets, setSheets] = useState([]);
  const [search, setSearch] = useState("");
  const [activeCId, setActiveCId] = useState(null);
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sheetId, setSheetId] = useState(null);
  const [fotoUploading, setFotoUploading] = useState({}); // { [kategorie]: pocetVeFrontě }
  const [docUploading, setDocUploading] = useState(null);  // klíč dokumentu, který se právě nahrává
  const [nakladySyncing, setNakladySyncing] = useState(false);

  // Načti listy ze Supabase
  useEffect(() => {
    supabase.from("project_sheets").select("*").order("updated_at", { ascending: false }).then(({ data: d }) => setSheets(d || []));
  }, []);

  // Otevři list pokud přišel initialContractId z Contracts.jsx
  useEffect(() => {
    if (initialContractId && sheets !== null) {
      openSheet(initialContractId, initialContractName);
      if (onClearInitial) onClearInitial();
    }
  }, [initialContractId, sheets]);

  const openSheet = async (contractId, contractName) => {
    const existing = sheets.find(s => s.project_id === contractId);
    if (existing) {
      setData(existing.data);
      setSheetId(existing.id);
    } else {
      const d = { ...PRAZDNA_DATA, _nazev: contractName || "" };
      setData(d);
      setSheetId(null);
    }
    setActiveCId(contractId);
  };

  const save = async () => {
    if (!activeCId || !data) return;
    setSaving(true);
    if (sheetId) {
      await supabase.from("project_sheets").update({ data, updated_at: new Date().toISOString() }).eq("id", sheetId);
    } else {
      const { data: row } = await supabase.from("project_sheets").insert({ project_id: activeCId, data }).select().single();
      if (row) { setSheetId(row.id); setSheets(s => [row, ...s]); }
    }
    setSaving(false);
  };

  const upd = (sekce, key, val) => setData(d => ({ ...d, [sekce]: { ...d[sekce], [key]: val } }));
  const updStav = (sekce, val) => setData(d => ({ ...d, stavy: { ...d.stavy, [sekce]: val } }));
  const updArr = (sekce, id, key, val) => setData(d => ({ ...d, [sekce]: d[sekce].map(r => r.id === id ? { ...r, [key]: val } : r) }));
  const delArr = (sekce, id) => setData(d => ({ ...d, [sekce]: d[sekce].filter(r => r.id !== id) }));
  const addArr = (sekce, item) => setData(d => ({ ...d, [sekce]: [...(d[sekce] || []), { id: Date.now(), ...item }] }));

  // ─── Upload fotek na OneDrive (FirmaCRM/Zakázky/[název]/Fotky) ─────────────
  const handleFotoUpload = async (kategorie, files) => {
    if (!files || files.length === 0) return;
    if (!isConnected()) { alert("Nejdřív se připoj k OneDrive v záložce ☁️ OneDrive."); return; }
    setFotoUploading(u => ({ ...u, [kategorie]: (u[kategorie] || 0) + files.length }));
    for (const f of files) {
      try {
        const webUrl = await uploadFileObject(zakazkaFolderPath(data._nazev, `Fotky/${kategorie}`), f);
        setData(d => ({ ...d, fotky: { ...d.fotky, nahrane: [...(d.fotky.nahrane || []), {
          id: Date.now() + Math.random(), name: f.name, url: toDirectImageUrl(webUrl), link: webUrl,
          datum: new Date().toLocaleDateString("cs-CZ"), kategorie,
        }] } }));
      } catch (e) {
        alert(`Nahrání fotky "${f.name}" na OneDrive selhalo: ${e.message}`);
      } finally {
        setFotoUploading(u => ({ ...u, [kategorie]: Math.max(0, (u[kategorie] || 1) - 1) }));
      }
    }
  };

  // ─── Upload dokumentu na OneDrive (FirmaCRM/Zakázky/[název]/Dokumenty) ─────
  const handleDokUpload = async (key, file) => {
    if (!file) return;
    if (!isConnected()) { alert("Nejdřív se připoj k OneDrive v záložce ☁️ OneDrive."); return; }
    setDocUploading(key);
    try {
      const webUrl = await uploadFileObject(zakazkaFolderPath(data._nazev, "Dokumenty"), file);
      setData(d => ({ ...d, dokumenty: { ...d.dokumenty, [key]: {
        ...d.dokumenty[key], soubor: { name: file.name, link: webUrl },
        stav: (!d.dokumenty[key]?.stav || d.dokumenty[key]?.stav === "ceka") ? "vyplnen" : d.dokumenty[key].stav,
      } } }));
    } catch (e) {
      alert(`Nahrání dokumentu "${file.name}" na OneDrive selhalo: ${e.message}`);
    } finally {
      setDocUploading(null);
    }
  };

  const handleExtraDokUpload = async (id, file) => {
    if (!file) return;
    if (!isConnected()) { alert("Nejdřív se připoj k OneDrive v záložce ☁️ OneDrive."); return; }
    setDocUploading("extra-" + id);
    try {
      const webUrl = await uploadFileObject(zakazkaFolderPath(data._nazev, "Dokumenty"), file);
      setData(d => ({ ...d, dokumenty: { ...d.dokumenty, extra: d.dokumenty.extra.map(x =>
        x.id === id ? { ...x, soubor: { name: file.name, link: webUrl } } : x
      ) } }));
    } catch (e) {
      alert(`Nahrání dokumentu "${file.name}" na OneDrive selhalo: ${e.message}`);
    } finally {
      setDocUploading(null);
    }
  };

  // ─── Propsat plán i skutečnost (contracts = plán, contract_cost_entries = skutečnost) ─
  const nacistSkutecneNaklady = async () => {
    if (!activeCId) return;
    const b = data.bilance || {};
    const maZaplneno = [
      b.skutMaterialNaklad, b.skutPraceNaklad, b.skutDopravaNaklad, b.skutCelkemNaklad,
      b.planMaterialNaklad, b.planPraceNaklad, b.planDopravaNaklad, b.planCelkemNaklad,
    ].some(v => v);
    if (maZaplneno && !confirm("Přepsat ručně zadané náklady daty z modulu Zakázky a Náklady?")) return;

    setNakladySyncing(true);
    try {
      const [{ data: entries, error: entriesErr }, { data: contract, error: contractErr }] = await Promise.all([
        supabase.from("contract_cost_entries").select("cost_type, amount_cost").eq("contract_id", activeCId),
        supabase.from("contracts").select("price, budget_prace, budget_material, budget_doprava").eq("id", activeCId).single(),
      ]);
      if (entriesErr) throw entriesErr;
      if (contractErr) throw contractErr;

      const sum = (typ) => (entries || []).filter(e => e.cost_type === typ).reduce((s, e) => s + Number(e.amount_cost || 0), 0);
      const material = sum("materiál"), prace = sum("práce"), doprava = sum("doprava");
      const celkem = material + prace + doprava;
      const prodej = Number(data.bilance.skutProdejBezDph) || 0;
      const marzeKc = prodej ? prodej - celkem : null;
      const marzePct = prodej ? Math.round((marzeKc / prodej) * 1000) / 10 : null;

      const planMaterial = Number(contract?.budget_material) || 0;
      const planPrace = Number(contract?.budget_prace) || 0;
      const planDoprava = Number(contract?.budget_doprava) || 0;
      const planCelkem = planMaterial + planPrace + planDoprava;
      const planProdej = Number(contract?.price) || 0;
      const planMarzeKc = planProdej ? planProdej - planCelkem : null;
      const planMarzePct = planProdej ? Math.round((planMarzeKc / planProdej) * 1000) / 10 : null;

      setData(d => ({ ...d, bilance: {
        ...d.bilance,
        skutMaterialNaklad: String(material),
        skutPraceNaklad: String(prace),
        skutDopravaNaklad: String(doprava),
        skutCelkemNaklad: String(celkem),
        ...(marzeKc !== null ? { skutMarzeKc: String(marzeKc), skutMarzePct: String(marzePct) } : {}),
        planMaterialNaklad: String(planMaterial),
        planPraceNaklad: String(planPrace),
        planDopravaNaklad: String(planDoprava),
        planCelkemNaklad: String(planCelkem),
        ...(planProdej ? { planProdejBezDph: String(planProdej) } : {}),
        ...(planMarzeKc !== null ? { planMarzeKc: String(planMarzeKc), planMarzePct: String(planMarzePct) } : {}),
      } }));
    } catch (e) {
      alert("Načtení nákladů selhalo: " + e.message);
    } finally {
      setNakladySyncing(false);
    }
  };

  // Seznam listů (výběr zakázky)
  const filteredSheets = sheets.filter(s => !search || (s.data?._nazev || "").toLowerCase().includes(search.toLowerCase()));

  if (!data) return (
    <div style={S.app}>
      <div style={{ padding:24, maxWidth:700 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:"#fff", marginBottom:6 }}>📋 Listy zakázek</h1>
        <p style={{ color:"#475569", fontSize:13, marginBottom:20 }}>Otevři zakázkový list kliknutím na 📋 v záložce Zakázky, nebo vyber existující list níže.</p>
        <input style={{...S.inp, marginBottom:16, fontSize:14}} placeholder="Hledat zakázku..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filteredSheets.length === 0 && <div style={{color:"#334155",fontSize:13}}>Žádné listy. Otevři zakázku a klikni na 📋.</div>}
          {filteredSheets.map(s=>(
            <div key={s.id} onClick={()=>{setData(s.data);setSheetId(s.id);setActiveCId(s.project_id);}}
              style={{background:"#0f1117",borderRadius:12,padding:"14px 18px",border:"1px solid #1a2035",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:22}}>📋</span>
              <div>
                <div style={{fontWeight:700,color:"#fff",fontSize:14}}>{s.data?._nazev||"Zakázka #"+s.project_id}</div>
                <div style={{fontSize:11,color:"#475569",marginTop:2}}>Upraveno: {new Date(s.updated_at).toLocaleDateString("cs-CZ")}</div>
              </div>
              <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                {SEKCE.slice(0,5).map(sec=>(
                  <div key={sec.id} style={{width:8,height:8,borderRadius:"50%",background:s.data?.stavy?.[sec.id]==="Hotovo"?"#16a34a":s.data?.stavy?.[sec.id]==="Probíhá"?"#f59e0b":"#1a2035"}} title={sec.label}/>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const st = data.stavy || {};

  return (
    <div style={S.app}>
      {/* Top bar */}
      <div style={S.topBar}>
        <button onClick={()=>{setData(null);setActiveCId(null);}} style={{...S.btn("#1a2035"),color:"#94a3b8",padding:"6px 12px"}}>← Zpět</button>
        <div>
          <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>{data._nazev||"Nová zakázka"}</div>
          <div style={{fontSize:11,color:"#475569"}}>Zakázkový list</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",overflowX:"auto"}}>
          {SEKCE.map(s=>(
            <div key={s.id} onClick={()=>document.getElementById("s-"+s.id)?.scrollIntoView({behavior:"smooth",inline:"start",block:"nearest"})}
              style={{background:s.barva+"22",color:s.barva,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,border:`1px solid ${s.barva}33`}}>
              {s.icon} {s.label}
            </div>
          ))}
          <button onClick={save} style={{...S.btn(saving?"#334155":"#16a34a"),padding:"7px 18px",flexShrink:0}}>
            {saving?"⏳ Ukládám...":"💾 Uložit"}
          </button>
        </div>
      </div>

      {/* Horizontální scroll */}
      <div style={S.scroll}>

        {/* ZÁKAZNÍK */}
        <div id="s-zakaznik" style={S.card(true,"#6366f1")}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="zakaznik")} stav={st.zakaznik||"Čeká"} onStav={v=>updStav("zakaznik",v)}/>
          <div style={S.body}>
            <EF label="Jméno a příjmení"  value={data.zakaznik.jmeno}          onChange={v=>upd("zakaznik","jmeno",v)}/>
            <EF label="Adresa"             value={data.zakaznik.adresa}         onChange={v=>upd("zakaznik","adresa",v)}/>
            <EF label="Telefon"            value={data.zakaznik.telefon}        onChange={v=>upd("zakaznik","telefon",v)}/>
            <EF label="E-mail"             value={data.zakaznik.email}          onChange={v=>upd("zakaznik","email",v)}/>
            <EF label="Datum narození"     value={data.zakaznik.datumNarozeni}  onChange={v=>upd("zakaznik","datumNarozeni",v)}/>
            <div style={S.div}/>
            <EF label="EAN odběrného místa" value={data.zakaznik.ean}          onChange={v=>upd("zakaznik","ean",v)} mono/>
            <EF label="Distributor"        value={data.zakaznik.distributor}    onChange={v=>upd("zakaznik","distributor",v)}/>
            <EF label="Počet vlastníků"    value={data.zakaznik.pocetVlastniku} onChange={v=>upd("zakaznik","pocetVlastniku",v)}/>
            <div style={S.div}/>
            <EF label="Poznámka"           value={data.zakaznik.poznamka}       onChange={v=>upd("zakaznik","poznamka",v)} multi/>
          </div>
        </div>

        {/* NABÍDKA */}
        <div id="s-nabidka" style={S.card(false,"#2563eb")}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="nabidka")} stav={st.nabidka||"Čeká"} onStav={v=>updStav("nabidka",v)}/>
          <div style={S.body}>
            <EF label="Číslo OP"            value={data.nabidka.cisloOP}         onChange={v=>upd("nabidka","cisloOP",v)} mono/>
            <EF label="Sestava"             value={data.nabidka.sestava}         onChange={v=>upd("nabidka","sestava",v)}/>
            <EF label="Obchodní zástupce"   value={data.nabidka.oz}              onChange={v=>upd("nabidka","oz",v)}/>
            <EF label="Datum nabídky"       value={data.nabidka.datumNabidky}    onChange={v=>upd("nabidka","datumNabidky",v)}/>
            <EF label="Platnost do"         value={data.nabidka.platnostDo}      onChange={v=>upd("nabidka","platnostDo",v)}/>
            <div style={S.div}/>
            <EF label="Cena s DPH (Kč)"    value={data.nabidka.cenaSDph}        onChange={v=>upd("nabidka","cenaSDph",v)}/>
            <EF label="Dotace NMP (Kč)"    value={data.nabidka.dotace}          onChange={v=>upd("nabidka","dotace",v)}/>
            <EF label="Cena po dotaci (Kč)" value={data.nabidka.cenaPoOdecteni} onChange={v=>upd("nabidka","cenaPoOdecteni",v)}/>
            <div style={S.div}/>
            <EF label="Poznámka"            value={data.nabidka.poznamka}        onChange={v=>upd("nabidka","poznamka",v)} multi/>
          </div>
        </div>

        {/* SMLOUVA */}
        <div id="s-smlouva" style={S.card(false,"#7c3aed")}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="smlouva")} stav={st.smlouva||"Čeká"} onStav={v=>updStav("smlouva",v)}/>
          <div style={S.body}>
            <EF label="Datum podpisu"       value={data.smlouva.datumPodpisu}    onChange={v=>upd("smlouva","datumPodpisu",v)}/>
            <EF label="Záloha (Kč)"         value={data.smlouva.zaloha}          onChange={v=>upd("smlouva","zaloha",v)}/>
            <EF label="Datum úhrady zálohy" value={data.smlouva.datumZalohy}     onChange={v=>upd("smlouva","datumZalohy",v)}/>
            <EF label="Termín realizace"    value={data.smlouva.terminRealizace} onChange={v=>upd("smlouva","terminRealizace",v)}/>
            <div style={S.div}/>
            <EF label="Poznámka"            value={data.smlouva.poznamka}        onChange={v=>upd("smlouva","poznamka",v)} multi/>
          </div>
        </div>

        {/* FVE SYSTÉM — dynamický podle typu zakázky */}
        <div id="s-system" style={{...S.card(false,"#f59e0b"),maxWidth:340,minWidth:340}}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="system")} stav={st.system||"Čeká"} onStav={v=>updStav("system",v)}/>
          <div style={S.body}>

            {/* Výběr typu zakázky */}
            <div style={{marginBottom:14}}>
              <label style={S.lbl}>Typ zakázky</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {[
                  {id:"fve",     label:"FVE Systém",       icon:"☀️"},
                  {id:"ohrev",   label:"FVE Ohřev vody",   icon:"🔥"},
                  {id:"elektro", label:"Elektroinstalace",  icon:"⚡"},
                  {id:"hromosvod",label:"Hromosvod",        icon:"⛈️"},
                ].map(t=>(
                  <button key={t.id}
                    onClick={()=>upd("system","typZakazky",t.id)}
                    style={{background:(data.system.typZakazky||"fve")===t.id?"#f59e0b22":"#0a0d14", border:`1px solid ${(data.system.typZakazky||"fve")===t.id?"#f59e0b":"#252d45"}`, borderRadius:8, padding:"6px 12px", color:(data.system.typZakazky||"fve")===t.id?"#f59e0b":"#475569", fontSize:12, fontWeight:600, cursor:"pointer"}}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={S.div}/>

            {/* FVE SYSTÉM */}
            {(data.system.typZakazky||"fve")==="fve" && <>
              <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",marginBottom:8}}>☀️ Panely</div>
              <EF label="Typ panelu"    value={data.system.panelTyp}    onChange={v=>upd("system","panelTyp",v)}/>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}><EF label="Počet ks"  value={data.system.panelPocet} onChange={v=>upd("system","panelPocet",v)}/></div>
                <div style={{flex:1}}><EF label="Výkon kWp" value={data.system.panelKwp}   onChange={v=>upd("system","panelKwp",v)}/></div>
              </div>
              <div style={S.div}/>
              <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",marginBottom:8}}>🔌 Střídač</div>
              <EF label="Typ střídače"     value={data.system.stridacTyp}      onChange={v=>upd("system","stridacTyp",v)}/>
              <EF label="Výrobní číslo SN" value={data.system.stridacSN}       onChange={v=>upd("system","stridacSN",v)} mono/>
              <EF label="Firmware"         value={data.system.stridacFirmware} onChange={v=>upd("system","stridacFirmware",v)} mono/>
              <div style={S.div}/>
              <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",marginBottom:8}}>🔋 Baterie</div>
              <EF label="Typ baterie"    value={data.system.baterieTyp}   onChange={v=>upd("system","baterieTyp",v)}/>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}><EF label="Počet ks" value={data.system.bateriePocet} onChange={v=>upd("system","bateriePocet",v)}/></div>
                <div style={{flex:1}}><EF label="Kapacita" value={data.system.baterieKwh}   onChange={v=>upd("system","baterieKwh",v)}/></div>
              </div>
              <EF label="Výrobní čísla SN" value={data.system.baterieSN} onChange={v=>upd("system","baterieSN",v)} mono/>
              <div style={S.div}/>
              <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",marginBottom:8}}>⚙️ Příslušenství</div>
              <EF label="BMS"         value={data.system.bms}        onChange={v=>upd("system","bms",v)}/>
              <EF label="Back-up"     value={data.system.backup}     onChange={v=>upd("system","backup",v)}/>
              <EF label="Regulace"    value={data.system.regulace}   onChange={v=>upd("system","regulace",v)}/>
              <EF label="ELMR úprava" value={data.system.elmr}       onChange={v=>upd("system","elmr",v)}/>
              <EF label="Rozvaděč DC" value={data.system.rozvadecDC} onChange={v=>upd("system","rozvadecDC",v)}/>
            </>}

            {/* FVE OHŘEV VODY */}
            {data.system.typZakazky==="ohrev" && <>
              <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",marginBottom:8}}>☀️ Panely</div>
              <EF label="Typ panelu"    value={data.system.panelTyp}   onChange={v=>upd("system","panelTyp",v)}/>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}><EF label="Počet ks"  value={data.system.panelPocet} onChange={v=>upd("system","panelPocet",v)}/></div>
                <div style={{flex:1}}><EF label="Výkon kWp" value={data.system.panelKwp}   onChange={v=>upd("system","panelKwp",v)}/></div>
              </div>
              <div style={S.div}/>
              <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",marginBottom:8}}>🔥 Bojler / ohřev</div>
              <EF label="Typ bojleru"       value={data.system.bojlerTyp}   onChange={v=>upd("system","bojlerTyp",v)}/>
              <EF label="Objem (l)"         value={data.system.bojlerObjem} onChange={v=>upd("system","bojlerObjem",v)}/>
              <EF label="Výkon topného tělesa" value={data.system.bojlerKw} onChange={v=>upd("system","bojlerKw",v)}/>
              <EF label="Výrobní číslo SN"  value={data.system.bojlerSN}    onChange={v=>upd("system","bojlerSN",v)} mono/>
              <div style={S.div}/>
              <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",marginBottom:8}}>🔌 Střídač / regulace</div>
              <EF label="Typ střídače"      value={data.system.stridacTyp}  onChange={v=>upd("system","stridacTyp",v)}/>
              <EF label="SN střídače"       value={data.system.stridacSN}   onChange={v=>upd("system","stridacSN",v)} mono/>
              <EF label="Regulace ohřevu"   value={data.system.regulace}    onChange={v=>upd("system","regulace",v)}/>
              <EF label="ELMR úprava"       value={data.system.elmr}        onChange={v=>upd("system","elmr",v)}/>
            </>}

            {/* ELEKTROINSTALACE — volný seznam technologií */}
            {data.system.typZakazky==="elektro" && <>
              <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",marginBottom:8}}>⚡ Instalované technologie</div>
              <div style={{fontSize:12,color:"#475569",marginBottom:12}}>Přidej každou instalovanou technologii jako položku.</div>

              {/* Seznam položek */}
              {(data.system.elektroPolozky||[]).map((p,i)=>(
                <div key={p.id} style={{background:"#080b12",borderRadius:8,padding:10,marginBottom:8,border:"1px solid #1a2035"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:11,fontWeight:700,color:"#f59e0b"}}>#{i+1}</span>
                    <button onClick={()=>setData(d=>({...d,system:{...d.system,elektroPolozky:(d.system.elektroPolozky||[]).filter(x=>x.id!==p.id)}}))}
                      style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:13}}>×</button>
                  </div>
                  <input style={{...S.inp,marginBottom:6}} placeholder="Název technologie (např. Domofon, Kamera, Závora...)"
                    value={p.nazev}
                    onChange={e=>setData(d=>({...d,system:{...d.system,elektroPolozky:(d.system.elektroPolozky||[]).map(x=>x.id===p.id?{...x,nazev:e.target.value}:x)}}))}/>
                  <textarea rows={2} style={{...S.inp,resize:"none"}} placeholder="Specifikace, výrobce, SN, poznámka..."
                    value={p.popis}
                    onChange={e=>setData(d=>({...d,system:{...d.system,elektroPolozky:(d.system.elektroPolozky||[]).map(x=>x.id===p.id?{...x,popis:e.target.value}:x)}}))}/>
                </div>
              ))}

              <button style={{...S.btn("#f59e0b"),width:"100%",marginBottom:12}}
                onClick={()=>setData(d=>({...d,system:{...d.system,elektroPolozky:[...(d.system.elektroPolozky||[]),{id:Date.now(),nazev:"",popis:""}]}}))}>
                + Přidat technologii
              </button>

              <div style={S.div}/>
              <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",marginBottom:8}}>🔌 Rozvaděč</div>
              <EF label="Typ rozvaděče"    value={data.system.rozvadecTyp}   onChange={v=>upd("system","rozvadecTyp",v)}/>
              <EF label="Počet okruhů"     value={data.system.rozvadecOkruhy} onChange={v=>upd("system","rozvadecOkruhy",v)}/>
              <EF label="Jmenovitý proud"  value={data.system.rozvadecProud}  onChange={v=>upd("system","rozvadecProud",v)}/>
            </>}

            {/* HROMOSVOD — volný seznam */}
            {data.system.typZakazky==="hromosvod" && <>
              <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",marginBottom:8}}>⛈️ Instalované komponenty</div>
              <div style={{fontSize:12,color:"#475569",marginBottom:12}}>Přidej každý instalovaný komponent hromosvodu.</div>

              {(data.system.hromoPolozky||[]).map((p,i)=>(
                <div key={p.id} style={{background:"#080b12",borderRadius:8,padding:10,marginBottom:8,border:"1px solid #1a2035"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:11,fontWeight:700,color:"#f59e0b"}}>#{i+1}</span>
                    <button onClick={()=>setData(d=>({...d,system:{...d.system,hromoPolozky:(d.system.hromoPolozky||[]).filter(x=>x.id!==p.id)}}))}
                      style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:13}}>×</button>
                  </div>
                  <input style={{...S.inp,marginBottom:6}} placeholder="Název komponentu (např. Jímací tyč, Svod, Uzemnění...)"
                    value={p.nazev}
                    onChange={e=>setData(d=>({...d,system:{...d.system,hromoPolozky:(d.system.hromoPolozky||[]).map(x=>x.id===p.id?{...x,nazev:e.target.value}:x)}}))}/>
                  <textarea rows={2} style={{...S.inp,resize:"none"}} placeholder="Specifikace, materiál, délka, SN, poznámka..."
                    value={p.popis}
                    onChange={e=>setData(d=>({...d,system:{...d.system,hromoPolozky:(d.system.hromoPolozky||[]).map(x=>x.id===p.id?{...x,popis:e.target.value}:x)}}))}/>
                </div>
              ))}

              <button style={{...S.btn("#f59e0b"),width:"100%",marginBottom:12}}
                onClick={()=>setData(d=>({...d,system:{...d.system,hromoPolozky:[...(d.system.hromoPolozky||[]),{id:Date.now(),nazev:"",popis:""}]}}))}>
                + Přidat komponent
              </button>

              <div style={S.div}/>
              <div style={{fontSize:11,fontWeight:700,color:"#f59e0b",textTransform:"uppercase",marginBottom:8}}>📋 Obecné info</div>
              <EF label="Typ jímací soustavy" value={data.system.hromoJimac}   onChange={v=>upd("system","hromoJimac",v)}/>
              <EF label="Počet svodů"          value={data.system.hromoSvody}   onChange={v=>upd("system","hromoSvody",v)}/>
              <EF label="Typ uzemnění"         value={data.system.hromoUzemneni} onChange={v=>upd("system","hromoUzemneni",v)}/>
            </>}

            <div style={S.div}/>
            <EF label="Poznámka" value={data.system.poznamka} onChange={v=>upd("system","poznamka",v)} multi/>
          </div>
        </div>

        {/* ZÁRUKY */}
        <div id="s-zaruky" style={{...S.card(false,"#06b6d4"),maxWidth:340,minWidth:340}}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="zaruky")} stav={st.zaruky||"Čeká"} onStav={v=>updStav("zaruky",v)}/>
          <div style={S.body}>

            {(data.zaruky||[]).map((z,i)=>{
              // Výpočet stavu záruky
              const dnes = new Date();
              const instalace = z.datumInstalace ? new Date(z.datumInstalace.split(".").reverse().join("-")) : null;
              const vyprseni = instalace ? new Date(instalace.getFullYear()+Number(z.delkaLet||0), instalace.getMonth(), instalace.getDate()) : null;
              const dniDo = vyprseni ? Math.round((vyprseni-dnes)/(1000*60*60*24)) : null;

              let stav = null;
              if (dniDo !== null) {
                if (dniDo > 5)        stav = { label:`V záruce — zbývá ${dniDo} dní`, color:"#16a34a", bg:"#16a34a15", icon:"🟢" };
                else if (dniDo >= 0)  stav = { label:`⚠️ Vyprší za ${dniDo} dní!`, color:"#f59e0b", bg:"#f59e0b15", icon:"🟡" };
                else                  stav = { label:`Vypršela před ${Math.abs(dniDo)} dny`, color:"#ef4444", bg:"#ef444415", icon:"🔴" };
              }

              return (
                <div key={z.id} style={{background:"#080b12",borderRadius:10,padding:12,marginBottom:10,border:`1px solid ${stav?.color||"#1a2035"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#e2e8f0"}}>{z.nazev||`Záruka #${i+1}`}</span>
                    <button onClick={()=>setData(d=>({...d,zaruky:(d.zaruky||[]).filter(x=>x.id!==z.id)}))}
                      style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:13}}>×</button>
                  </div>

                  {/* Stav záruky */}
                  {stav && (
                    <div style={{background:stav.bg,border:`1px solid ${stav.color}33`,borderRadius:7,padding:"6px 10px",marginBottom:10,fontSize:12,fontWeight:700,color:stav.color}}>
                      {stav.icon} {stav.label}
                      {vyprseni && <div style={{fontSize:10,fontWeight:400,marginTop:2}}>Datum vypršení: {vyprseni.toLocaleDateString("cs-CZ")}</div>}
                    </div>
                  )}

                  {/* Pole */}
                  <div style={{marginBottom:6}}>
                    <label style={S.lbl}>Název záruky</label>
                    <input style={S.inp} value={z.nazev} placeholder="např. Střídač, Panely..."
                      onChange={e=>setData(d=>({...d,zaruky:(d.zaruky||[]).map(x=>x.id===z.id?{...x,nazev:e.target.value}:x)}))}/>
                  </div>
                  <div style={{display:"flex",gap:8,marginBottom:6}}>
                    <div style={{flex:1}}>
                      <label style={S.lbl}>Datum instalace</label>
                      <input style={S.inp} placeholder="dd.mm.rrrr" value={z.datumInstalace}
                        onChange={e=>setData(d=>({...d,zaruky:(d.zaruky||[]).map(x=>x.id===z.id?{...x,datumInstalace:e.target.value}:x)}))}/>
                    </div>
                    <div style={{flex:1}}>
                      <label style={S.lbl}>Délka záruky (let)</label>
                      <input style={S.inp} type="number" min={1} max={30} value={z.delkaLet}
                        onChange={e=>setData(d=>({...d,zaruky:(d.zaruky||[]).map(x=>x.id===z.id?{...x,delkaLet:Number(e.target.value)}:x)}))}/>
                    </div>
                  </div>
                  <div>
                    <label style={S.lbl}>Poznámka</label>
                    <input style={S.inp} placeholder="Typ záruky, podmínky..." value={z.poznamka}
                      onChange={e=>setData(d=>({...d,zaruky:(d.zaruky||[]).map(x=>x.id===z.id?{...x,poznamka:e.target.value}:x)}))}/>
                  </div>
                </div>
              );
            })}

            <button style={{...S.btn("#06b6d4"),width:"100%",marginTop:4}}
              onClick={()=>setData(d=>({...d,zaruky:[...(d.zaruky||[]),{id:Date.now(),nazev:"",datumInstalace:"",delkaLet:5,poznamka:""}]}))}>
              + Přidat záruku
            </button>
          </div>
        </div>

        {/* MONTÁŽ */}
        <div id="s-montaz" style={S.card(false,"#ef4444")}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="montaz")} stav={st.montaz||"Čeká"} onStav={v=>updStav("montaz",v)}/>
          <div style={S.body}>
            <EF label="Datum montáže" value={data.montaz.datumMontaze}    onChange={v=>upd("montaz","datumMontaze",v)}/>
            <EF label="Technici"      value={data.montaz.technici}         onChange={v=>upd("montaz","technici",v)}/>
            <div style={S.div}/>
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}><EF label="Elektro (dny)"   value={data.montaz.elektroHodiny} onChange={v=>upd("montaz","elektroHodiny",v)}/></div>
              <div style={{flex:1}}><EF label="Střecha (dny)"   value={data.montaz.strechaHodiny} onChange={v=>upd("montaz","strechaHodiny",v)}/></div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}><EF label="Instalatér (dny)" value={data.montaz.instalater}  onChange={v=>upd("montaz","instalater",v)}/></div>
              <div style={{flex:1}}><EF label="Doprava (km)"     value={data.montaz.doprava}     onChange={v=>upd("montaz","doprava",v)}/></div>
            </div>
            <div style={S.div}/>
            <EF label="Průběžné poznámky" value={data.montaz.prubezhPoznamky} onChange={v=>upd("montaz","prubezhPoznamky",v)} multi/>
            <EF label="Poznámka"          value={data.montaz.poznamka}        onChange={v=>upd("montaz","poznamka",v)} multi/>
          </div>
        </div>

        {/* PŘEDÁNÍ */}
        <div id="s-predani" style={S.card(false,"#16a34a")}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="predani")} stav={st.predani||"Čeká"} onStav={v=>updStav("predani",v)}/>
          <div style={S.body}>
            <EF label="Datum předání"    value={data.predani.datumPredani}          onChange={v=>upd("predani","datumPredani",v)}/>
            <EF label="Technik"          value={data.predani.technik}               onChange={v=>upd("predani","technik",v)}/>
            <EF label="Číslo protokolu"  value={data.predani.protokolCislo}         onChange={v=>upd("predani","protokolCislo",v)} mono/>
            <EF label="Stav elektrárny"  value={data.predani.stavElektrarny}        onChange={v=>upd("predani","stavElektrarny",v)}/>
            <div style={S.div}/>
            <EF label="Vady bránící"     value={data.predani.vadyBraniciUzivani}    onChange={v=>upd("predani","vadyBraniciUzivani",v)} multi/>
            <EF label="Vady nebránící"   value={data.predani.vadyNebraniciUzivani}  onChange={v=>upd("predani","vadyNebraniciUzivani",v)} multi/>
            <div style={S.div}/>
            <EF label="Poznámka"         value={data.predani.poznamka}              onChange={v=>upd("predani","poznamka",v)} multi/>
          </div>
        </div>

        {/* DOTACE */}
        <div id="s-dotace" style={S.card(false,"#0ea5e9")}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="dotace")} stav={st.dotace||"Čeká"} onStav={v=>updStav("dotace",v)}/>
          <div style={S.body}>
            <EF label="Typ dotace"         value={data.dotace.typ}            onChange={v=>upd("dotace","typ",v)}/>
            <EF label="Kraj"               value={data.dotace.kraj}           onChange={v=>upd("dotace","kraj",v)}/>
            <EF label="Datum podání"       value={data.dotace.datumPodani}    onChange={v=>upd("dotace","datumPodani",v)}/>
            <EF label="Stav žádosti"       value={data.dotace.stav}           onChange={v=>upd("dotace","stav",v)}/>
            <EF label="Datum schválení"    value={data.dotace.datumSchvaleni} onChange={v=>upd("dotace","datumSchvaleni",v)}/>
            <EF label="Datum vyplacení"    value={data.dotace.datumVyplaceni} onChange={v=>upd("dotace","datumVyplaceni",v)}/>
            <div style={S.div}/>
            <EF label="Poznámka"           value={data.dotace.poznamka}       onChange={v=>upd("dotace","poznamka",v)} multi/>
          </div>
        </div>

        {/* FAKTURACE */}
        <div id="s-fakturace" style={S.card(false,"#f97316")}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="fakturace")} stav={st.fakturace||"Čeká"} onStav={v=>updStav("fakturace",v)}/>
          <div style={S.body}>
            <div style={{fontSize:11,fontWeight:700,color:"#f97316",textTransform:"uppercase",marginBottom:8}}>Záloha</div>
            <EF label="Číslo faktury"  value={data.fakturace.zalohaFaktura}  onChange={v=>upd("fakturace","zalohaFaktura",v)} mono/>
            <EF label="Částka (Kč)"   value={data.fakturace.zalohaKc}       onChange={v=>upd("fakturace","zalohaKc",v)}/>
            <EF label="Datum splat."  value={data.fakturace.zalohaDatum}    onChange={v=>upd("fakturace","zalohaDatum",v)}/>
            <EF label="Uhrazena"      value={data.fakturace.zalohaUhrazena} onChange={v=>upd("fakturace","zalohaUhrazena",v)}/>
            <div style={S.div}/>
            <div style={{fontSize:11,fontWeight:700,color:"#f97316",textTransform:"uppercase",marginBottom:8}}>Doplatek</div>
            <EF label="Číslo faktury"  value={data.fakturace.doplatekFaktura}  onChange={v=>upd("fakturace","doplatekFaktura",v)} mono/>
            <EF label="Částka (Kč)"   value={data.fakturace.doplatekKc}       onChange={v=>upd("fakturace","doplatekKc",v)}/>
            <EF label="Datum splat."  value={data.fakturace.doplatekDatum}    onChange={v=>upd("fakturace","doplatekDatum",v)}/>
            <EF label="Uhrazen"       value={data.fakturace.doplatekUhrazen} onChange={v=>upd("fakturace","doplatekUhrazen",v)}/>
            <div style={S.div}/>
            <EF label="Poznámka"      value={data.fakturace.poznamka}        onChange={v=>upd("fakturace","poznamka",v)} multi/>
          </div>
        </div>

        {/* EKONOMICKÁ BILANCE */}
        <div id="s-bilance" style={{...S.card(false,"#10b981"),maxWidth:340,minWidth:340}}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="bilance")} stav={st.bilance||"Čeká"} onStav={v=>updStav("bilance",v)}/>
          <div style={S.body}>
            <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
              <thead><tr>
                <th style={{textAlign:"left",padding:"5px 8px",fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",borderBottom:"1px solid #1a2035"}}>Položka</th>
                <th style={{textAlign:"right",padding:"5px 8px",fontSize:10,fontWeight:700,color:"#2563eb",textTransform:"uppercase",borderBottom:"1px solid #1a2035"}}>Plán</th>
                <th style={{textAlign:"right",padding:"5px 8px",fontSize:10,fontWeight:700,color:"#10b981",textTransform:"uppercase",borderBottom:"1px solid #1a2035"}}>Skutečnost</th>
              </tr></thead>
              <tbody>
                {[["Materiál","planMaterialNaklad","skutMaterialNaklad"],["Práce","planPraceNaklad","skutPraceNaklad"],["Doprava","planDopravaNaklad","skutDopravaNaklad"],["Celkem náklad","planCelkemNaklad","skutCelkemNaklad"],["Prodejní cena","planProdejBezDph","skutProdejBezDph"]].map(([l,pk,sk])=>(
                  <tr key={l} style={{borderBottom:"1px solid #1a2035"}}>
                    <td style={{padding:"6px 8px",fontSize:12,color:"#94a3b8"}}>{l}</td>
                    <td style={{padding:"6px 8px",fontSize:12,color:"#2563eb",textAlign:"right"}}>{data.bilance[pk]||"—"}</td>
                    <td style={{padding:"6px 8px",fontSize:12,color:"#10b981",textAlign:"right"}}>{data.bilance[sk]||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{background:"#080b12",borderRadius:8,padding:12,marginBottom:12,display:"flex",gap:12}}>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>PLÁN</div>
                <div style={{fontSize:18,fontWeight:800,color:"#2563eb"}}>{data.bilance.planMarzePct||"—"} %</div>
                <div style={{fontSize:11,color:"#475569"}}>{data.bilance.planMarzeKc||"—"} Kč</div>
              </div>
              <div style={{width:1,background:"#1a2035"}}/>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>SKUTEČNOST</div>
                <div style={{fontSize:18,fontWeight:800,color:"#10b981"}}>{data.bilance.skutMarzePct||"—"} %</div>
                <div style={{fontSize:11,color:"#475569"}}>{data.bilance.skutMarzeKc||"—"} Kč</div>
              </div>
            </div>
            <div style={S.div}/>
            <button style={{...S.btn("#10b981"),width:"100%",marginBottom:12}} onClick={nacistSkutecneNaklady} disabled={nakladySyncing}>
              {nakladySyncing?"⏳ Načítám...":"🔄 Načíst plán ze Zakázky a skutečnost z Nákladů"}
            </button>
            <div style={{fontSize:11,fontWeight:700,color:"#475569",textTransform:"uppercase",marginBottom:8}}>Zadat skutečné náklady</div>
            <EF label="Materiál skutečný (Kč)"  value={data.bilance.skutMaterialNaklad} onChange={v=>upd("bilance","skutMaterialNaklad",v)}/>
            <EF label="Práce skutečná (Kč)"     value={data.bilance.skutPraceNaklad}    onChange={v=>upd("bilance","skutPraceNaklad",v)}/>
            <EF label="Doprava skutečná (Kč)"   value={data.bilance.skutDopravaNaklad}  onChange={v=>upd("bilance","skutDopravaNaklad",v)}/>
            <EF label="Celkem náklad (Kč)"      value={data.bilance.skutCelkemNaklad}   onChange={v=>upd("bilance","skutCelkemNaklad",v)}/>
            <EF label="Marže skutečná (%)"      value={data.bilance.skutMarzePct}       onChange={v=>upd("bilance","skutMarzePct",v)}/>
            <EF label="Marže skutečná (Kč)"     value={data.bilance.skutMarzeKc}        onChange={v=>upd("bilance","skutMarzeKc",v)}/>
            <div style={S.div}/>
            <EF label="Poznámky k odchylkám"    value={data.bilance.odchylkaPoznamka}   onChange={v=>upd("bilance","odchylkaPoznamka",v)} multi/>
          </div>
        </div>

        {/* ROZŠÍŘENÍ */}
        <div id="s-rozsireni" style={{...S.card(false,"#8b5cf6"),maxWidth:340,minWidth:340}}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="rozsireni")} stav={st.rozsireni||"Čeká"} onStav={v=>updStav("rozsireni",v)}/>
          <div style={S.body}>
            {(data.rozsireni||[]).length===0&&<div style={{color:"#334155",fontSize:13,textAlign:"center",padding:"16px 0"}}>Žádná rozšíření</div>}
            {(data.rozsireni||[]).map((r,i)=>(
              <div key={r.id} style={{...S.sCard,borderLeft:"3px solid #8b5cf6"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#8b5cf6"}}>Rozšíření #{i+1}</span>
                  <button onClick={()=>delArr("rozsireni",r.id)} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:14}}>×</button>
                </div>
                <EF label="Datum"            value={r.datum}    onChange={v=>updArr("rozsireni",r.id,"datum",v)}/>
                <EF label="Technik"          value={r.technik}  onChange={v=>updArr("rozsireni",r.id,"technik",v)}/>
                <EF label="Popis rozšíření"  value={r.popis}    onChange={v=>updArr("rozsireni",r.id,"popis",v)} multi/>
                <EF label="SN nového dílu"   value={r.sn}       onChange={v=>updArr("rozsireni",r.id,"sn",v)} mono/>
                <EF label="Cena (Kč)"        value={r.cena}     onChange={v=>updArr("rozsireni",r.id,"cena",v)}/>
              </div>
            ))}
            <button style={{...S.btn("#8b5cf6"),width:"100%",marginTop:6}} onClick={()=>addArr("rozsireni",{datum:"",technik:"",popis:"",sn:"",cena:""})}>+ Přidat rozšíření</button>
          </div>
        </div>

        {/* FOTODOKUMENTACE */}
        <div id="s-fotky" style={{...S.card(false,"#06b6d4"),maxWidth:340,minWidth:340}}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="fotky")} stav={st.fotky||"Čeká"} onStav={v=>updStav("fotky",v)}/>
          <div style={S.body}>
            <div style={{background:"#080b12",borderRadius:10,padding:12,marginBottom:14,border:"1px solid #1a2035"}}>
              <div style={{fontWeight:700,color:"#fff",fontSize:13,marginBottom:8}}>☁️ OneDrive složka</div>
              <EF label="Odkaz na OneDrive" value={data.fotky.onedrive} onChange={v=>upd("fotky","onedrive",v)}/>
              {data.fotky.onedrive?.startsWith("http")&&(
                <a href={data.fotky.onedrive} target="_blank" rel="noopener noreferrer"
                  style={{display:"inline-flex",alignItems:"center",gap:6,background:"#06b6d422",color:"#06b6d4",borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:700,textDecoration:"none"}}>
                  🔗 Otevřít OneDrive →
                </a>
              )}
            </div>
            {FOTO_KATEGORIE.map(kat=>{
              const fc=(data.fotky.nahrane||[]).filter(f=>f.kategorie===kat);
              const busy=fotoUploading[kat]>0;
              return(
                <div key={kat} style={{marginBottom:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>{kat} ({fc.length})</div>
                  {fc.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                    {fc.map(f=>(
                      <div key={f.id} style={{borderRadius:8,overflow:"hidden",border:"1px solid #1a2035",position:"relative"}}>
                        <a href={f.link||f.url} target="_blank" rel="noreferrer">
                          <img src={f.url} alt={f.name} style={{width:"100%",height:70,objectFit:"cover",display:"block"}}/>
                        </a>
                        <button onClick={()=>setData(d=>({...d,fotky:{...d.fotky,nahrane:(d.fotky.nahrane||[]).filter(x=>x.id!==f.id)}}))}
                          style={{position:"absolute",top:3,right:3,background:"#ef444488",border:"none",borderRadius:4,color:"#fff",cursor:"pointer",fontSize:10,padding:"1px 5px"}}>×</button>
                      </div>
                    ))}
                  </div>}
                  <label style={{display:"inline-flex",alignItems:"center",gap:5,background:busy?"#0ea5e922":"#1a2035",color:busy?"#0ea5e9":"#475569",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:busy?"default":"pointer",border:"1px dashed #252d45"}}>
                    {busy?`⏳ Nahrávám na OneDrive (${fotoUploading[kat]})...`:"+ Přidat foto"}
                    <input type="file" accept="image/*" multiple disabled={busy} style={{display:"none"}} onChange={e=>{
                      const files=Array.from(e.target.files);
                      e.target.value="";
                      handleFotoUpload(kat, files);
                    }}/>
                  </label>
                </div>
              );
            })}
            <div style={S.div}/>
            <EF label="Poznámka" value={data.fotky.poznamka} onChange={v=>upd("fotky","poznamka",v)} multi/>
          </div>
        </div>

        {/* DOKUMENTY */}
        <div id="s-dokumenty" style={{...S.card(false,"#64748b"),maxWidth:340,minWidth:340}}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="dokumenty")} stav={st.dokumenty||"Čeká"} onStav={v=>updStav("dokumenty",v)}/>
          <div style={S.body}>
            {[
              {key:"smlouva",       label:"Smlouva o dodání FVE",       icon:"✍️", gen:true},
              {key:"plnaMoc",       label:"Plná moc",                   icon:"⚖️", gen:true},
              {key:"predavaci",     label:"Předávací protokol FVE",     icon:"✅", gen:true},
              {key:"protokolOchr",  label:"Protokol nastavení ochran",  icon:"🔧", gen:true},
              {key:"instalacniVM",  label:"Instalační dokument VM A1",  icon:"🏭", gen:false},
              {key:"zadostPripojeni",label:"Žádost o připojení k DS",  icon:"🔌", gen:false},
              {key:"revize",        label:"Revizní zpráva",             icon:"📋", gen:false},
            ].map(doc=>{
              const d2=data.dokumenty[doc.key]||{stav:"ceka",datum:"",poznamka:""};
              const sc=STAV_DOC[d2.stav]||STAV_DOC.ceka;
              const updD=(k,v)=>setData(d=>({...d,dokumenty:{...d.dokumenty,[doc.key]:{...d.dokumenty[doc.key],[k]:v}}}));
              return(
                <div key={doc.key} style={{...S.sCard,border:`1px solid ${sc.color}33`,marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:15}}>{doc.icon}</span>
                      <span style={{fontSize:12,fontWeight:600,color:"#e2e8f0"}}>{doc.label}</span>
                    </div>
                    <select value={d2.stav} onChange={e=>updD("stav",e.target.value)}
                      style={{background:sc.color+"22",color:sc.color,border:`1px solid ${sc.color}44`,borderRadius:6,padding:"2px 6px",fontSize:10,fontWeight:700,cursor:"pointer",outline:"none"}}>
                      {Object.entries(STAV_DOC).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <input style={{...S.inp,padding:"5px 8px",fontSize:12,flex:1}} placeholder="Datum..." value={d2.datum} onChange={e=>updD("datum",e.target.value)}/>
                    {doc.gen&&<button style={{...S.btn(),padding:"5px 10px",fontSize:11,flexShrink:0}}>⬇️ Gen.</button>}
                  </div>
                  {!doc.gen&&<input style={{...S.inp,marginTop:6,padding:"5px 8px",fontSize:11,color:"#475569"}} placeholder="Poznámka..." value={d2.poznamka} onChange={e=>updD("poznamka",e.target.value)}/>}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,paddingTop:8,borderTop:"1px solid #1a2035"}}>
                    <label style={{display:"inline-flex",alignItems:"center",gap:5,background:docUploading===doc.key?"#0ea5e922":"#1a2035",color:docUploading===doc.key?"#0ea5e9":"#475569",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:docUploading===doc.key?"default":"pointer",border:"1px dashed #252d45",flexShrink:0}}>
                      {docUploading===doc.key?"⏳ Nahrávám...":(d2.soubor?"🔁 Nahradit":"📎 Nahrát soubor")}
                      <input type="file" disabled={docUploading===doc.key} style={{display:"none"}} onChange={e=>{const f=e.target.files[0];e.target.value="";handleDokUpload(doc.key,f);}}/>
                    </label>
                    {d2.soubor&&<a href={d2.soubor.link} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#60a5fa",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📄 {d2.soubor.name}</a>}
                  </div>
                </div>
              );
            })}
            {(data.dokumenty.extra||[]).map((doc,i)=>(
              <div key={doc.id} style={{...S.sCard,border:"1px solid #1a2035"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#475569"}}>Dokument #{i+1}</span>
                  <button onClick={()=>setData(d=>({...d,dokumenty:{...d.dokumenty,extra:d.dokumenty.extra.filter(x=>x.id!==doc.id)}}))}
                    style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:13}}>×</button>
                </div>
                <input style={{...S.inp,marginBottom:6}} placeholder="Název dokumentu..."
                  value={doc.nazev} onChange={e=>setData(d=>({...d,dokumenty:{...d.dokumenty,extra:d.dokumenty.extra.map(x=>x.id===doc.id?{...x,nazev:e.target.value}:x)}}))}/>
                <input style={{...S.inp,fontSize:11,color:"#475569"}} placeholder="Poznámka..."
                  value={doc.poznamka} onChange={e=>setData(d=>({...d,dokumenty:{...d.dokumenty,extra:d.dokumenty.extra.map(x=>x.id===doc.id?{...x,poznamka:e.target.value}:x)}}))}/>
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,paddingTop:8,borderTop:"1px solid #1a2035"}}>
                  <label style={{display:"inline-flex",alignItems:"center",gap:5,background:docUploading==="extra-"+doc.id?"#0ea5e922":"#1a2035",color:docUploading==="extra-"+doc.id?"#0ea5e9":"#475569",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:docUploading==="extra-"+doc.id?"default":"pointer",border:"1px dashed #252d45",flexShrink:0}}>
                    {docUploading==="extra-"+doc.id?"⏳ Nahrávám...":(doc.soubor?"🔁 Nahradit":"📎 Nahrát soubor")}
                    <input type="file" disabled={docUploading==="extra-"+doc.id} style={{display:"none"}} onChange={e=>{const f=e.target.files[0];e.target.value="";handleExtraDokUpload(doc.id,f);}}/>
                  </label>
                  {doc.soubor&&<a href={doc.soubor.link} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#60a5fa",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📄 {doc.soubor.name}</a>}
                </div>
              </div>
            ))}
            <button style={{...S.btn("#334155"),width:"100%",marginTop:4}}
              onClick={()=>setData(d=>({...d,dokumenty:{...d.dokumenty,extra:[...(d.dokumenty.extra||[]),{id:Date.now(),nazev:"",stav:"ceka",datum:"",poznamka:""}]}}))}>
              + Přidat dokument
            </button>
          </div>
        </div>

        {/* SERVIS */}
        <div id="s-servis" style={{...S.card(false,"#ec4899"),maxWidth:340,minWidth:340}}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="servis")} stav={st.servis||"Čeká"} onStav={v=>updStav("servis",v)}/>
          <div style={S.body}>
            {(data.servis||[]).length===0&&<div style={{color:"#334155",fontSize:13,textAlign:"center",padding:"16px 0"}}>Žádné servisní zásahy</div>}
            {(data.servis||[]).map((z,i)=>(
              <div key={z.id} style={{...S.sCard,borderLeft:"3px solid #ec4899"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#ec4899"}}>Zásah #{i+1}</span>
                  <button onClick={()=>delArr("servis",z.id)} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:14}}>×</button>
                </div>
                <EF label="Datum"           value={z.datum}        onChange={v=>updArr("servis",z.id,"datum",v)}/>
                <EF label="Technik"         value={z.technik}      onChange={v=>updArr("servis",z.id,"technik",v)}/>
                <EF label="Popis problému"  value={z.problem}      onChange={v=>updArr("servis",z.id,"problem",v)} multi/>
                <EF label="Řešení"          value={z.reseni}       onChange={v=>updArr("servis",z.id,"reseni",v)} multi/>
                <EF label="Vyměněné díly"   value={z.vymeneneDily} onChange={v=>updArr("servis",z.id,"vymeneneDily",v)}/>
                <EF label="SN nového dílu"  value={z.snNovehoDilu} onChange={v=>updArr("servis",z.id,"snNovehoDilu",v)} mono/>
              </div>
            ))}
            <button style={{...S.btn("#ec4899"),width:"100%",marginTop:6}} onClick={()=>addArr("servis",{datum:"",technik:"",problem:"",reseni:"",vymeneneDily:"",snNovehoDilu:""})}>+ Přidat servisní zásah</button>
          </div>
        </div>

      </div>
    </div>
  );
}
