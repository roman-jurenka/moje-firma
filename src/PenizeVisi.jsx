// ─── Peníze, které visí (Přehled) ────────────────────────────────────────────
// Na jednom místě všechno, co čeká na peníze:
//   • zakázky po montáži (od Předání dál), u kterých zbývá dofakturovat —
//     cena z Průběhu (hodnota z nabídky), jinak z ceny zakázky, mínus
//     vydané faktury k zakázce (bez DPH, bez storen),
//   • vydané faktury po splatnosti (podle párování plateb),
//   • zálohové faktury vystavené, ale nezaplacené,
//   • letošní náklady na záruční servis (platíme my).
// Klik otevře rovnou místo, kde se to řeší.

import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { FAZE } from "./prubehFaze.js";
import { getInvoicePaymentInfo, cisloFaktury } from "./invoicingUtils.js";

const fmtKc = (n) => `${Math.round(Number(n) || 0).toLocaleString("cs-CZ")} Kč`;
const dnyOd = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : 0);
const dni = (n) => `${n} ${n === 1 ? "den" : n > 1 && n < 5 ? "dny" : "dní"}`;
const OD_FAZE = "predani";

export default function PenizeVisi({ invoices = [], customers = [], onOtevritPrubeh, setTab }) {
  const [prubeh, setPrubeh] = useState(null);
  const [cenyZakazek, setCenyZakazek] = useState({});
  const [zarukaLetos, setZarukaLetos] = useState(null);

  useEffect(() => {
    let zruseno = false;
    const iOd = FAZE.findIndex((f) => f.id === OD_FAZE);
    const pozdniFaze = FAZE.slice(Math.max(0, iOd)).map((f) => f.id);
    (async () => {
      const { data: rows } = await supabase.from("zakazky_prubeh").select("id, nazev, contract_id, customer_id, hodnota, faze, faze_od, stav, typ")
        .eq("stav", "otevrena").in("faze", pozdniFaze);
      const ids = [...new Set((rows || []).map((r) => r.contract_id).filter(Boolean))];
      const { data: ceny } = ids.length ? await supabase.from("contracts").select("id, price").in("id", ids) : { data: [] };
      const rok = String(new Date().getFullYear());
      const [{ data: naklady }, { data: tickety }] = await Promise.all([
        supabase.from("contract_cost_entries").select("ticket_id, amount_cost, date").not("ticket_id", "is", null).gte("date", `${rok}-01-01`),
        supabase.from("service_tickets").select("id, placeny"),
      ]);
      if (zruseno) return;
      const zaruka = new Set((tickety || []).filter((t) => !t.placeny).map((t) => t.id));
      setZarukaLetos((naklady || []).filter((x) => zaruka.has(x.ticket_id)).reduce((s, x) => s + (Number(x.amount_cost) || 0), 0));
      setCenyZakazek(Object.fromEntries((ceny || []).map((c) => [c.id, Number(c.price) || 0])));
      setPrubeh(rows || []);
    })();
    return () => { zruseno = true; };
  }, []);

  const vydane = invoices.filter((i) => (i.invoice_type || "vydaná") === "vydaná" && i.status !== "Storno");
  const jmeno = (id) => { const c = customers.find((x) => x.id === id); return c ? (c.company || c.name) : ""; };

  const nevyfakturovano = (prubeh || []).map((r) => {
    const cena = Number(r.hodnota) || cenyZakazek[r.contract_id] || 0;
    const fakturovano = r.contract_id ? vydane.filter((i) => i.contract_id === r.contract_id).reduce((s, i) => s + (Number(i.amount) || 0), 0) : 0;
    return { r, cena, fakturovano, zbyva: cena - fakturovano, dny: dnyOd(r.faze_od) };
  }).filter((x) => x.cena > 0 && x.zbyva > 1).sort((a, b) => b.zbyva - a.zbyva);
  const bezCeny = (prubeh || []).filter((r) => !(Number(r.hodnota) || cenyZakazek[r.contract_id]));
  const sumaNevyf = nevyfakturovano.reduce((s, x) => s + x.zbyva, 0);

  const poSplatnosti = vydane.map((i) => ({ i, info: getInvoicePaymentInfo(i) })).filter((x) => x.info.isOverdue)
    .sort((a, b) => b.info.daysOverdue - a.info.daysOverdue);
  const sumaPoSpl = poSplatnosti.reduce((s, x) => s + x.info.outstanding, 0);

  const zalohy = vydane.filter((i) => i.is_deposit).map((i) => ({ i, info: getInvoicePaymentInfo(i) })).filter((x) => !x.info.isPaid)
    .sort((a, b) => String(a.i.issued).localeCompare(String(b.i.issued)));
  const sumaZaloh = zalohy.reduce((s, x) => s + x.info.outstanding, 0);

  const box = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 };
  const hlava = { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 };
  const titul = { fontWeight: 800, fontSize: 14, color: "#1A1A1A" };
  const castka = (barva) => ({ fontWeight: 800, fontSize: 16, color: barva, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" });
  const radek = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12.5, padding: "5px 0", borderTop: "1px solid #f1f5f9" };
  const popis = { color: "#475569", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  const tl = (barva) => ({ background: barva, color: "#fff", border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 });
  const nic = { fontSize: 12.5, color: "#15803d" };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10, color: "#0E3B5E" }}>💰 Peníze, které visí</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
        <div style={box}>
          <div style={hlava}><span style={titul}>Po montáži, nevyfakturováno</span><span style={castka("#c2410c")}>{prubeh === null ? "…" : fmtKc(sumaNevyf)}</span></div>
          {prubeh !== null && nevyfakturovano.length === 0 && <div style={nic}>✓ U zakázek po montáži je vše vyfakturované.</div>}
          {nevyfakturovano.slice(0, 5).map(({ r, zbyva, dny }) => (
            <div key={r.id} style={radek}>
              <span style={popis} title={`${r.nazev} · ${jmeno(r.customer_id)}`}><b style={{ color: "#1A1A1A" }}>{r.nazev}</b> · zbývá {fmtKc(zbyva)} · {dni(dny)} v kroku</span>
              <button type="button" style={tl("#F5821F")} onClick={() => onOtevritPrubeh?.(r.id)}>Dofakturovat</button>
            </div>
          ))}
          {nevyfakturovano.length > 5 && <div style={{ fontSize: 11.5, color: "#64748b" }}>+ {nevyfakturovano.length - 5} dalších</div>}
          {bezCeny.length > 0 && <div style={{ fontSize: 11.5, color: "#b45309" }}>⚠️ {bezCeny.length === 1 ? "1 zakázka" : `${bezCeny.length} zakázek`} po montáži nemá cenu – zbývající částka nejde spočítat ({bezCeny.slice(0, 3).map((r) => r.nazev).join(", ")}{bezCeny.length > 3 ? "…" : ""}).</div>}
        </div>

        <div style={box}>
          <div style={hlava}><span style={titul}>Faktury po splatnosti</span><span style={castka("#b91c1c")}>{fmtKc(sumaPoSpl)}</span></div>
          {poSplatnosti.length === 0 && <div style={nic}>✓ Nic není po splatnosti.</div>}
          {poSplatnosti.slice(0, 4).map(({ i, info }) => (
            <div key={i.id} style={radek}>
              <span style={popis}><b style={{ color: "#1A1A1A" }}>{cisloFaktury(i)}</b> · {jmeno(i.customer_id ?? i.customerId)} · {dni(info.daysOverdue)} po splatnosti</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtKc(info.outstanding)}</span>
            </div>
          ))}
          {poSplatnosti.length > 0 && <button type="button" style={{ ...tl("#0E3B5E"), alignSelf: "flex-start", marginTop: 4 }} onClick={() => setTab?.("invoices")}>Otevřít faktury</button>}
        </div>

        <div style={box}>
          <div style={hlava}><span style={titul}>Nezaplacené zálohy</span><span style={castka("#0E3B5E")}>{fmtKc(sumaZaloh)}</span></div>
          {zalohy.length === 0 && <div style={nic}>✓ Všechny zálohy jsou zaplacené.</div>}
          {zalohy.slice(0, 4).map(({ i, info }) => (
            <div key={i.id} style={radek}>
              <span style={popis}><b style={{ color: "#1A1A1A" }}>{cisloFaktury(i)}</b> · {jmeno(i.customer_id ?? i.customerId)} · vystavena před {dni(dnyOd(i.issued))}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtKc(info.outstanding)}</span>
            </div>
          ))}
          {zarukaLetos !== null && (
            <div style={{ ...radek, marginTop: "auto" }}>
              <span style={popis}>🔧 Záruční servis letos (platíme my)</span>
              <button type="button" onClick={() => setTab?.("servis")} style={{ background: "none", border: "none", padding: 0, fontWeight: 800, color: "#0f766e", cursor: "pointer", fontFamily: "inherit", fontVariantNumeric: "tabular-nums" }}>{fmtKc(zarukaLetos)}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
