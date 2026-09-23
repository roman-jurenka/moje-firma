import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { cenaUkonu, ukonBezCeny, ukonyMajiMaterial, DUVERA } from "./nabidkaTexty.js";

// ─── Náhled nabídky pro zákazníka (FVE, servis, rozšíření, hromosvody, elektro) ─
// Nabídka se skládá přímo v appce: texty jsou předvyplněné podle typu
// zakázky (nabidkaTexty.js) a dají se upravit kliknutím přímo do náhledu,
// částky se berou z kalkulace, záruky a platební podmínky z výchozích
// hodnot firmy (app_settings, klíč podle typu — klicNastaveni) — u konkrétní
// nabídky se dají přepsat. Úpravy se ukládají do nabídky. Tisk / PDF
// vytiskne přesně to, co je vidět, včetně záhlaví s logem a zápatí.

// Nová FVE má jiné podmínky (platnost, termín, záruky) než servis a menší
// zakázky — proto vlastní sadu výchozích hodnot.
const klicNastaveni = (typ) => (typ === "FVE" ? "nabidky_vychozi_FVE" : "nabidky_vychozi");
const popisNastaveni = (typ) => (typ === "FVE" ? "nabídky nové FVE" : "servis, rozšíření, hromosvody a elektroinstalace");
const FIRMA_EMAIL = "info@jurenkaelektro.cz";
const FIRMA_TELEFON = "+420 702 172 622";
const fmtCas = (iso) => new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Výchozí hodnoty firmy — schválně prázdné, vyplní se jednou v nastavení.
// E-mail do nabídek a šablona e-mailu zákazníkovi — jedna sada pro všechny
// typy nabídek (app_settings, klíč EMAIL_KEY).
const EMAIL_KEY = "nabidky_email";
const VYCHOZI_EMAIL = {
  email: "",
  predmet: "Cenová nabídka {cislo} – {popis}",
  text: [
    "Dobrý den,",
    "",
    "v příloze Vám posíláme cenovou nabídku č. {cislo} – {popis}.",
    "",
    "Cena: {cena}.",
    "Nabídka platí do {plati_do}.",
    "",
    "Nabídku přijmete jednoduše odpovědí na tento e-mail nebo telefonicky na {telefon}. Pokud cokoliv není jasné, rádi Vám vše vysvětlíme.",
    "",
    "S pozdravem",
    "{obchodnik}",
    "Jurenka Elektro s.r.o.",
    "{telefon} · {email}",
    "www.jurenkaelektro.cz",
  ].join("\n"),
};
const ZNACKY_EMAILU = "{cislo} číslo nabídky · {popis} podnadpis nabídky · {zakaznik} · {cena} cena bez DPH a s DPH · {plati_do} · {obchodnik} · {email} · {telefon}";

const PRAZDNE_NASTAVENI = {
  platnost: "",       // počet dní, např. "30" (starší "30 dní" se taky přečte)
  zalohaPct: "",      // např. 50 (0 = bez zálohy)
  zalohaKdy: "",      // např. "před zahájením prací"
  termin: "",         // např. "4 týdnů"
  zarukaMaterial: "", // např. "24 měsíců"
  zarukaPrace: "",    // např. "24 měsíců"
};

const POLE_NASTAVENI = [
  ["platnost", "Platnost nabídky (dní)", "např. 30"],
  ["zalohaPct", "Záloha (%)", "např. 50, 0 = bez zálohy"],
  ["zalohaKdy", "Kdy se platí záloha", "např. před zahájením prací"],
  ["termin", "Termín provedení (do …)", "např. 4 týdnů"],
  ["zarukaMaterial", "Záruka na materiál a komponenty", "např. 24 měsíců"],
  ["zarukaPrace", "Záruka na provedenou práci", "např. 24 měsíců"],
];

const fmtKc = (n) => Math.round(Number(n) || 0).toLocaleString("cs-CZ") + " Kč";
const fmtDatum = (d) => d.toLocaleDateString("cs-CZ");
// "2026-09-22" → Date v místním čase (bez posunu přes UTC)
const zIso = (iso) => {
  const [r, m, d] = String(iso).split("-").map(Number);
  return r && m && d ? new Date(r, m - 1, d) : null;
};

