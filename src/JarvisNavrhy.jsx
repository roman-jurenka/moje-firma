// ─── Jarvis – fronta ke schválení ────────────────────────────────────────────
// Návrhy zápisů, které asistent Jarvis připravil z denních poznámek (poznámky
// k zakázkám, úkoly, termíny do kalendáře). Na konci dne je tu projdeš:
// Potvrdit = zapíše se do aplikace, Změnit = upravíš a pak potvrdíš,
// Smazat = zahodí se (zůstane jen v Jarvisově historii jako zamítnuté).
// Zápis dělá funkce jarvis_navrh_rozhodnout. Karta je vidět, jen když něco čeká.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

const DRUH = {
  poznamka_zakazky: { ikona: "🔧", nazev: "Poznámka k zakázce" },
  ukol: { ikona: "✅", nazev: "Úkol" },
  udalost_kalendare: { ikona: "📅", nazev: "Kalendář" },
};
const PRIORITY = ["Nízká", "Střední", "Vysoká"];

const detail = (n) => {
  const d = n.data || {};
  if (n.druh === "ukol") return [d.description, d.due && `do ${new Date(d.due + "T12:00").toLocaleDateString("cs-CZ")}`, d.assigned_to && `→ ${d.assigned_to}`, d.priority && d.priority !== "Střední" && d.priority].filter(Boolean).join(" · ");
  if (n.druh === "udalost_kalendare") return [d.date && new Date(d.date + "T12:00").toLocaleDateString("cs-CZ"), d.work_description, d.address, d.na_starosti].filter(Boolean).join(" · ");
  return d.text && d.text !== n.nazev ? d.text : "";
};

