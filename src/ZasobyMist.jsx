// ─── Zásoby po místech (Hlavní sklad, auta) + přesun mezi nimi ──────────────
// Skutečná evidence ze sklad_zasoby. Přesun (např. naložení materiálu do auta)
// přes funkci presun_zasob v DB — zapíše pohyb a změní zásoby obou míst.
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

  const nacist = async () => {
    const [{ data: m }, { data: z }] = await Promise.all([
      supabase.from("sklad_mista").select("*").eq("aktivni", true).order("hlavni", { ascending: false }).order("nazev"),
      supabase.from("sklad_zasoby").select("*"),
    ]);
    setMista(m || []);
    setZasoby(z || []);
    setPresun((p) => (p.z || !m?.length ? p : { ...p, z: String(m.find((x) => x.hlavni)?.id || ""), do: String(m.find((x) => x.typ === "auto")?.id || "") }));
  };
  useEffect(() => { Promise.resolve().then(nacist); }, []);

  const produkt = (id) => products.find((p) => String(p.id) === String(id));
  const naMiste = (pid, mid) => Number(zasoby.find((z) => String(z.product_id) === String(pid) && String(z.misto_id) === String(mid))?.mnozstvi || 0);

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

  const q = bezDiakritiky(hledat);
  const viditelne = products.filter((p) => !q || bezDiakritiky(`${p.name} ${p.sku || ""}`).includes(q));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "left" }}>
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

      <input style={{ ...pole, maxWidth: 320 }} type="search" placeholder="Hledat položku…" value={hledat} onChange={(e) => setHledat(e.target.value)} />
      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ textAlign: "left", color: "#64748b", fontSize: 11 }}>
            <th style={{ padding: "8px 10px" }}>Položka</th>
            {mista.map((m) => <th key={m.id} style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>{m.typ === "auto" ? "🚚" : "📦"} {m.nazev}</th>)}
            <th style={{ padding: "8px 10px", textAlign: "right" }}>Celkem</th>
          </tr></thead>
          <tbody>
            {viditelne.map((p) => {
              const celkem = mista.reduce((s, m) => s + naMiste(p.id, m.id), 0);
              return (
                <tr key={p.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "7px 10px", fontWeight: 600 }}>{p.name}</td>
                  {mista.map((m) => { const v = naMiste(p.id, m.id); return <td key={m.id} style={{ padding: "7px 10px", textAlign: "right", color: v < 0 ? "#b91c1c" : v ? "#0f172a" : "#cbd5e1", fontWeight: v ? 700 : 400 }}>{v ? fmtQ(v) : "–"}</td>; })}
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 800 }}>{fmtQ(celkem)} {p.unit || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: "#64748b" }}>Záporné číslo = na místě se vydalo víc, než se tam evidovalo (např. materiál nebyl na auto zapsán přesunem). Výdeje z docházky se odepisují z místa, které zaměstnanec u materiálu zvolil, až po schválení dne.</div>
    </div>
  );
}
