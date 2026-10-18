// ─── Dofakturace zbývající částky (Průběh → fáze Vyúčtování) ─────────────────
// Konečná faktura: celá cena zakázky a pod ní odečty všeho, co už bylo
// k zakázce vyfakturováno (zálohy, dílčí faktury) — po sazbách DPH, takže
// k úhradě zbývá jen rozdíl a DPH sedí. Cena se bere z nabídky, jinak z hodnoty
// zakázky (jde přepsat). Přenesená daňová povinnost: odečty v 0 % jako ve
// Fakturaci (bez uvedené sazby), DPH se neúčtuje.
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { computeInvoiceTotals, nextInvNum, fmtKc2, cisloFaktury } from "./invoicingUtils.js";

const iso = (d) => d.toLocaleDateString("sv-SE");
const cislo = (v) => { const t = String(v ?? "").replace(/\s/g, "").replace(",", "."); return t === "" ? NaN : Number(t); };

export default function DofakturaceFaktura({ zak, contract, zakaznik, cenaBezDph = 0, dphPct = 21, onVystaveno, onZavrit }) {
  const [cena, setCena] = useState(String(Math.round(cenaBezDph || 0)));
  const [dph, setDph] = useState([0, 12, 21].includes(Number(dphPct)) ? Number(dphPct) : 21);
  const [prenesena, setPrenesena] = useState(false);
  const [splatnost, setSplatnost] = useState(String(zakaznik?.payment_terms_days || 14));
  const [predchozi, setPredchozi] = useState(null);
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState("");

  useEffect(() => {
    let zruseno = false;
    if (!zak.contract_id) { Promise.resolve().then(() => { if (!zruseno) setPredchozi([]); }); return () => { zruseno = true; }; }
    supabase.from("invoices").select("id, number, cislo_ucetni, amount, tax, items, status, is_deposit, invoice_type, prenesena_dph")
      .eq("contract_id", zak.contract_id).order("issued")
      .then(({ data }) => { if (!zruseno) setPredchozi((data || []).filter((i) => i.status !== "Storno" && (i.invoice_type || "vydaná") === "vydaná")); });
    return () => { zruseno = true; };
  }, [zak.contract_id]);

  const c = cislo(cena);
  const nazev = contract?.name || zak.nazev || "";
  // odečty po sazbách DPH z dřívějších faktur
  const odecty = [];
  for (const inv of predchozi || []) {
    const { byRate } = computeInvoiceTotals(inv.items || [], inv.prenesena_dph);
    for (const [sazba, v] of Object.entries(byRate)) {
      if (Math.abs(v.zaklad) < 0.005) continue;
      odecty.push({ desc: `Odečet – již vyfakturováno: ${inv.is_deposit ? "záloha " : "faktura "}${cisloFaktury(inv)}`, qty: 1, unit: "kpl.", price: -Math.round(v.zaklad * 100) / 100, vatRate: prenesena ? 0 : Number(sazba) });
    }
  }
  const polozky = [{ desc: `Konečná faktura — ${nazev}`.trim(), qty: 1, unit: "kpl.", price: Number.isFinite(c) ? c : 0, vatRate: dph }, ...odecty];
  const { total, totalTax } = computeInvoiceTotals(polozky, prenesena);
  const uzVyfakturovano = -odecty.reduce((s, o) => s + o.price, 0);

  const vystavit = async () => {
    setChyba("");
    if (!zak.customer_id) { setChyba("Zakázka nemá zákazníka — doplň ho v kartě Zákazník a místo realizace."); return; }
    if (!(c > 0)) { setChyba("Doplň cenu zakázky bez DPH."); return; }
    if (total - totalTax <= 0.5) { setChyba("Není co dofakturovat — vše už je vyfakturované."); return; }
    setPracuji(true);
    const d = new Date(), s = new Date(); s.setDate(s.getDate() + (Number(splatnost) || 14));
    let row = null;
    for (let pokus = 0; pokus < 5 && !row; pokus++) {
      const { data: cisla } = await supabase.from("invoices").select("number, cislo_ucetni");
      const cc = nextInvNum(cisla || []);
      const { data, error } = await supabase.from("invoices").insert({
        number: cc, customer_id: zak.customer_id, amount: total - totalTax, tax: totalTax, status: "Čeká",
        issued: iso(d), due: iso(s), items: polozky, invoice_type: "vydaná", is_deposit: false, prenesena_dph: prenesena,
        order_ref: contract?.code || null, variable_symbol: cc.replace(/\D/g, ""), contract_id: zak.contract_id || null,
        customer_ico: zakaznik?.ico || null, customer_dic: zakaznik?.dic || null,
      }).select().single();
      if (!error) row = data;
      else if (error.code !== "23505") { setPracuji(false); setChyba("Fakturu se nepodařilo vystavit: " + error.message); return; }
    }
    if (!row) { setPracuji(false); setChyba("Číslo faktury se opakovaně srazilo, zkus to znovu."); return; }
    await supabase.from("invoice_events").insert({ invoice_id: row.id, type: "vystavena" });
    setPracuji(false);
    onVystaveno?.(row, total);
  };

  const lbl = { fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 3 };
  const pole = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 9px", fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  return (
    <div style={{ margin: "0 12px 12px", padding: 12, border: "1px solid #bbf7d0", background: "#f0fdf4", borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 14 }}>🧾 Dofakturovat zbývající částku</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, alignItems: "end" }}>
        <div><label style={lbl} htmlFor={`dof-cena-${zak.id}`}>Celková cena zakázky bez DPH (Kč)</label>
          <input id={`dof-cena-${zak.id}`} style={pole} inputMode="decimal" value={cena} onChange={(e) => setCena(e.target.value)} /></div>
        <div><label style={lbl} htmlFor={`dof-dph-${zak.id}`}>DPH</label>
          <select id={`dof-dph-${zak.id}`} style={pole} value={dph} onChange={(e) => setDph(Number(e.target.value))} disabled={prenesena}>
            <option value={21}>21 %</option><option value={12}>12 %</option><option value={0}>0 %</option>
          </select></div>
        <div><label style={lbl} htmlFor={`dof-spl-${zak.id}`}>Splatnost (dní)</label>
          <input id={`dof-spl-${zak.id}`} style={pole} inputMode="numeric" value={splatnost} onChange={(e) => setSplatnost(e.target.value)} /></div>
      </div>
      <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
        <input type="checkbox" checked={prenesena} onChange={(e) => setPrenesena(e.target.checked)} /> Přenesená daňová povinnost (DPH odvede zákazník)
      </label>
      {predchozi === null ? <div style={{ fontSize: 13, color: "#64748b" }}>Načítám faktury zakázky…</div> : (
        <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>Cena zakázky</span><b>{fmtKc2(Number.isFinite(c) ? c : 0)} Kč</b></div>
          {predchozi.length === 0 && <div style={{ color: "#64748b" }}>K zakázce zatím není žádná faktura — vyfakturuje se celá cena.</div>}
          {predchozi.map((i) => (
            <div key={i.id} style={{ display: "flex", justifyContent: "space-between", color: "#475569" }}>
              <span>− {i.is_deposit ? "záloha" : "faktura"} {cisloFaktury(i)}</span><span>{fmtKc2(i.amount)} Kč</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #bbf7d0", paddingTop: 4, marginTop: 2 }}>
            <span>Zbývá dofakturovat bez DPH</span><b>{fmtKc2(total - totalTax)} Kč</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>DPH</span><span>{fmtKc2(totalTax)} Kč</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}><b>K úhradě</b><b style={{ color: "#15803d" }}>{fmtKc2(total)} Kč</b></div>
          {uzVyfakturovano > 0 && <div style={{ fontSize: 11, color: "#64748b" }}>Na faktuře bude celá cena a pod ní odečty dřívějších faktur ({fmtKc2(uzVyfakturovano)} Kč bez DPH).</div>}
        </div>
      )}
      {chyba && <div role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{chyba}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={onZavrit} style={{ background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Zrušit</button>
        <button type="button" disabled={pracuji || predchozi === null} onClick={vystavit} style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          {pracuji ? "Vystavuji…" : "🧾 Vystavit konečnou fakturu"}
        </button>
      </div>
    </div>
  );
}
