import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import { uploadFileObject, zakazkaFolderPath, isConnected, getDirectDownloadUrl } from "./onedrive.js";

const STAV_DOC = { ceka: { label: "Čeká", color: "#475569" }, vyplnen: { label: "Vyplněn", color: "#f59e0b" }, odeslan: { label: "Odeslán", color: "#0369a1" }, podepsan: { label: "Podepsán", color: "#16a34a" } };
// Formátování peněžních částek jednotně s tisícovými oddělovači, jako všude jinde v appce.
const fmtKc = (v) => { const n = Number(v); return (!v || isNaN(n)) ? "—" : n.toLocaleString("cs-CZ") + " Kč"; };
const fmtDateSheet = (v) => { if (!v) return "—"; try { return new Date(v + "T00:00:00").toLocaleDateString("cs-CZ"); } catch { return v; } };
export const FOTO_KATEGORIE = ["Před montáží","Průběh montáže","Po montáži","Detail střídač/baterie","Předávací protokol","Servis"];
const SEKCE = [
  { id: "zakaznik",  icon: "👤", label: "Zákazník",         barva: "#6366f1" },
  { id: "nabidka",   icon: "📋", label: "Nabídka",          barva: "#0369a1" },
  { id: "smlouva",   icon: "✍️", label: "Smlouva",          barva: "#7c3aed" },
  { id: "system",    icon: "⚡", label: "Systém",             barva: "#f59e0b" },
  { id: "zaruky",    icon: "🛡️", label: "Záruky",             barva: "#06b6d4" },
  { id: "montaz",    icon: "🔧", label: "Montáž",           barva: "#ef4444" },
  { id: "predani",   icon: "✅", label: "Předání",          barva: "#16a34a" },
  { id: "dotace",    icon: "🏛️", label: "Dotace",           barva: "#0ea5e9" },
  { id: "fakturace", icon: "💰", label: "Fakturace",        barva: "#F5821F" },
  { id: "bilance",   icon: "📊", label: "Ekonomika",        barva: "#10b981" },
  { id: "rozsireni", icon: "🔩", label: "Rozšíření",        barva: "#8b5cf6" },
  { id: "fotky",     icon: "📷", label: "Fotodokumentace",  barva: "#06b6d4" },
  { id: "dokumenty", icon: "📄", label: "Dokumenty",        barva: "#475569" },
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
  app: { fontFamily:"'DM Sans',sans-serif", background:"#f0f4f8", minHeight:"100vh", color:"#1A1A1A" },
  topBar: { background:"#ffffff", borderBottom:"1px solid #e2e8f0", padding:"12px 20px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:100 },
  scroll: { display:"flex", gap:14, padding:"16px 20px", overflowX:"auto", alignItems:"flex-start", minHeight:"calc(100vh - 110px)" },
  card: (a,barva) => ({ minWidth:310, maxWidth:310, background:"#ffffff", borderRadius:14, border:`1px solid ${a?barva:"#e2e8f0"}`, overflow:"hidden", flexShrink:0, transition:"border-color 0.15s" }),
  cH: (barva) => ({ background:barva+"18", padding:"12px 14px", borderBottom:"1px solid #e2e8f0", display:"flex", alignItems:"center", justifyContent:"space-between" }),
  body: { padding:14 },
  lbl: { fontSize:10, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:3 },
  val: { fontSize:13, color:"#1A1A1A", lineHeight:1.5 },
  inp: { background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:7, padding:"6px 10px", color:"#1A1A1A", fontSize:13, width:"100%", outline:"none", boxSizing:"border-box", resize:"none", fontFamily:"inherit" },
  btn: (c="#0369a1") => ({ background:c, color:"#fff", border:"none", borderRadius:7, padding:"6px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }),
  div: { borderBottom:"1px solid #e2e8f0", margin:"10px 0" },
  mono: { fontFamily:"monospace", fontSize:12, color:"#0369a1", background:"#1e3a5f22", borderRadius:4, padding:"2px 6px" },
  sCard: { background:"#f8fafc", borderRadius:8, padding:12, marginBottom:10, border:"1px solid #e2e8f0" },
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
            <button style={{...S.btn("#475569")}} onClick={()=>{setDr(value);setEd(false);}}>✕</button>
          </div>
        </div>
      ) : (
        <div style={{display:"flex",alignItems:"flex-start",gap:6,cursor:"pointer"}} onClick={()=>{setDr(value);setEd(true);}}>
          <div style={mono?S.mono:{...S.val,flex:1}}>{value||<span style={{color:"#64748b",fontStyle:"italic"}}>— klikni pro zápis —</span>}</div>
          <span style={{color:"#64748b",fontSize:11,flexShrink:0,paddingTop:2}}>✏️</span>
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

// Náhled fotky z OneDrive — natáhne si čerstvý přímý odkaz na obsah souboru
// (spolehlivé i tam, kde firemní tenant zakazuje anonymní sdílené odkazy).
// Když se to nepovede (starší fotka bez itemId, výpadek), spadne zpět na
// uložený sdílený odkaz.
function OneDriveThumb({ itemId, fallbackUrl, alt, style }) {
  const [src, setSrc] = useState(fallbackUrl);
  useEffect(() => {
    let zrusen = false;
    if (itemId) {
      getDirectDownloadUrl(itemId).then(url => { if (!zrusen && url) setSrc(url); });
    }
    return () => { zrusen = true; };
  }, [itemId]);
  return <img src={src} alt={alt} style={style} onError={() => { if (src !== fallbackUrl) setSrc(fallbackUrl); }} />;
}

function SekceHeader({ sekce, stav, onStav }) {
  return (
    <div style={S.cH(sekce.barva)}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:18}}>{sekce.icon}</span>
        <span style={{fontWeight:800,fontSize:14,color:sekce.barva}}>{sekce.label}</span>
      </div>
      <StavSekce val={stav} onChange={onStav}/>
    </div>
  );
}

// ─── Export do PDF (jen stažení, bez odesílání e-mailem) ───────────────────
// Stejná cesta jako u faktur — offscreen HTML → html2canvas → jsPDF, kvůli
// spolehlivé české diakritice. Dlouhý dokument (14 sekcí) se rozdělí na víc
// stran A4 podle výšky vykresleného obrázku.
async function safeImportSheet(loader) {
  try {
    return await loader();
  } catch {
    const reload = confirm("Aplikace byla mezitím aktualizována a je potřeba načíst stránku znovu, než půjde PDF vygenerovat. Načíst teď?");
    if (reload) window.location.reload();
    throw new Error("Stránka potřebuje obnovit (nová verze appky) — zkus to prosím znovu po načtení.");
  }
}

function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pdfField(label, value) {
  return `<div style="display:flex;gap:10px;padding:3px 0;border-bottom:1px solid #f1f5f9;font-size:11px;">
    <div style="width:190px;flex-shrink:0;color:#475569;font-weight:600;">${escHtml(label)}</div>
    <div style="flex:1;color:#0f172a;white-space:pre-wrap;">${escHtml(value) || "—"}</div>
  </div>`;
}

function pdfSection(sekce, innerHtml) {
  return `<div style="margin-bottom:20px;">
    <div style="background:${sekce.barva}18;border-left:4px solid ${sekce.barva};padding:7px 12px;font-weight:800;font-size:13px;color:#0f172a;margin-bottom:6px;">${sekce.icon} ${escHtml(sekce.label)}</div>
    ${innerHtml}
  </div>`;
}

const TYP_ZAKAZKY_LABEL = { fve: "FVE Systém", ohrev: "FVE Ohřev vody", elektro: "Elektroinstalace", hromosvod: "Hromosvod" };

const FIELD_LABELS = {
  zakaznik: { jmeno: "Jméno a příjmení", adresa: "Adresa", telefon: "Telefon", email: "E-mail", datumNarozeni: "Datum narození", ean: "EAN odběrného místa", distributor: "Distributor", pocetVlastniku: "Počet vlastníků", poznamka: "Poznámka" },
  nabidka: { cisloOP: "Číslo OP", sestava: "Sestava", oz: "Obchodní zástupce", datumNabidky: "Datum nabídky", platnostDo: "Platnost do", cenaSDph: "Cena s DPH (orientační)", dotace: "Dotace NMP", cenaPoOdecteni: "Cena po dotaci", poznamka: "Poznámka" },
  smlouva: { datumPodpisu: "Datum podpisu", zaloha: "Záloha (Kč)", datumZalohy: "Datum úhrady zálohy", terminRealizace: "Termín realizace", poznamka: "Poznámka" },
  system: { panelTyp: "Typ panelu", panelPocet: "Počet panelů (ks)", panelKwp: "Výkon (kWp)", stridacTyp: "Typ střídače", stridacSN: "SN střídače", stridacFirmware: "Firmware", baterieTyp: "Typ baterie", bateriePocet: "Počet baterií (ks)", baterieKwh: "Kapacita (kWh)", baterieSN: "SN baterií", bms: "BMS", backup: "Back-up", regulace: "Regulace", elmr: "ELMR úprava", rozvadecDC: "Rozvaděč DC", bojlerTyp: "Typ bojleru", bojlerObjem: "Objem (l)", bojlerKw: "Výkon topného tělesa", bojlerSN: "SN bojleru", rozvadecTyp: "Typ rozvaděče", rozvadecOkruhy: "Počet okruhů", rozvadecProud: "Jmenovitý proud", hromoJimac: "Typ jímací soustavy", hromoSvody: "Počet svodů", hromoUzemneni: "Typ uzemnění", poznamka: "Poznámka" },
  montaz: { datumMontaze: "Datum montáže", technici: "Technici", elektroHodiny: "Elektro (dny)", strechaHodiny: "Střecha (dny)", instalater: "Instalatér (dny)", doprava: "Doprava (km)", prubezhPoznamky: "Průběžné poznámky", poznamka: "Poznámka" },
  predani: { datumPredani: "Datum předání", technik: "Technik", protokolCislo: "Číslo protokolu", stavElektrarny: "Stav elektrárny", vadyBraniciUzivani: "Vady bránící užívání", vadyNebraniciUzivani: "Vady nebránící užívání", poznamka: "Poznámka" },
  dotace: { typ: "Typ dotace", kraj: "Kraj", datumPodani: "Datum podání", stav: "Stav žádosti", datumSchvaleni: "Datum schválení", datumVyplaceni: "Datum vyplacení", poznamka: "Poznámka" },
  fakturace: { zalohaFaktura: "Č. faktury (záloha)", zalohaKc: "Částka zálohy (Kč)", zalohaDatum: "Datum splatnosti zálohy", zalohaUhrazena: "Záloha uhrazena", doplatekFaktura: "Č. faktury (doplatek)", doplatekKc: "Částka doplatku (Kč)", doplatekDatum: "Datum splatnosti doplatku", doplatekUhrazen: "Doplatek uhrazen", poznamka: "Poznámka" },
};

function buildSheetHtmlBody(data, contractPhotos, contractInvoices, liveBilance) {
  const parts = [];

  parts.push(`<div style="font-size:20px;font-weight:800;color:#0f172a;margin-bottom:2px;">${escHtml(data._nazev || "Zakázka")}</div>
    <div style="font-size:11px;color:#475569;margin-bottom:18px;">Zakázkový list — export ${new Date().toLocaleDateString("cs-CZ")}</div>`);

  const simple = (id) => {
    const vals = data[id] || {};
    const labels = FIELD_LABELS[id];
    const html = Object.entries(labels).map(([k, l]) => pdfField(l, vals[k])).join("");
    return pdfSection(SEKCE.find(s => s.id === id), html);
  };

  parts.push(simple("zakaznik"));
  parts.push(simple("nabidka"));
  parts.push(simple("smlouva"));

  {
    const sys = data.system || {};
    let html = pdfField("Typ zakázky", TYP_ZAKAZKY_LABEL[sys.typZakazky] || sys.typZakazky);
    html += Object.entries(FIELD_LABELS.system).filter(([k]) => sys[k]).map(([k, l]) => pdfField(l, sys[k])).join("");
    if ((sys.elektroPolozky || []).length > 0) {
      html += `<div style="margin-top:8px;font-weight:700;font-size:11px;color:#475569;">Instalované technologie</div>`;
      html += sys.elektroPolozky.map((p, i) => pdfField(`#${i + 1} ${p.nazev || ""}`, p.popis)).join("");
    }
    if ((sys.hromoPolozky || []).length > 0) {
      html += `<div style="margin-top:8px;font-weight:700;font-size:11px;color:#475569;">Instalované komponenty</div>`;
      html += sys.hromoPolozky.map((p, i) => pdfField(`#${i + 1} ${p.nazev || ""}`, p.popis)).join("");
    }
    parts.push(pdfSection(SEKCE.find(s => s.id === "system"), html));
  }

  {
    const zaruky = data.zaruky || [];
    const html = zaruky.length === 0 ? `<div style="color:#64748b;font-size:11px;">Žádné záruky</div>` : zaruky.map(z => {
      const instalace = z.datumInstalace ? new Date(z.datumInstalace.split(".").reverse().join("-")) : null;
      const vyprseni = instalace ? new Date(instalace.getFullYear() + Number(z.delkaLet || 0), instalace.getMonth(), instalace.getDate()) : null;
      return `<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;">
        <div style="font-weight:700;font-size:12px;color:#0f172a;">${escHtml(z.nazev || "Záruka")}</div>
        ${pdfField("Datum instalace", z.datumInstalace)}
        ${pdfField("Délka záruky", z.delkaLet ? z.delkaLet + " let" : "")}
        ${pdfField("Vyprší", vyprseni ? vyprseni.toLocaleDateString("cs-CZ") : "")}
        ${pdfField("Poznámka", z.poznamka)}
      </div>`;
    }).join("");
    parts.push(pdfSection(SEKCE.find(s => s.id === "zaruky"), html));
  }

  parts.push(simple("montaz"));
  parts.push(simple("predani"));
  parts.push(simple("dotace"));

  {
    const invoices = contractInvoices || [];
    let html = invoices.length === 0
      ? `<div style="color:#64748b;font-size:11px;">Zatím žádná faktura k této zakázce</div>`
      : invoices.map(inv => pdfField(
          `${inv.number} (${inv.invoice_type === "přijatá" ? "přijatá" : "vydaná"})`,
          `${inv.status} · splatnost ${fmtDateSheet(inv.due)} · ${fmtKc(inv.amount)}`
        )).join("");
    html += pdfField("Poznámka", (data.fakturace || {}).poznamka);
    parts.push(pdfSection(SEKCE.find(s => s.id === "fakturace"), html));
  }

  {
    const b = liveBilance || {};
    const rows = [["Materiál", "planMaterialNaklad", "skutMaterialNaklad"], ["Práce", "planPraceNaklad", "skutPraceNaklad"], ["Doprava", "planDopravaNaklad", "skutDopravaNaklad"], ["Celkem náklad", "planCelkemNaklad", "skutCelkemNaklad"], ["Prodejní cena (bez DPH)", "planProdejBezDph", "skutProdejBezDph"]];
    let html = `<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;">
      <tr><th style="text-align:left;padding:4px 6px;border-bottom:1px solid #cbd5e1;color:#475569;">Položka</th><th style="text-align:right;padding:4px 6px;border-bottom:1px solid #cbd5e1;color:#0369a1;">Plán</th><th style="text-align:right;padding:4px 6px;border-bottom:1px solid #cbd5e1;color:#10b981;">Skutečnost</th></tr>
      ${rows.map(([l, pk, sk]) => `<tr><td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;">${l}</td><td style="padding:4px 6px;text-align:right;border-bottom:1px solid #f1f5f9;">${fmtKc(b[pk])}</td><td style="padding:4px 6px;text-align:right;border-bottom:1px solid #f1f5f9;">${fmtKc(b[sk])}</td></tr>`).join("")}
    </table>`;
    html += pdfField("Marže plán", (b.planMarzePct ?? "—") + " % / " + fmtKc(b.planMarzeKc));
    html += pdfField("Marže skutečnost", (b.skutMarzePct ?? "—") + " % / " + fmtKc(b.skutMarzeKc));
    html += pdfField("Poznámky k odchylkám", (data.bilance || {}).odchylkaPoznamka);
    parts.push(pdfSection(SEKCE.find(s => s.id === "bilance"), html));
  }

  {
    const items = data.rozsireni || [];
    const html = items.length === 0 ? `<div style="color:#64748b;font-size:11px;">Žádná rozšíření</div>` : items.map((r, i) => `<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;">
      <div style="font-weight:700;font-size:12px;color:#0f172a;">Rozšíření #${i + 1}</div>
      ${pdfField("Datum", r.datum)}${pdfField("Technik", r.technik)}${pdfField("Popis", r.popis)}${pdfField("SN nového dílu", r.sn)}${pdfField("Cena", r.cena ? fmtKc(r.cena) : "")}
    </div>`).join("");
    parts.push(pdfSection(SEKCE.find(s => s.id === "rozsireni"), html));
  }

  {
    const fotky = data.fotky || {};
    const allPhotos = contractPhotos || [];
    let html = pdfField("Odkaz na OneDrive", fotky.onedrive);
    if (allPhotos.length > 0) html += pdfField("Celkem nahráno", allPhotos.length + " fotek");
    FOTO_KATEGORIE.forEach(kat => {
      const fc = allPhotos.filter(f => f.category === kat);
      if (fc.length > 0) html += pdfField(kat, fc.length + " fotek");
    });
    const nezarazene = allPhotos.filter(f => !f.category || !FOTO_KATEGORIE.includes(f.category));
    if (nezarazene.length > 0) html += pdfField("Ostatní", nezarazene.length + " fotek");
    html += pdfField("Poznámka", fotky.poznamka);
    parts.push(pdfSection(SEKCE.find(s => s.id === "fotky"), html));
  }

  {
    const dok = data.dokumenty || {};
    const list = [
      { key: "smlouva", label: "Smlouva o dodání FVE" },
      { key: "plnaMoc", label: "Plná moc" },
      { key: "predavaci", label: "Předávací protokol FVE" },
      { key: "protokolOchr", label: "Protokol nastavení ochran" },
      { key: "instalacniVM", label: "Instalační dokument VM A1" },
      { key: "zadostPripojeni", label: "Žádost o připojení k DS" },
      { key: "revize", label: "Revizní zpráva" },
    ];
    let html = list.map(doc => {
      const d2 = dok[doc.key] || { stav: "ceka", datum: "" };
      const stav = STAV_DOC[d2.stav]?.label || "Čeká";
      return pdfField(doc.label, `${stav}${d2.datum ? " · " + d2.datum : ""}${d2.soubor ? " · soubor: " + d2.soubor.name : ""}`);
    }).join("");
    (dok.extra || []).forEach(doc => { html += pdfField(doc.nazev || "Dokument", `${doc.poznamka || ""}${doc.soubor ? " · soubor: " + doc.soubor.name : ""}`); });
    parts.push(pdfSection(SEKCE.find(s => s.id === "dokumenty"), html));
  }

  {
    const items = data.servis || [];
    const html = items.length === 0 ? `<div style="color:#64748b;font-size:11px;">Žádné servisní zásahy</div>` : items.map((z, i) => `<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;">
      <div style="font-weight:700;font-size:12px;color:#0f172a;">Zásah #${i + 1}</div>
      ${pdfField("Datum", z.datum)}${pdfField("Technik", z.technik)}${pdfField("Popis problému", z.problem)}${pdfField("Řešení", z.reseni)}${pdfField("Vyměněné díly", z.vymeneneDily)}${pdfField("SN nového dílu", z.snNovehoDilu)}
    </div>`).join("");
    parts.push(pdfSection(SEKCE.find(s => s.id === "servis"), html));
  }

  return `<div style="font-family:'DM Sans',Arial,sans-serif;padding:28px;background:#fff;color:#0f172a;">${parts.join("")}</div>`;
}

async function exportSheetPdf(data, contractPhotos, contractInvoices, liveBilance) {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    safeImportSheet(() => import("jspdf")), safeImportSheet(() => import("html2canvas")),
  ]);
  const html2canvas = html2canvasMod.default;

  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "0";
  el.style.width = `${(595.27 * 4 / 3).toFixed(2)}px`;
  el.style.background = "#fff";
  el.innerHTML = buildSheetHtmlBody(data, contractPhotos, contractInvoices, liveBilance);

  document.body.appendChild(el);
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = 210, pageHeight = 297;
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height / canvas.width) * imgWidth;
    const imgData = canvas.toDataURL("image/png");
    let heightLeft = imgHeight, position = 0;
    doc.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      doc.addPage();
      doc.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    doc.save(`Zakazkovy-list-${(data._nazev || "zakazka").replace(/[^\w-]+/g, "_")}.pdf`);
  } finally {
    document.body.removeChild(el);
  }
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
  const [contractPhotos, setContractPhotos] = useState([]); // fotky nahrané přímo u zakázky (záložka Zakázky)
  const [contractInvoices, setContractInvoices] = useState([]); // skutečné faktury k zakázce (modul Fakturace)
  const [contractCostEntries, setContractCostEntries] = useState([]); // skutečné náklady zakázky (záložka Náklady)
  const [contractDeliveryNotes, setContractDeliveryNotes] = useState([]); // dodací listy zakázky (materiál + marže)
  const [contractDNItems, setContractDNItems] = useState([]); // položky dodacích listů
  const [contractBudget, setContractBudget] = useState(null); // plánovaný rozpočet a cena ze Zakázky
  const [savedSnapshot, setSavedSnapshot] = useState(null); // poslední uložený stav — pro varování při odchodu s neuloženými změnami
  const [linkedCustomer, setLinkedCustomer] = useState(null); // zákazník napojený na zakázku (z modulu Zákazníci)
  const [pdfExporting, setPdfExporting] = useState(false);

  const isDirty = () => data && savedSnapshot !== null && JSON.stringify(data) !== savedSnapshot;
  const confirmLeave = () => !isDirty() || confirm("V zakázkovém listu máš neuložené změny. Opravdu odejít bez uložení?");
  const goBack = () => { if (!confirmLeave()) return; setData(null); setActiveCId(null); setSavedSnapshot(null); setLinkedCustomer(null); };

  // Fakturace a Ekonomika v zakázkovém listu dřív byly ručně přepisovaná
  // čísla, oddělená od skutečných faktur a od živého výpočtu marže v
  // Zakázkách — snadno se rozjela od reality. Teď se při každém otevření
  // listu natáhnou živá data (faktury, náklady zakázky, plán) a sekce se
  // z nich jen dopočítají — nic se neukládá jako zamrzlý snímek.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!activeCId) { setContractInvoices([]); setContractCostEntries([]); setContractDeliveryNotes([]); setContractDNItems([]); setContractBudget(null); return; }
    supabase.from("invoices").select("id, number, amount, status, issued, due, invoice_type").eq("contract_id", activeCId).order("issued", { ascending: false })
      .then(({ data: d }) => setContractInvoices(d || []));
    supabase.from("contract_cost_entries").select("cost_type, amount_cost, quantity, unit_price_cost").eq("contract_id", activeCId)
      .then(({ data: d }) => setContractCostEntries(d || []));
    supabase.from("delivery_notes").select("id, margin").eq("contract_id", activeCId)
      .then(({ data: d }) => {
        const notes = d || [];
        setContractDeliveryNotes(notes);
        const ids = notes.map(n => n.id);
        if (ids.length === 0) { setContractDNItems([]); return; }
        supabase.from("delivery_note_items").select("delivery_note_id, quantity, unit_price").in("delivery_note_id", ids)
          .then(({ data: di }) => setContractDNItems(di || []));
      });
    supabase.from("contracts").select("price, budget_prace, budget_material, budget_doprava").eq("id", activeCId).single()
      .then(({ data: d }) => setContractBudget(d || null));
  }, [activeCId]);

  // Živý dopočet plánu a skutečnosti — stejná logika jako záložka Finance
  // v Zakázkách (contract_cost_entries = skutečné náklady, budget_* =
  // plán), jen prodejní cena skutečnosti se navíc bere ze součtu vydaných
  // faktur k zakázce místo ručního zadání.
  const costOf = (e) => e.amount_cost != null ? Number(e.amount_cost) : Number(e.quantity || 1) * Number(e.unit_price_cost || 0);
  const sumCostBy = (typ) => contractCostEntries.filter(e => e.cost_type === typ).reduce((s, e) => s + costOf(e), 0);
  // Materiál z dodacích listů se dřív do marže zakázky vůbec nepočítal (ani
  // náklad, ani prodejní cena) — stejná chyba, jaká byla opravena v
  // Contracts.jsx u contractProfit(). Tady se počítá symetricky: náklad jde
  // do skutMaterial, prodejní cena (náklad + marže dodacího listu) jde do
  // skutProdej, aby marže ze zakázky odpovídala skutečnosti.
  const dnMaterialCost = contractDNItems.reduce((s, i) => s + Number(i.quantity || 1) * Number(i.unit_price || 0), 0);
  const dnMaterialClient = contractDeliveryNotes.reduce((s, n) => {
    const cost = contractDNItems.filter(i => i.delivery_note_id === n.id).reduce((sum, i) => sum + Number(i.quantity || 1) * Number(i.unit_price || 0), 0);
    return s + cost * (1 + Number(n.margin || 30) / 100);
  }, 0);
  const skutMaterial = sumCostBy("materiál") + dnMaterialCost, skutPrace = sumCostBy("práce"), skutDoprava = sumCostBy("doprava");
  const skutCelkem = skutMaterial + skutPrace + skutDoprava;
  const vydaneFaktury = contractInvoices.filter(i => (i.invoice_type || "vydaná") === "vydaná" && i.status !== "Storno");
  const fakturovano = vydaneFaktury.reduce((s, i) => s + Number(i.amount || 0), 0);
  const skutProdej = (fakturovano || Number(contractBudget?.price) || 0) + dnMaterialClient;
  const skutMarzeKc = skutProdej ? skutProdej - skutCelkem : null;
  const skutMarzePct = skutProdej ? Math.round((skutMarzeKc / skutProdej) * 1000) / 10 : null;
  const planMaterial = Number(contractBudget?.budget_material) || 0;
  const planPrace = Number(contractBudget?.budget_prace) || 0;
  const planDoprava = Number(contractBudget?.budget_doprava) || 0;
  const planCelkem = planMaterial + planPrace + planDoprava;
  const planProdej = Number(contractBudget?.price) || 0;
  const planMarzeKc = planProdej ? planProdej - planCelkem : null;
  const planMarzePct = planProdej ? Math.round((planMarzeKc / planProdej) * 1000) / 10 : null;
  const liveBilance = {
    planMaterialNaklad: planMaterial, planPraceNaklad: planPrace, planDopravaNaklad: planDoprava, planCelkemNaklad: planCelkem, planProdejBezDph: planProdej,
    planMarzeKc, planMarzePct,
    skutMaterialNaklad: skutMaterial, skutPraceNaklad: skutPrace, skutDopravaNaklad: skutDoprava, skutCelkemNaklad: skutCelkem, skutProdejBezDph: skutProdej,
    skutMarzeKc, skutMarzePct,
  };
  const fmtDate = fmtDateSheet;
  const INV_STAV_BARVA = { Zaplacena: "#16a34a", Čeká: "#f59e0b", "Po splatnosti": "#ef4444", Storno: "#64748b" };

  // Fotky uložené u zakázky (contract_photos) se mají zobrazit i v zakázkovém listu
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!activeCId) { setContractPhotos([]); return; }
    supabase.from("contract_photos").select("*").eq("contract_id", activeCId).order("date", { ascending: false })
      .then(({ data: d }) => setContractPhotos(d || []));
  }, [activeCId]);

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

  // Najde zákazníka napojeného na zakázku (přes contracts.customer_id) a u nové,
  // ještě neuložené karty jím předvyplní prázdná pole v sekci Zákazník — omezuje
  // riziko, že se jméno/telefon rozejdou mezi CRM a zakázkovým listem.
  const loadLinkedCustomer = async (contractId, isNewSheet) => {
    const { data: contract } = await supabase.from("contracts").select("customer_id").eq("id", contractId).single();
    const cust = contract?.customer_id ? (customers || []).find(c => c.id === contract.customer_id) : null;
    setLinkedCustomer(cust || null);
    if (cust && isNewSheet) {
      setData(d => {
        if (!d) return d;
        const next = { ...d, zakaznik: {
          ...d.zakaznik,
          jmeno: d.zakaznik.jmeno || cust.name || "",
          adresa: d.zakaznik.adresa || cust.address || "",
          telefon: d.zakaznik.telefon || cust.phone || "",
          email: d.zakaznik.email || cust.email || "",
        } };
        setSavedSnapshot(JSON.stringify(next)); // předvyplnění se nepočítá jako neuložená změna
        return next;
      });
    }
  };

  const openSheet = async (contractId, contractName) => {
    const existing = sheets.find(s => s.project_id === contractId);
    if (existing) {
      setData(existing.data);
      setSheetId(existing.id);
      setSavedSnapshot(JSON.stringify(existing.data));
    } else {
      const d = { ...PRAZDNA_DATA, _nazev: contractName || "" };
      setData(d);
      setSheetId(null);
      setSavedSnapshot(JSON.stringify(d));
    }
    setActiveCId(contractId);
    loadLinkedCustomer(contractId, !existing);
  };

  const save = async () => {
    if (!activeCId || !data || saving) return; // blokace proti dvojkliku (dvojitý insert při prvním uložení)
    setSaving(true);
    try {
      if (sheetId) {
        const { error } = await supabase.from("project_sheets").update({ data, updated_at: new Date().toISOString() }).eq("id", sheetId);
        if (error) throw error;
      } else {
        const { data: row, error } = await supabase.from("project_sheets").insert({ project_id: activeCId, data }).select().single();
        if (error) throw error;
        if (row) { setSheetId(row.id); setSheets(s => [row, ...s]); }
      }
      setSavedSnapshot(JSON.stringify(data));
    } catch (e) {
      alert("Uložení zakázkového listu selhalo: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const upd = (sekce, key, val) => setData(d => ({ ...d, [sekce]: { ...d[sekce], [key]: val } }));
  const updStav = (sekce, val) => setData(d => ({ ...d, stavy: { ...d.stavy, [sekce]: val } }));
  const updArr = (sekce, id, key, val) => setData(d => ({ ...d, [sekce]: d[sekce].map(r => r.id === id ? { ...r, [key]: val } : r) }));
  const delArr = (sekce, id) => setData(d => ({ ...d, [sekce]: d[sekce].filter(r => r.id !== id) }));
  const addArr = (sekce, item) => setData(d => ({ ...d, [sekce]: [...(d[sekce] || []), { id: Date.now(), ...item }] }));

  // Datum montáže automaticky předvyplní počátek záruční doby u záruk, které
  // ještě žádné datum instalace nemají (aby se nemuselo zadávat dvakrát).
  const handleDatumMontaze = (v) => {
    setData(d => ({
      ...d,
      montaz: { ...d.montaz, datumMontaze: v },
      zaruky: (d.zaruky || []).map(z => (!z.datumInstalace && v) ? { ...z, datumInstalace: v } : z),
    }));
  };

  const handleExportPdf = async () => {
    if (!data) return;
    setPdfExporting(true);
    try {
      await exportSheetPdf(data, contractPhotos, contractInvoices, liveBilance);
    } catch (e) {
      alert("Export PDF selhal: " + e.message);
    } finally {
      setPdfExporting(false);
    }
  };

  // ─── Upload fotek — stejná tabulka (contract_photos) a stejná OneDrive
  // složka jako Docházka a záložka "Fotky" v Zakázkách, ať je vidět všechno
  // na jednom místě místo tří nepropojených evidencí. Ukládá se rovnou při
  // nahrání (ne až při uložení celého listu), takže fotka nezmizí, i kdyby
  // se list zavřel bez uložení.
  const handleFotoUpload = async (kategorie, files) => {
    if (!files || files.length === 0) return;
    setFotoUploading(u => ({ ...u, [kategorie]: (u[kategorie] || 0) + files.length }));
    for (const f of files) {
      try {
        let url, storagePath, itemId = null;
        if (isConnected()) {
          const res = await uploadFileObject(zakazkaFolderPath(data._nazev, "Fotky"), f);
          url = res.webUrl; itemId = res.itemId; storagePath = "onedrive:" + f.name;
        } else {
          // OneDrive momentálně nedostupný — fotka se místo blokace uloží do
          // Supabase Storage, stejně jako u Docházky, ať nezmizí.
          const ext = f.name.split(".").pop();
          const path = `${activeCId}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage.from("zakazky-fotky").upload(path, f);
          if (error) throw error;
          url = supabase.storage.from("zakazky-fotky").getPublicUrl(path).data.publicUrl;
          storagePath = path;
        }
        const { data: row, error: insErr } = await supabase.from("contract_photos").insert({
          contract_id: activeCId, date: new Date().toISOString().slice(0, 10),
          storage_path: storagePath, url, item_id: itemId, category: kategorie,
          uploaded_by: currentUser?.employeeId || null,
        }).select().single();
        if (insErr) throw insErr;
        if (row) setContractPhotos(prev => [row, ...prev]);
      } catch (e) {
        alert(`Nahrání fotky "${f.name}" selhalo: ${e.message}`);
      } finally {
        setFotoUploading(u => ({ ...u, [kategorie]: Math.max(0, (u[kategorie] || 1) - 1) }));
      }
    }
  };

  const removeContractPhoto = async (id) => {
    await supabase.from("contract_photos").delete().eq("id", id);
    setContractPhotos(prev => prev.filter(f => f.id !== id));
  };

  // ─── Upload dokumentu na OneDrive (FirmaCRM/Zakázky/[název]/Dokumenty) ─────
  const handleDokUpload = async (key, file) => {
    if (!file) return;
    if (!isConnected()) { alert("Nejdřív se připoj k OneDrive v záložce ☁️ OneDrive."); return; }
    setDocUploading(key);
    try {
      const { webUrl, itemId } = await uploadFileObject(zakazkaFolderPath(data._nazev, "Dokumenty"), file);
      setData(d => ({ ...d, dokumenty: { ...d.dokumenty, [key]: {
        ...d.dokumenty[key], soubor: { name: file.name, link: webUrl, itemId },
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
      const { webUrl, itemId } = await uploadFileObject(zakazkaFolderPath(data._nazev, "Dokumenty"), file);
      setData(d => ({ ...d, dokumenty: { ...d.dokumenty, extra: d.dokumenty.extra.map(x =>
        x.id === id ? { ...x, soubor: { name: file.name, link: webUrl, itemId } } : x
      ) } }));
    } catch (e) {
      alert(`Nahrání dokumentu "${file.name}" na OneDrive selhalo: ${e.message}`);
    } finally {
      setDocUploading(null);
    }
  };


  // Seznam listů (výběr zakázky)
  const filteredSheets = sheets.filter(s => !search || (s.data?._nazev || "").toLowerCase().includes(search.toLowerCase()));

  if (!data) return (
    <div style={S.app}>
      <div style={{ padding:24, maxWidth:700 }}>
        <h1 style={{ fontSize:22, fontWeight:800, color:"#1A1A1A", marginBottom:6 }}>📋 Listy zakázek</h1>
        <p style={{ color:"#475569", fontSize:13, marginBottom:20 }}>Otevři zakázkový list kliknutím na 📋 v záložce Zakázky, nebo vyber existující list níže.</p>
        <input style={{...S.inp, marginBottom:16, fontSize:14}} placeholder="Hledat zakázku..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filteredSheets.length === 0 && <div style={{color:"#64748b",fontSize:13}}>Žádné listy. Otevři zakázku a klikni na 📋.</div>}
          {filteredSheets.map(s=>(
            <div key={s.id} onClick={()=>{setData(s.data);setSheetId(s.id);setActiveCId(s.project_id);setSavedSnapshot(JSON.stringify(s.data));loadLinkedCustomer(s.project_id,false);}}
              style={{background:"#ffffff",borderRadius:12,padding:"14px 18px",border:"1px solid #e2e8f0",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:22}}>📋</span>
              <div>
                <div style={{fontWeight:700,color:"#1A1A1A",fontSize:14}}>{s.data?._nazev||"Zakázka #"+s.project_id}</div>
                <div style={{fontSize:11,color:"#475569",marginTop:2}}>Upraveno: {new Date(s.updated_at).toLocaleDateString("cs-CZ")}</div>
              </div>
              <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                {SEKCE.slice(0,5).map(sec=>(
                  <div key={sec.id} style={{width:8,height:8,borderRadius:"50%",background:s.data?.stavy?.[sec.id]==="Hotovo"?"#16a34a":s.data?.stavy?.[sec.id]==="Probíhá"?"#f59e0b":"#e2e8f0"}} title={sec.label}/>
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
        <button onClick={goBack} style={{...S.btn("#e2e8f0"),color:"#64748b",padding:"6px 12px"}}>← Zpět</button>
        <div>
          <div style={{fontWeight:800,fontSize:15,color:"#1A1A1A"}}>{data._nazev||"Nová zakázka"}</div>
          <div style={{fontSize:11,color:"#475569"}}>Zakázkový list</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",overflowX:"auto"}}>
          {SEKCE.map(s=>(
            <div key={s.id} onClick={()=>document.getElementById("s-"+s.id)?.scrollIntoView({behavior:"smooth",inline:"start",block:"nearest"})}
              style={{background:s.barva+"22",color:s.barva,borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,border:`1px solid ${s.barva}33`}}>
              {s.icon} {s.label}
            </div>
          ))}
          <button onClick={handleExportPdf} disabled={pdfExporting} style={{...S.btn(pdfExporting?"#475569":"#0369a1"),padding:"7px 16px",flexShrink:0,cursor:pdfExporting?"default":"pointer",opacity:pdfExporting?0.7:1}}>
            {pdfExporting?"⏳ Generuji...":"📄 Exportovat PDF"}
          </button>
          <button onClick={save} disabled={saving} style={{...S.btn(saving?"#475569":"#16a34a"),padding:"7px 18px",flexShrink:0,cursor:saving?"default":"pointer",opacity:saving?0.7:1}}>
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
            {linkedCustomer ? (
              <div style={{background:"#6366f114",border:"1px solid #6366f144",borderRadius:7,padding:"6px 10px",marginBottom:10,fontSize:11,color:"#6366f1"}}>
                🔗 Napojeno na zákazníka v CRM: <b>{linkedCustomer.name}</b>. Pole níže jsou samostatná kopie (kvůli historii) — při změně kontaktu uprav i záznam v modulu Zákazníci.
              </div>
            ) : (
              <div style={{background:"#f59e0b14",border:"1px solid #f59e0b44",borderRadius:7,padding:"6px 10px",marginBottom:10,fontSize:11,color:"#b45309"}}>
                ⚠️ Tato zakázka nemá napojeného zákazníka v CRM (nebo mu chybí customer_id). Pole níže jsou čistě volný text.
              </div>
            )}
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
        <div id="s-nabidka" style={S.card(false,"#0369a1")}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="nabidka")} stav={st.nabidka||"Čeká"} onStav={v=>updStav("nabidka",v)}/>
          <div style={S.body}>
            <EF label="Číslo OP"            value={data.nabidka.cisloOP}         onChange={v=>upd("nabidka","cisloOP",v)} mono/>
            <EF label="Sestava"             value={data.nabidka.sestava}         onChange={v=>upd("nabidka","sestava",v)}/>
            <EF label="Obchodní zástupce"   value={data.nabidka.oz}              onChange={v=>upd("nabidka","oz",v)}/>
            <EF label="Datum nabídky"       value={data.nabidka.datumNabidky}    onChange={v=>upd("nabidka","datumNabidky",v)}/>
            <EF label="Platnost do"         value={data.nabidka.platnostDo}      onChange={v=>upd("nabidka","platnostDo",v)}/>
            <div style={S.div}/>
            <EF label="Cena s DPH (Kč) — jen orientační z nabídky" value={data.nabidka.cenaSDph}        onChange={v=>upd("nabidka","cenaSDph",v)}/>
            <EF label="Dotace NMP (Kč)"    value={data.nabidka.dotace}          onChange={v=>upd("nabidka","dotace",v)}/>
            <EF label="Cena po dotaci (Kč)" value={data.nabidka.cenaPoOdecteni} onChange={v=>upd("nabidka","cenaPoOdecteni",v)}/>
            <div style={{fontSize:10,color:"#475569",marginTop:-4,marginBottom:10}}>Platná cena zakázky (bez DPH) je v sekci Ekonomika → „Prodejní cena – skutečnost".</div>
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
                    style={{background:(data.system.typZakazky||"fve")===t.id?"#f59e0b22":"#f8fafc", border:`1px solid ${(data.system.typZakazky||"fve")===t.id?"#f59e0b":"#e2e8f0"}`, borderRadius:8, padding:"6px 12px", color:(data.system.typZakazky||"fve")===t.id?"#f59e0b":"#475569", fontSize:12, fontWeight:600, cursor:"pointer"}}>
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
                <div key={p.id} style={{background:"#f8fafc",borderRadius:8,padding:10,marginBottom:8,border:"1px solid #e2e8f0"}}>
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
                <div key={p.id} style={{background:"#f8fafc",borderRadius:8,padding:10,marginBottom:8,border:"1px solid #e2e8f0"}}>
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
                <div key={z.id} style={{background:"#f8fafc",borderRadius:10,padding:12,marginBottom:10,border:`1px solid ${stav?.color||"#e2e8f0"}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#1A1A1A"}}>{z.nazev||`Záruka #${i+1}`}</span>
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
            <EF label="Datum montáže" value={data.montaz.datumMontaze}    onChange={handleDatumMontaze}/>
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

        {/* FAKTURACE — živý seznam skutečných faktur k zakázce, ne ruční přepis */}
        <div id="s-fakturace" style={S.card(false,"#F5821F")}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="fakturace")} stav={st.fakturace||"Čeká"} onStav={v=>updStav("fakturace",v)}/>
          <div style={S.body}>
            {contractInvoices.length===0 ? (
              <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Zatím žádná faktura k této zakázce. Vystaví se v modulu Fakturace (jde i rovnou ze zakázky).</div>
            ) : (
              <div style={{marginBottom:12}}>
                {contractInvoices.map(inv=>{
                  const barva = INV_STAV_BARVA[inv.status] || "#64748b";
                  return (
                    <div key={inv.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #e2e8f0"}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A"}}>{inv.number}</div>
                        <div style={{fontSize:11,color:"#64748b"}}>{inv.invoice_type==="přijatá"?"Přijatá":"Vydaná"} · splatnost {fmtDate(inv.due)}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A"}}>{fmtKc(inv.amount)}</div>
                        <span style={{fontSize:10,fontWeight:700,color:barva,background:barva+"22",borderRadius:5,padding:"1px 7px"}}>{inv.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={S.div}/>
            <EF label="Poznámka"      value={data.fakturace.poznamka}        onChange={v=>upd("fakturace","poznamka",v)} multi/>
          </div>
        </div>

        {/* EKONOMICKÁ BILANCE — živě dopočtená z faktur, nákladů zakázky a
            rozpočtu; nic tu není ruční přepis, který by se mohl rozejít od
            skutečnosti v Zakázkách. */}
        <div id="s-bilance" style={{...S.card(false,"#10b981"),maxWidth:340,minWidth:340}}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="bilance")} stav={st.bilance||"Čeká"} onStav={v=>updStav("bilance",v)}/>
          <div style={S.body}>
            <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
              <thead><tr>
                <th style={{textAlign:"left",padding:"5px 8px",fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",borderBottom:"1px solid #e2e8f0"}}>Položka</th>
                <th style={{textAlign:"right",padding:"5px 8px",fontSize:10,fontWeight:700,color:"#0369a1",textTransform:"uppercase",borderBottom:"1px solid #e2e8f0"}}>Plán</th>
                <th style={{textAlign:"right",padding:"5px 8px",fontSize:10,fontWeight:700,color:"#10b981",textTransform:"uppercase",borderBottom:"1px solid #e2e8f0"}}>Skutečnost</th>
              </tr></thead>
              <tbody>
                {[["Materiál","planMaterialNaklad","skutMaterialNaklad"],["Práce","planPraceNaklad","skutPraceNaklad"],["Doprava","planDopravaNaklad","skutDopravaNaklad"],["Celkem náklad","planCelkemNaklad","skutCelkemNaklad"],["Prodejní cena (bez DPH)","planProdejBezDph","skutProdejBezDph"]].map(([l,pk,sk])=>(
                  <tr key={l} style={{borderBottom:"1px solid #e2e8f0"}}>
                    <td style={{padding:"6px 8px",fontSize:12,color:"#64748b"}}>{l}</td>
                    <td style={{padding:"6px 8px",fontSize:12,color:"#0369a1",textAlign:"right"}}>{fmtKc(liveBilance[pk])}</td>
                    <td style={{padding:"6px 8px",fontSize:12,color:"#10b981",textAlign:"right"}}>{fmtKc(liveBilance[sk])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{background:"#f8fafc",borderRadius:8,padding:12,marginBottom:12,display:"flex",gap:12}}>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>PLÁN</div>
                <div style={{fontSize:18,fontWeight:800,color:"#0369a1"}}>{liveBilance.planMarzePct??"—"} %</div>
                <div style={{fontSize:11,color:"#475569"}}>{fmtKc(liveBilance.planMarzeKc)}</div>
              </div>
              <div style={{width:1,background:"#e2e8f0"}}/>
              <div style={{flex:1,textAlign:"center"}}>
                <div style={{fontSize:10,color:"#475569",marginBottom:3}}>SKUTEČNOST</div>
                <div style={{fontSize:18,fontWeight:800,color:"#10b981"}}>{liveBilance.skutMarzePct??"—"} %</div>
                <div style={{fontSize:11,color:"#475569"}}>{fmtKc(liveBilance.skutMarzeKc)}</div>
              </div>
            </div>
            <div style={{background:"#10b98114",border:"1px solid #10b98144",borderRadius:7,padding:"6px 10px",marginBottom:10,fontSize:11,color:"#0f766e"}}>
              {fakturovano
                ? `Skutečná prodejní cena je součet ${vydaneFaktury.length} vydan${vydaneFaktury.length===1?"é":"ých"} faktur k této zakázce (${fmtKc(fakturovano)}).`
                : "Zatím nevystavena žádná faktura — skutečnost se počítá orientačně z plánované ceny na zakázce."}
            </div>
            <div style={S.div}/>
            <EF label="Poznámky k odchylkám"    value={data.bilance.odchylkaPoznamka}   onChange={v=>upd("bilance","odchylkaPoznamka",v)} multi/>
          </div>
        </div>

        {/* ROZŠÍŘENÍ */}
        <div id="s-rozsireni" style={{...S.card(false,"#8b5cf6"),maxWidth:340,minWidth:340}}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="rozsireni")} stav={st.rozsireni||"Čeká"} onStav={v=>updStav("rozsireni",v)}/>
          <div style={S.body}>
            {(data.rozsireni||[]).length===0&&<div style={{color:"#64748b",fontSize:13,textAlign:"center",padding:"16px 0"}}>Žádná rozšíření</div>}
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
            <div style={{background:"#f8fafc",borderRadius:10,padding:12,marginBottom:14,border:"1px solid #e2e8f0"}}>
              <div style={{fontWeight:700,color:"#1A1A1A",fontSize:13,marginBottom:8}}>☁️ OneDrive složka</div>
              <EF label="Odkaz na OneDrive" value={data.fotky.onedrive} onChange={v=>upd("fotky","onedrive",v)}/>
              {data.fotky.onedrive?.startsWith("http")&&(
                <a href={data.fotky.onedrive} target="_blank" rel="noopener noreferrer"
                  style={{display:"inline-flex",alignItems:"center",gap:6,background:"#06b6d422",color:"#06b6d4",borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:700,textDecoration:"none"}}>
                  🔗 Otevřít OneDrive →
                </a>
              )}
            </div>
            {(() => {
              const nezarazene = contractPhotos.filter(f => !f.category || !FOTO_KATEGORIE.includes(f.category));
              const kategorie = nezarazene.length > 0 ? [...FOTO_KATEGORIE, "Ostatní"] : FOTO_KATEGORIE;
              return kategorie.map(kat => {
                const fc = kat === "Ostatní" ? nezarazene : contractPhotos.filter(f => f.category === kat);
                const busy = fotoUploading[kat] > 0;
                return (
                  <div key={kat} style={{marginBottom:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>{kat} ({fc.length})</div>
                    {fc.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                      {fc.map(f=>(
                        <div key={f.id} style={{borderRadius:8,overflow:"hidden",border:"1px solid #e2e8f0",position:"relative"}}>
                          <a href={f.url} target="_blank" rel="noreferrer">
                            <OneDriveThumb itemId={f.item_id} fallbackUrl={f.url} alt={f.description||kat} style={{width:"100%",height:70,objectFit:"cover",display:"block"}}/>
                          </a>
                          <button onClick={()=>removeContractPhoto(f.id)}
                            style={{position:"absolute",top:3,right:3,background:"#ef444488",border:"none",borderRadius:4,color:"#fff",cursor:"pointer",fontSize:10,padding:"1px 5px"}}>×</button>
                        </div>
                      ))}
                    </div>}
                    {kat!=="Ostatní"&&(
                      <label style={{display:"inline-flex",alignItems:"center",gap:5,background:busy?"#0ea5e922":"#e2e8f0",color:busy?"#0ea5e9":"#475569",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:busy?"default":"pointer",border:"1px dashed #e2e8f0"}}>
                        {busy?`⏳ Nahrávám (${fotoUploading[kat]})...`:"+ Přidat foto"}
                        <input type="file" accept="image/*" multiple disabled={busy} style={{display:"none"}} onChange={e=>{
                          const files=Array.from(e.target.files);
                          e.target.value="";
                          handleFotoUpload(kat, files);
                        }}/>
                      </label>
                    )}
                  </div>
                );
              });
            })()}
            <div style={S.div}/>
            <EF label="Poznámka" value={data.fotky.poznamka} onChange={v=>upd("fotky","poznamka",v)} multi/>
          </div>
        </div>

        {/* DOKUMENTY */}
        <div id="s-dokumenty" style={{...S.card(false,"#475569"),maxWidth:340,minWidth:340}}>
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
                      <span style={{fontSize:12,fontWeight:600,color:"#1A1A1A"}}>{doc.label}</span>
                    </div>
                    <select value={d2.stav} onChange={e=>updD("stav",e.target.value)}
                      style={{background:sc.color+"22",color:sc.color,border:`1px solid ${sc.color}44`,borderRadius:6,padding:"2px 6px",fontSize:10,fontWeight:700,cursor:"pointer",outline:"none"}}>
                      {Object.entries(STAV_DOC).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <input style={{...S.inp,padding:"5px 8px",fontSize:12,flex:1}} placeholder="Datum..." value={d2.datum} onChange={e=>updD("datum",e.target.value)}/>
                    {doc.gen&&<button disabled title="Automatické generování dokumentu zatím není v appce hotové — použij zatím nahrání hotového souboru níže." style={{...S.btn("#475569"),padding:"5px 10px",fontSize:11,flexShrink:0,cursor:"not-allowed",opacity:0.6}}>⬇️ Gen. (brzy)</button>}
                  </div>
                  {!doc.gen&&<input style={{...S.inp,marginTop:6,padding:"5px 8px",fontSize:11,color:"#475569"}} placeholder="Poznámka..." value={d2.poznamka} onChange={e=>updD("poznamka",e.target.value)}/>}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,paddingTop:8,borderTop:"1px solid #e2e8f0"}}>
                    <label style={{display:"inline-flex",alignItems:"center",gap:5,background:docUploading===doc.key?"#0ea5e922":"#e2e8f0",color:docUploading===doc.key?"#0ea5e9":"#475569",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:docUploading===doc.key?"default":"pointer",border:"1px dashed #e2e8f0",flexShrink:0}}>
                      {docUploading===doc.key?"⏳ Nahrávám...":(d2.soubor?"🔁 Nahradit":"📎 Nahrát soubor")}
                      <input type="file" disabled={docUploading===doc.key} style={{display:"none"}} onChange={e=>{const f=e.target.files[0];e.target.value="";handleDokUpload(doc.key,f);}}/>
                    </label>
                    {d2.soubor&&<a href={d2.soubor.link} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#0369a1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📄 {d2.soubor.name}</a>}
                  </div>
                </div>
              );
            })}
            {(data.dokumenty.extra||[]).map((doc,i)=>(
              <div key={doc.id} style={{...S.sCard,border:"1px solid #e2e8f0"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#475569"}}>Dokument #{i+1}</span>
                  <button onClick={()=>setData(d=>({...d,dokumenty:{...d.dokumenty,extra:d.dokumenty.extra.filter(x=>x.id!==doc.id)}}))}
                    style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",fontSize:13}}>×</button>
                </div>
                <input style={{...S.inp,marginBottom:6}} placeholder="Název dokumentu..."
                  value={doc.nazev} onChange={e=>setData(d=>({...d,dokumenty:{...d.dokumenty,extra:d.dokumenty.extra.map(x=>x.id===doc.id?{...x,nazev:e.target.value}:x)}}))}/>
                <input style={{...S.inp,fontSize:11,color:"#475569"}} placeholder="Poznámka..."
                  value={doc.poznamka} onChange={e=>setData(d=>({...d,dokumenty:{...d.dokumenty,extra:d.dokumenty.extra.map(x=>x.id===doc.id?{...x,poznamka:e.target.value}:x)}}))}/>
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,paddingTop:8,borderTop:"1px solid #e2e8f0"}}>
                  <label style={{display:"inline-flex",alignItems:"center",gap:5,background:docUploading==="extra-"+doc.id?"#0ea5e922":"#e2e8f0",color:docUploading==="extra-"+doc.id?"#0ea5e9":"#475569",borderRadius:6,padding:"4px 10px",fontSize:11,cursor:docUploading==="extra-"+doc.id?"default":"pointer",border:"1px dashed #e2e8f0",flexShrink:0}}>
                    {docUploading==="extra-"+doc.id?"⏳ Nahrávám...":(doc.soubor?"🔁 Nahradit":"📎 Nahrát soubor")}
                    <input type="file" disabled={docUploading==="extra-"+doc.id} style={{display:"none"}} onChange={e=>{const f=e.target.files[0];e.target.value="";handleExtraDokUpload(doc.id,f);}}/>
                  </label>
                  {doc.soubor&&<a href={doc.soubor.link} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#0369a1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📄 {doc.soubor.name}</a>}
                </div>
              </div>
            ))}
            <button style={{...S.btn("#475569"),width:"100%",marginTop:4}}
              onClick={()=>setData(d=>({...d,dokumenty:{...d.dokumenty,extra:[...(d.dokumenty.extra||[]),{id:Date.now(),nazev:"",stav:"ceka",datum:"",poznamka:""}]}}))}>
              + Přidat dokument
            </button>
          </div>
        </div>

        {/* SERVIS */}
        <div id="s-servis" style={{...S.card(false,"#ec4899"),maxWidth:340,minWidth:340}}>
          <SekceHeader sekce={SEKCE.find(s=>s.id==="servis")} stav={st.servis||"Čeká"} onStav={v=>updStav("servis",v)}/>
          <div style={S.body}>
            {(data.servis||[]).length===0&&<div style={{color:"#64748b",fontSize:13,textAlign:"center",padding:"16px 0"}}>Žádné servisní zásahy</div>}
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
