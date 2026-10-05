// Údaje firmy do formuláře zákazníka: IČO (po 8 číslicích se samo načte z ARES),
// DIČ, sídlo; bez IČO jde firmu najít v ARES podle názvu.
// hodnoty = { company, ico, dic, sidlo, ares_at }, onZmena(patch) — patch se slije do formuláře.
import { useEffect, useRef, useState } from "react";
import { nactiZAres, hledatVAres, cisteIco, jeIco } from "./ares.js";

const pole = { width: "100%", boxSizing: "border-box", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit", color: "#0f172a", background: "#fff" };
const popisek = { display: "block", fontSize: 12, color: "#475569", fontWeight: 600, margin: "8px 0 4px" };
const tl = { background: "#fff", color: "#0369a1", border: "1px solid #93c5fd", borderRadius: 8, padding: "7px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
const datum = (iso) => (iso ? new Date(iso).toLocaleDateString("cs-CZ") : "");

export default function FirmaAres({ hodnoty, onZmena }) {
  const [stav, setStav] = useState(null);      // { text, chyba } | null
  const [nacitam, setNacitam] = useState(false);
  const [vysledky, setVysledky] = useState(null); // výsledky hledání podle názvu
  const posledniIco = useRef(cisteIco(hodnoty.ico));

  const nacist = async (ico) => {
    setNacitam(true);
    setStav(null);
    try {
      const f = await nactiZAres(ico);
      if (!f) { setStav({ chyba: true, text: "Firma s tímto IČO v ARES není — zkontroluj číslo." }); return; }
      onZmena({ ico: f.ico, company: f.nazev, dic: f.dic, sidlo: f.sidlo, ares_at: new Date().toISOString() });
      setStav({ chyba: f.zanikla, text: f.zanikla ? `⚠ ${f.nazev} — firma podle ARES zanikla.` : `✓ Načteno z ARES: ${f.nazev}` });
    } catch (e) {
      setStav({ chyba: true, text: e.message || String(e) });
    } finally {
      setNacitam(false);
    }
  };

  // po dopsání 8 číslic IČO načíst samo
  useEffect(() => {
    const c = cisteIco(hodnoty.ico);
    if (c === posledniIco.current) return;
    posledniIco.current = c;
    if (jeIco(c)) Promise.resolve().then(() => nacist(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hodnoty.ico]);

  const hledat = async () => {
    setNacitam(true);
    setStav(null);
    try {
      const v = await hledatVAres(hodnoty.company);
      setVysledky(v);
      if (!v.length) setStav({ chyba: true, text: "V ARES jsem podle názvu nic nenašel — zkus zadat IČO." });
    } finally {
      setNacitam(false);
    }
  };

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", margin: "8px 0", textAlign: "left" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>🏢 Údaje firmy z ARES</span>
        {hodnoty.ares_at && <span style={{ fontSize: 11, color: "#15803d" }}>✓ ověřeno {datum(hodnoty.ares_at)}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <label style={popisek}>IČO</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input style={pole} inputMode="numeric" value={hodnoty.ico || ""} placeholder="8 číslic — doplní se samo"
              onChange={(e) => onZmena({ ico: e.target.value })} />
            <button type="button" style={tl} disabled={nacitam || !jeIco(hodnoty.ico)} onClick={() => nacist(hodnoty.ico)} title="Načíst znovu z ARES">↻</button>
          </div>
        </div>
        <div>
          <label style={popisek}>DIČ</label>
          <input style={pole} value={hodnoty.dic || ""} placeholder="CZ…" onChange={(e) => onZmena({ dic: e.target.value })} />
        </div>
      </div>
      <label style={popisek}>Sídlo firmy</label>
      <input style={pole} value={hodnoty.sidlo || ""} placeholder="Ulice č., PSČ Obec" onChange={(e) => onZmena({ sidlo: e.target.value })} />

      {!jeIco(hodnoty.ico) && String(hodnoty.company || "").trim().length >= 3 && (
        <button type="button" style={{ ...tl, marginTop: 8 }} disabled={nacitam} onClick={hledat}>🔎 Najít „{String(hodnoty.company).trim()}“ v ARES</button>
      )}
      {nacitam && <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>Hledám v ARES…</div>}
      {stav && <div role={stav.chyba ? "alert" : "status"} style={{ fontSize: 12, marginTop: 6, color: stav.chyba ? "#b91c1c" : "#15803d" }}>{stav.text}</div>}
      {vysledky?.length > 0 && (
        <div style={{ marginTop: 6, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", maxHeight: 200, overflowY: "auto" }}>
          {vysledky.map((f) => (
            <button key={f.ico} type="button" onClick={() => { setVysledky(null); onZmena({ ico: f.ico, company: f.nazev, dic: f.dic, sidlo: f.sidlo, ares_at: new Date().toISOString() }); posledniIco.current = f.ico; setStav({ chyba: false, text: `✓ Načteno z ARES: ${f.nazev}` }); }}
              style={{ display: "block", width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid #f1f5f9", background: "none", padding: "7px 10px", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: f.zanikla ? "#94a3b8" : "#0f172a" }}>{f.nazev}{f.zanikla ? " (zaniklá)" : ""}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>IČO {f.ico}{f.sidlo ? ` · ${f.sidlo}` : ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