const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #CBD5E1", borderRadius: 8, padding: "6px 8px", fontSize: 14, font: "inherit" };
const lbl = { fontSize: 11.5, fontWeight: 700, color: "#5B6B7F", marginTop: 6, display: "block" };
const btn = { border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" };

function Uprava({ n, zakazky, lidi, onUlozit, onZrusit, pracuje }) {
  const [nazev, setNazev] = useState(n.nazev);
  const [d, setD] = useState({ ...(n.data || {}), prubeh_id: n.data?.prubeh_id ?? n.prubeh_id ?? null });
  const set = (k) => (e) => setD((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div style={{ background: "#F8FAFC", border: "1px solid #E3E8EF", borderRadius: 10, padding: 10, marginTop: 6 }}>
      <label style={lbl}>Název v přehledu</label>
      <input style={inp} value={nazev} onChange={(e) => setNazev(e.target.value)} />

      {n.druh === "poznamka_zakazky" && (
        <>
          <label style={lbl}>Zakázka</label>
          <select style={inp} value={d.prubeh_id ?? ""} onChange={(e) => setD((x) => ({ ...x, prubeh_id: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">— vyberte zakázku —</option>
            {zakazky.map((z) => <option key={z.id} value={z.id}>{z.nazev}</option>)}
          </select>
          <label style={lbl}>Text poznámky</label>
          <textarea style={{ ...inp, minHeight: 70 }} value={d.text ?? ""} onChange={set("text")} />
        </>
      )}

      {n.druh === "ukol" && (
        <>
          <label style={lbl}>Úkol</label>
          <input style={inp} value={d.title ?? ""} onChange={set("title")} />
          <label style={lbl}>Popis</label>
          <textarea style={{ ...inp, minHeight: 50 }} value={d.description ?? ""} onChange={set("description")} />
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Termín</label>
              <input type="date" style={inp} value={d.due ?? ""} onChange={set("due")} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Kdo</label>
              <select style={inp} value={d.assigned_to ?? ""} onChange={set("assigned_to")}>
                <option value="">—</option>
                {lidi.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Priorita</label>
              <select style={inp} value={d.priority ?? "Střední"} onChange={set("priority")}>
                {PRIORITY.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {n.druh === "udalost_kalendare" && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Datum</label>
              <input type="date" style={inp} value={d.date ?? ""} onChange={set("date")} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={lbl}>Na starosti</label>
              <select style={inp} value={d.na_starosti ?? ""} onChange={set("na_starosti")}>
                <option value="">—</option>
                {lidi.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>
          </div>
          <label style={lbl}>Název</label>
          <input style={inp} value={d.title ?? ""} onChange={set("title")} />
          <label style={lbl}>Co se bude dělat</label>
          <textarea style={{ ...inp, minHeight: 50 }} value={d.work_description ?? ""} onChange={set("work_description")} />
          <label style={lbl}>Adresa</label>
          <input style={inp} value={d.address ?? ""} onChange={set("address")} />
          <label style={lbl}>Zakázka</label>
          <select style={inp} value={d.prubeh_id ?? ""} onChange={(e) => setD((x) => ({ ...x, prubeh_id: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">— bez zakázky —</option>
            {zakazky.map((z) => <option key={z.id} value={z.id}>{z.nazev}</option>)}
          </select>
        </>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button style={{ ...btn, background: "#2E7D32", color: "#fff" }} disabled={pracuje || (n.druh === "poznamka_zakazky" && !d.prubeh_id) || (n.druh === "udalost_kalendare" && !d.date)}
          onClick={() => onUlozit(nazev, d)}>
          Uložit a potvrdit
        </button>
        <button style={{ ...btn, background: "#EEF1F5", color: "#334155" }} onClick={onZrusit}>Zpět</button>
      </div>
    </div>
  );
}

export default function JarvisNavrhy() {
  const [navrhy, setNavrhy] = useState([]);
  const [zakazky, setZakazky] = useState([]);
  const [lidi, setLidi] = useState([]);
  const [chyby, setChyby] = useState({});
  const [pracuje, setPracuje] = useState(null);
  const [uprava, setUprava] = useState(null);

  const nacti = useCallback(async () => {
    const [{ data }, { data: z }, { data: e }] = await Promise.all([
      supabase.from("jarvis_navrhy").select("*").eq("stav", "navrh").neq("druh", "myslenka").order("den").order("cas"),
      supabase.from("zakazky_prubeh").select("id, nazev, stav").order("updated_at", { ascending: false }).limit(300),
      supabase.from("employees").select("name, archived").order("name"),
    ]);
    setNavrhy(data || []);
    setZakazky((z || []).filter((x) => x.stav === "otevrena" || (data || []).some((n) => n.prubeh_id === x.id)));
    setLidi((e || []).filter((x) => !x.archived && x.name).map((x) => x.name));
  }, []);

  useEffect(() => { nacti(); }, [nacti]);

  const rozhodnout = async (n, schvalit, nazev, data) => {
    setPracuje(n.id);
    setChyby((c) => ({ ...c, [n.id]: null }));
    if (nazev && nazev !== n.nazev) {
      await supabase.from("jarvis_navrhy").update({ nazev, prubeh_id: data?.prubeh_id ?? n.prubeh_id }).eq("id", n.id);
    }
    const { error } = await supabase.rpc("jarvis_navrh_rozhodnout", { p_id: n.id, p_schvalit: schvalit, p_data: data ?? null });
    setPracuje(null);
    if (error) { setChyby((c) => ({ ...c, [n.id]: error.message })); return; }
    setUprava(null);
    setNavrhy((x) => x.filter((r) => r.id !== n.id));
  };

  if (!navrhy.length) return null;

  const nazevZak = (id) => zakazky.find((z) => z.id === id)?.nazev || `#${id}`;
  const box = { background: "#fff", border: "1px solid #E3E8EF", borderLeft: "4px solid #D29922", borderRadius: 12, padding: "10px 12px" };
  const schvalitelne = navrhy.filter((n) => n.druh !== "poznamka_zakazky" || n.prubeh_id);
  const dny = [...new Set(navrhy.map((n) => n.den))];

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <b style={{ fontSize: 15 }}>🤖 Jarvis – ke schválení ({navrhy.length})</b>
        {schvalitelne.length > 1 && !uprava && (
          <button style={{ ...btn, marginLeft: "auto", background: "#2E7D32", color: "#fff" }} disabled={!!pracuje}
            onClick={async () => { for (const n of schvalitelne) await rozhodnout(n, true); }}>
            Potvrdit vše
          </button>
        )}
      </div>
      {dny.map((den) => (
        <div key={den}>
          {dny.length > 1 && <div style={{ fontSize: 12, fontWeight: 800, color: "#0E3B5E", margin: "8px 0 2px" }}>
            {new Date(den + "T12:00").toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" })}
          </div>}
          {navrhy.filter((n) => n.den === den).map((n) => (
            <div key={n.id} style={{ borderTop: "1px solid #EEF1F5", padding: "8px 0" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 18 }}>{DRUH[n.druh]?.ikona}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{n.nazev}</div>
                  <div style={{ fontSize: 12, color: "#5B6B7F" }}>
                    {String(n.cas).slice(0, 5)} · {DRUH[n.druh]?.nazev}
                    {n.prubeh_id ? ` · 🏗 ${nazevZak(n.prubeh_id)}` : n.druh === "poznamka_zakazky" ? " · ⚠ bez zakázky – dejte Změnit" : ""}
                  </div>
                  {detail(n) && <div style={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap" }}>{detail(n)}</div>}
                  {chyby[n.id] && <div style={{ fontSize: 12, color: "#C62828" }}>{chyby[n.id]}</div>}
                </div>
              </div>
              {uprava === n.id ? (
                <Uprava n={n} zakazky={zakazky} lidi={lidi} pracuje={pracuje === n.id}
                  onUlozit={(nazev, data) => rozhodnout(n, true, nazev, data)} onZrusit={() => setUprava(null)} />
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 6, paddingLeft: 26 }}>
                  <button style={{ ...btn, background: "#2E7D32", color: "#fff" }} disabled={pracuje === n.id || (n.druh === "poznamka_zakazky" && !n.prubeh_id)}
                    onClick={() => rozhodnout(n, true)}>Potvrdit</button>
                  <button style={{ ...btn, background: "#E3F2FD", color: "#0D47A1" }} disabled={pracuje === n.id} onClick={() => setUprava(n.id)}>Změnit</button>
                  <button style={{ ...btn, background: "#FDECEA", color: "#B71C1C" }} disabled={pracuje === n.id}
                    onClick={() => { if (window.confirm(`Smazat „${n.nazev}“? Do aplikace se nic nezapíše.`)) rozhodnout(n, false); }}>Smazat</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