const CSS = `
.nb-page { width: 210mm; max-width: 100%; margin: 0 auto; background: #fff; color: #1A1A1A; font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; box-shadow: 0 2px 12px rgba(15,23,42,.15); }
.nb-hlavicka img { display: block; width: 100%; }
.nb-obsah { padding: 4mm 15mm 8mm; }
.nb-paticka { position: relative; height: 22mm; background: url("/nabidka/paticka.png") center / cover no-repeat, linear-gradient(90deg, #0a5aa6, #22a0dc); color: #fff; font-family: Arial, sans-serif; font-size: 8pt; line-height: 1.35; padding: 4mm 15mm; box-sizing: border-box; display: flex; justify-content: space-between; }
.nb-paticka b { font-size: 8.5pt; }
.nb-nadpis { font-size: 20pt; font-weight: 700; color: #16324F; margin: 0 0 1mm; }
.nb-podnadpis { font-size: 11pt; color: #5B6472; padding-bottom: 2mm; border-bottom: 2px solid #E08A1E; margin-bottom: 1.5mm; }
.nb-meta { font-size: 9pt; color: #5B6472; margin-bottom: 4mm; }
.nb-p { margin: 0 0 3mm; text-align: justify; }
.nb-poznamka { margin: 0 0 3mm; font-style: italic; }
.nb-oz-jmeno { font-weight: 700; color: #16324F; margin-top: 2mm; }
.nb-oz-kontakt { font-size: 9pt; color: #5B6472; margin-bottom: 5mm; }
.nb-h { font-size: 12pt; font-weight: 700; color: #16324F; border-bottom: 1.5px solid #E08A1E; padding-bottom: 1mm; margin: 5mm 0 2.5mm; break-after: avoid; page-break-after: avoid; }
.nb-h + .nb-tab thead, .nb-h + .nb-p { break-before: avoid; }
.nb-kroky, .nb-dva, .nb-drzet { break-inside: avoid; page-break-inside: avoid; }
.nb-tab { width: 100%; border-collapse: collapse; }
.nb-tab th { font-size: 8pt; font-weight: 700; color: #5B6472; text-align: left; padding: 1.5mm 1.5mm; border-bottom: 1px solid #D9D9D9; }
.nb-tab td { padding: 2mm 1.5mm; border-bottom: 1px solid #D9D9D9; vertical-align: top; }
.nb-tab tr { break-inside: avoid; page-break-inside: avoid; }
.nb-tab td.nb-l { color: #5B6472; width: 30%; }
.nb-tab td.nb-ks, .nb-tab th.nb-ks { text-align: center; width: 13%; font-weight: 700; }
.nb-tab td.nb-v { font-weight: 700; }
.nb-tab tr.nb-cena td { font-size: 11pt; }
.nb-tab td.nb-kc, .nb-tab th.nb-kc { text-align: right; width: 16%; white-space: nowrap; font-weight: 700; }
.nb-tab tr.nb-soucet td { border-bottom: none; padding-top: 1.2mm; padding-bottom: 1.2mm; }
.nb-tab tr.nb-soucet td.nb-l2 { text-align: right; color: #5B6472; }
.nb-tab tr.nb-soucet-hl td { font-size: 12pt; color: #16324F; border-top: 1.5px solid #16324F; }
.nb-drobne { font-size: 9pt; font-style: italic; color: #5B6472; margin: 2mm 0 0; }
.nb-dva { display: flex; gap: 6mm; }
.nb-dva > div { flex: 1; }
.nb-dva ul { margin: 1mm 0 0; padding: 0; list-style: none; }
.nb-dva li { margin: 0 0 1mm; font-size: 9.5pt; }
.nb-dva li::before { content: "— "; font-weight: 700; }
.nb-zahr li::before { color: #2F8F5B; } .nb-zahr b { color: #2F8F5B; }
.nb-nezahr li::before { color: #C23B3B; } .nb-nezahr b { color: #C23B3B; }
.nb-kroky { display: flex; align-items: flex-start; justify-content: space-between; margin-top: 2mm; }
.nb-krok { width: 29mm; text-align: center; font-size: 9pt; }
.nb-krok img { width: 14mm; height: 14mm; display: block; margin: 0 auto 1.5mm; }
.nb-krok-cislo { color: #E08A1E; font-weight: 700; font-size: 8pt; }
.nb-sipka { width: 7mm; margin-top: 5.5mm; }
.nb-cenabox { display: flex; justify-content: space-between; align-items: center; gap: 6mm; background: #F4F8FC; border: 1.5px solid #16324F; border-left: 5px solid #E08A1E; border-radius: 2mm; padding: 3.5mm 5mm; margin: 1mm 0 4mm; break-inside: avoid; page-break-inside: avoid; }
.nb-cenabox-l { font-size: 9pt; color: #5B6472; line-height: 1.5; }
.nb-cenabox-l b { color: #16324F; font-size: 10.5pt; }
.nb-cenabox-tab { border-collapse: collapse; margin-left: auto; }
.nb-cenabox-tab td { padding: 0.4mm 0 0.4mm 5mm; font-size: 9.5pt; color: #5B6472; white-space: nowrap; text-align: right; vertical-align: baseline; }
.nb-cenabox-tab td:first-child { padding-left: 0; text-align: left; }
.nb-cenabox-tab tr.nb-hl td { border-top: 1px solid #16324F; padding-top: 1.2mm; color: #16324F; font-weight: 700; font-size: 10.5pt; }
.nb-cenabox-tab tr.nb-hl td:last-child { font-size: 18pt; line-height: 1.1; }
.nb-cenabox-tab tr.nb-dotace td { color: #2F8F5B; }
.nb-krok-ted { display: inline-block; margin-top: 1mm; font-size: 7pt; font-weight: 700; color: #fff; background: #E08A1E; border-radius: 2mm; padding: 0.3mm 1.8mm; }
.nb-krok-dalsi { display: inline-block; margin-top: 1mm; font-size: 7pt; font-weight: 700; color: #16324F; border: 1px solid #16324F; border-radius: 2mm; padding: 0.2mm 1.8mm; }
.nb-vyzva { background: #FFF7EC; border: 1.5px solid #E08A1E; border-radius: 2mm; padding: 4mm 5mm; margin-top: 5mm; break-inside: avoid; page-break-inside: avoid; }
.nb-vyzva-h { font-size: 12pt; font-weight: 700; color: #16324F; margin-bottom: 1.5mm; }
.nb-podpis { display: flex; gap: 8mm; margin-top: 5mm; font-size: 9pt; color: #5B6472; }
.nb-podpis > div { flex: 1; }
.nb-podpis-cara { border-bottom: 1px solid #1A1A1A; height: 9mm; margin-bottom: 1mm; }
.nb-duvera { display: flex; gap: 4mm; margin: 0 0 4mm; break-inside: avoid; page-break-inside: avoid; }
.nb-duvera > div { flex: 1; border-top: 2px solid #E08A1E; padding-top: 1.8mm; font-size: 8.5pt; color: #5B6472; line-height: 1.4; }
.nb-duvera b { display: block; font-size: 10pt; color: #16324F; margin-bottom: 0.5mm; }
.nb-duvera b::before { content: "✓ "; color: #E08A1E; }
.nb-chybi { color: #b91c1c; background: #fee2e2; border-radius: 3px; padding: 0 3px; font-weight: 700; font-style: normal; }
[contenteditable="true"] { outline: 1px dashed transparent; border-radius: 3px; cursor: text; transition: outline-color .15s; }
.nb-edit [contenteditable="true"]:hover { outline-color: #93c5fd; }
.nb-edit [contenteditable="true"]:focus { outline: 2px solid #3b82f6; background: #f8fbff; }
[contenteditable="true"]:empty::before { content: attr(data-placeholder); color: #94a3b8; font-style: italic; }
.nb-zastarale { display: block; margin-top: 1mm; font-size: 8.5pt; font-style: normal; color: #b45309; background: #fef3c7; border-radius: 3px; padding: 1mm 2mm; }
.nb-zastarale button { margin-left: 6px; font-size: 8.5pt; color: #0369a1; background: none; border: none; cursor: pointer; padding: 0; text-decoration: underline; }
.nb-reset { margin-left: 6px; font-size: 8pt; color: #0369a1; background: none; border: none; cursor: pointer; padding: 0; font-style: normal; font-weight: 400; }
`;

