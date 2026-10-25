// ─── Knihovna dokumentů podle typu zakázky (Průběh → 📚 Dokumenty dle typu) ───
// Admin sem jednou nahraje certifikáty, návody, prohlášení o shodě a vzory pro
// každý typ zakázky (nebo pro všechny typy). Každá zakázka daného typu je pak
// automaticky ukáže ve svých Dokumentech — náhled, stažení, podklad k předání.
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { TYPY } from "./prubehFaze.js";

const BUCKET = "dokumenty-typu";
const bezpecneJmeno = (n) => String(n || "soubor").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);

export default function KnihovnaTypu({ currentUser, onZavrit }) {
  const [typ, setTyp] = useState("FVE");
  const [vse, setVse] = useState(null);
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState("");
  const [uprava, setUprava] = useState(null); // { id, nazev, popis }

  const nacist = async () => {
    const { data, error } = await supabase.from("dokumenty_typu").select("*").order("poradi").order("nazev");
    if (error) setChyba(error.message);
    setVse(data || []);
  };
  useEffect(() => { Promise.resolve().then(nacist); }, []);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onZavrit(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onZavrit]);

  const nahrat = async (files) => {
    if (!files?.length) return;
    setPracuji(true); setChyba("");
    try {
      const max = Math.max(0, ...(vse || []).filter((d) => d.typ === typ).map((d) => d.poradi || 0));
      let i = 0;
      for (const f of files) {
        const cesta = `${typ === "*" ? "vse" : typ}/${Date.now()}-${bezpecneJmeno(f.name)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(cesta, f, { contentType: f.type || undefined });
        if (error) throw new Error(`${f.name}: ${error.message}`);
        const { error: e2 } = await supabase.from("dokumenty_typu").insert({ typ, nazev: f.name, cesta, poradi: max + ++i, nahral: currentUser?.name || null });
        if (e2) throw e2;
      }
      await nacist();
    } catch (e) { setChyba("Nahrání se nepovedlo: " + (e.message || e)); }
    setPracuji(false);
  };
  const ulozitUpravu = async () => {
    const { error } = await supabase.from("dokumenty_typu").update({ nazev: uprava.nazev.trim() || "Dokument", popis: uprava.popis.trim() || null }).eq("id", uprava.id);
    if (error) { setChyba(error.message); return; }
    setUprava(null);
    await nacist();
  };
  const smazat = async (d) => {
    if (!window.confirm(`Smazat „${d.nazev}“ z knihovny? Zmizí ze všech zakázek typu ${d.typ === "*" ? "všechny" : d.typ}.`)) return;
    const { error } = await supabase.from("dokumenty_typu").delete().eq("id", d.id);
    if (error) { setChyba(error.message); return; }
    await supabase.storage.from(BUCKET).remove([d.cesta]);
    await nacist();
  };
  const posunout = async (d, smer) => {
    const seznam = (vse || []).filter((x) => x.typ === d.typ);
    const i = seznam.findIndex((x) => x.id === d.id), j = i + smer;
    if (j < 0 || j >= seznam.length) return;
    const b = seznam[j];
    await Promise.all([
      supabase.from("dokumenty_typu").update({ poradi: b.poradi ?? j }).eq("id", d.id),
      supabase.from("dokumenty_typu").update({ poradi: d.poradi ?? i }).eq("id", b.id),
    ]);
    await nacist();
  };
  const otevrit = async (d) => {
    const okno = window.open("", "_blank");
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(d.cesta, 600);
    if (data?.signedUrl && okno) okno.location.href = data.signedUrl; else okno?.close();
  };

  const typy = [{ id: "*", label: "Všechny typy" }, ...TYPY];
  const pocet = (t) => (vse || []).filter((d) => d.typ === t).length;
  const seznam = (vse || []).filter((d) => d.typ === typ);
  const tl = (bg, fg = "#fff") => ({ background: bg, color: fg, border: bg === "#fff" ? "1px solid #cbd5e1" : "none", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
  const pole = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 9px", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };

  return (
    <div role="dialog" aria-modal="true" aria-label="Dokumenty podle typu zakázky" onClick={(e) => { if (e.target === e.currentTarget) onZavrit(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 14, width: "min(820px, 100%)", maxHeight: "90vh", overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>📚 Dokumenty podle typu zakázky</div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 3 }}>Co sem nahraješ, ukáže se automaticky v Dokumentech každé zakázky daného typu (i těch stávajících) — certifikáty, návody, prohlášení o shodě, vzory pro zákazníka.</div>
          </div>
          <button type="button" aria-label="Zavřít" style={tl("#fff", "#334155")} onClick={onZavrit}>✕</button>
        </div>

        <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {typy.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={typ === t.id} onClick={() => setTyp(t.id)}
              style={{ background: typ === t.id ? "#e0f2fe" : "#fff", border: `1px solid ${typ === t.id ? "#7dd3fc" : "#e2e8f0"}`, color: typ === t.id ? "#0369a1" : "#475569", borderRadius: 999, padding: "5px 12px", fontSize: 13, fontWeight: typ === t.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {t.id === "*" ? t.label : t.id} {pocet(t.id) ? `(${pocet(t.id)})` : ""}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: "#64748b" }}>{typ === "*" ? "Tyto dokumenty dostane každá zakázka bez ohledu na typ." : TYPY.find((t) => t.id === typ)?.label}</div>

        {chyba && <div role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{chyba}</div>}
        {vse === null ? <div style={{ fontSize: 13, color: "#64748b" }}>Načítám…</div> : (
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            {seznam.length === 0 && <div style={{ padding: 12, fontSize: 13, color: "#64748b" }}>Pro tento typ zatím nic. Nahraj soubory tlačítkem níž.</div>}
            {seznam.map((d, i) => (
              <div key={d.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", borderTop: i ? "1px solid #f1f5f9" : "none", flexWrap: "wrap" }}>
                {uprava?.id === d.id ? (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 220 }}>
                    <input aria-label="Název" style={pole} value={uprava.nazev} onChange={(e) => setUprava({ ...uprava, nazev: e.target.value })} />
                    <input aria-label="Popis" style={pole} value={uprava.popis} placeholder="Popis (nepovinné), např. předat zákazníkovi při předání" onChange={(e) => setUprava({ ...uprava, popis: e.target.value })} />
                    <div style={{ display: "flex", gap: 6 }}><button type="button" style={tl("#0369a1")} onClick={ulozitUpravu}>Uložit</button><button type="button" style={tl("#fff", "#334155")} onClick={() => setUprava(null)}>Zrušit</button></div>
                  </div>
                ) : (
                  <button type="button" onClick={() => otevrit(d)} style={{ flex: 1, minWidth: 200, textAlign: "left", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a" }}>📄 {d.nazev}</div>
                    {d.popis && <div style={{ fontSize: 12, color: "#64748b" }}>{d.popis}</div>}
                  </button>
                )}
                {uprava?.id !== d.id && (
                  <span style={{ display: "flex", gap: 4 }}>
                    <button type="button" aria-label="Posunout nahoru" disabled={i === 0} style={{ ...tl("#fff", "#334155"), padding: "3px 8px" }} onClick={() => posunout(d, -1)}>↑</button>
                    <button type="button" aria-label="Posunout dolů" disabled={i === seznam.length - 1} style={{ ...tl("#fff", "#334155"), padding: "3px 8px" }} onClick={() => posunout(d, 1)}>↓</button>
                    <button type="button" aria-label={`Upravit ${d.nazev}`} style={{ ...tl("#fff", "#334155"), padding: "3px 8px" }} onClick={() => setUprava({ id: d.id, nazev: d.nazev, popis: d.popis || "" })}>✏️</button>
                    <button type="button" aria-label={`Smazat ${d.nazev}`} style={{ ...tl("#fff", "#b91c1c"), padding: "3px 8px" }} onClick={() => smazat(d)}>🗑</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <label style={{ ...tl("#0369a1"), alignSelf: "flex-start", display: "inline-block", opacity: pracuji ? 0.6 : 1 }}>
          {pracuji ? "Nahrávám…" : `+ Nahrát dokumenty pro ${typ === "*" ? "všechny typy" : typ}`}
          <input type="file" multiple hidden disabled={pracuji} accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.zip" onChange={(e) => { nahrat([...e.target.files]); e.target.value = ""; }} />
        </label>
      </div>
    </div>
  );
}
