// ─── Hledání všude (lupa vpravo nahoře, na počítači Ctrl+K) ──────────────────
// Jedno pole přes zakázky, Průběh, zákazníky, faktury, sklad a servis.
// Stejné hledání jako ve výběrech (hledani.js): bez diakritiky, s tolerancí
// překlepů, nejpodobnější nahoře. Prázdné pole ukáže naposledy otevřené.
// Šipky + Enter vybírají, Esc zavře. Klik otevře rovnou detail, kde to jde.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { seraditPodleShody } from "./hledani.js";
import { cisloFaktury } from "./invoicingUtils.js";

const NEDAVNE_KEY = "proudos_hledani_nedavne";
const SKUPINY = [
  { id: "prubeh", nazev: "Průběh zakázek", ikona: "ti-route", barva: "#F5821F", tab: "prubeh" },
  { id: "zakazka", nazev: "Zakázky", ikona: "ti-briefcase", barva: "#7c3aed", tab: "contracts" },
  { id: "zakaznik", nazev: "Zákazníci", ikona: "ti-user", barva: "#0369a1", tab: "customers" },
  { id: "faktura", nazev: "Faktury", ikona: "ti-file-invoice", barva: "#15803d", tab: "invoices" },
  { id: "servis", nazev: "Servis", ikona: "ti-tool", barva: "#0f766e", tab: "servis" },
  { id: "produkt", nazev: "Sklad", ikona: "ti-package", barva: "#b45309", tab: "warehouse" },
];
const fmtKc = (n) => `${Math.round(Number(n) || 0).toLocaleString("cs-CZ")} Kč`;

const nactiNedavne = () => { try { return JSON.parse(localStorage.getItem(NEDAVNE_KEY) || "[]"); } catch { return []; } };

