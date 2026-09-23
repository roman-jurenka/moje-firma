import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { cenaUkonu, ukonBezCeny, ukonyMajiMaterial, DUVERA } from "./nabidkaTexty.js";

// ─── Náhled nabídky pro zákazníka (servis SRV a rozšíření FVR) ────────────
// Nabídka se skládá přímo v appce: texty jsou předvyplněné podle typu
// zakázky (nabidkaTexty.js) a dají se upravit kliknutím přímo do náhledu,
// částky se berou z kalkulace, záruky a platební podmínky z výchozích
// hodnot firmy (app_settings, klíč NASTAVENI_KEY) — u konkrétní nabídky se
// dají přepsat. Úpravy se ukládají do nabídky (cfg.nahled). Tisk / PDF
// vytiskne přesně to, co je vidět, včetně záhlaví s logem a zápatí.

const NASTAVENI_KEY = "nabidky_vychozi";

// Výchozí hodnoty firmy — schválně prázdné, vyplní se jednou v nastavení.
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
.nb-kroky, .nb-dva { break-inside: avoid; page-break-inside: avoid; }
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
.nb-cenabox-r { text-align: right; }
.nb-cenabox-cena { font-size: 20pt; font-weight: 700; color: #16324F; line-height: 1.1; white-space: nowrap; }
.nb-cenabox-dph { font-size: 8.5pt; color: #5B6472; white-space: nowrap; }
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
.nb-reset { margin-left: 6px; font-size: 8pt; color: #0369a1; background: none; border: none; cursor: pointer; padding: 0; font-style: normal; font-weight: 400; }
`;

// Tisk: záhlaví a zápatí jsou na každé stránce (position: fixed), obsah je
// v tabulce s prázdnou hlavičkou/patičkou, které na každé stránce udělají
// místo — tak se nic nepřekryje. Prvky jen pro appku (.nb-no-print) mizí.
const CSS_TISK = `
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.nb-page { box-shadow: none; width: 210mm; }
.nb-no-print, .nb-reset { display: none !important; }
[contenteditable] { outline: none !important; background: none !important; }
[contenteditable]:empty::before { content: ""; }
.nb-print-hlavicka { position: fixed; top: 0; left: 0; width: 210mm; }
.nb-print-hlavicka img { width: 210mm; display: block; }
.nb-print-paticka { position: fixed; bottom: 0; left: 0; width: 210mm; }
.nb-layout { width: 210mm; border-collapse: collapse; }
.nb-layout > thead > tr > td { height: 42mm; padding: 0; }
.nb-layout > tfoot > tr > td { height: 27mm; padding: 0; }
.nb-layout > tbody > tr > td { padding: 0; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

// Text, který jde přepsat kliknutím přímo v náhledu. Prázdná hodnota =
// použije se předvyplněný text; "↺ původní" vrátí předvyplnění.
function Upravitelne({ hodnota, vychozi, onZmena, className, placeholder }) {
  const text = hodnota ?? vychozi ?? "";
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
    </div>
  );
}

const Chybi = ({ co }) => <span className="nb-chybi">doplnit: {co}</span>;

export default function NabidkaNahled({
  texty, ukony, onUkonyChange, cenaSDph, cenaBezDph, dphPct, zahrnuto, nezahrnuto, seznamNoveFve,
  upravy, onUpravy, customerName, adresa, cisloNabidky, vystaveno, oz, isAdmin, onSave, S,
  chybiPripojeni,
}) {
  const [nastaveni, setNastaveni] = useState(PRAZDNE_NASTAVENI);
  const [nastaveniNacteno, setNastaveniNacteno] = useState(false);
  const [nastaveniOtevreno, setNastaveniOtevreno] = useState(false);
  const [nastaveniForm, setNastaveniForm] = useState(PRAZDNE_NASTAVENI);
  const [ukladamNastaveni, setUkladamNastaveni] = useState(false);
  const stranka = useRef(null);

  useEffect(() => {
    let zruseno = false;
    supabase.from("app_settings").select("value").eq("key", NASTAVENI_KEY).maybeSingle().then(({ data, error }) => {
      if (zruseno) return;
      if (error) console.error("Nepodařilo se načíst výchozí hodnoty nabídek:", error.message);
      const hodnoty = { ...PRAZDNE_NASTAVENI, ...(data?.value || {}) };
      setNastaveni(hodnoty);
      setNastaveniForm(hodnoty);
      setNastaveniNacteno(true);
    });
    return () => { zruseno = true; };
  }, []);

  const ulozNastaveni = async () => {
    setUkladamNastaveni(true);
    const { error } = await supabase.from("app_settings").upsert({ key: NASTAVENI_KEY, value: nastaveniForm, updated_at: new Date().toISOString() });
    setUkladamNastaveni(false);
    if (error) { alert("Výchozí hodnoty se nepodařilo uložit: " + error.message); return; }
    setNastaveni(nastaveniForm);
    setNastaveniOtevreno(false);
  };

  const u = upravy || {};
  const nastav = (patch) => onUpravy({ ...u, ...patch });
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
  const maMaterial = texty.maUkony ? ukonyMajiMaterial(ukony) : true;
  // výzva k přijetí nabídky (bod 6) — předvyplněná z kontaktu OZ a čísla nabídky
  const vyzvaVychozi = [
    "Nabídku přijmete jednoduše:",
    [oz.email && `odpovězte na e-mail ${oz.email}`, oz.telefon && `zavolejte na ${oz.telefon}`].filter(Boolean).join(" nebo "),
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
    texty.maUkony && !(ukony || []).some((x) => (x.nazev || "").trim()) && "úkony servisu",
    texty.maUkony && (ukony || []).some(ukonBezCeny) && "cena u některého úkonu",
    seznamNoveFve && "„Co je v ceně“ má položky pro novou instalaci FVE (oprav v kalkulaci)",
    chybiPripojeni && "jestli je v ceně změna připojení u distributora (vyber v kalkulaci)",
  ].filter(Boolean);

  const tisk = () => {
    if (chybejici.length && !window.confirm(`V nabídce chybí: ${chybejici.join(", ")}.\n\nVytisknout i tak?`)) return;
    const el = stranka.current;
    if (!el) return;
    const obsah = el.querySelector(".nb-obsah").innerHTML;
    const paticka = el.querySelector(".nb-paticka").outerHTML;
    const origin = window.location.origin;
    const html = `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><title>${cisloNabidky ? cisloNabidky + " – " : ""}${texty.nadpis} – ${customerName || ""}</title>
      <base href="${origin}/"><style>${CSS}${CSS_TISK}</style></head><body>
      <div class="nb-print-hlavicka"><img src="${origin}/nabidka/hlavicka.png" alt=""></div>
      <div class="nb-print-paticka nb-page">${paticka}</div>
      <table class="nb-layout nb-page"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot>
      <tbody><tr><td><div class="nb-obsah">${obsah}</div></td></tr></tbody></table>
      <script>window.onload=function(){setTimeout(function(){window.print();},150);}</script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) { alert("Prohlížeč zablokoval nové okno pro tisk — povol prosím vyskakovací okna pro tuto stránku."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const upravUkon = (id, patch) => onUkonyChange((ukony || []).map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const platneUkony = (ukony || []).filter((x) => (x.nazev || "").trim() || (x.popis || "").trim());
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
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>
          Texty v náhledu upravíš kliknutím přímo do nich. Ceny a počty se berou z kalkulace výše. Pro PDF zvol v tisku „Uložit jako PDF“.
        </div>

        {nastaveniChybi && !nastaveniOtevreno && (
          <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e", marginBottom: 12 }}>
            Výchozí záruky a platební podmínky ještě nejsou nastavené. {isAdmin ? "Nastav je jednou pro všechny nabídky:" : "Požádej administrátora, ať je nastaví."}
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

        <div style={{ marginTop: 10 }}>
          <button style={{ ...S.btnGhost, padding: "4px 12px", fontSize: 12 }} onClick={() => { setNastaveniForm(nastaveni); setNastaveniOtevreno((v) => !v); }}>
            ⚙️ Výchozí hodnoty pro všechny nabídky {nastaveniOtevreno ? "▲" : "▼"}
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
          <Upravitelne className="nb-podnadpis" hodnota={u.podnadpis} vychozi={texty.podnadpis} onZmena={(v) => nastav({ podnadpis: v })} />
          <div className="nb-meta">
            <div>
              Nabídka č. <b>{cisloNabidky || <Chybi co="číslo se přidělí při uložení" />}</b>
              {" · "}Vystaveno {fmtDatum(datumVystaveni)}
              {platiDo && <> · Platí do <b>{fmtDatum(platiDo)}</b></>}
            </div>
            <div>
              {customerName ? <>Pro: <b>{customerName}</b> · </> : ""}
              Místo instalace: {adresaInstalace || <Chybi co="adresa" />}
            </div>
          </div>

          <p className="nb-p">Dobrý den,</p>
          <Upravitelne className="nb-p" hodnota={u.uvod} vychozi={texty.uvod} onZmena={(v) => nastav({ uvod: v })} />
          <Upravitelne className="nb-poznamka" hodnota={u.poznamka} vychozi="" placeholder="＋ Klikni a doplň vlastní poznámku (např. zjištěná závada, stav soustavy…) — prázdné se netiskne"
            onZmena={(v) => nastav({ poznamka: v || undefined })} />
          <div className="nb-oz-jmeno">{oz.jmeno}</div>
          <div className="nb-oz-kontakt">{[oz.email, oz.telefon].filter(Boolean).join("   ·   ")}</div>

          <div className="nb-cenabox">
            <div className="nb-cenabox-l">
              <b>{texty.maUkony ? "Cena servisu" : "Cena rozšíření"}</b><br />
              {platiDo ? <>Nabídka platí do {fmtDatum(platiDo)}</> : <>Platnost: {platnost || <Chybi co="platnost" />}</>}
              {zalohaPct > 0 && <><br />Záloha {zalohaPct} % ({fmtKc(zalohaKc)}), zbytek po dokončení</>}
            </div>
            <div className="nb-cenabox-r">
              <div className="nb-cenabox-cena">{fmtKc(cenaSDph)}</div>
              <div className="nb-cenabox-dph">vč. DPH {dphPct} % · bez DPH {fmtKc(cenaBezDph)}</div>
            </div>
          </div>
          <div className="nb-duvera">
            {DUVERA.map((d) => <div key={d.nadpis}><b>{d.nadpis}</b>{d.text}</div>)}
          </div>

          {texty.maUkony && (
            <div className="nb-sekce">
              <div className="nb-h">Co pro Vás provedeme</div>
              <table className="nb-tab">
                <thead><tr><th>ÚKON</th><th className="nb-ks">POČET KS</th><th>POPIS</th><th className="nb-kc">CENA BEZ DPH</th></tr></thead>
                <tbody>
                  {platneUkony.length === 0 && (
                    <tr><td className="nb-l">Rozsah prací</td><td className="nb-ks"></td><td className="nb-v"><Chybi co="úkony zadej v kalkulaci výše" /></td><td className="nb-kc"></td></tr>
                  )}
                  {platneUkony.map((x) => (
                    <tr key={x.id}>
                      <td className="nb-l"><span key={x.nazev} contentEditable suppressContentEditableWarning onBlur={(e) => upravUkon(x.id, { nazev: e.currentTarget.innerText.trim() })}>{x.nazev}</span></td>
                      <td className="nb-ks">{x.ks ?? ""}</td>
                      <td className="nb-v"><span key={x.popis} contentEditable suppressContentEditableWarning onBlur={(e) => upravUkon(x.id, { popis: e.currentTarget.innerText.trim() })}>{x.popis}</span></td>
                      <td className="nb-kc">{ukonBezCeny(x) ? <Chybi co="cena" /> : fmtKc(cenaUkonu(x))}</td>
                    </tr>
                  ))}
                  <tr className="nb-soucet"><td colSpan={3} className="nb-l2">Cena celkem bez DPH</td><td className="nb-kc">{fmtKc(cenaBezDph)}</td></tr>
                  <tr className="nb-soucet"><td colSpan={3} className="nb-l2">DPH {dphPct} %</td><td className="nb-kc">{fmtKc(cenaSDph - cenaBezDph)}</td></tr>
                  <tr className="nb-soucet nb-soucet-hl"><td colSpan={3} className="nb-l2" style={{ color: "#16324F", fontWeight: 700 }}>Cena celkem s DPH</td><td className="nb-kc">{fmtKc(cenaSDph)}</td></tr>
                </tbody>
              </table>
            </div>
          )}

          <div className="nb-sekce">
            <div className="nb-h">Zpracování nabídky</div>
            <Upravitelne className="nb-p" hodnota={u.zpracovani} vychozi={texty.zpracovani} onZmena={(v) => nastav({ zpracovani: v })} />
          </div>

          <div className="nb-sekce">
            <div className="nb-h">{texty.nadpisSpecifikace}</div>
            <table className="nb-tab">
              <thead><tr><th>POLOŽKA</th><th className="nb-ks">POČET KS</th><th>TYP / POPIS</th></tr></thead>
              <tbody>
                {texty.specRadky.map((r, i) => (
                  <tr key={i} className={/^Cena/.test(r.label) ? "nb-cena" : ""}>
                    <td className="nb-l">{r.label}</td>
                    <td className="nb-ks">{r.ks}</td>
                    <td className="nb-v">{r.hodnota === "[doplnit]" ? <Chybi co="zadej v kalkulaci výše" /> : r.hodnota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="nb-drobne">
              {platiDo
                ? <>Nabídka platí do {fmtDatum(platiDo)}.</>
                : platnost ? <>Platnost nabídky: {platnost}.</> : <>Platnost nabídky: <Chybi co="platnost" />.</>}
              {" "}Ceny jsou s DPH {dphPct} %.
            </p>
          </div>

          <div className="nb-sekce">
            <div className="nb-h">Platební podmínky</div>
            <table className="nb-tab">
              <tbody>
                {zalohaPct == null && (
                  <tr><td className="nb-l">Platba</td><td className="nb-v"><Chybi co="výše zálohy" /></td></tr>
                )}
                {zalohaPct === 0 && (
                  <tr><td className="nb-l">Platba</td><td className="nb-v">{fmtKc(cenaSDph)} (100 %) — po dokončení prací a otestování funkčnosti</td></tr>
                )}
                {zalohaPct > 0 && (
                  <>
                    <tr><td className="nb-l">1. Zálohová platba</td><td className="nb-v">{fmtKc(zalohaKc)} ({zalohaPct} % z celkové ceny) — {zalohaKdy || <Chybi co="kdy se platí" />}</td></tr>
                    <tr><td className="nb-l">2. Konečná platba</td><td className="nb-v">{fmtKc(doplatekKc)} ({100 - zalohaPct} % z celkové ceny) — po dokončení prací a otestování funkčnosti</td></tr>
                  </>
                )}
              </tbody>
            </table>
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

          <div className="nb-sekce">
            <div className="nb-h">Termín provedení</div>
            <p className="nb-p">Práce provedeme do {termin || <Chybi co="termín" />} od odsouhlasení nabídky.</p>
          </div>

          <div className="nb-sekce">
            <div className="nb-h">Záruční podmínky</div>
            <table className="nb-tab">
              <tbody>
                {maMaterial && <tr><td className="nb-l">Dodaný materiál a komponenty</td><td className="nb-v">{zarukaMaterial || <Chybi co="záruka" />}</td></tr>}
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
            <Upravitelne className="nb-p" hodnota={u.vyzva} vychozi={vyzvaVychozi} onZmena={(v) => nastav({ vyzva: v })} />
            <div className="nb-podpis">
              <div>
                <div className="nb-podpis-cara"></div>
                Nabídku přijímám — datum a podpis zákazníka
              </div>
              <div>
                <div className="nb-podpis-cara"></div>
                Za Jurenka Elektro{oz.jmeno ? ` — ${oz.jmeno}` : ""}
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
