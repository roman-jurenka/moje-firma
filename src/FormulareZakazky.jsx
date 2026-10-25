// ─── Formuláře k zakázce v Průběhu (NZÚ Light, ČEZ A1, protokol ochran) ─────
// Seznam formulářů, které pro zakázku platí. Klik otevře formulář předvyplněný
// ze zakázky; vyplněné hodnoty se ukládají k zakázce (zakazky_prubeh.dokumenty
// .vyplnene), technické a firemní údaje se pamatují pro příští zakázku.
// Výstup: stažení PDF nebo uložení do Dokumentů zakázky.
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { FORMULARE, POSLEDNI_KEY, krajObce, vyplnitPdf, protokolPdf } from "./formulareZakazky.js";
import { aktualniFirma } from "./firmaDokumenty.js";
import { nahratFotkuZakazky } from "./fotkyZakazky.js";

const bezpecne = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .-]+/g, "").replace(/\s+/g, " ").trim();

export default function FormulareZakazky({ z, zakaznik, slozka, currentUser, onUlozeno, onNahrano }) {
  const platne = FORMULARE.filter((f) => f.plati(z, zakaznik));
  const vyplnene = z?.dokumenty?.vyplnene || {};
  const [otevreny, setOtevreny] = useState(null); // { def, h }
  const [pracuji, setPracuji] = useState("");
  const [zprava, setZprava] = useState(null);
  const [firma, setFirma] = useState(null);

  useEffect(() => {
    if (!otevreny) return undefined;
    const h = (e) => { if (e.key === "Escape") setOtevreny(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [otevreny]);

  const otevrit = async (def) => {
    setZprava(null); setPracuji("nacitam");
    try {
      const [{ znacky }, { data: posl }, { data: sn }] = await Promise.all([
        aktualniFirma(),
        supabase.from("app_settings").select("value").eq("key", POSLEDNI_KEY).maybeSingle(),
        supabase.from("vyrobni_cisla").select("sn, nazev, druh").or([z.contract_id && `contract_id.eq.${z.contract_id}`, `prubeh_id.eq.${z.id}`].filter(Boolean).join(",")),
      ]);
      setFirma(znacky);
      const zaklad = def.predvyplnit({ z, zakaznik: zakaznik || {}, firma: znacky, sn: sn || [], technik: currentUser?.name || "" });
      const prazdne = (x) => x === undefined || x === null || x === "";
      const minule = posl?.value?.[def.id] || {};
      const minuleZak = posl?.value?.[`${def.id}:${z.customer_id}`] || {};
      // přednost: uložené u zakázky > dodavatel pro tohoto klienta > předvyplnění ze zakázky > technika z minula (jen do prázdných)
      const technika = Object.fromEntries((def.pamatovat || []).filter((k) => prazdne(zaklad[k]) && !prazdne(minule[k])).map((k) => [k, minule[k]]));
      const proKlienta = Object.fromEntries((def.pamatovatZakaznik || []).filter((k) => !prazdne(minuleZak[k])).map((k) => [k, minuleZak[k]]));
      const h = { ...zaklad, ...technika, ...proKlienta, ...(vyplnene[def.id]?.hodnoty || {}) };
      setOtevreny({ def, h });
      // kraj dohledat podle obce (NZÚ)
      if ("kraj" in h && !h.kraj && h.obec) krajObce(h.obec, h.psc).then((k) => k && setOtevreny((o) => (o && o.def.id === def.id && !o.h.kraj ? { ...o, h: { ...o.h, kraj: k } } : o)));
    } catch (e) {
      setZprava({ chyba: true, text: "Formulář se nepodařilo připravit: " + (e.message || e) });
    }
    setPracuji("");
  };

  const ulozitHodnoty = async (def, h) => {
    const dokumenty = { ...(z.dokumenty || {}), vyplnene: { ...vyplnene, [def.id]: { hodnoty: h, upraveno: new Date().toISOString(), kdo: currentUser?.name || null } } };
    const { error } = await supabase.from("zakazky_prubeh").update({ dokumenty, updated_at: new Date().toISOString() }).eq("id", z.id);
    if (error) throw error;
    onUlozeno?.(dokumenty);
    // zapamatovat technické a firemní údaje na příště
    const { data: posl } = await supabase.from("app_settings").select("value").eq("key", POSLEDNI_KEY).maybeSingle();
    const pamet = { ...(posl?.value || {}), [def.id]: Object.fromEntries((def.pamatovat || []).map((k) => [k, h[k]])) };
    if (def.pamatovatZakaznik && z.customer_id) pamet[`${def.id}:${z.customer_id}`] = Object.fromEntries(def.pamatovatZakaznik.map((k) => [k, h[k]]));
    await supabase.from("app_settings").upsert({ key: POSLEDNI_KEY, value: pamet, updated_at: new Date().toISOString() });
  };

  const vytvorit = async (def, h) => (def.html ? protokolPdf(h, firma || {}) : vyplnitPdf(def, h));
  const nazevSouboru = (def) => `${def.soubor} - ${bezpecne(zakaznik?.company || zakaznik?.name || z.nazev)}.pdf`;

  const akce = async (co) => {
    const { def, h } = otevreny;
    setPracuji(co); setZprava(null);
    try {
      await ulozitHodnoty(def, h);
      if (co === "ulozit") { setZprava({ text: "✓ Uloženo u zakázky." }); setPracuji(""); return; }
      const blob = await vytvorit(def, h);
      if (co === "stahnout") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = nazevSouboru(def); a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        setZprava({ text: "✓ PDF staženo." });
      } else if (co === "nahled") {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else if (co === "dokumenty") {
        const soubor = new File([blob], nazevSouboru(def), { type: "application/pdf" });
        const row = await nahratFotkuZakazky(soubor, { slozka, contractId: z.contract_id || null, prubehId: z.id, kategorie: "Dokumenty", nahral: currentUser?.employeeId || null, popis: nazevSouboru(def), pripraveno: true });
        onNahrano?.(row);
        setZprava({ text: "✓ Uloženo do Dokumentů zakázky." });
      }
    } catch (e) {
      setZprava({ chyba: true, text: "Nepodařilo se: " + (e.message || e) });
    }
    setPracuji("");
  };

  if (!platne.length) return <div style={{ fontSize: 13, color: "#64748b" }}>Pro tento typ zakázky zatím nejsou žádné formuláře.</div>;

  const tl = (bg, fg = "#fff") => ({ background: bg, color: fg, border: bg === "#fff" ? "1px solid #cbd5e1" : "none", borderRadius: 8, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
  const pole = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box", background: "#fff" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
      {platne.map((def) => {
        const v = vyplnene[def.id];
        return (
          <button key={def.id} type="button" disabled={!!pracuji} onClick={() => otevrit(def)}
            style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
            <span><span style={{ marginRight: 6 }}>{def.ikona}</span><b style={{ fontSize: 13.5 }}>{def.nazev}</b></span>
            <span style={{ fontSize: 12, color: v ? "#15803d" : "#94a3b8", whiteSpace: "nowrap" }}>{v ? `✓ vyplněno ${new Date(v.upraveno).toLocaleDateString("cs-CZ")}` : "vyplnit →"}</span>
          </button>
        );
      })}
      {pracuji === "nacitam" && <div style={{ fontSize: 12.5, color: "#64748b" }}>Připravuji formulář…</div>}
      {zprava && !otevreny && <div role="status" style={{ fontSize: 13, color: zprava.chyba ? "#b91c1c" : "#15803d" }}>{zprava.text}</div>}

      {otevreny && (
        <div role="dialog" aria-modal="true" aria-label={otevreny.def.nazev} onClick={(e) => { if (e.target === e.currentTarget) setOtevreny(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "min(860px, 100%)", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "14px 18px", borderBottom: "1px solid #e2e8f0" }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{otevreny.def.ikona} {otevreny.def.nazev}</div>
                <div style={{ fontSize: 12.5, color: "#64748b" }}>{z.nazev} · předvyplněno ze zakázky, výrobních čísel a minulého formuláře — zkontroluj a doplň</div>
              </div>
              <button type="button" aria-label="Zavřít" style={tl("#fff", "#334155")} onClick={() => setOtevreny(null)}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "10px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              {otevreny.def.sekce.map((s) => (
                <fieldset key={s.nazev} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px 12px", margin: 0 }}>
                  <legend style={{ fontWeight: 800, fontSize: 13, padding: "0 4px" }}>{s.nazev}</legend>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                    {s.pole.map((p) => {
                      const v = otevreny.h[p.id];
                      const set = (hodnota) => setOtevreny((o) => ({ ...o, h: { ...o.h, [p.id]: hodnota } }));
                      const id = `fz-${otevreny.def.id}-${p.id}`;
                      const sirka = p.sirka === 2 || p.typ === "dlouhe" ? { gridColumn: "span 2" } : {};
                      if (p.typ === "check") return (
                        <label key={p.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, ...sirka }}>
                          <input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} /> {p.label}
                        </label>
                      );
                      return (
                        <div key={p.id} style={sirka}>
                          <label htmlFor={id} style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#475569", marginBottom: 2 }}>{p.label}</label>
                          {p.typ === "select" ? (
                            <select id={id} style={pole} value={v ?? ""} onChange={(e) => set(e.target.value)}>{p.moznosti.map((m) => <option key={m}>{m}</option>)}</select>
                          ) : p.typ === "dlouhe" ? (
                            <textarea id={id} style={{ ...pole, minHeight: 60 }} value={v ?? ""} onChange={(e) => set(e.target.value)} />
                          ) : (
                            <input id={id} style={pole} value={v ?? ""} onChange={(e) => set(e.target.value)} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "12px 18px", borderTop: "1px solid #e2e8f0" }}>
              <button type="button" style={tl("#0369a1")} disabled={!!pracuji} onClick={() => akce("dokumenty")}>{pracuji === "dokumenty" ? "Ukládám…" : "📁 Uložit PDF do Dokumentů"}</button>
              <button type="button" style={tl("#fff", "#0369a1")} disabled={!!pracuji} onClick={() => akce("stahnout")}>{pracuji === "stahnout" ? "Připravuji…" : "⬇ Stáhnout PDF"}</button>
              <button type="button" style={tl("#fff", "#334155")} disabled={!!pracuji} onClick={() => akce("nahled")}>👁 Náhled</button>
              <button type="button" style={tl("#fff", "#334155")} disabled={!!pracuji} onClick={() => akce("ulozit")}>💾 Jen uložit údaje</button>
              {zprava && <span role="status" style={{ fontSize: 13, color: zprava.chyba ? "#b91c1c" : "#15803d" }}>{zprava.text}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
