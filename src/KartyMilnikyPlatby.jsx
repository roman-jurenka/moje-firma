// ─── Karty Průběhu: Úřední milníky a Platební kalendář ───────────────────────
// Logika (které milníky, lhůty, kdy je platba splatná) je v milnikyZakazky.js,
// tady je jen zobrazení a úpravy. Ukládá se přes onUlozit(patch, poznamka) =
// uloz() v Průběhu, faktury vystavují stávající ZalohovaFaktura / DofakturaceFaktura.
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import ZalohovaFaktura from "./ZalohovaFaktura.jsx";
import DofakturaceFaktura from "./DofakturaceFaktura.jsx";
import { fmtKc2, cisloFaktury, getInvoicePaymentInfo } from "./invoicingUtils.js";
import {
  skupinyPro, stavMilniku, nastavMilnik, KDY_PLATBY, popisKdy, SABLONY_PLATEB, planZeSablony, novaPlatba,
  procentoDoplatku, procentoPlatby, platbaSplatna,
} from "./milnikyZakazky.js";

const karta = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "16px 20px" };
const inp = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 8px", fontSize: 14, fontFamily: "inherit", color: "#0f172a", background: "#fff" };
const btnGhost = { background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 10, padding: "5px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const BARVY = { chyba: ["#fee2e2", "#991b1b"], pozor: ["#ffedd5", "#9a3412"] };
const fmtDatum = (iso) => { if (!iso) return ""; const [r, m, d] = String(iso).slice(0, 10).split("-").map(Number); return `${d}. ${m}. ${r}`; };

export function KartaMilniky({ z, dnes, otevrena, onUlozit }) {
  const skupiny = skupinyPro(z.typ);
  const vyplneno = Object.keys(z.milniky || {}).length;
  const ulozit = (m, datum) => onUlozit({ milniky: nastavMilnik(z.milniky, m.id, datum) },
    datum ? `Milník „${m.nazev}“: ${fmtDatum(datum)}.` : `Milník „${m.nazev}“ smazán.`);
  return (
    <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>Úřední milníky</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>{vyplneno ? `vyplněno ${vyplneno}` : "data kroků u distributora, dotace, revize"}</span>
      </div>
      {skupiny.map((s) => (
        <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: 0.5, textTransform: "uppercase" }}>{s.nazev}</div>
          {s.milniky.map((m) => {
            const datum = z.milniky?.[m.id] || "";
            const stav = stavMilniku(z, m, dnes);
            const id = `pr-mil-${z.id}-${m.id}`;
            return (
              <div key={m.id}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 150px", gap: 8, alignItems: "center", fontSize: 14 }}>
                  <label htmlFor={id} style={{ color: datum && !m.lhuta ? "#15803d" : "#334155", fontWeight: datum ? 700 : 400 }}>
                    {datum && !m.lhuta ? "✓ " : ""}{m.nazev}
                  </label>
                  <div style={{ display: "flex", gap: 4 }}>
                    <input id={id} type="date" style={inp} value={datum} disabled={!otevrena} onChange={(e) => ulozit(m, e.target.value)} />
                    {otevrena && !datum && !m.lhuta && (
                      <button type="button" title="Zapsat dnešní datum" style={{ ...btnGhost, padding: "4px 7px" }} onClick={() => ulozit(m, dnes)}>dnes</button>
                    )}
                  </div>
                </div>
                {stav && (
                  <div style={{ marginTop: 4, background: BARVY[stav.uroven][0], color: BARVY[stav.uroven][1], borderRadius: 8, padding: "4px 8px", fontSize: 12, fontWeight: 700 }}>
                    ⚠ {stav.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function KartaPlatby({ z, contract, zakaznik, cenaBezDph = 0, dphPct = 21, dnes, otevrena, onUlozit, onFaktura }) {
  const plan = z.platebni_plan || [];
  const [uprava, setUprava] = useState(null);     // rozpracovaný plán při úpravě
  const [vystavit, setVystavit] = useState(null); // id platby s otevřeným formulářem faktury
  const [faktury, setFaktury] = useState({});     // { [invoice_id]: invoice }
  const [chyba, setChyba] = useState("");

  const idsFaktur = plan.map((p) => p.invoice_id).filter(Boolean).join(",");
  useEffect(() => {
    if (!idsFaktur) return undefined;
    let zruseno = false;
    supabase.from("invoices").select("id, number, cislo_ucetni, amount, tax, status, paid_amount, discount_percent, due")
      .in("id", idsFaktur.split(",").map(Number))
      .then(({ data }) => { if (!zruseno) setFaktury(Object.fromEntries((data || []).map((i) => [i.id, i]))); });
    return () => { zruseno = true; };
  }, [idsFaktur]);

  const castka = (p, pl = plan) => Math.round(cenaBezDph * procentoPlatby(p, pl)) / 100;
  const vyfakturovano = plan.filter((p) => p.invoice_id).reduce((s, p) => s + castka(p), 0);

  const ulozitUpravu = async () => {
    setChyba("");
    const radky = uprava.map((p) => ({ ...p, nazev: String(p.nazev || "").trim() || "Platba", procent: p.doplatek ? null : Number(String(p.procent).replace(",", ".")) || 0 }));
    if (radky.filter((p) => p.doplatek).length > 1) { setChyba("Doplatek (zbytek ceny) může být jen jeden."); return; }
    if (radky.some((p) => p.kdy === "datum" && !p.datum)) { setChyba("U platby „k datu“ vyplň datum."); return; }
    const soucet = radky.filter((p) => !p.doplatek).reduce((s, p) => s + p.procent, 0);
    if (soucet > 100) { setChyba(`Součet procent je ${soucet} % — víc než 100 %.`); return; }
    const ok = await onUlozit({ platebni_plan: radky }, `Platební kalendář: ${radky.map((p) => `${p.nazev} ${procentoPlatby(p, radky)} % ${popisKdy(p)}`).join(", ")}.`);
    if (ok !== false) setUprava(null);
  };

  const poVystaveni = async (platba, inv) => {
    setVystavit(null);
    const cislo = cisloFaktury(inv);
    const novyPlan = plan.map((p) => (p.id === platba.id ? { ...p, invoice_id: inv.id, invoice_cislo: cislo } : p));
    const ukol = platba.doplatek ? "vyuctovani.faktura" : "zaloha.faktura";
    setFaktury((f) => ({ ...f, [inv.id]: inv }));
    await onUlozit({ platebni_plan: novyPlan, hotove_ukoly: { ...(z.hotove_ukoly || {}), [ukol]: true } },
      `Vystavena faktura ${cislo} — ${platba.nazev} (platební kalendář).`);
    onFaktura?.(inv, platba);
  };

  const stavPlatby = (p) => {
    const inv = p.invoice_id ? faktury[p.invoice_id] : null;
    if (p.invoice_id) {
      if (!inv) return { text: `vystaveno ${p.invoice_cislo || ""}`, barva: ["#e0f2fe", "#075985"] };
      const info = getInvoicePaymentInfo(inv);
      if (info.isCancelled) return { text: `faktura ${cisloFaktury(inv)} stornovaná`, barva: ["#f1f5f9", "#64748b"] };
      if (info.isPaid) return { text: `✓ zaplaceno (${cisloFaktury(inv)})`, barva: ["#dcfce7", "#166534"] };
      if (info.isOverdue) return { text: `po splatnosti ${info.daysOverdue} dní (${cisloFaktury(inv)})`, barva: ["#fee2e2", "#991b1b"] };
      return { text: `vystaveno ${cisloFaktury(inv)} · čeká na platbu`, barva: ["#e0f2fe", "#075985"] };
    }
    if (platbaSplatna(z, p, dnes)) return { text: "🔔 k vystavení", barva: ["#fef3c7", "#92400e"], kVystaveni: true };
    return { text: `čeká: ${popisKdy(p)}`, barva: ["#f8fafc", "#64748b"] };
  };

  return (
    <div style={{ ...karta, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>Platební kalendář</span>
        <span style={{ fontSize: 12, color: "#64748b" }}>cena {fmtKc2(cenaBezDph)} Kč bez DPH</span>
      </div>

      {!uprava && plan.length === 0 && (
        <>
          <div style={{ fontSize: 14, color: "#475569" }}>Zatím bez plánu plateb. Vyber šablonu (dá se upravit):</div>
          {otevrena && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {SABLONY_PLATEB.map((s) => (
                <button key={s.id} type="button" style={{ ...btnGhost, textAlign: "left", padding: "8px 10px" }} onClick={() => setUprava(planZeSablony(s))}>{s.nazev}</button>
              ))}
              <button type="button" style={{ ...btnGhost, textAlign: "left", padding: "8px 10px" }} onClick={() => setUprava([novaPlatba()])}>+ Vlastní plán</button>
            </div>
          )}
        </>
      )}

      {!uprava && plan.length > 0 && (
        <>
          {plan.map((p) => {
            const st = stavPlatby(p);
            const proc = procentoPlatby(p, plan);
            return (
              <div key={p.id} style={{ borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                  <span><b>{p.nazev}</b> · {String(proc).replace(".", ",")} %{p.doplatek ? " (zbytek)" : ""}</span>
                  <b style={{ whiteSpace: "nowrap" }}>{fmtKc2(castka(p))} Kč</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{popisKdy(p)}</span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ background: st.barva[0], color: st.barva[1], borderRadius: 999, padding: "2px 9px", fontSize: 12, fontWeight: 700 }}>{st.text}</span>
                    {otevrena && !p.invoice_id && (
                      <button type="button" style={{ ...btnGhost, ...(st.kVystaveni ? { background: "#b45309", color: "#fff", borderColor: "#b45309" } : {}) }}
                        title={st.kVystaveni ? "" : "Milník ještě nenastal — vystavit i tak"}
                        onClick={() => setVystavit(vystavit === p.id ? null : p.id)}>🧾 Vystavit</button>
                    )}
                  </span>
                </div>
                {vystavit === p.id && (
                  <div style={{ marginTop: 8, marginLeft: -12, marginRight: -12 }}>
                    {p.doplatek
                      ? <DofakturaceFaktura zak={z} contract={contract} zakaznik={zakaznik} cenaBezDph={cenaBezDph} dphPct={dphPct}
                          onZavrit={() => setVystavit(null)} onVystaveno={(inv) => poVystaveni(p, inv)} />
                      : <ZalohovaFaktura zak={z} contract={contract} zakaznik={zakaznik} cenaBezDph={cenaBezDph} dphPct={dphPct} vychoziProcento={proc}
                          onZavrit={() => setVystavit(null)} onVystaveno={(inv) => poVystaveni(p, inv)} />}
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderTop: "1px solid #e2e8f0", paddingTop: 8, fontSize: 13, color: "#475569", flexWrap: "wrap" }}>
            <span>Vyfakturováno {fmtKc2(vyfakturovano)} z {fmtKc2(cenaBezDph)} Kč bez DPH</span>
            {otevrena && <button type="button" style={btnGhost} onClick={() => { setChyba(""); setUprava(plan.map((p) => ({ ...p }))); }}>Upravit plán</button>}
          </div>
        </>
      )}

      {uprava && (
        <>
          {uprava.map((p, i) => {
            const zmenit = (patch) => setUprava((u) => u.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            const idp = `pr-plat-${z.id}-${i}`;
            return (
              <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: i ? "1px solid #f1f5f9" : "none", paddingTop: i ? 8 : 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 80px", gap: 6 }}>
                  <input aria-label="Název platby" style={inp} value={p.nazev} onChange={(e) => zmenit({ nazev: e.target.value })} />
                  <input aria-label="Procento z ceny" style={inp} inputMode="decimal" disabled={p.doplatek}
                    value={p.doplatek ? `${procentoDoplatku(uprava)}` : p.procent ?? ""} onChange={(e) => zmenit({ procent: e.target.value })} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: p.kdy === "datum" ? "minmax(0, 1fr) 140px" : "minmax(0, 1fr)", gap: 6 }}>
                  <select aria-label="Kdy vystavit" style={inp} value={p.kdy} onChange={(e) => zmenit({ kdy: e.target.value })}>
                    {KDY_PLATBY.map((k) => <option key={k.id} value={k.id}>{k.nazev}</option>)}
                  </select>
                  {p.kdy === "datum" && <input aria-label="Datum platby" type="date" style={inp} value={p.datum || ""} onChange={(e) => zmenit({ datum: e.target.value })} />}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <label htmlFor={idp} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input id={idp} type="checkbox" checked={!!p.doplatek} disabled={!!p.invoice_id} onChange={(e) => zmenit({ doplatek: e.target.checked })} />
                    Doplatek (zbytek ceny, odečte vystavené zálohy)
                  </label>
                  {p.invoice_id
                    ? <span style={{ fontSize: 12, color: "#64748b" }}>vystaveno {p.invoice_cislo || ""}</span>
                    : <button type="button" style={{ ...btnGhost, color: "#b91c1c" }} onClick={() => setUprava((u) => u.filter((_, j) => j !== i))}>Odebrat</button>}
                </div>
              </div>
            );
          })}
          {chyba && <div role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{chyba}</div>}
          <div style={{ display: "flex", gap: 6, justifyContent: "space-between", flexWrap: "wrap" }}>
            <button type="button" style={btnGhost} onClick={() => setUprava((u) => [...u, novaPlatba()])}>+ Přidat platbu</button>
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" style={btnGhost} onClick={() => { setUprava(null); setChyba(""); }}>Zrušit</button>
              <button type="button" style={{ ...btnGhost, background: "#0369a1", color: "#fff", borderColor: "#0369a1" }} onClick={ulozitUpravu}>Uložit plán</button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
