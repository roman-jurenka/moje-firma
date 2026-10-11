// ─── Nahrát do zakázky: soubory i celé složky s podsložkami ─────────────────
// Společné pro Průběh zakázek (karta Fotky, okno Složka zakázky). Vybere se,
// kam soubory patří (Dokumenty, Fotky podle kategorie, Předávací protokol…),
// pak soubory nebo složka — tlačítkem, nebo přetažením myší. Struktura
// podsložek zůstane na OneDrivu stejná, dokumenty si nechají původní název.
import { useState } from "react";
import { nahratFotkuZakazky, KATEGORIE_FOTEK, pocetSouboruText, polozkySouboru, souboryZPretazeni } from "./fotkyZakazky.js";

const btn = { background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 10, padding: "6px 11px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const popisKategorie = (k) => (k === "Dokumenty" ? "📄 Dokumenty" : k === "Předávací protokol" ? "📋 Předávací protokol" : k === "Ostatní" ? "📎 Ostatní" : `📷 Fotky — ${k}`);

// onNahrano(rows, kategorie) — nové řádky contract_photos
export default function NahratDoZakazky({ slozka, contractId = null, prubehId = null, nahral = null, onNahrano, vychoziKam = "Dokumenty", kategorie = KATEGORIE_FOTEK, id = "nahrat" }) {
  const [kam, setKam] = useState(vychoziKam);
  const [prubeh, setPrubeh] = useState(null); // { hotovo, celkem }
  const [tazeni, setTazeni] = useState(false);
  const [zprava, setZprava] = useState(null);  // { text, chyba }

  const nahrat = async (seznam) => {
    const polozky = polozkySouboru(seznam);
    if (!polozky.length || prubeh) return;
    setZprava(null);
    setPrubeh({ hotovo: 0, celkem: polozky.length });
    const nove = [], chyby = [];
    for (const [i, { file, cesta }] of polozky.entries()) {
      try {
        nove.push(await nahratFotkuZakazky(file, { slozka, contractId, prubehId, kategorie: kam, nahral, poradi: i + 1, podslozka: cesta, popis: cesta ? `${cesta}/${file.name}` : null }));
      } catch (e) { chyby.push(`${file.name}: ${e.message || e}`); }
      setPrubeh({ hotovo: i + 1, celkem: polozky.length });
    }
    setPrubeh(null);
    if (nove.length) onNahrano?.(nove, kam);
    setZprava(chyby.length
      ? { chyba: true, text: `Nahráno ${nove.length} z ${polozky.length}. Nepodařilo se: ${chyby.join("; ")}` }
      : { chyba: false, text: `✓ Nahráno ${pocetSouboruText(nove.length)} do „${kam}“` });
  };

  return (
    <div onDragOver={(e) => { e.preventDefault(); setTazeni(true); }} onDragLeave={() => setTazeni(false)}
      onDrop={async (e) => { e.preventDefault(); setTazeni(false); nahrat(await souboryZPretazeni(e.dataTransfer)); }}
      style={{ border: `1px dashed ${tazeni ? "#0369a1" : "#cbd5e1"}`, background: tazeni ? "#e0f2fe" : "#fff", borderRadius: 12, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor={`${id}-kam`} style={{ fontSize: 13, fontWeight: 800 }}>⬆ Nahrát do</label>
        <select id={`${id}-kam`} value={kam} onChange={(e) => setKam(e.target.value)} disabled={!!prubeh}
          style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 10px", fontSize: 14, fontFamily: "inherit" }}>
          {kategorie.map((k) => <option key={k} value={k}>{popisKategorie(k)}</option>)}
        </select>
        <label style={{ ...btn, background: "#0369a1", color: "#fff", borderColor: "#0369a1", cursor: prubeh ? "default" : "pointer" }}>
          {prubeh ? `Nahrávám ${prubeh.hotovo}/${prubeh.celkem}…` : "Vybrat soubory"}
          <input type="file" multiple style={{ display: "none" }} disabled={!!prubeh} onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; nahrat(f); }} />
        </label>
        {!prubeh && (
          <label style={{ ...btn, cursor: "pointer" }} title="Nahraje celou složku i s podsložkami — struktura zůstane stejná">
            📁 Vybrat složku
            <input type="file" multiple webkitdirectory="" directory="" style={{ display: "none" }} onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; nahrat(f); }} />
          </label>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#64748b" }}>Soubory i celé složky s podsložkami — vyber je, nebo je sem přetáhni myší. Dokumenty a protokoly jdou na OneDrive do Dokumentů, fotky do Fotek.</div>
      {zprava && <div role={zprava.chyba ? "alert" : "status"} style={{ fontSize: 13, fontWeight: 700, color: zprava.chyba ? "#991b1b" : "#166534" }}>{zprava.text}</div>}
    </div>
  );
}
