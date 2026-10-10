// ─── Podklady pro mzdy z docházky (vedení) ───────────────────────────────────
// Měsíční souhrn po zaměstnancích: dny, odpracované hodiny (pauza 1 h nad 6 h
// jako všude jinde), z toho schválené, víkendy, svátky, přesčas nad 8 h/den,
// hodiny bez zakázky, neuzavřené dny a orientační náklad podle hodinové sazby.
// Export do CSV pro Excel / mzdovou účetní. Rozkliknutím se ukážou jednotlivé dny.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { blokyDne, hodinyDne, hhmm } from "./denniZapis.js";

const NORMA_DNE = 8; // přesčas = nad 8 h za den
const p2 = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const h1 = (h) => (Math.round((Number(h) || 0) * 100) / 100).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kc = (v) => `${Math.round(Number(v) || 0).toLocaleString("cs-CZ")} Kč`;

// státní svátky ČR (pevné + Velký pátek a Velikonoční pondělí)
function svatky(rok) {
  const a = rok % 19, b = Math.floor(rok / 100), c = rok % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mesic = Math.floor((h + l - 7 * m + 114) / 31), den = ((h + l - 7 * m + 114) % 31) + 1;
  const nedele = new Date(rok, mesic - 1, den);
  const posun = (n) => { const x = new Date(nedele); x.setDate(x.getDate() + n); return iso(x); };
  const pevne = ["01-01", "05-01", "05-08", "07-05", "07-06", "09-28", "10-28", "11-17", "12-24", "12-25", "12-26"].map((md) => `${rok}-${md}`);
  return new Set([...pevne, posun(-2), posun(1)]);
}