// Tisk: nabídka se v tiskovém okně sama rozdělí na stránky A4 (skript
// STRANKOVANI níže) — každá stránka má vlastní záhlaví, zápatí a číslo
// stránky. Nespoléhá na opakování "position: fixed" ani hlavičky tabulky,
// které Safari při tisku neopakuje, takže vypadá stejně v Chrome, Edge,
// Firefoxu i Safari (ověřeno v Chromiu a WebKitu). Velké tabulky se dělí
// po řádcích, malé sekce (.nb-drzet) se přesouvají celé.
const CSS_TISK = `
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
@media screen { body { background: #e5e7eb; padding: 8mm 0; } .nb-list { margin: 0 auto 8mm; box-shadow: 0 2px 12px rgba(15,23,42,.2); } }
.nb-list, #nb-zdroj { color: #1A1A1A; font-family: Calibri, Carlito, "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; }
.nb-list { position: relative; width: 210mm; height: 296.5mm; overflow: hidden; background: #fff; break-after: page; page-break-after: always; box-sizing: border-box; }
.nb-list:last-child { break-after: auto; page-break-after: auto; }
.nb-list-hlavicka { position: absolute; top: 0; left: 0; width: 210mm; }
.nb-list-hlavicka img { width: 210mm; display: block; }
.nb-list-telo { position: absolute; top: 42mm; bottom: 27mm; left: 0; right: 0; padding: 0 15mm; overflow: hidden; }
.nb-list-paticka { position: absolute; bottom: 0; left: 0; width: 210mm; }
.nb-list-cislo { position: absolute; bottom: 23.5mm; right: 15mm; font-family: Arial, sans-serif; font-size: 7.5pt; color: #94a3b8; }
#nb-zdroj { position: absolute; left: -10000px; top: 0; width: 180mm; }
.nb-no-print, .nb-reset, .nb-zastarale { display: none !important; }
[contenteditable] { outline: none !important; background: none !important; }
[contenteditable]:empty::before { content: ""; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

// Stránkování v tiskovém okně (čistý JS bez knihoven, ES5 kvůli starším
// prohlížečům). Bloky obsahu se skládají na stránky; když se blok nevejde,
// jde na další stránku, tabulka se případně rozdělí po řádcích.
const STRANKOVANI = `function nbStrankuj(tisk){
  var zdroj=document.getElementById('nb-zdroj'), stranky=document.getElementById('nb-stranky');
  var paticka=document.getElementById('nb-paticka').innerHTML, telo;
  function novaStrana(){
    var s=document.createElement('div'); s.className='nb-list';
    s.innerHTML='<div class="nb-list-hlavicka"><img src="nabidka/hlavicka.png" alt=""></div><div class="nb-list-telo"></div><div class="nb-list-paticka">'+paticka+'</div>';
    stranky.appendChild(s); telo=s.querySelector('.nb-list-telo');
  }
  function preteka(){ return telo.scrollHeight > telo.clientHeight + 1; }
  function tbody(el){ return el.querySelector ? el.querySelector('table.nb-tab > tbody') : null; }
  function rozdel(el){
    var tb=tbody(el), tab=tb.parentNode, radky=[], za=[], i;
    while(tb.firstChild){ radky.push(tb.removeChild(tb.firstChild)); }
    while(tab.nextSibling){ za.push(tab.parentNode.removeChild(tab.nextSibling)); }
    var sablona=el.cloneNode(true), h=sablona.querySelector('.nb-h'); if(h){ h.parentNode.removeChild(h); }
    var kus=el; telo.appendChild(kus);
    for(i=0;i<radky.length;i++){
      tb.appendChild(radky[i]);
      if(!preteka()) continue;
      tb.removeChild(radky[i]);
      var sam=telo.children.length===1;
      if(!tb.children.length && sam){ tb.appendChild(radky[i]); continue; }
      if(!tb.children.length){ telo.removeChild(kus); novaStrana(); telo.appendChild(kus); i--; continue; }
      novaStrana(); kus=sablona.cloneNode(true); tb=tbody(kus); telo.appendChild(kus); i--;
    }
    for(i=0;i<za.length;i++){ kus.appendChild(za[i]); }
    if(za.length && preteka()){
      var obal=document.createElement('div');
      for(i=0;i<za.length;i++){ obal.appendChild(kus.removeChild(za[i])); }
      novaStrana(); telo.appendChild(obal);
    }
  }
  function pridej(el){
    telo.appendChild(el);
    if(!preteka()) return;
    telo.removeChild(el);
    var tb=tbody(el), drzet=el.className && String(el.className).indexOf('nb-drzet')>=0;
    if(tb && tb.children.length>1 && !drzet){ rozdel(el); return; }
    if(telo.children.length){ novaStrana(); }
    telo.appendChild(el);
    if(preteka() && tb && tb.children.length>1){ telo.removeChild(el); rozdel(el); }
  }
  novaStrana();
  var bloky=[], n;
  while(zdroj.firstChild){ n=zdroj.removeChild(zdroj.firstChild); if(n.nodeType===1) bloky.push(n); }
  for(var i=0;i<bloky.length;i++){ pridej(bloky[i]); }
  zdroj.parentNode.removeChild(zdroj);
  var listy=stranky.children;
  for(i=0;i<listy.length;i++){
    var c=document.createElement('div'); c.className='nb-list-cislo'; c.textContent='Strana '+(i+1)+' / '+listy.length; listy[i].appendChild(c);
  }
  if(tisk){ setTimeout(function(){ window.print(); }, 200); }
}`;

// Text, který jde přepsat kliknutím přímo v náhledu. Prázdná hodnota =
// použije se předvyplněný text; "↺ původní" vrátí předvyplnění.
function Upravitelne({ hodnota, vychozi, zaklad, onZmena, className, placeholder }) {
  const text = hodnota ?? vychozi ?? "";
  // ručně upravený text vznikl z jiného předvyplnění (např. se mezitím
  // změnily úkony nebo přidávané komponenty) → může už nesedět
  const zastarale = hodnota !== undefined && zaklad !== undefined && vychozi !== undefined && zaklad !== vychozi;
  return (
    <div className={className}>
      <span
        key={text}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onBlur={(e) => {
          const t = e.currentTarget.innerText.replace(/\s+\n/g, "\n").trim();
          if (t !== text) onZmena(t === (vychozi ?? "") ? undefined : t);
        }}
      >{text}</span>
      {hodnota !== undefined && hodnota !== vychozi && vychozi !== undefined && (
        <button className="nb-reset" title="Vrátit předvyplněný text" onClick={() => onZmena(undefined)}>↺ původní</button>
      )}
      {zastarale && (
        <span className="nb-zastarale">
          ⚠️ Od tvé úpravy se změnil obsah nabídky (úkony, komponenty…) — zkontroluj, jestli text pořád sedí.
          <button onClick={() => onZmena(undefined)}>Použít nový předvyplněný text</button>
        </span>
      )}
    </div>
  );
}

const Chybi = ({ co }) => <span className="nb-chybi">doplnit: {co}</span>;

export default function NabidkaNahled({
  texty, ukony, onUkonyChange, cenaSDph, cenaBezDph, dphPct, zahrnuto, nezahrnuto, seznamNoveFve,
  upravy, onUpravy, customerName, adresa, cisloNabidky, vystaveno, oz, isAdmin, onSave, S,
  odeslane, onOdeslano,
  chybiPripojeni,
  typ,                 // typ zakázky (FVE/SRV/FVR/HRM/ELK) — podle něj se berou výchozí hodnoty
  dotace = 0,          // Kč s DPH, o které se cena díla sníží dotací (jen FVE/FVR s dotací)
  poznamkaVychozi = "", // předvyplněná poznámka (u HRM/ELK poznámka k nabídce)
  upozorneni = [],     // další chybějící údaje od volající stránky
  customerEmail = "",  // e-mail zákazníka — předvyplní se do "Komu" v e-mailu
}) {
  const nastaveniKlic = klicNastaveni(typ);
  const [nastaveni, setNastaveni] = useState(PRAZDNE_NASTAVENI);
  const [nastaveniNacteno, setNastaveniNacteno] = useState(false);
  const [nastaveniOtevreno, setNastaveniOtevreno] = useState(false);
  const [nastaveniForm, setNastaveniForm] = useState(PRAZDNE_NASTAVENI);
  const [ukladamNastaveni, setUkladamNastaveni] = useState(false);
  const stranka = useRef(null);

  useEffect(() => {
    let zruseno = false;
    supabase.from("app_settings").select("value").eq("key", nastaveniKlic).maybeSingle().then(({ data, error }) => {
      if (zruseno) return;
      if (error) console.error("Nepodařilo se načíst výchozí hodnoty nabídek:", error.message);
      const hodnoty = { ...PRAZDNE_NASTAVENI, ...(data?.value || {}) };
      setNastaveni(hodnoty);
      setNastaveniForm(hodnoty);
      setNastaveniNacteno(true);
    });
    return () => { zruseno = true; };
  }, [nastaveniKlic]);

  const [emailNastaveni, setEmailNastaveni] = useState(VYCHOZI_EMAIL);
  const [emailForm, setEmailForm] = useState(VYCHOZI_EMAIL);
  useEffect(() => {
    let zruseno = false;
    supabase.from("app_settings").select("value").eq("key", EMAIL_KEY).maybeSingle().then(({ data }) => {
      if (zruseno) return;
      const v = { ...VYCHOZI_EMAIL, ...Object.fromEntries(Object.entries(data?.value || {}).filter(([, x]) => String(x ?? "").trim() !== "")) };
      setEmailNastaveni(v);
      setEmailForm(v);
    });
    return () => { zruseno = true; };
  }, []);

  const ulozNastaveni = async () => {
    setUkladamNastaveni(true);
    const { error: e1 } = await supabase.from("app_settings").upsert({ key: nastaveniKlic, value: nastaveniForm, updated_at: new Date().toISOString() });
    const { error: e2 } = await supabase.from("app_settings").upsert({ key: EMAIL_KEY, value: emailForm, updated_at: new Date().toISOString() });
    const error = e1 || e2;
    if (!error) setEmailNastaveni({ ...VYCHOZI_EMAIL, ...Object.fromEntries(Object.entries(emailForm).filter(([, x]) => String(x ?? "").trim() !== "")) });
    setUkladamNastaveni(false);
    if (error) { alert("Výchozí hodnoty se nepodařilo uložit: " + error.message); return; }
    setNastaveni(nastaveniForm);
    setNastaveniOtevreno(false);
  };

  const u = upravy || {};
  const nastav = (patch) => onUpravy({ ...u, ...patch });
  // úprava textu si uloží i předvyplnění, ze kterého vznikla (klíč_zaklad)
  const upravText = (k, vychozi) => (v) => nastav({ [k]: v, [`${k}_zaklad`]: v === undefined ? undefined : vychozi });

  // Kontakt obchodníka: e-mail a telefon z jeho zaměstnanecké karty, jinak firemní.
  const [kontaktOz, setKontaktOz] = useState(null);
  useEffect(() => {
    if (!oz.employeeId) return undefined;
    let zruseno = false;
    supabase.from("employees").select("email, phone").eq("id", oz.employeeId).maybeSingle()
      .then(({ data }) => { if (!zruseno) setKontaktOz(data || null); });
    return () => { zruseno = true; };
  }, [oz.employeeId]);
  // Předdefinovaný e-mail z nastavení má přednost před e-mailem z karty zaměstnance.
  const ozEmailVychozi = (emailNastaveni.email || kontaktOz?.email || oz.email || FIRMA_EMAIL).trim();
  const ozTelefonVychozi = (kontaktOz?.phone || oz.telefon || FIRMA_TELEFON).trim();
  // U konkrétní nabídky jde kontakt přepsat (např. nabídka za kolegu);
  // prázdné pole = kontakt z karty zaměstnance, případně firemní.
  const ozJmeno = String(u.ozJmeno ?? "").trim() || oz.jmeno || "";
  const ozEmail = String(u.ozEmail ?? "").trim() || ozEmailVychozi;
  const ozTelefon = String(u.ozTelefon ?? "").trim() || ozTelefonVychozi;
  // hodnota pro tuto nabídku: vlastní úprava, jinak výchozí z nastavení
  const hodnota = (k) => {
    const v = u[k];
    return v !== undefined && v !== "" ? v : nastaveni[k];
  };

  const platnost = String(hodnota("platnost") ?? "").trim();
  // Datum vystavení = kdy nabídka dostala číslo (první uložení); do té doby
  // dnešek. Platnost jako konkrétní datum, když je zadaná počtem dní.
  const datumVystaveni = zIso(vystaveno) || new Date();
  const platnostDni = parseInt(platnost, 10);
  const platiDo = Number.isFinite(platnostDni) && platnostDni > 0
    ? new Date(datumVystaveni.getFullYear(), datumVystaveni.getMonth(), datumVystaveni.getDate() + platnostDni)
    : null;
  const adresaInstalace = String(adresa ?? "").trim();
  const zalohaRaw = hodnota("zalohaPct");
  const zalohaZadana = zalohaRaw !== "" && zalohaRaw != null && !Number.isNaN(Number(zalohaRaw));
  const zalohaPct = zalohaZadana ? Math.min(100, Math.max(0, Number(zalohaRaw))) : null;
  const zalohaKdy = String(hodnota("zalohaKdy") ?? "").trim();
  const termin = String(hodnota("termin") ?? "").trim();
  const zarukaMaterial = String(hodnota("zarukaMaterial") ?? "").trim();
  // u servisu jen s revizí / diagnostikou / čištěním se nic nedodává
  const maMaterial = texty.maMaterial ?? (texty.maUkony ? ukonyMajiMaterial(ukony) : true);
  const dotaceKc = Math.max(0, Math.round(Number(dotace) || 0));
  const duvera = texty.duvera || DUVERA;
  const doplatekKdy = texty.doplatekKdy || "po dokončení prací a otestování funkčnosti";
  const zarukyNavic = texty.zarukyNavic || [];
  // výzva k přijetí nabídky (bod 6) — předvyplněná z kontaktu OZ a čísla nabídky
  const vyzvaVychozi = [
    "Nabídku přijmete jednoduše:",
    [ozEmail && `odpovězte na e-mail ${ozEmail}`, ozTelefon && `zavolejte na ${ozTelefon}`].filter(Boolean).join(" nebo "),
    cisloNabidky ? `a uveďte číslo nabídky ${cisloNabidky}.` : "a uveďte číslo nabídky.",
    "Obratem se Vám ozveme a domluvíme termín. Nabídku můžete také podepsat níže a poslat nám ji zpět.",
  ].filter(Boolean).join(" ");
  const zarukaPrace = String(hodnota("zarukaPrace") ?? "").trim();
  const zalohaKc = zalohaPct != null ? Math.round((cenaSDph * zalohaPct) / 100) : 0;
  const doplatekKc = cenaSDph - zalohaKc;

  const chybejici = [
    !cisloNabidky && "číslo nabídky (přidělí se při uložení — klikni na Uložit)",
    !adresaInstalace && "adresa instalace (vyplň v kalkulaci nebo u zákazníka)",
    !platnost && "platnost nabídky",
    zalohaPct == null && "výše zálohy",
    zalohaPct > 0 && !zalohaKdy && "kdy se platí záloha",
    !termin && "termín provedení",
    maMaterial && !zarukaMaterial && "záruka na materiál",
    !zarukaPrace && "záruka na práci",
    texty.maUkony && !(ukony || []).some((x) => (x.nazev || "").trim()) && (texty.ukonyChybi || "úkony servisu"),
    texty.maUkony && (ukony || []).some(ukonBezCeny) && (texty.ukonBezCenyText || "cena u některého úkonu"),
    seznamNoveFve && "„Co je v ceně“ má položky pro novou instalaci FVE (oprav v kalkulaci)",
    chybiPripojeni && "jestli je v ceně změna připojení u distributora (vyber v kalkulaci)",
    ...upozorneni,
  ].filter(Boolean);

  // Celá nabídka jako samostatné HTML (stejné pro tisk i pro uloženou kopii).
  const sestavHtml = (sTiskem) => {
    const el = stranka.current;
    if (!el) return null;
    const obsah = el.querySelector(".nb-obsah").innerHTML;
    const paticka = el.querySelector(".nb-paticka").outerHTML;
    const origin = window.location.origin;
    // Bez skriptu by uložená kopie po otevření nebyla rozdělená na stránky,
    // proto se stránkování spouští vždy; tisk jen když sTiskem.
    const html = `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><title>${cisloNabidky ? cisloNabidky + " – " : ""}${texty.nadpis} – ${customerName || ""}</title>
      <base href="${origin}/"><style>${CSS}${CSS_TISK}</style></head><body>
      <div id="nb-zdroj" class="nb-obsah">${obsah}</div>
      <div id="nb-paticka" style="display:none">${paticka}</div>
      <div id="nb-stranky"></div>
      <script>${STRANKOVANI}
      window.onload=function(){ var go=function(){ nbStrankuj(${sTiskem ? "true" : "false"}); };
        if(document.fonts && document.fonts.ready){ document.fonts.ready.then(go, go); } else { go(); } };</script></body></html>`;
    return html;
  };

  const otevritOkno = (html) => {
    const w = window.open("", "_blank");
    if (!w) { alert("Prohlížeč zablokoval nové okno — povol prosím vyskakovací okna pro tuto stránku."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const tisk = () => {
    if (chybejici.length && !window.confirm(`V nabídce chybí: ${chybejici.join(", ")}.\n\nVytisknout i tak?`)) return;
    const html = sestavHtml(true);
    if (!html) return;
    const w = window.open("", "_blank");
    if (!w) { alert("Prohlížeč zablokoval nové okno pro tisk — povol prosím vyskakovací okna pro tuto stránku."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // Evidence odeslání: kopie přesně toho, co zákazník dostal, + stav Odesláno.
  const [odesilam, setOdesilam] = useState(false);
  const oznacitOdeslano = async () => {
    if (!cisloNabidky) { alert("Nabídka ještě nemá číslo — nejdřív ji ulož (💾 Uložit)."); return; }
    if (chybejici.length && !window.confirm(`V nabídce chybí: ${chybejici.join(", ")}.\n\nOznačit jako odeslanou i tak?`)) return;
    if (!window.confirm(`Označit nabídku ${cisloNabidky} jako odeslanou zákazníkovi?\n\nUloží se přesná kopie toho, co teď vidíš, a stav nabídky se přepne na „Odesláno“.`)) return;
    const html = sestavHtml(false);
    if (!html) return;
    setOdesilam(true);
    try {
      await onOdeslano({ html, cena: cenaSDph });
    } finally {
      setOdesilam(false);
    }
  };
  const zobrazitOdeslanou = async (id) => {
    const { data, error } = await supabase.from("nabidky_odeslane").select("html").eq("id", id).maybeSingle();
    if (error || !data) { alert("Kopii se nepodařilo načíst: " + (error?.message || "nenalezeno")); return; }
    otevritOkno(data.html);
  };

  // E-mail zákazníkovi: předvyplní se ze šablony, před odesláním jde upravit.
  const [email, setEmail] = useState(null); // { komu, predmet, text } — null = zavřeno
  const doplnitEmail = (sablona) => {
    const cenaText = dotaceKc > 0
      ? `${fmtKc(cenaBezDph)} bez DPH, ${fmtKc(cenaSDph)} vč. DPH ${dphPct} %, po odečtení dotace ${fmtKc(cenaSDph - dotaceKc)}`
      : `${fmtKc(cenaBezDph)} bez DPH, ${fmtKc(cenaSDph)} vč. DPH ${dphPct} %`;
    const hodnoty = {
      cislo: cisloNabidky || "(číslo se přidělí při uložení)",
      popis: String(u.podnadpis ?? texty.podnadpis ?? "").trim(),
      zakaznik: customerName || "",
      cena: cenaText,
      plati_do: platiDo ? fmtDatum(platiDo) : (platnost || "—"),
      obchodnik: ozJmeno,
      email: ozEmail,
      telefon: ozTelefon,
    };
    return String(sablona || "").replace(/\{(\w+)\}/g, (m, k) => (k in hodnoty ? hodnoty[k] : m));
  };
  const otevritEmail = () => setEmail({
    komu: customerEmail || "",
    predmet: doplnitEmail(emailNastaveni.predmet),
    text: doplnitEmail(emailNastaveni.text),
  });
  const mailto = email
    ? `mailto:${email.komu.trim().replace(/[\s;]+/g, ",")}?subject=${encodeURIComponent(email.predmet)}&body=${encodeURIComponent(email.text)}`
    : "";
  const [zkopirovano, setZkopirovano] = useState(false);
  const kopirovatEmail = async () => {
    try {
      await navigator.clipboard.writeText(`${email.predmet}\n\n${email.text}`);
      setZkopirovano(true);
      setTimeout(() => setZkopirovano(false), 2000);
    } catch {
      alert("Text se nepodařilo zkopírovat — označ ho v poli a zkopíruj ručně (Ctrl+C).");
    }
  };

  const upravUkon = (id, patch) => onUkonyChange((ukony || []).map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const platneUkony = (ukony || []).filter((x) => (x.nazev || "").trim() || (x.popis || "").trim());
  // sloupec "počet ks" jen když ho některý řádek má (u sekcí HRM/ELK většinou ne)
  const ukonyMajiKs = platneUkony.some((x) => String(x.ks ?? "").trim() !== "");
  const specRadky = texty.specRadky || [];
  const specMaPopis = specRadky.some((r) => String(r.hodnota ?? "").trim() !== "");
  const nastaveniChybi = nastaveniNacteno && POLE_NASTAVENI.some(([k]) => String(nastaveni[k] ?? "").trim() === "");

  const inp = { ...S.input, marginBottom: 0 };

  return (
    <div style={{ marginTop: 16 }}>
      <style>{CSS}</style>

      {/* ── Údaje této nabídky + výchozí hodnoty ── */}
      <div className="nb-no-print" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <div style={{ fontWeight: 700, color: "#1A1A1A" }}>📝 Náhled nabídky pro zákazníka</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onSave && <button style={S.btn("#34d399")} onClick={onSave}>💾 Uložit</button>}
            <button style={S.btn("#0369a1")} onClick={tisk}>🖨️ Tisk / PDF</button>
            <button style={S.btn("#0f766e")} onClick={() => (email ? setEmail(null) : otevritEmail())}>✉️ E-mail zákazníkovi</button>
            {onOdeslano && (
              <button style={S.btn("#7c3aed")} disabled={odesilam} onClick={oznacitOdeslano}
                title="Uloží přesnou kopii nabídky tak, jak ji zákazník dostal, a přepne stav na Odesláno">
                {odesilam ? "Ukládám…" : "📨 Označit jako odeslanou"}
              </button>
            )}
          </div>
        </div>
        {email && (
          <div style={{ background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: "#115e59", marginBottom: 8 }}>✉️ E-mail zákazníkovi</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
              <div>
                <label style={S.label}>Komu</label>
                <input style={{ ...inp, borderColor: email.komu.trim() ? undefined : "#f87171" }} type="email" value={email.komu} placeholder="e-mail zákazníka"
                  onChange={(e) => setEmail({ ...email, komu: e.target.value })} />
              </div>
              <div>
                <label style={S.label}>Předmět</label>
                <input style={inp} value={email.predmet} onChange={(e) => setEmail({ ...email, predmet: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Text</label>
              <textarea style={{ ...inp, minHeight: 230, resize: "vertical", fontFamily: "inherit" }} value={email.text} onChange={(e) => setEmail({ ...email, text: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
              <a href={mailto} style={{ ...S.btn("#0f766e"), textDecoration: "none", display: "inline-block" }}>📧 Otevřít v poště</a>
              <button style={S.btnGhost} onClick={kopirovatEmail}>{zkopirovano ? "✓ Zkopírováno" : "📋 Kopírovat text"}</button>
              <button style={{ ...S.btnGhost, padding: "6px 12px", fontSize: 12 }} onClick={otevritEmail}>↺ Znovu ze šablony</button>
            </div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 8 }}>
              Postup: 1) 🖨️ Tisk / PDF → Uložit jako PDF, 2) 📧 Otevřít v poště a PDF přilož, 3) po odeslání klikni 📨 Označit jako odeslanou.
              {!customerEmail && " U zákazníka není vyplněný e-mail — doplň ho sem nebo do karty zákazníka."}
            </div>
          </div>
        )}
        {(odeslane || []).length > 0 && (
          <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#4c1d95", marginBottom: 12 }}>
            <b>Odesláno zákazníkovi:</b>{" "}
            {odeslane.map((o, i) => (
              <span key={o.id}>
                {i > 0 && " · "}
                {fmtCas(o.created_at)}{o.odeslal ? ` (${o.odeslal})` : ""}{o.cena != null ? `, ${fmtKc(o.cena)}` : ""}{" "}
                <button style={{ background: "none", border: "none", color: "#6d28d9", textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 12 }}
                  onClick={() => zobrazitOdeslanou(o.id)}>zobrazit kopii</button>
              </span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>
          Texty v náhledu upravíš kliknutím přímo do nich. Ceny a počty se berou z kalkulace výše. Pro PDF zvol v tisku „Uložit jako PDF“.
        </div>

        {nastaveniChybi && !nastaveniOtevreno && (
          <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e", marginBottom: 12 }}>
            Výchozí záruky a platební podmínky pro {popisNastaveni(typ)} ještě nejsou nastavené. {isAdmin ? "Nastav je jednou, pak se doplňují samy:" : "Požádej administrátora, ať je nastaví."}
            {isAdmin && <button style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 12, marginLeft: 8 }} onClick={() => setNastaveniOtevreno(true)}>⚙️ Nastavit</button>}
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Tato nabídka <span style={{ textTransform: "none", fontWeight: 400 }}>(prázdné = výchozí hodnota)</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
          {POLE_NASTAVENI.map(([k, label, ph]) => (
            <div key={k}>
              <label style={S.label}>{label}</label>
              <input style={inp} type={k === "zalohaPct" ? "number" : "text"} min={k === "zalohaPct" ? 0 : undefined} max={k === "zalohaPct" ? 100 : undefined}
                value={u[k] ?? ""} placeholder={String(nastaveni[k] ?? "") !== "" ? String(nastaveni[k]) : ph}
                onChange={(e) => nastav({ [k]: e.target.value === "" ? undefined : e.target.value })} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4, margin: "12px 0 6px" }}>
          Kontakt obchodníka v této nabídce <span style={{ textTransform: "none", fontWeight: 400 }}>(prázdné = {emailNastaveni.email ? "e-mail z výchozích hodnot, telefon z karty zaměstnance" : "z karty zaměstnance, jinak firemní"})</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
          {[["ozJmeno", "Jméno obchodníka", oz.jmeno || "jméno"], ["ozEmail", "E-mail", ozEmailVychozi], ["ozTelefon", "Telefon", ozTelefonVychozi]].map(([k, label, ph]) => (
            <div key={k}>
              <label style={S.label}>{label}</label>
              <input style={inp} type={k === "ozEmail" ? "email" : k === "ozTelefon" ? "tel" : "text"} value={u[k] ?? ""} placeholder={ph}
                onChange={(e) => nastav({ [k]: e.target.value === "" ? undefined : e.target.value })} />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 10 }}>
          <button style={{ ...S.btnGhost, padding: "4px 12px", fontSize: 12 }} onClick={() => { setNastaveniForm(nastaveni); setNastaveniOtevreno((v) => !v); }}>
            ⚙️ Výchozí hodnoty — {popisNastaveni(typ)} {nastaveniOtevreno ? "▲" : "▼"}
          </button>
        </div>
        {nastaveniOtevreno && (
          <div style={{ marginTop: 10, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
            {!isAdmin && <div style={{ color: "#f59e0b", fontSize: 12, marginBottom: 8 }}>Výchozí hodnoty smí měnit jen administrátor — tady je jen náhled.</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
              {POLE_NASTAVENI.map(([k, label, ph]) => (
                <div key={k}>
                  <label style={S.label}>{label}</label>
                  <input style={inp} disabled={!isAdmin} type={k === "zalohaPct" ? "number" : "text"} value={nastaveniForm[k] ?? ""} placeholder={ph}
                    onChange={(e) => setNastaveniForm({ ...nastaveniForm, [k]: e.target.value })} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4, margin: "14px 0 6px" }}>
              E-mail — společný pro všechny typy nabídek
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
              <div>
                <label style={S.label}>E-mail do všech nabídek</label>
                <input style={inp} disabled={!isAdmin} type="email" value={emailForm.email ?? ""} placeholder={`prázdné = z karty zaměstnance (jinak ${FIRMA_EMAIL})`}
                  onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })} />
              </div>
              <div>
                <label style={S.label}>Předmět e-mailu zákazníkovi</label>
                <input style={inp} disabled={!isAdmin} value={emailForm.predmet ?? ""} onChange={(e) => setEmailForm({ ...emailForm, predmet: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={S.label}>Text e-mailu zákazníkovi</label>
              <textarea style={{ ...inp, minHeight: 210, resize: "vertical", fontFamily: "inherit" }} disabled={!isAdmin} value={emailForm.text ?? ""}
                onChange={(e) => setEmailForm({ ...emailForm, text: e.target.value })} />
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Doplní se samo: {ZNACKY_EMAILU}</div>
            </div>
            {isAdmin && (
              <button style={{ ...S.btn("#0369a1"), marginTop: 10 }} disabled={ukladamNastaveni} onClick={ulozNastaveni}>
                {ukladamNastaveni ? "Ukládám…" : "Uložit výchozí hodnoty"}
              </button>
            )}
          </div>
        )}

        {chybejici.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>Chybí: {chybejici.join(", ")}</div>
        )}
      </div>

      {/* ── Samotná stránka nabídky ── */}
      <div ref={stranka} className="nb-page nb-edit">
        <div className="nb-hlavicka"><img src="/nabidka/hlavicka.png" alt="Jurenka Elektro" /></div>
        <div className="nb-obsah">
          <div className="nb-nadpis">{texty.nadpis}</div>
          <Upravitelne className="nb-podnadpis" hodnota={u.podnadpis} vychozi={texty.podnadpis} zaklad={u.podnadpis_zaklad} onZmena={upravText("podnadpis", texty.podnadpis)} />
          <div className="nb-meta">
            <div>
              Nabídka č. <b>{cisloNabidky || <Chybi co="číslo se přidělí při uložení" />}</b>
              {" · "}Vystaveno {fmtDatum(datumVystaveni)}
              {platiDo && <> · Platí do <b>{fmtDatum(platiDo)}</b></>}
              {texty.metaNavic ? <> · {texty.metaNavic}</> : null}
            </div>
            <div>
              {customerName ? <>Pro: <b>{customerName}</b> · </> : ""}
              {texty.mistoLabel || "Místo instalace"}: {adresaInstalace || <Chybi co="adresa" />}
            </div>
          </div>

          <p className="nb-p">Dobrý den,</p>
          <Upravitelne className="nb-p" hodnota={u.uvod} vychozi={texty.uvod} zaklad={u.uvod_zaklad} onZmena={upravText("uvod", texty.uvod)} />
          <Upravitelne className="nb-poznamka" hodnota={u.poznamka} vychozi={poznamkaVychozi || ""} placeholder="＋ Klikni a doplň vlastní poznámku (např. zjištěná závada, stav soustavy…) — prázdné se netiskne"
            onZmena={(v) => nastav({ poznamka: v || undefined })} />
          <div className="nb-oz-jmeno">{ozJmeno}</div>
          <div className="nb-oz-kontakt">{[ozEmail, ozTelefon].filter(Boolean).join("   ·   ")}</div>

          <div className="nb-cenabox">
            <div className="nb-cenabox-l">
              <b>{texty.cenaNadpis || (texty.maUkony ? "Cena servisu" : "Cena rozšíření")}</b><br />
              {platiDo ? <>Nabídka platí do {fmtDatum(platiDo)}</> : <>Platnost: {platnost || <Chybi co="platnost" />}</>}
              {zalohaPct > 0 && <><br />Záloha {zalohaPct} % ({fmtKc(zalohaKc)} vč. DPH), zbytek po dokončení</>}
            </div>
            {/* Stejné řádky u všech typů: bez DPH → DPH → s DPH (u dotace ještě
                dotace a cena po dotaci). Zvýrazněná je částka, kterou zákazník platí. */}
            <table className="nb-cenabox-tab">
              <tbody>
                <tr><td>Cena{dotaceKc > 0 ? " díla" : ""} bez DPH</td><td>{fmtKc(cenaBezDph)}</td></tr>
                <tr><td>DPH {dphPct} %</td><td>{fmtKc(cenaSDph - cenaBezDph)}</td></tr>
                {dotaceKc > 0 ? (
                  <>
                    <tr><td>Cena díla s DPH</td><td>{fmtKc(cenaSDph)}</td></tr>
                    <tr className="nb-dotace"><td>Dotace Nová zelená úsporám</td><td>− {fmtKc(dotaceKc)}</td></tr>
                    <tr className="nb-hl"><td>Vaše cena po dotaci</td><td>{fmtKc(cenaSDph - dotaceKc)}</td></tr>
                  </>
                ) : (
                  <tr className="nb-hl"><td>Cena s DPH</td><td>{fmtKc(cenaSDph)}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="nb-duvera">
            {duvera.map((d) => <div key={d.nadpis}><b>{d.nadpis}</b>{d.text}</div>)}
          </div>

          {texty.maUkony && (
            <div className="nb-sekce">
              <div className="nb-h">Co pro Vás provedeme</div>
              <table className="nb-tab">
                <thead><tr><th>{texty.ukonySloupec || "ÚKON"}</th>{ukonyMajiKs && <th className="nb-ks">POČET KS</th>}<th>POPIS</th><th className="nb-kc">CENA BEZ DPH</th></tr></thead>
                <tbody>
                  {platneUkony.length === 0 && (
                    <tr><td className="nb-l">Rozsah prací</td>{ukonyMajiKs && <td className="nb-ks"></td>}<td className="nb-v"><Chybi co={texty.ukonyChybi || "úkony zadej v kalkulaci výše"} /></td><td className="nb-kc"></td></tr>
                  )}
                  {platneUkony.map((x) => (
                    <tr key={x.id}>
                      <td className="nb-l"><span key={x.nazev} contentEditable suppressContentEditableWarning onBlur={(e) => upravUkon(x.id, { nazev: e.currentTarget.innerText.trim() })}>{x.nazev}</span></td>
                      {ukonyMajiKs && <td className="nb-ks">{x.ks ?? ""}</td>}
                      <td className="nb-v"><span key={x.popis} contentEditable suppressContentEditableWarning onBlur={(e) => upravUkon(x.id, { popis: e.currentTarget.innerText.trim() })}>{x.popis}</span></td>
                      <td className="nb-kc">{ukonBezCeny(x) ? <Chybi co="cena" /> : fmtKc(cenaUkonu(x))}</td>
                    </tr>
                  ))}
                  <tr className="nb-soucet"><td colSpan={ukonyMajiKs ? 3 : 2} className="nb-l2">Cena celkem bez DPH</td><td className="nb-kc">{fmtKc(cenaBezDph)}</td></tr>
                  <tr className="nb-soucet"><td colSpan={ukonyMajiKs ? 3 : 2} className="nb-l2">DPH {dphPct} %</td><td className="nb-kc">{fmtKc(cenaSDph - cenaBezDph)}</td></tr>
                  <tr className="nb-soucet nb-soucet-hl"><td colSpan={ukonyMajiKs ? 3 : 2} className="nb-l2" style={{ color: "#16324F", fontWeight: 700 }}>Cena celkem s DPH</td><td className="nb-kc">{fmtKc(cenaSDph)}</td></tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="nb-sekce">
            <div className="nb-h">Zpracování nabídky</div>
            <Upravitelne className="nb-p" hodnota={u.zpracovani} vychozi={texty.zpracovani} zaklad={u.zpracovani_zaklad} onZmena={upravText("zpracovani", texty.zpracovani)} />
          </div>

          {specRadky.length > 0 && (
            <div className="nb-sekce">
              <div className="nb-h">{texty.nadpisSpecifikace}</div>
              <table className="nb-tab">
                <thead><tr><th>POLOŽKA</th><th className="nb-ks">{texty.specSloupecKs || "POČET KS"}</th>{specMaPopis && <th>TYP / POPIS</th>}</tr></thead>
                <tbody>
                  {specRadky.map((r, i) => (
                    <tr key={i} className={/^Cena/.test(r.label) ? "nb-cena" : ""}>
                      <td className={specMaPopis ? "nb-l" : "nb-v"}>{r.label}</td>
                      <td className="nb-ks">{r.ks}</td>
                      {specMaPopis && <td className="nb-v">{r.hodnota === "[doplnit]" ? <Chybi co="zadej v kalkulaci výše" /> : r.hodnota}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="nb-drobne">
                {platiDo
                  ? <>Nabídka platí do {fmtDatum(platiDo)}.</>
                  : platnost ? <>Platnost nabídky: {platnost}.</> : <>Platnost nabídky: <Chybi co="platnost" />.</>}
                {" "}{texty.maUkony
                  ? <>Ceny položek jsou uvedeny bez DPH, celková cena včetně DPH {dphPct} % je v součtu.</>
                  : <>Cena bez DPH i včetně DPH {dphPct} % je uvedena v cenovém přehledu na začátku nabídky.</>}
              </p>
            </div>
          )}

          <div className="nb-sekce nb-drzet">
            <div className="nb-h">Platební podmínky</div>
            <table className="nb-tab">
              <tbody>
                {zalohaPct == null && (
                  <tr><td className="nb-l">Platba</td><td className="nb-v"><Chybi co="výše zálohy" /></td></tr>
                )}
                {zalohaPct === 0 && (
                  <tr><td className="nb-l">Platba</td><td className="nb-v">{fmtKc(cenaSDph)} (100 % ceny vč. DPH) — {doplatekKdy}</td></tr>
                )}
                {zalohaPct > 0 && (
                  <>
                    <tr><td className="nb-l">1. Zálohová platba</td><td className="nb-v">{fmtKc(zalohaKc)} ({zalohaPct} % z celkové ceny vč. DPH) — {zalohaKdy || <Chybi co="kdy se platí" />}</td></tr>
                    <tr><td className="nb-l">2. Konečná platba</td><td className="nb-v">{fmtKc(doplatekKc)} ({100 - zalohaPct} % z celkové ceny vč. DPH) — {doplatekKdy}</td></tr>
                  </>
                )}
              </tbody>
            </table>
            {dotaceKc > 0 && (
              <p className="nb-drobne">Platby se počítají z ceny díla {fmtKc(cenaSDph)} vč. DPH. Dotaci ve výši {fmtKc(dotaceKc)} vyplácí Státní fond životního prostředí ČR v rámci programu Nová zelená úsporám.</p>
            )}
          </div>

          {(zahrnuto.length > 0 || nezahrnuto.length > 0) && (
            <div className="nb-sekce">
              <div className="nb-h">Co je a co není v ceně</div>
              <div className="nb-dva">
                <div className="nb-zahr"><b>Cena ZAHRNUJE</b><ul>{zahrnuto.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
                <div className="nb-nezahr"><b>Cena NEZAHRNUJE</b><ul>{nezahrnuto.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
              </div>
            </div>
          )}

          <div className="nb-sekce nb-drzet">
            <div className="nb-h">Termín provedení</div>
            <p className="nb-p">{texty.terminPred || "Práce provedeme do"} {termin || <Chybi co="termín" />} {texty.terminOd || "od odsouhlasení nabídky"}.</p>
          </div>

          <div className="nb-sekce nb-drzet">
            <div className="nb-h">Záruční podmínky</div>
            <table className="nb-tab">
              <tbody>
                {zarukyNavic.map((z) => (
                  <tr key={z.k}><td className="nb-l">{z.label}</td><td className="nb-v">
                    <Upravitelne hodnota={u[z.k]} vychozi={z.hodnota} onZmena={(v) => nastav({ [z.k]: v })} />
                  </td></tr>
                ))}
                {maMaterial && <tr><td className="nb-l">{texty.zarukaMaterialLabel || "Dodaný materiál a komponenty"}</td><td className="nb-v">{zarukaMaterial || <Chybi co="záruka" />}</td></tr>}
                <tr><td className="nb-l">Provedená práce</td><td className="nb-v">{zarukaPrace || <Chybi co="záruka" />}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="nb-sekce">
            <div className="nb-h">{texty.nadpisPostup}</div>
            <div className="nb-kroky">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} style={{ display: "contents" }}>
                  <div className="nb-krok">
                    <img src={`/nabidka/krok${n}.png`} alt="" />
                    <div className="nb-krok-cislo">KROK {n}</div>
                    <div>{texty[`krok${n}`]}</div>
                    {n === 3 && <div className="nb-krok-ted">JSTE ZDE</div>}
                    {n === 4 && <div className="nb-krok-dalsi">DALŠÍ KROK</div>}
                  </div>
                  {n < 5 && <img className="nb-sipka" src="/nabidka/sipka.png" alt="→" />}
                </div>
              ))}
            </div>
          </div>

          <div className="nb-vyzva">
            <div className="nb-vyzva-h">Jak nabídku přijmout</div>
            <Upravitelne className="nb-p" hodnota={u.vyzva} vychozi={vyzvaVychozi} zaklad={u.vyzva_zaklad} onZmena={upravText("vyzva", vyzvaVychozi)} />
            <div className="nb-podpis">
              <div>
                <div className="nb-podpis-cara"></div>
                Nabídku přijímám — datum a podpis zákazníka
              </div>
              <div>
                <div className="nb-podpis-cara"></div>
                Za Jurenka Elektro{ozJmeno ? ` — ${ozJmeno}` : ""}
              </div>
            </div>
          </div>
        </div>
        <div className="nb-paticka">
          <div>
            <b>Jurenka Elektro s.r.o.</b><br />
            Riegrova 394/17, 779 00 Olomouc<br />
            IČ: 19147813<br />
            Infolinka: +420 702 172 622, e-mail: info@jurenkaelektro.cz
          </div>
          <div style={{ textAlign: "right" }}><b>www.jurenkaelektro.cz</b></div>
        </div>
      </div>
    </div>
  );
}
