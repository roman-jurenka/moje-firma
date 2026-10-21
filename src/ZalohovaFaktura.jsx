// ─── Zálohová faktura z Průběhu (fáze Záloha) ────────────────────────────────
// Vystaví zálohovou fakturu na zvolené procento z ceny zakázky (výchozí 50 %,
// naposledy použité procento si aplikace pamatuje). Cena se bere z nabídky,
// jinak z hodnoty zakázky — jde přepsat. Číslo faktury stejně jako ve Fakturaci.
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { computeInvoiceTotals, nextInvNum, fmtKc2, cisloFaktury } from "./invoicingUtils.js";

const PROCENTO_KEY = "zaloha_procento";
const iso = (d) => d.toLocaleDateString("sv-SE");
const cislo = (v) => { const t = String(v ?? "").replace(/\s/g, "").replace(",", "."); return t === "" ? NaN : Number(t); };

// cenaBezDph = výchozí základ (z nabídky / zakázky), dphPct = sazba z nabídky,
// vychoziProcento = procento z platebního kalendáře (pak se nepamatuje naposledy použité)
export default function ZalohovaFaktura({ zak, contract, zakaznik, cenaBezDph = 0, dphPct = 21, vychoziProcento = null, onVystaveno, onZavrit }) {
  const zPlanu = vychoziProcento != null;
  const [procento, setProcento] = useState(zPlanu ? String(vychoziProcento) : "50");
  const [zaklad, setZaklad] = useState(String(Math.round(cenaBezDph || 0)));
  const [dph, setDph] = useState([0, 12, 21].includes(Number(dphPct)) ? Number(dphPct) : 21);
  const [splatnost, setSplatnost] = useState(String(zakaznik?.payment_terms_days || 14));
  const [predchozi, setPredchozi] = useState([]);
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState("");

  useEffect(() => {
    let zruseno = false;
    if (!zPlanu) {
      supabase.from("app_settings").select("value").eq("key", PROCENTO_KEY).maybeSingle()
        .then(({ data }) => { if (!zruseno && data?.value?.procento) setProcento(String(data.value.procento)); });
    }
    if (zak.contract_id) {
      supabase.from("invoices").select("id, number, cislo_ucetni, amount, tax, items, status").eq("contract_id", zak.contract_id).eq("is_deposit", true)
        .then(({ data }) => { if (!zruseno) setPredchozi((data || []).filter((i) => i.status !== "Storno")); });
    }
    return () => { zruseno = true; };
  }, [zak.contract_id, zPlanu]);

  const p = cislo(procento), z = cislo(zaklad);
  const castka = Number.isFinite(p) && Number.isFinite(z) ? Math.round(z * p) / 100 : 0;
  const polozky = [{ desc: `Záloha ${String(p).replace(".", ",")} % — ${contract?.name || zak.nazev || ""}`.trim(), qty: 1, unit: "kpl.", price: castka, vatRate: dph }];
  const { total, totalTax } = computeInvoiceTotals(polozky);

  const vystavit = async () => {
    setChyba("");
    if (!zak.customer_id) { setChyba("Zakázka nemá zákazníka — doplň ho v kartě Zákazník a místo realizace."); return; }
    if (!(p > 0 && p <= 100)) { setChyba("Procento zálohy musí být mezi 1 a 100."); return; }
    if (!(castka > 0)) { setChyba("Doplň cenu zakázky bez DPH."); return; }
    setPracuji(true);
    const d = new Date(), s = new Date(); s.setDate(s.getDate() + (Number(splatnost) || 14));
    let row = null;
    for (let pokus = 0; pokus < 5 && !row; pokus++) {
      const { data: cisla } = await supabase.from("invoices").select("number, cislo_ucetni");
      const c = nextInvNum(cisla || []);
      const { data, error } = await supabase.from("invoices").insert({
        number: c, customer_id: zak.customer_id, amount: total - totalTax, tax: totalTax, status: "Čeká",
        issued: iso(d), due: iso(s), items: polozky, invoice_type: "vydaná", is_deposit: true,
        order_ref: contract?.code || null, variable_symbol: c.replace(/\D/g, ""), contract_id: zak.contract_id || null,
        customer_ico: zakaznik?.ico || null, customer_dic: zakaznik?.dic || null,
      }).select().single();
      if (!error) row = data;
      else if (error.code !== "23505") { setPracuji(false); setChyba("Fakturu se nepodařilo vystavit: " + error.message); return; }
    }
    if (!row) { setPracuji(false); setChyba("Číslo faktury se opakovaně srazilo, zkus to znovu."); return; }
    await supabase.from("invoice_events").insert({ invoice_id: row.id, type: "vystavena" });
    if (!zPlanu) await supabase.from("app_settings").upsert({ key: PROCENTO_KEY, value: { procento: p }, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setPracuji(false);
    onVystaveno?.(row, p);
  };

  const lbl = { fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 3 };
  const pole = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 9px", fontSize: 14, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  return (
    <div style={{ margin: "0 12px 12px", padding: 12, border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 14 }}>🧾 Zálohová faktura</div>
      {predchozi.length > 0 && (
        <div style={{ fontSize: 13, color: "#92400e" }}>
          ⚠ K zakázce už {predchozi.length === 1 ? "je zálohová faktura" : "jsou zálohové faktury"}: {predchozi.map((i) => `${cisloFaktury(i)} (${fmtKc2(Number(i.amount) + Number(i.tax))} Kč)`).join(", ")}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, alignItems: "end" }}>
        <div><label style={lbl} htmlFor={`zal-proc-${zak.id}`}>Záloha (%)</label>
          <input id={`zal-proc-${zak.id}`} style={pole} inputMode="decimal" value={procento} onChange={(e) => setProcento(e.target.value)} /></div>
        <div><label style={lbl} htmlFor={`zal-zakl-${zak.id}`}>Cena zakázky bez DPH (Kč)</label>
          <input id={`zal-zakl-${zak.id}`} style={pole} inputMode="decimal" value={zaklad} onChange={(e) => setZaklad(e.target.value)} /></div>
        <div><label style={lbl} htmlFor={`zal-dph-${zak.id}`}>DPH</label>
          <select id={`zal-dph-${zak.id}`} style={pole} value={dph} onChange={(e) => setDph(Number(e.target.value))}>
            <option value={21}>21 %</option><option value={12}>12 %</option><option value={0}>0 %</option>
          </select></div>
        <div><label style={lbl} htmlFor={`zal-spl-${zak.id}`}>Splatnost (dní)</label>
          <input id={`zal-spl-${zak.id}`} style={pole} inputMode="numeric" value={splatnost} onChange={(e) => setSplatnost(e.target.value)} /></div>
      </div>
      <div style={{ fontSize: 14 }}>
        Záloha: <b>{fmtKc2(total - totalTax)} Kč</b> bez DPH · DPH {fmtKc2(totalTax)} Kč · <b>k úhradě {fmtKc2(total)} Kč</b>
      </div>
      {chyba && <div role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{chyba}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={onZavrit} style={{ background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Zrušit</button>
        <button type="button" disabled={pracuji} onClick={vystavit} style={{ background: "#b45309", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          {pracuji ? "Vystavuji…" : `🧾 Vystavit zálohu ${String(Number.isFinite(p) ? p : "").replace(".", ",")} %`}
        </button>
      </div>
      <div style={{ fontSize: 12, color: "#92400e" }}>Faktura se objeví ve Fakturaci (Vydané) jako „Faktura - záloha“; odtud ji stáhneš jako PDF. Naposledy použité procento si aplikace zapamatuje.</div>
    </div>
  );
}