export default function MzdovePodklady({ employees = [] }) {
  const dnes = new Date();
  const [mesic, setMesic] = useState(`${dnes.getFullYear()}-${p2(dnes.getMonth() + 1)}`);
  const [zaznamy, setZaznamy] = useState(null);
  const [otevreny, setOtevreny] = useState(null);
  const [chyba, setChyba] = useState("");

  useEffect(() => {
    let zruseno = false;
    const [r, m] = mesic.split("-").map(Number);
    const od = `${mesic}-01`, doo = iso(new Date(r, m, 0));
    Promise.resolve().then(() => { if (!zruseno) { setZaznamy(null); setChyba(""); } });
    supabase.from("attendance").select("id, employee_id, date, checkin, checkout, contract_id, schvaleno")
      .gte("date", od).lte("date", doo).order("date").then(({ data, error }) => {
        if (zruseno) return;
        if (error) { setChyba(error.message); setZaznamy([]); return; }
        setZaznamy(data || []);
      });
    return () => { zruseno = true; };
  }, [mesic]);

  const souhrn = useMemo(() => {
    if (!zaznamy) return [];
    const rok = Number(mesic.slice(0, 4));
    const sv = svatky(rok);
    const dnesIso = iso(new Date());
    const poZam = new Map();
    for (const z of zaznamy) {
      const k = String(z.employee_id);
      if (!poZam.has(k)) poZam.set(k, new Set());
      poZam.get(k).add(z.date);
    }
    return [...poZam.entries()].map(([empId, dny]) => {
      const emp = employees.find((e) => String(e.id) === empId);
      const radky = [...dny].sort().map((datum) => {
        const bloky = blokyDne(zaznamy, empId, datum);
        const { efektivni } = hodinyDne(bloky);
        const otevreno = bloky.some((b) => b.checkin && !b.checkout) && datum < dnesIso;
        const dt = new Date(datum + "T00:00:00");
        const vikend = dt.getDay() === 0 || dt.getDay() === 6;
        const svatek = sv.has(datum);
        const schvaleno = bloky.length > 0 && bloky.every((b) => b.schvaleno);
        // hodiny bez zakázky = poměrný díl efektivních hodin dne (pauza rozpočítaná jako jinde)
        const hrubeDne = hodinyDne(bloky).hrube;
        const bezZak = hrubeDne > 0
          ? bloky.filter((b) => !b.contract_id).reduce((s, b) => s + efektivni * hodinyDne([b]).hrube / hrubeDne, 0)
          : 0;
        return {
          datum, bloky, hodiny: efektivni, otevreno, vikend, svatek, schvaleno, bezZak,
          prescas: Math.max(0, efektivni - NORMA_DNE),
          od: hhmm(bloky[0]?.checkin), do: hhmm(bloky[bloky.length - 1]?.checkout),
        };
      });
      const sum = (fn) => radky.reduce((s, r) => s + fn(r), 0);
      const hodiny = sum((r) => r.hodiny);
      const sazba = Number(emp?.hourly_rate_cost) || 0;
      return {
        empId, jmeno: emp?.name || `Zaměstnanec #${empId}`, sazba, radky,
        dny: radky.filter((r) => r.hodiny > 0).length,
        hodiny, schvaleno: sum((r) => (r.schvaleno ? r.hodiny : 0)),
        vikend: sum((r) => (r.vikend ? r.hodiny : 0)), svatek: sum((r) => (r.svatek ? r.hodiny : 0)),
        prescas: sum((r) => r.prescas), bezZak: sum((r) => r.bezZak), otevrene: radky.filter((r) => r.otevreno).length,
        naklad: hodiny * sazba,
      };
    }).sort((a, b) => a.jmeno.localeCompare(b.jmeno, "cs"));
  }, [zaznamy, employees, mesic]);

  const exportCsv = () => {
    const hlav = ["Zaměstnanec", "Dny", "Hodiny celkem", "Z toho schváleno", "Víkend", "Svátek", "Přesčas nad 8 h", "Bez zakázky", "Neuzavřené dny", "Sazba Kč/h", "Náklad Kč"];
    const cislo = (v) => String(Math.round((Number(v) || 0) * 100) / 100).replace(".", ",");
    const radky = souhrn.map((s) => [s.jmeno, s.dny, cislo(s.hodiny), cislo(s.schvaleno), cislo(s.vikend), cislo(s.svatek), cislo(s.prescas), cislo(s.bezZak), s.otevrene, cislo(s.sazba), cislo(s.naklad)]);
    const csv = "﻿" + [hlav, ...radky].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `podklady-mzdy-${mesic}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const mesice = Array.from({ length: 13 }, (_, i) => { const d = new Date(dnes.getFullYear(), dnes.getMonth() - i, 1); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; });
  const nazevMesice = (m) => new Date(m + "-01T00:00:00").toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
  const neschvaleno = souhrn.reduce((s, x) => s + (x.hodiny - x.schvaleno), 0);
  const otevreneCelkem = souhrn.reduce((s, x) => s + x.otevrene, 0);
  const th = { padding: "8px 10px", fontSize: 11, color: "#64748b", textAlign: "right", whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "left" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>💶 Podklady pro mzdy</div>
        <select value={mesic} onChange={(e) => { setMesic(e.target.value); setOtevreny(null); }} aria-label="Měsíc"
          style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 10px", fontSize: 14, fontFamily: "inherit" }}>
          {mesice.map((m) => <option key={m} value={m}>{nazevMesice(m)}</option>)}
        </select>
        <button type="button" onClick={exportCsv} disabled={!souhrn.length}
          style={{ marginLeft: "auto", background: "#0369a1", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>⬇ Export do Excelu (CSV)</button>
      </div>
      {(neschvaleno > 0.01 || otevreneCelkem > 0) && (
        <div role="alert" style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#92400e" }}>
          ⚠ Měsíc ještě není uzavřený: {neschvaleno > 0.01 && <>{h1(neschvaleno)} h čeká na schválení (Ke schválení)</>}{neschvaleno > 0.01 && otevreneCelkem > 0 && ", "}{otevreneCelkem > 0 && <>{otevreneCelkem} {otevreneCelkem === 1 ? "den bez odchodu" : "dny bez odchodu"}</>}. Před předáním podkladů je dořeš.
        </div>
      )}
      {chyba && <div role="alert" style={{ color: "#b91c1c" }}>Docházku se nepodařilo načíst: {chyba}</div>}
      {zaznamy === null ? <div style={{ color: "#64748b" }}>Načítám docházku…</div> : !souhrn.length ? <div style={{ color: "#64748b" }}>V tomto měsíci není žádná docházka.</div> : (
        <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>Zaměstnanec</th><th style={th}>Dny</th><th style={th}>Hodiny</th><th style={th}>Schváleno</th>
              <th style={th}>Víkend</th><th style={th}>Svátek</th><th style={th}>Přesčas &gt; 8 h</th><th style={th}>Bez zakázky</th><th style={th}>Bez odchodu</th><th style={th}>Náklad dle sazby</th>
            </tr></thead>
            <tbody>
              {souhrn.map((s) => (
                <FragmentRadek key={s.empId} s={s} otevreny={otevreny === s.empId} onToggle={() => setOtevreny(otevreny === s.empId ? null : s.empId)} td={td} />
              ))}
            </tbody>
            <tfoot><tr style={{ borderTop: "2px solid #e2e8f0", fontWeight: 800 }}>
              <td style={{ ...td, textAlign: "left" }}>Celkem</td>
              <td style={td}>{souhrn.reduce((x, s) => x + s.dny, 0)}</td>
              <td style={td}>{h1(souhrn.reduce((x, s) => x + s.hodiny, 0))}</td>
              <td style={td}>{h1(souhrn.reduce((x, s) => x + s.schvaleno, 0))}</td>
              <td style={td}>{h1(souhrn.reduce((x, s) => x + s.vikend, 0))}</td>
              <td style={td}>{h1(souhrn.reduce((x, s) => x + s.svatek, 0))}</td>
              <td style={td}>{h1(souhrn.reduce((x, s) => x + s.prescas, 0))}</td>
              <td style={td}>{h1(souhrn.reduce((x, s) => x + s.bezZak, 0))}</td>
              <td style={td}>{otevreneCelkem}</td>
              <td style={td}>{kc(souhrn.reduce((x, s) => x + s.naklad, 0))}</td>
            </tr></tfoot>
          </table>
        </div>
      )}
      <div style={{ fontSize: 12, color: "#64748b" }}>Hodiny = odpracováno po odečtení pauzy (1 h, když den trvá déle než 6 h). Přesčas se počítá nad 8 h za den, svátky podle kalendáře ČR. Náklad = hodiny × nákladová sazba zaměstnance (orientačně, ne výplata).</div>
    </div>
  );
}

function FragmentRadek({ s, otevreny, onToggle, td }) {
  return (
    <>
      <tr style={{ borderTop: "1px solid #f1f5f9", cursor: "pointer", background: otevreny ? "#f8fafc" : undefined }} onClick={onToggle}>
        <td style={{ ...td, textAlign: "left", fontWeight: 700 }}><span aria-hidden="true">{otevreny ? "▾" : "▸"}</span> {s.jmeno}</td>
        <td style={td}>{s.dny}</td>
        <td style={{ ...td, fontWeight: 800 }}>{h1(s.hodiny)}</td>
        <td style={{ ...td, color: s.schvaleno + 0.01 < s.hodiny ? "#b45309" : "#15803d" }}>{h1(s.schvaleno)}</td>
        <td style={td}>{s.vikend ? h1(s.vikend) : "–"}</td>
        <td style={td}>{s.svatek ? h1(s.svatek) : "–"}</td>
        <td style={td}>{s.prescas ? h1(s.prescas) : "–"}</td>
        <td style={{ ...td, color: s.bezZak ? "#b45309" : undefined }}>{s.bezZak ? h1(s.bezZak) : "–"}</td>
        <td style={{ ...td, color: s.otevrene ? "#b91c1c" : undefined }}>{s.otevrene || "–"}</td>
        <td style={td}>{s.sazba ? kc(s.naklad) : <span style={{ color: "#94a3b8" }}>bez sazby</span>}</td>
      </tr>
      {otevreny && s.radky.map((r) => (
        <tr key={r.datum} style={{ background: "#f8fafc", fontSize: 12, color: "#334155" }}>
          <td style={{ ...td, textAlign: "left", paddingLeft: 30 }}>
            {new Date(r.datum + "T00:00:00").toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}
            {r.vikend && <span style={{ color: "#7c3aed", fontWeight: 700 }}> · víkend</span>}{r.svatek && <span style={{ color: "#be185d", fontWeight: 700 }}> · svátek</span>}
          </td>
          <td style={td}>{r.od}–{r.do || "?"}</td>
          <td style={td}>{h1(r.hodiny)}</td>
          <td style={{ ...td, color: r.schvaleno ? "#15803d" : "#b45309" }}>{r.schvaleno ? "✓" : "čeká"}</td>
          <td style={td} />
          <td style={td} />
          <td style={td}>{r.prescas ? h1(r.prescas) : ""}</td>
          <td style={td}>{r.bezZak ? h1(r.bezZak) : ""}</td>
          <td style={{ ...td, color: "#b91c1c" }}>{r.otevreno ? "bez odchodu" : ""}</td>
          <td style={td} />
        </tr>
      ))}
    </>
  );
}