export default function HledaniVsude({ open, setOpen, customers = [], contracts = [], invoices = [], products = [], allowedTabs = [], onOtevrit }) {
  const [q, setQ] = useState("");
  const [aktivni, setAktivni] = useState(0);
  const [dalsi, setDalsi] = useState({ prubeh: [], servis: [] }); // načte se při prvním otevření
  const [nedavne, setNedavne] = useState(nactiNedavne);
  const nacteno = useRef(false);
  const seznam = useRef(null);

  // Ctrl+K / Cmd+K kdekoli v aplikaci
  useEffect(() => {
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setOpen]);

  useEffect(() => {
    if (!open || nacteno.current) return;
    nacteno.current = true;
    Promise.all([
      allowedTabs.includes("prubeh") ? supabase.from("zakazky_prubeh").select("id, nazev, typ, faze, stav, customer_id, contract_id, misto_adresa, misto_telefon").neq("stav", "prohrana") : Promise.resolve({ data: [] }),
      allowedTabs.includes("servis") ? supabase.from("service_tickets").select("id, cislo, nazev, stav, customer_id, contract_id, adresa, telefon, placeny") : Promise.resolve({ data: [] }),
    ]).then(([p, s]) => setDalsi({ prubeh: p.data || [], servis: s.data || [] }));
  }, [open, allowedTabs]);

  const zak = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const jmenoZak = (id) => { const c = zak.get(id); return c ? (c.company || c.name || "") : ""; };

  // všechny položky jako { druh, id, nazev, popis, hledat, data }
  const polozky = useMemo(() => {
    const out = [];
    const smi = (tab) => allowedTabs.includes(tab);
    if (smi("prubeh")) for (const r of dalsi.prubeh) out.push({ druh: "prubeh", id: r.id, nazev: r.nazev || "Zakázka", popis: [r.typ, jmenoZak(r.customer_id), r.stav === "uzavrena" ? "uzavřená" : null].filter(Boolean).join(" · "), hledat: [zak.get(r.customer_id)?.name, r.misto_adresa, r.misto_telefon].filter(Boolean).join(" "), data: r });
    if (smi("contracts")) for (const c of contracts) out.push({ druh: "zakazka", id: c.id, nazev: c.name || "Zakázka", popis: [c.code, jmenoZak(c.customer_id), c.status].filter(Boolean).join(" · "), hledat: [zak.get(c.customer_id)?.name, c.address].filter(Boolean).join(" "), data: c });
    if (smi("customers")) for (const c of customers) out.push({ druh: "zakaznik", id: c.id, nazev: c.company ? `${c.company}` : (c.name || "Zákazník"), popis: [c.company ? c.name : null, c.phone, c.ico ? `IČO ${c.ico}` : null].filter(Boolean).join(" · "), hledat: [c.email, c.address, c.city, c.dic].filter(Boolean).join(" "), data: c });
    if (smi("invoices")) for (const i of invoices) {
      if (i.invoice_type === "přijatá") continue;
      out.push({ druh: "faktura", id: i.id, nazev: `${cisloFaktury(i)} · ${jmenoZak(i.customer_id ?? i.customerId) || "bez zákazníka"}`, popis: [fmtKc((Number(i.amount) || 0) + (Number(i.tax) || 0)), i.status, i.is_deposit ? "záloha" : null].filter(Boolean).join(" · "), hledat: [i.number, i.cislo_ucetni, i.variable_symbol, i.order_ref].filter(Boolean).join(" "), data: i });
    }
    if (smi("servis")) for (const t of dalsi.servis) out.push({ druh: "servis", id: t.id, nazev: `${t.cislo || ""} ${t.nazev || ""}`.trim(), popis: [jmenoZak(t.customer_id), t.stav, t.placeny ? "placený" : "záruka"].filter(Boolean).join(" · "), hledat: [t.adresa, t.telefon].filter(Boolean).join(" "), data: t });
    if (smi("warehouse")) for (const p of products) out.push({ druh: "produkt", id: p.id, nazev: p.name || "Produkt", popis: [p.sku, p.stock != null ? `${p.stock} ${p.unit || ""}`.trim() : null].filter(Boolean).join(" · "), hledat: [p.category, p.supplier].filter(Boolean).join(" "), data: p });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dalsi, contracts, customers, invoices, products, allowedTabs, zak]);

  const vysledky = useMemo(() => {
    if (!q.trim()) {
      return nedavne.map((n) => polozky.find((p) => p.druh === n.druh && String(p.id) === String(n.id))).filter(Boolean).slice(0, 8);
    }
    const serazene = seraditPodleShody(polozky, q, (p) => `${p.nazev} ${p.popis} ${p.hledat}`);
    // nejvýš 6 z každé skupiny, ať jedna skupina nezahltí ostatní
    const pocty = {};
    return serazene.filter((p) => { pocty[p.druh] = (pocty[p.druh] || 0) + 1; return pocty[p.druh] <= 6; }).slice(0, 30);
  }, [q, polozky, nedavne]);

  // pořadí pro šipky = pořadí, jak se vykreslí po skupinách
  const poSkupinach = useMemo(() => {
    if (!q.trim()) return [{ skupina: { id: "nedavne", nazev: "Naposledy otevřené" }, polozky: vysledky }];
    const skupinyVPoradi = [...new Set(vysledky.map((v) => v.druh))];
    return skupinyVPoradi.map((d) => ({ skupina: SKUPINY.find((s) => s.id === d), polozky: vysledky.filter((v) => v.druh === d) }));
  }, [vysledky, q]);
  const plochy = poSkupinach.flatMap((g) => g.polozky);

  const zavrit = () => { setOpen(false); setQ(""); setAktivni(0); };
  const otevrit = (p) => {
    const dalsiNedavne = [{ druh: p.druh, id: p.id }, ...nedavne.filter((n) => !(n.druh === p.druh && String(n.id) === String(p.id)))].slice(0, 12);
    setNedavne(dalsiNedavne);
    try { localStorage.setItem(NEDAVNE_KEY, JSON.stringify(dalsiNedavne)); } catch { /* ignore */ }
    zavrit();
    onOtevrit?.(p.druh, p.data);
  };

  useEffect(() => {
    seznam.current?.querySelector(`[data-i="${aktivni}"]`)?.scrollIntoView({ block: "nearest" });
  }, [aktivni]);

  if (!open) return null;
  const klavesy = (e) => {
    if (e.key === "Escape") { e.preventDefault(); zavrit(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setAktivni((a) => Math.min(a + 1, Math.max(0, plochy.length - 1))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAktivni((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && plochy[aktivni]) { e.preventDefault(); otevrit(plochy[aktivni]); }
  };

  let index = -1;
  return (
    <>
      <div onClick={zavrit} style={{ position: "fixed", inset: 0, zIndex: 490, background: "#0E3B5E22" }} />
      <div role="dialog" aria-label="Hledat v celé aplikaci" style={{ position: "fixed", top: "calc(56px + env(safe-area-inset-top))", right: 16, zIndex: 500, width: 440, maxWidth: "calc(100vw - 32px)", maxHeight: "74vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 16px 40px #0003", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
          <i className="ti ti-search" aria-hidden="true" style={{ color: "#F5821F", fontSize: 18 }}></i>
          <input id="hledani-vsude" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setAktivni(0); }} onKeyDown={klavesy}
            placeholder="Zakázka, zákazník, telefon, IČO, faktura, produkt…" aria-label="Hledat"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 15, fontFamily: "inherit", background: "transparent", color: "#1A1A1A" }} />
          <kbd style={{ fontSize: 10, color: "#64748b", border: "1px solid #e2e8f0", borderRadius: 5, padding: "1px 5px", fontFamily: "inherit" }}>Esc</kbd>
        </div>
        <div ref={seznam} style={{ overflowY: "auto", padding: "4px 6px 8px" }}>
          {q.trim() && plochy.length === 0 && <div style={{ padding: "14px 8px", fontSize: 13, color: "#64748b" }}>Nic podobného jsem nenašel. Zkus kratší slovo nebo jinou část názvu.</div>}
          {!q.trim() && plochy.length === 0 && <div style={{ padding: "14px 8px", fontSize: 13, color: "#64748b" }}>Piš název, jméno, telefon, IČO nebo číslo faktury. Na háčcích a překlepech nezáleží. Na počítači se hledání otevře i zkratkou Ctrl+K.</div>}
          {poSkupinach.map(({ skupina, polozky: pp }) => pp.length > 0 && (
            <div key={skupina.id}>
              <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, padding: "8px 8px 3px" }}>{skupina.nazev}</div>
              {pp.map((p) => {
                index += 1;
                const i = index;
                const s = SKUPINY.find((x) => x.id === p.druh);
                return (
                  <div key={`${p.druh}-${p.id}`} data-i={i} role="option" aria-selected={i === aktivni}
                    onMouseEnter={() => setAktivni(i)} onClick={() => otevrit(p)}
                    style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "7px 8px", borderRadius: 8, cursor: "pointer", background: i === aktivni ? "#eef4fa" : "transparent" }}>
                    <i className={`ti ${s.ikona}`} aria-hidden="true" style={{ color: s.barva, fontSize: 16, marginTop: 1 }}></i>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nazev}</div>
                      {p.popis && <div style={{ fontSize: 11.5, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.popis}</div>}
                    </div>
                    {!q.trim() && <span style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{s.nazev}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
