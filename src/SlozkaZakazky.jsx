// ─── Složka zakázky: přehled všeho nahraného ────────────────────────────────
// Ikona složky u typu zakázky → okno s fotkami (podle kategorií), dokumenty
// evidovanými v appce (smlouva, protokol, dodatky, odeslané nabídky, kalkulace)
// a skutečným obsahem složky Dokumenty na OneDrivu.

import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { OneDriveThumb } from "./storageUrl.jsx";
import { seznamDokumentu, odkazNaDokumenty } from "./dokumentyOneDrive.js";
import { isConnected, connectSharedAccount, odkazNaSlozku } from "./onedrive.js";
import { pocetFotekText } from "./fotkyZakazky.js";

const karta = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" };
const btnGhost = { background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 10, padding: "6px 11px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const nadpis = { fontSize: 13, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", letterSpacing: ".03em", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 };
const datum = (iso) => (iso ? new Date(iso).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }) : "");
const velikost = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} kB`);
const ikonaSouboru = (n) => (/\.(docx?|odt)$/i.test(n) ? "📝" : /\.(xlsx?|xlsm|csv)$/i.test(n) ? "📊" : /\.pdf$/i.test(n) ? "📕" : /\.html?$/i.test(n) ? "🌐" : /\.(jpe?g|png|heic|webp)$/i.test(n) ? "🖼" : "📄");

export default function SlozkaZakazky({ zak, slozka, fotky, onZavrit, onFotka, onVsechnyFotky }) {
  const [nabidky, setNabidky] = useState(zak.quote_id ? null : []);
  const [od, setOd] = useState({ stav: isConnected() ? "nacitam" : "nepripojeno", soubory: [] });

  useEffect(() => {
    let zruseno = false;
    if (zak.quote_id) {
      supabase.from("nabidky_odeslane").select("id, cislo, cena, created_at, onedrive_url, onedrive_chyba").eq("quote_id", zak.quote_id).order("created_at", { ascending: true })
        .then(({ data }) => { if (!zruseno) setNabidky(data || []); });
    }
    return () => { zruseno = true; };
  }, [zak.quote_id]);

  const nactiOneDrive = async (prihlasit = false) => {
    if (prihlasit && !isConnected()) {
      try { await connectSharedAccount(); } catch { /* bez OneDrivu */ }
    }
    if (!isConnected()) { setOd({ stav: "nepripojeno", soubory: [] }); return; }
    setOd((o) => ({ ...o, stav: "nacitam" }));
    await nactiSoubory();
  };
  // Jen zápis výsledku (bez synchronního setState) — volá se i z efektu při otevření.
  const nactiSoubory = async () => {
    try {
      const soubory = await seznamDokumentu(slozka);
      setOd({ stav: "ok", soubory: (soubory || []).filter((x) => x.file).sort((a, b) => String(b.lastModifiedDateTime).localeCompare(String(a.lastModifiedDateTime))) });
    } catch (e) {
      setOd({ stav: "chyba", soubory: [], chyba: e.message || String(e) });
    }
  };
  useEffect(() => {
    if (isConnected()) nactiSoubory();
    // jen při otevření okna
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slozka]);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onZavrit(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onZavrit]);

  const otevrit = async (ziskatOdkaz) => {
    const okno = window.open("", "_blank");
    const odkaz = await ziskatOdkaz();
    if (odkaz && okno) okno.location.href = odkaz; else okno?.close();
  };

  // Fotky podle kategorií
  const poradi = ["Obhlídka", "Smlouva", "Před montáží", "Průběh montáže", "Střecha", "Uzemnění", "Po montáži", "Detail střídač/baterie", "Předávací protokol", "Servis"];
  const poKat = {};
  (fotky || []).forEach((p) => { const k = p.category || "Bez kategorie"; poKat[k] = (poKat[k] || 0) + 1; });
  const kategorie = Object.keys(poKat).sort((a, b) => ((poradi.indexOf(a) + 1) || 99) - ((poradi.indexOf(b) + 1) || 99));

  // Dokumenty evidované v appce
  const d = zak.dokumenty || {};
  const ceka = d.onedriveCeka || [];
  const radky = [
    ...(nabidky || []).map((n) => ({ key: `n${n.id}`, ikona: "💰", text: `Nabídka ${n.cislo || ""} — odeslaná`, kdy: n.created_at, url: n.onedrive_url, chyba: !n.onedrive_url && n.onedrive_chyba })),
    d.smlouva && { key: "smlouva", ikona: "📝", text: "Smlouva o dílo", kdy: d.smlouva.at, url: d.smlouva.onedrive, chyba: ceka.some((c) => c.id === "smlouva") },
    ...(d.dodatky || []).map((x) => ({ key: `d${x.cislo}`, ikona: "📎", text: `Dodatek č. ${x.cislo}${x.popis ? ` — ${x.popis}` : ""}`, kdy: x.at, url: x.onedrive, chyba: ceka.some((c) => c.id === `dodatek-${x.cislo}`) })),
    d.protokol && { key: "protokol", ikona: "✅", text: "Předávací protokol", kdy: d.protokol.at, url: d.protokol.onedrive, chyba: ceka.some((c) => c.id === "protokol") },
    zak.naceneni_rea?.excel?.soubor && { key: "rea", ikona: "📊", text: `Kalkulace realizace — ${zak.naceneni_rea.excel.soubor}`, kdy: zak.naceneni_rea.upraveno, url: zak.naceneni_rea.excel.onedrive, chyba: !zak.naceneni_rea.excel.onedrive },
    zak.naceneni_rea?.invoice_number && { key: "fa", ikona: "🧾", text: `Konečná faktura ${zak.naceneni_rea.invoice_number}`, kdy: zak.naceneni_rea.upraveno, url: null, vAppce: "ve Fakturaci" },
  ].filter(Boolean);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="slozka-titulek" onClick={(e) => { if (e.target === e.currentTarget) onZavrit(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 9000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }}>
      <div style={{ background: "#f8fafc", borderRadius: 16, width: "100%", maxWidth: 720, padding: 18, boxShadow: "0 20px 50px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div id="slozka-titulek" style={{ fontSize: 18, fontWeight: 800 }}>📁 Složka zakázky</div>
            <div style={{ fontSize: 13, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>OneDrive › FirmaCRM › Zakázky › {slozka}</div>
          </div>
          <button type="button" onClick={onZavrit} aria-label="Zavřít" style={{ ...btnGhost, fontSize: 18, padding: "2px 10px" }}>✕</button>
        </div>

        {/* Souhrn */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          {[["📷", "Fotky", (fotky || []).length], ["📄", "Dokumenty", radky.length], ["☁️", "Na OneDrivu (Dokumenty)", od.stav === "ok" ? od.soubory.length : "—"]].map(([i, t, n]) => (
            <div key={t} style={{ ...karta, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{i} {t}</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{n}</div>
            </div>
          ))}
        </div>
        {ceka.length > 0 && (
          <div role="alert" style={{ ...karta, background: "#fef2f2", borderColor: "#fecaca", color: "#991b1b", fontSize: 13 }}>
            ⚠ Na OneDrive se zatím neuložilo: {ceka.map((c) => (c.druh === "dodatek" ? `Dodatek č. ${c.cislo}` : c.druh === "smlouva" ? "Smlouva o dílo" : "Předávací protokol")).join(", ")} — „Zkusit znovu“ je v hlavičce zakázky.
          </div>
        )}

        {/* Fotky */}
        <div style={karta}>
          <div style={nadpis}>
            <span>📷 Fotky — {pocetFotekText((fotky || []).length)}</span>
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" style={btnGhost} onClick={() => otevrit(async () => {
                if (!isConnected()) { try { await connectSharedAccount(); } catch { return null; } }
                return odkazNaSlozku(`FirmaCRM/Zakázky/${slozka.replace(/[/\\?%*:|"<>]/g, "_")}/Fotky`);
              })}>☁️ Fotky na OneDrivu</button>
            </span>
          </div>
          {!(fotky || []).length ? <div style={{ fontSize: 13, color: "#94a3b8" }}>Zatím žádné fotky.</div> : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {kategorie.map((k) => <span key={k} style={{ background: "#f1f5f9", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, color: "#334155" }}>{k} · {poKat[k]}</span>)}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {fotky.slice(0, 10).map((p, i) => (
                  <button key={p.id} type="button" onClick={() => onFotka(i)} aria-label={`Zobrazit fotku ${i + 1} z ${fotky.length}`}
                    style={{ width: 60, height: 60, padding: 0, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0", cursor: "zoom-in", background: "#f1f5f9" }}>
                    <OneDriveThumb itemId={p.item_id} fallbackUrl={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </button>
                ))}
                {fotky.length > 10 && <button type="button" style={{ ...btnGhost, alignSelf: "center" }} onClick={onVsechnyFotky}>+{fotky.length - 10} dalších</button>}
              </div>
            </>
          )}
        </div>

        {/* Dokumenty v appce */}
        <div style={karta}>
          <div style={nadpis}><span>📄 Dokumenty zakázky</span></div>
          {nabidky === null ? <div style={{ fontSize: 13, color: "#64748b" }}>Načítám…</div>
            : !radky.length ? <div style={{ fontSize: 13, color: "#94a3b8" }}>Zatím žádné dokumenty (nabídka, smlouva, dodatek, protokol).</div>
              : radky.map((r) => (
                <div key={r.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderTop: "1px solid #f1f5f9", fontSize: 14, flexWrap: "wrap" }}>
                  <span aria-hidden="true">{r.ikona}</span>
                  <span style={{ flex: 1, minWidth: 160 }}>{r.text}{r.kdy && <span style={{ color: "#94a3b8", fontSize: 12 }}> · {datum(r.kdy)}</span>}</span>
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: "#0369a1" }}>☁️ Otevřít</a>
                    : r.vAppce ? <span style={{ fontSize: 12, color: "#64748b" }}>{r.vAppce}</span>
                      : <span style={{ fontSize: 12, fontWeight: 700, color: r.chyba ? "#b91c1c" : "#94a3b8" }}>{r.chyba ? "⚠ neuloženo na OneDrive" : "jen v appce"}</span>}
                </div>
              ))}
        </div>

        {/* Skutečný obsah OneDrivu */}
        <div style={karta}>
          <div style={nadpis}>
            <span>☁️ Složka Dokumenty na OneDrivu</span>
            <span style={{ display: "flex", gap: 6 }}>
              {od.stav !== "nepripojeno" && <button type="button" style={btnGhost} onClick={() => nactiOneDrive()} disabled={od.stav === "nacitam"}>↻</button>}
              <button type="button" style={btnGhost} onClick={() => otevrit(() => odkazNaDokumenty(slozka))}>Otevřít složku</button>
            </span>
          </div>
          {od.stav === "nepripojeno" ? (
            <div style={{ fontSize: 13, color: "#64748b" }}>OneDrive není připojený. <button type="button" style={{ ...btnGhost, padding: "3px 9px", fontSize: 12 }} onClick={() => nactiOneDrive(true)}>Připojit a načíst</button></div>
          ) : od.stav === "nacitam" ? <div style={{ fontSize: 13, color: "#64748b" }}>Načítám obsah složky…</div>
            : od.stav === "chyba" ? <div style={{ fontSize: 13, color: "#b91c1c" }}>Obsah se nepodařilo načíst: {od.chyba}</div>
              : !od.soubory.length ? <div style={{ fontSize: 13, color: "#94a3b8" }}>Složka je zatím prázdná.</div>
                : od.soubory.map((f) => (
                  <a key={f.id} href={f.webUrl} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderTop: "1px solid #f1f5f9", fontSize: 14, color: "#0f172a", textDecoration: "none" }}>
                    <span aria-hidden="true">{ikonaSouboru(f.name)}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>{velikost(f.size || 0)} · {datum(f.lastModifiedDateTime)}</span>
                  </a>
                ))}
        </div>
      </div>
    </div>
  );
}
