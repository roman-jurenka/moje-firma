// ─── Ziskovost zakázek: rozpočet (nacenění) proti skutečnosti ────────────────
// Pro každou zakázku: tržby (cena + vícepráce + prodej materiálu z dodacích
// listů — stejně jako zisk v seznamu Zakázek), náklady práce / materiálu /
// dopravy proti rozpočtu z karty zakázky, zisk a marže, skutečné hodiny.
// Řazení od nejhorší marže, ať je hned vidět, kde se nacenění netrefilo.
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";

const kc = (v) => `${Math.round(Number(v) || 0).toLocaleString("cs-CZ")} Kč`;
const TYPY = [["práce", "budget_prace"], ["materiál", "budget_material"], ["doprava", "budget_doprava"]];
const STAVY = { hotove: ["Dokončena", "Fakturována"], bezi: ["Nová", "Probíhá"] };

export default function ZiskovostZakazek() {
  const [data, setData] = useState(null);
  const [filtr, setFiltr] = useState("hotove");
  const [hledat, setHledat] = useState("");

  useEffect(() => {
    let zruseno = false;
    Promise.all([
      supabase.from("contracts").select("id, code, name, type, status, price, budget_prace, budget_material, budget_doprava"),
      supabase.from("contract_cost_entries").select("contract_id, cost_type, is_extra, quantity, unit, amount_cost, amount_client"),
      supabase.from("delivery_notes").select("id, contract_id, margin"),
      supabase.from("delivery_note_items").select("delivery_note_id, quantity, unit_price"),
    ]).then(([c, e, dn, dni]) => {
      if (zruseno) return;
      const chyba = [c, e, dn, dni].find((x) => x.error)?.error;
      setData({ contracts: c.data || [], entries: e.data || [], dn: dn.data || [], dni: dni.data || [], chyba: chyba?.message || "" });
    });
    return () => { zruseno = true; };
  }, []);

  const radky = useMemo(() => {
    if (!data) return [];
    const polozkyDl = new Map();
    for (const i of data.dni) {
      const k = i.delivery_note_id;
      polozkyDl.set(k, (polozkyDl.get(k) || 0) + Number(i.quantity || 1) * Number(i.unit_price || 0));
    }
    return data.contracts.map((c) => {
      const en = data.entries.filter((x) => x.contract_id === c.id);
      const dl = data.dn.filter((d) => d.contract_id === c.id);
      const dlNaklad = dl.reduce((s, d) => s + (polozkyDl.get(d.id) || 0), 0);
      const dlProdej = dl.reduce((s, d) => s + (polozkyDl.get(d.id) || 0) * (1 + Number(d.margin ?? 30) / 100), 0);
      const naklad = (typ, vice) => en.filter((x) => x.cost_type === typ && !!x.is_extra === vice).reduce((s, x) => s + (Number(x.amount_cost) || 0), 0);
      const typy = TYPY.map(([typ, pole]) => {
        const skutecnost = naklad(typ, false) + (typ === "materiál" ? dlNaklad : 0);
        const rozpocet = Number(c[pole]) || 0;
        return { typ, rozpocet, skutecnost, rozdil: skutecnost - rozpocet };
      });
      const vice = TYPY.reduce((s, [typ]) => s + naklad(typ, true), 0);
      const viceProdej = en.filter((x) => x.is_extra).reduce((s, x) => s + (Number(x.amount_client) || 0), 0);
      const nakladCelkem = typy.reduce((s, t) => s + t.skutecnost, 0) + vice;
      const trzby = (Number(c.price) || 0) + viceProdej + dlProdej;
      const rozpocetCelkem = typy.reduce((s, t) => s + t.rozpocet, 0);
      const hodiny = en.filter((x) => x.cost_type === "práce" && String(x.unit || "h").startsWith("h")).reduce((s, x) => s + (Number(x.quantity) || 0), 0);
      const zisk = trzby - nakladCelkem;
      return { c, typy, vice, nakladCelkem, trzby, zisk, marze: trzby > 0 ? (zisk / trzby) * 100 : null, rozpocetCelkem, hodiny, maData: en.length > 0 || dl.length > 0 };
    });
  }, [data]);

  const q = hledat.trim().toLowerCase();
  const zobrazene = radky
    .filter((r) => (filtr === "vse" ? true : STAVY[filtr].includes(r.c.status)))
    .filter((r) => !q || `${r.c.code || ""} ${r.c.name || ""}`.toLowerCase().includes(q))
    .filter((r) => r.maData || r.trzby > 0)
    .sort((a, b) => (a.marze ?? 999) - (b.marze ?? 999));
  const soucet = (fn) => zobrazene.reduce((s, r) => s + fn(r), 0);
  const trzbyCelkem = soucet((r) => r.trzby), ziskCelkem = soucet((r) => r.zisk);
  const preteceno = zobrazene.filter((r) => r.typy.some((t) => t.rozpocet > 0 && t.rozdil > t.rozpocet * 0.1));

  const th = { padding: "8px 10px", fontSize: 11, color: "#64748b", textAlign: "right", whiteSpace: "nowrap" };
  const td = { padding: "8px 10px", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const barvaMarze = (m) => (m == null ? "#64748b" : m < 0 ? "#b91c1c" : m < 15 ? "#b45309" : "#15803d");
  const bunkaTypu = (t) => (
    <td style={td} title={`Rozpočet ${kc(t.rozpocet)} · skutečnost ${kc(t.skutecnost)}`}>
      <div style={{ fontWeight: 700 }}>{kc(t.skutecnost)}</div>
      {t.rozpocet > 0
        ? <div style={{ fontSize: 11, color: t.rozdil > 0.5 ? "#b91c1c" : "#15803d" }}>{t.rozdil > 0.5 ? `+${kc(t.rozdil)} nad` : `${kc(-t.rozdil)} pod`} rozpočtem</div>
        : <div style={{ fontSize: 11, color: "#94a3b8" }}>bez rozpočtu</div>}
    </td>
  );

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>📊 Ziskovost zakázek — rozpočet proti skutečnosti</div>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[["hotove", "Dokončené a fakturované"], ["bezi", "Rozpracované"], ["vse", "Vše"]].map(([id, t]) => (
            <button key={id} type="button" aria-pressed={filtr === id} onClick={() => setFiltr(id)}
              style={{ border: "1px solid " + (filtr === id ? "#0369a1" : "#cbd5e1"), background: filtr === id ? "#0369a1" : "#fff", color: filtr === id ? "#fff" : "#334155", borderRadius: 999, padding: "5px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{t}</button>
          ))}
          <input type="search" value={hledat} onChange={(e) => setHledat(e.target.value)} placeholder="Hledat zakázku…" aria-label="Hledat zakázku"
            style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "inherit" }} />
        </span>
      </div>
      {data?.chyba && <div role="alert" style={{ color: "#b91c1c" }}>Data se nepodařilo načíst: {data.chyba}</div>}
      {!data ? <div style={{ color: "#64748b" }}>Načítám zakázky…</div> : (<>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 14 }}>
          <span>Zakázek: <b>{zobrazene.length}</b></span>
          <span>Tržby: <b>{kc(trzbyCelkem)}</b></span>
          <span>Zisk: <b style={{ color: ziskCelkem < 0 ? "#b91c1c" : "#15803d" }}>{kc(ziskCelkem)}</b></span>
          <span>Průměrná marže: <b style={{ color: barvaMarze(trzbyCelkem ? (ziskCelkem / trzbyCelkem) * 100 : null) }}>{trzbyCelkem ? `${Math.round((ziskCelkem / trzbyCelkem) * 100)} %` : "–"}</b></span>
          {preteceno.length > 0 && <span style={{ color: "#b91c1c" }}>⚠ {preteceno.length} {preteceno.length === 1 ? "zakázka přetáhla" : "zakázek přetáhlo"} rozpočet o víc než 10 %</span>}
        </div>
        {!zobrazene.length ? <div style={{ color: "#64748b" }}>Žádné zakázky v tomto výběru.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: "left" }}>Zakázka</th><th style={th}>Tržby</th>
                <th style={th}>Práce</th><th style={th}>Materiál</th><th style={th}>Doprava</th><th style={th}>Vícepráce</th>
                <th style={th}>Náklady celkem</th><th style={th}>Zisk</th><th style={th}>Marže</th><th style={th}>Hodiny</th>
              </tr></thead>
              <tbody>
                {zobrazene.map((r) => (
                  <tr key={r.c.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: 180 }}>
                      <div style={{ fontWeight: 700 }}>{r.c.name}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{[r.c.code, r.c.type, r.c.status].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td style={{ ...td, fontWeight: 700 }}>{kc(r.trzby)}</td>
                    {r.typy.map((t) => <Fragment key={t.typ}>{bunkaTypu(t)}</Fragment>)}
                    <td style={td}>{r.vice ? kc(r.vice) : "–"}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{kc(r.nakladCelkem)}{r.rozpocetCelkem > 0 && <div style={{ fontSize: 11, color: "#64748b", fontWeight: 400 }}>rozpočet {kc(r.rozpocetCelkem)}</div>}</td>
                    <td style={{ ...td, fontWeight: 800, color: r.zisk < 0 ? "#b91c1c" : "#15803d" }}>{kc(r.zisk)}</td>
                    <td style={{ ...td, fontWeight: 800, color: barvaMarze(r.marze) }}>{r.marze == null ? "–" : `${Math.round(r.marze)} %`}</td>
                    <td style={td}>{r.hodiny ? `${(Math.round(r.hodiny * 10) / 10).toLocaleString("cs-CZ")} h` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 12, color: "#64748b" }}>
          Tržby = cena zakázky + vícepráce + materiál z dodacích listů v prodejní ceně (stejně jako zisk v seznamu Zakázek). Náklady práce vznikají ze schválených dnů docházky.
          Rozpočet je z karty zakázky (Práce / Materiál / Doprava). Marže pod 15 % je oranžově, ztráta červeně.
        </div>
      </>)}
    </div>
  );
}

