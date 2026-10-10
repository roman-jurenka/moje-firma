// ─── Zásoby po místech (Hlavní sklad, auta) + přesun mezi nimi ──────────────
// Skutečná evidence ze sklad_zasoby. Přesun (např. naložení materiálu do auta)
// přes funkci presun_zasob v DB — zapíše pohyb a změní zásoby obou míst.
// Místa skladu jde přidat / odebrat (odebrat = skrýt, jen když je prázdné);
// u položky se eviduje umístění na místě (kód regálu / police).
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { bezDiakritiky } from "./denniZapis.js";

const pole = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit", color: "#0f172a", background: "#fff", boxSizing: "border-box", width: "100%" };
const cislo = (v) => { const t = String(v ?? "").replace(/\s/g, "").replace(",", "."); return t === "" ? null : Number(t); };
const fmtQ = (q) => String(Math.round(Number(q) * 100) / 100).replace(".", ",");

export default function ZasobyMist({ products, onZmena }) {
  const [mista, setMista] = useState([]);
  const [zasoby, setZasoby] = useState([]);
  const [presun, setPresun] = useState({ product_id: "", z: "", do: "", mnozstvi: "" });
  const [hledat, setHledat] = useState("");
  const [zprava, setZprava] = useState(null);
  const [pracuji, setPracuji] = useState(false);
  const [sprava, setSprava] = useState(false);
  const [nove, setNove] = useState({ nazev: "", typ: "sklad", kod: "" });
  const [umMisto, setUmMisto] = useState("");

  const nacist = async () => {
    const [{ data: m }, { data: z }] = await Promise.all([
      supabase.from("sklad_mista").select("*").eq("aktivni", true).order("hlavni", { ascending: false }).order("nazev"),
      supabase.from("sklad_zasoby").select("*"),
    ]);
    setMista(m || []);
    setUmMisto((u) => u || String(m?.find((x) => x.hlavni)?.id || ""));
    setZasoby(z || []);
    setPresun((p) => (p.z || !m?.length ? p : { ...p, z: String(m.find((x) => x.hlavni)?.id || ""), do: String(m.find((x) => x.typ === "auto")?.id || "") }));
  };
  useEffect(() => { Promise.resolve().then(nacist); }, []);

  const produkt = (id) => products.find((p) => String(p.id) === String(id));
  const radek = (pid, mid) => zasoby.find((z) => String(z.product_id) === String(pid) && String(z.misto_id) === String(mid));
  const naMiste = (pid, mid) => Number(radek(pid, mid)?.mnozstvi || 0);

  // ── správa míst skladu ──
  const pridatMisto = async () => {
    const nazev = nove.nazev.trim();
    if (!nazev) { setZprava({ chyba: true, text: "Zadej název místa." }); return; }
    if (mista.some((m) => bezDiakritiky(m.nazev) === bezDiakritiky(nazev))) { setZprava({ chyba: true, text: `Místo „${nazev}“ už existuje.` }); return; }
    setPracuji(true);
    const { error } = await supabase.from("sklad_mista").insert({ nazev, typ: nove.typ, kod: nove.kod.trim() || null });
    setPracuji(false);
    if (error) { setZprava({ chyba: true, text: error.message }); return; }
    setZprava({ chyba: false, text: `✓ Přidáno místo „${nazev}“` });
    setNove({ nazev: "", typ: "sklad", kod: "" });
    await nacist();
  };
  const upravitMisto = async (m, zmena) => {
    if (Object.keys(zmena).every((k) => (m[k] || "") === (zmena[k] || ""))) return;
    if ("nazev" in zmena && !zmena.nazev) { setZprava({ chyba: true, text: "Název místa nesmí být prázdný." }); return; }
    const { error } = await supabase.from("sklad_mista").update(zmena).eq("id", m.id);
    if (error) { setZprava({ chyba: true, text: error.message }); return; }
    await nacist();
  };
  const odebratMisto = async (m) => {
    if (m.hlavni) return;
    const zbyva = zasoby.filter((z) => String(z.misto_id) === String(m.id) && Number(z.mnozstvi) !== 0);
    if (zbyva.length) { setZprava({ chyba: true, text: `Na místě „${m.nazev}“ jsou ještě zásoby (${zbyva.length} položek). Nejdřív je přesuň jinam.` }); return; }
    if (!window.confirm(`Odebrat místo „${m.nazev}“? Historie pohybů zůstane zachovaná.`)) return;
    const { error } = await supabase.from("sklad_mista").update({ aktivni: false }).eq("id", m.id);
    if (error) { setZprava({ chyba: true, text: error.message }); return; }
    setZprava({ chyba: false, text: `✓ Místo „${m.nazev}“ odebráno` });
    if (String(presun.z) === String(m.id) || String(presun.do) === String(m.id)) setPresun({ ...presun, z: "", do: "" });
    if (umMisto === String(m.id)) setUmMisto("");
    await nacist();
  };

  // ── umístění položky na místě (kód regálu) ──
  const ulozitUmisteni = async (pid, hodnota) => {
    const h = hodnota.trim() || null;
    const r0 = radek(pid, umMisto);
    if ((r0?.umisteni || null) === h) return;
    const { error } = r0
      ? await supabase.from("sklad_zasoby").update({ umisteni: h }).eq("product_id", pid).eq("misto_id", Number(umMisto))
      : await supabase.from("sklad_zasoby").insert({ product_id: pid, misto_id: Number(umMisto), mnozstvi: 0, umisteni: h });
    if (error) { setZprava({ chyba: true, text: error.message }); return; }
    setZasoby((zs) => r0 ? zs.map((z) => (z === r0 ? { ...z, umisteni: h } : z)) : [...zs, { product_id: pid, misto_id: Number(umMisto), mnozstvi: 0, umisteni: h }]);
  };

  const provest = async () => {
    const q = cislo(presun.mnozstvi);
    if (!presun.product_id || !presun.z || !presun.do || presun.z === presun.do) { setZprava({ chyba: true, text: "Vyber položku a dvě různá místa." }); return; }
    if (!q || Number.isNaN(q) || q <= 0) { setZprava({ chyba: true, text: "Zadej množství (např. 20 nebo 12,5)." }); return; }
    setPracuji(true); setZprava(null);
    const { error } = await supabase.rpc("presun_zasob", { p_product_id: Number(presun.product_id), p_z: Number(presun.z), p_do: Number(presun.do), p_mnozstvi: q, p_poznamka: null });
    setPracuji(false);
    if (error) { setZprava({ chyba: true, text: error.message }); return; }
    const p = produkt(presun.product_id);
    setZprava({ chyba: false, text: `✓ Přesunuto ${fmtQ(q)} ${p?.unit || ""} ${p?.name || ""}: ${mista.find((m) => String(m.id) === presun.z)?.nazev} → ${mista.find((m) => String(m.id) === presun.do)?.nazev}` });
    setPresun({ ...presun, mnozstvi: "" });
    await nacist();
    onZmena?.();
  };

  // ── záporné zásoby: doplnit převodem, nebo označit jako staré neevidované ──
  const [doplnitZ, setDoplnitZ] = useState({}); // "pid-mid" -> id místa, odkud doplnit
  const zaporne = zasoby.filter((z) => Number(z.mnozstvi) < 0 && mista.some((m) => String(m.id) === String(z.misto_id)));
  const klic = (z) => `${z.product_id}-${z.misto_id}`;
  const doplnit = async (z) => {
    const odkud = doplnitZ[klic(z)] || String(mista.find((m) => m.hlavni && String(m.id) !== String(z.misto_id))?.id || "");
    if (!odkud) { setZprava({ chyba: true, text: "Vyber, odkud materiál doplnit." }); return; }
    setPracuji(true); setZprava(null);
    const { error } = await supabase.rpc("presun_zasob", { p_product_id: z.product_id, p_z: Number(odkud), p_do: z.misto_id, p_mnozstvi: -Number(z.mnozstvi), p_poznamka: "Doplnění záporné zásoby" });
    setPracuji(false);
    if (error) { setZprava({ chyba: true, text: error.message }); return; }
    setZprava({ chyba: false, text: `✓ Doplněno ${fmtQ(-z.mnozstvi)} ${produkt(z.product_id)?.unit || ""} ${produkt(z.product_id)?.name || ""} z ${mista.find((m) => String(m.id) === String(odkud))?.nazev}` });
    await nacist(); onZmena?.();
  };
  const stare = async (seznam) => {
    if (!seznam.length) return;
    setPracuji(true); setZprava(null);
    let ok = 0;
    for (const z of seznam) {
      const { error } = await supabase.rpc("vyrovnat_zasoby", { p_product_id: z.product_id, p_misto: z.misto_id, p_poznamka: null });
      if (error) { setZprava({ chyba: true, text: `${produkt(z.product_id)?.name || "Položka"}: ${error.message}` }); break; }
      ok++;
    }
    setPracuji(false);
    if (ok) setZprava({ chyba: false, text: `✓ ${ok} ${ok === 1 ? "položka označena" : "položek označeno"} jako staré neevidované zásoby (stav místa srovnán na 0).` });
    await nacist(); onZmena?.();
  };

  const q = bezDiakritiky(hledat);
  const viditelne = products.filter((p) => !q || bezDiakritiky(`${p.name} ${p.sku || ""} ${radek(p.id, umMisto)?.umisteni || ""}`).includes(q));
  const ikona = (m) => (m.typ === "auto" ? "🚚" : "📦");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "left" }}>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800 }}>🏬 Místa skladu ({mista.length})</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{mista.map((m) => `${ikona(m)} ${m.nazev}${m.kod ? ` [${m.kod}]` : ""}`).join(" · ")}</div>
          <button type="button" onClick={() => setSprava(!sprava)}
            style={{ marginLeft: "auto", background: sprava ? "#e2e8f0" : "#0f172a", color: sprava ? "#0f172a" : "#fff", border: "none", borderRadius: 10, padding: "8px 12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {sprava ? "Hotovo" : "⚙ Přidat / odebrat sklad"}</button>
        </div>
        {sprava && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ textAlign: "left", color: "#64748b", fontSize: 11 }}>
                <th style={{ padding: "6px 8px" }}>Název</th><th style={{ padding: "6px 8px", width: 140 }}>Kód</th><th style={{ padding: "6px 8px", width: 110 }}>Typ</th><th style={{ padding: "6px 8px", width: 80, textAlign: "right" }}>Položek</th><th style={{ width: 110 }} />
              </tr></thead>
              <tbody>
                {mista.map((m) => {
                  const pocet = zasoby.filter((z) => String(z.misto_id) === String(m.id) && Number(z.mnozstvi) !== 0).length;
                  return (
                    <tr key={m.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "5px 8px", minWidth: 160 }}><input style={pole} defaultValue={m.nazev} aria-label="Název místa" onBlur={(e) => upravitMisto(m, { nazev: e.target.value.trim() })} /></td>
                      <td style={{ padding: "5px 8px", minWidth: 90 }}><input style={pole} defaultValue={m.kod || ""} placeholder="např. S1" aria-label="Kód místa" onBlur={(e) => upravitMisto(m, { kod: e.target.value.trim() || null })} /></td>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{ikona(m)} {m.typ === "auto" ? "auto" : "sklad"}{m.hlavni ? " · hlavní" : ""}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right" }}>{pocet}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right" }}>
                        {m.hlavni ? <span style={{ fontSize: 11, color: "#94a3b8" }}>nelze odebrat</span>
                          : <button type="button" onClick={() => odebratMisto(m)} style={{ background: "#fff", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>✕ Odebrat</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, alignItems: "end" }}>
              <label style={{ fontSize: 12, color: "#475569" }}>Nový sklad / místo
                <input style={pole} value={nove.nazev} placeholder="např. Sklad Bruntál" onChange={(e) => setNove({ ...nove, nazev: e.target.value })} /></label>
              <label style={{ fontSize: 12, color: "#475569" }}>Kód
                <input style={pole} value={nove.kod} placeholder="např. S2" onChange={(e) => setNove({ ...nove, kod: e.target.value })} /></label>
              <label style={{ fontSize: 12, color: "#475569" }}>Typ
                <select style={pole} value={nove.typ} onChange={(e) => setNove({ ...nove, typ: e.target.value })}>
                  <option value="sklad">📦 sklad</option><option value="auto">🚚 auto</option>
                </select></label>
              <button type="button" disabled={pracuji} onClick={pridatMisto}
                style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>＋ Přidat</button>
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Odebrat jde jen prázdné místo (zásoby nejdřív přesuň). Odebrané místo se skryje, historie pohybů zůstane.</div>
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>🔄 Přesun materiálu (sklad ⇄ auto)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, alignItems: "end" }}>
          <label style={{ fontSize: 12, color: "#475569" }}>Položka
            <select style={pole} value={presun.product_id} onChange={(e) => setPresun({ ...presun, product_id: e.target.value })}>
              <option value="">— vyber —</option>
              {[...products].sort((a, b) => String(a.name).localeCompare(String(b.name), "cs")).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label style={{ fontSize: 12, color: "#475569" }}>Odkud
            <select style={pole} value={presun.z} onChange={(e) => setPresun({ ...presun, z: e.target.value })}>
              {mista.map((m) => <option key={m.id} value={m.id}>{m.typ === "auto" ? "🚚" : "📦"} {m.nazev}{presun.product_id ? ` (${fmtQ(naMiste(presun.product_id, m.id))})` : ""}</option>)}
            </select></label>
          <label style={{ fontSize: 12, color: "#475569" }}>Kam
            <select style={pole} value={presun.do} onChange={(e) => setPresun({ ...presun, do: e.target.value })}>
              {mista.map((m) => <option key={m.id} value={m.id}>{m.typ === "auto" ? "🚚" : "📦"} {m.nazev}</option>)}
            </select></label>
          <label style={{ fontSize: 12, color: "#475569" }}>Množství {presun.product_id ? `(${produkt(presun.product_id)?.unit || "ks"})` : ""}
            <input style={pole} inputMode="decimal" value={presun.mnozstvi} onChange={(e) => setPresun({ ...presun, mnozstvi: e.target.value })} /></label>
          <button type="button" disabled={pracuji} onClick={provest}
            style={{ background: "#0369a1", color: "#fff", border: "none", borderRadius: 10, padding: "10px 14px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{pracuji ? "Přesouvám…" : "Přesunout"}</button>
        </div>
        {zprava && <div role={zprava.chyba ? "alert" : "status"} style={{ marginTop: 8, fontSize: 13, color: zprava.chyba ? "#b91c1c" : "#15803d" }}>{zprava.text}</div>}
      </div>

      {zaporne.length > 0 && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800, color: "#9a3412" }}>⚠ Záporné zásoby ({zaporne.length})</div>
            <div style={{ fontSize: 12, color: "#9a3412", flex: "1 1 260px" }}>Materiál se vydal na zakázku z místa, kam předtím nebyl převeden. Doplň ho převodem, nebo ho označ jako staré zásoby, které nebyly evidované.</div>
            <button type="button" disabled={pracuji} onClick={() => { if (window.confirm(`Označit všech ${zaporne.length} záporných položek jako staré neevidované zásoby? Stav míst se srovná na 0.`)) stare(zaporne); }}
              style={{ background: "#fff", color: "#9a3412", border: "1px solid #fdba74", borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Vše jako staré zásoby</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {zaporne.map((z) => {
                  const p = produkt(z.product_id), m = mista.find((x) => String(x.id) === String(z.misto_id));
                  const zdroj = doplnitZ[klic(z)] || String(mista.find((x) => x.hlavni && String(x.id) !== String(z.misto_id))?.id || "");
                  return (
                    <tr key={klic(z)} style={{ borderTop: "1px solid #fed7aa" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700 }}>{p?.name || `#${z.product_id}`}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{m?.typ === "auto" ? "🚚" : "📦"} {m?.nazev}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#b91c1c", fontWeight: 800, whiteSpace: "nowrap" }}>{fmtQ(z.mnozstvi)} {p?.unit || ""}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <select value={zdroj} aria-label={`Odkud doplnit ${p?.name || ""}`} onChange={(e) => setDoplnitZ({ ...doplnitZ, [klic(z)]: e.target.value })}
                            style={{ ...pole, width: "auto", padding: "5px 8px", fontSize: 13 }}>
                            {mista.filter((x) => String(x.id) !== String(z.misto_id)).map((x) => <option key={x.id} value={x.id}>z {x.nazev} ({fmtQ(naMiste(z.product_id, x.id))})</option>)}
                          </select>
                          <button type="button" disabled={pracuji} onClick={() => doplnit(z)}
                            style={{ background: "#0369a1", color: "#fff", border: "none", borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Doplnit</button>
                          <button type="button" disabled={pracuji} onClick={() => stare([z])}
                            style={{ background: "#fff", color: "#9a3412", border: "1px solid #fdba74", borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Staré zásoby</button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input style={{ ...pole, maxWidth: 320 }} type="search" placeholder="Hledat položku nebo umístění…" value={hledat} onChange={(e) => setHledat(e.target.value)} />
        <label style={{ fontSize: 12, color: "#475569", display: "flex", alignItems: "center", gap: 6 }}>Umístění pro
          <select style={{ ...pole, width: "auto" }} value={umMisto} onChange={(e) => setUmMisto(e.target.value)}>
            {mista.map((m) => <option key={m.id} value={m.id}>{ikona(m)} {m.nazev}</option>)}
          </select></label>
      </div>
      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ textAlign: "left", color: "#64748b", fontSize: 11 }}>
            <th style={{ padding: "8px 10px" }}>Položka</th>
            <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>Umístění (kód)</th>
            {mista.map((m) => <th key={m.id} style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>{ikona(m)} {m.nazev}{m.kod ? ` [${m.kod}]` : ""}</th>)}
            <th style={{ padding: "8px 10px", textAlign: "right" }}>Celkem</th>
          </tr></thead>
          <tbody>
            {viditelne.map((p) => {
              const celkem = mista.reduce((s, m) => s + naMiste(p.id, m.id), 0);
              return (
                <tr key={p.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "7px 10px", fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: "4px 10px", width: 130 }}>
                    <input key={`${p.id}-${umMisto}`} style={{ ...pole, padding: "5px 8px", fontSize: 13, fontFamily: "ui-monospace, monospace", minWidth: 90 }} placeholder="–"
                      defaultValue={radek(p.id, umMisto)?.umisteni || ""} aria-label={`Umístění ${p.name}`}
                      onBlur={(e) => ulozitUmisteni(p.id, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                  </td>
                  {mista.map((m) => { const v = naMiste(p.id, m.id); return <td key={m.id} style={{ padding: "7px 10px", textAlign: "right", color: v < 0 ? "#b91c1c" : v ? "#0f172a" : "#cbd5e1", fontWeight: v ? 700 : 400 }}>{v ? fmtQ(v) : "–"}</td>; })}
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800 }}>{fmtQ(celkem)} {p.unit || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: "#64748b" }}>Záporné číslo = na místě se vydalo víc, než se tam evidovalo (např. materiál nebyl na auto zapsán přesunem) — srovnáš ho v rámečku „Záporné zásoby“ nahoře. Výdeje z docházky se odepisují z místa, které zaměstnanec u materiálu zvolil, až po schválení dne.</div>
    </div>
  );
}
