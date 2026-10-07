// ─── Faktura a zakázka: kolik zbývá dofakturovat, „počítáno na papíře“ ───────
// StavFakturace: cena zakázky, už vyfakturováno (bez záloh a storna), zálohy,
// tato faktura a zbytek — u dílčí fakturace bez rozpisu. Jde rovnou doplnit
// zbývající částku jako jednu položku.
// PapirPanel: fotka ručního výpočtu (contract_photos.invoice_id) a rozpis
// z papíru, který dodatečně opíše administrativa (invoices.papir_rozpis).
// Aplikace řádky přepočítá (množství × cena, součet) a porovná s fakturou
// a s tím, co je zapsané na zakázce (hodiny, materiál, doprava).
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { fmtKc2 } from "./invoicingUtils.js";
import { nahratFotkuZakazky } from "./fotkyZakazky.js";
import { OneDriveThumb, StorageLink } from "./storageUrl.jsx";

const KATEGORIE_VYPOCTU = "Výpočet k faktuře";
const kc = (v) => `${fmtKc2(v)} Kč`;
const cislo = (v) => { const t = String(v ?? "").replace(/\s/g, "").replace(",", "."); return t === "" ? null : Number(t); };
const box = { border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", background: "#f8fafc", fontSize: 13 };
const radek = { display: "flex", justifyContent: "space-between", gap: 10, padding: "2px 0" };
const tl = { background: "#fff", color: "#0369a1", border: "1px solid #bae6fd", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };

// faktury zakázky (kromě této a storna)
function useFakturyZakazky(contractId, invoiceId) {
  const [faktury, setFaktury] = useState(null);
  useEffect(() => {
    if (!contractId) return undefined;
    let zruseno = false;
    supabase.from("invoices").select("id, number, cislo_ucetni, amount, is_deposit, dilci, status, invoice_type, issued")
      .eq("contract_id", contractId).then(({ data }) => {
        if (!zruseno) setFaktury((data || []).filter((i) => i.id !== invoiceId && i.status !== "Storno" && (i.invoice_type || "vydaná") !== "přijatá"));
      });
    return () => { zruseno = true; };
  }, [contractId, invoiceId]);
  return contractId ? faktury : [];
}

function souhrnFakturace(contract, faktury, tato = 0) {
  // cena zakázky; u REA (a když cena chybí) součet rozpočtu z karty zakázky
  const rozpocet = ["budget_prace", "budget_material", "budget_doprava", "budget_vice_prace", "budget_vice_material", "budget_vice_doprava"]
    .reduce((s, k) => s + (Number(contract?.[k]) || 0), 0);
  const cena = Number(contract?.price) || rozpocet || 0;
  const vyfakturovano = (faktury || []).filter((i) => !i.is_deposit).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const zalohy = (faktury || []).filter((i) => i.is_deposit).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  return { cena, vyfakturovano, zalohy, tato, zbyvaPred: cena - vyfakturovano, zbyva: cena - vyfakturovano - tato };
}

export function StavFakturace({ contract, invoiceId = null, tatoBezDph = 0, onDoplnit, disabled = false }) {
  const faktury = useFakturyZakazky(contract?.id, invoiceId);
  if (!contract) return null;
  if (faktury === null) return <div style={{ ...box, color: "#64748b" }}>Načítám faktury zakázky…</div>;
  const s = souhrnFakturace(contract, faktury, tatoBezDph);
  return (
    <div style={box}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>📊 Fakturace zakázky {contract.code || contract.name} <span style={{ fontWeight: 400, color: "#64748b" }}>(bez DPH)</span></div>
      <div style={radek}><span>Cena zakázky</span><b>{s.cena ? kc(s.cena) : "není zadaná"}</b></div>
      <div style={radek}><span>Už vyfakturováno ({faktury.filter((i) => !i.is_deposit).length} {faktury.filter((i) => !i.is_deposit).length === 1 ? "faktura" : "faktur"})</span><b>{kc(s.vyfakturovano)}</b></div>
      {s.zalohy > 0 && <div style={radek}><span>Zálohové faktury</span><b>{kc(s.zalohy)}</b></div>}
      <div style={radek}><span>Tato faktura</span><b>{kc(s.tato)}</b></div>
      {s.cena > 0 && (
        <div style={{ ...radek, borderTop: "1px solid #e2e8f0", marginTop: 4, paddingTop: 6, fontSize: 14 }}>
          <span>{s.zbyva >= 0 ? "Zbývá dofakturovat" : "Vyfakturováno víc, než je cena zakázky"}</span>
          <b style={{ color: s.zbyva < -0.5 ? "#b91c1c" : s.zbyva > 0.5 ? "#b45309" : "#15803d" }}>{kc(Math.abs(s.zbyva))}</b>
        </div>
      )}
      {faktury.length > 0 && (
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
          {faktury.map((i) => `${i.cislo_ucetni || i.number}${i.is_deposit ? " (záloha)" : i.dilci ? " (dílčí)" : ""}: ${kc(i.amount)}`).join(" · ")}
        </div>
      )}
      {onDoplnit && s.cena > 0 && s.zbyvaPred > 0.5 && !disabled && (
        <button type="button" style={{ ...tl, marginTop: 8 }} onClick={() => onDoplnit(s.zbyvaPred)}>
          ↧ Dílčí faktura na zbývající částku ({kc(s.zbyvaPred)})
        </button>
      )}
    </div>
  );
}

// ── Počítáno na papíře ──
const prazdnyRadek = () => ({ popis: "", mnozstvi: "", jednotka: "", cena: "", celkem_papir: "" });

export function PapirPanel({ contract, invoiceId = null, fakturaBezDph = 0, costEntries = [], rozpis: rozpisVychozi, onFotkyNove }) {
  const [fotky, setFotky] = useState([]);
  const [nahravam, setNahravam] = useState(false);
  const [rozpis, setRozpis] = useState(() => rozpisVychozi || { radky: [prazdnyRadek()], soucet_papir: "" });
  const [stav, setStav] = useState("");

  useEffect(() => {
    if (!invoiceId) return undefined;
    let zruseno = false;
    supabase.from("contract_photos").select("*").eq("invoice_id", invoiceId).order("id").then(({ data }) => { if (!zruseno) setFotky(data || []); });
    return () => { zruseno = true; };
  }, [invoiceId]);

  const nahrat = async (files) => {
    if (!contract) { alert("Nejdřív k faktuře vyber zakázku — fotka výpočtu se uloží do její složky."); return; }
    setNahravam(true);
    const nove = [];
    for (const [i, f] of [...files].entries()) {
      try {
        const row = await nahratFotkuZakazky(f, { slozka: contract.name || String(contract.id), contractId: contract.id, kategorie: KATEGORIE_VYPOCTU, popis: "Výpočet faktury na papíře", poradi: i + 1 });
        if (invoiceId) await supabase.from("contract_photos").update({ invoice_id: invoiceId }).eq("id", row.id);
        nove.push(row);
      } catch (e) { alert(`Soubor „${f.name}“ se nepodařilo nahrát: ${e.message}`); }
    }
    setNahravam(false);
    setFotky((p) => [...p, ...nove]);
    onFotkyNove?.(nove.map((r) => r.id));
  };

  // přepočet řádků z papíru
  const radky = (rozpis.radky || []).map((r) => {
    const m = cislo(r.mnozstvi), c = cislo(r.cena), p = cislo(r.celkem_papir);
    const spravne = m != null && c != null ? Math.round(m * c * 100) / 100 : null;
    return { ...r, spravne, chyba: spravne != null && p != null && Math.abs(spravne - p) > 0.5 };
  });
  const soucetSpravne = radky.reduce((s, r) => s + (r.spravne ?? cislo(r.celkem_papir) ?? 0), 0);
  const soucetRadkuPapir = radky.reduce((s, r) => s + (cislo(r.celkem_papir) ?? 0), 0);
  const soucetPapir = cislo(rozpis.soucet_papir);
  const chybSoucet = soucetPapir != null && Math.abs(soucetPapir - soucetRadkuPapir) > 0.5;
  const vyplneno = radky.some((r) => r.popis || r.spravne != null || cislo(r.celkem_papir) != null);

  // podle zápisů na zakázce (schválené dny → náklady v prodejních cenách)
  const zapisy = (costEntries || []).filter((e) => contract && e.contract_id === contract.id);
  const podleTypu = ["práce", "materiál", "doprava"].map((t) => [t, zapisy.filter((e) => e.cost_type === t).reduce((s, e) => s + (Number(e.amount_client) || 0), 0)]);
  const podleZapisu = podleTypu.reduce((s, [, v]) => s + v, 0);

  const ulozit = async () => {
    if (!invoiceId) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = user ? await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle() : { data: null };
    const hodnota = { ...rozpis, zapsal: prof?.name || null, zapsano_at: new Date().toISOString() };
    const { error } = await supabase.from("invoices").update({ papir_rozpis: hodnota, pocitano_na_papire: true }).eq("id", invoiceId);
    if (error) { setStav("Nepodařilo se uložit: " + error.message); return; }
    setRozpis(hodnota);
    setStav("✓ Rozpis z papíru uložený");
  };

  const setRadek = (i, patch) => { setStav(""); setRozpis((r) => ({ ...r, radky: r.radky.map((x, j) => (j === i ? { ...x, ...patch } : x)) })); };
  const pole = { border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
  const verdikt = (rozdil, coSrovnava) => Math.abs(rozdil) <= Math.max(1, Math.abs(fakturaBezDph) * 0.01)
    ? <span style={{ color: "#15803d", fontWeight: 800 }}>✓ sedí</span>
    : <span style={{ color: "#b45309", fontWeight: 800 }}>⚠ faktura o {kc(Math.abs(rozdil))} {rozdil > 0 ? "víc" : "méně"} než {coSrovnava}</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* fotka výpočtu */}
      <div style={box}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>📷 Fotka ručního výpočtu</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {fotky.map((p) => (
            <StorageLink key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", width: 90, height: 90, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0" }}>
              <OneDriveThumb itemId={p.item_id} fallbackUrl={p.url} cesta={p.storage_path} alt="Výpočet na papíře" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </StorageLink>
          ))}
          <label style={{ ...tl, display: "inline-flex", alignItems: "center", gap: 6 }}>
            {nahravam ? "Nahrávám…" : "＋ Nahrát fotku / sken"}
            <input type="file" multiple style={{ display: "none" }} disabled={nahravam} onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; if (f.length) nahrat(f); }} />
          </label>
        </div>
        {!contract && <div style={{ fontSize: 12, color: "#b45309", marginTop: 6 }}>Fotka se ukládá k zakázce — vyber zakázku v Základních údajích.</div>}
      </div>

      {/* rozpis z papíru — opíše administrativa */}
      <div style={box}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>✍️ Rozpis z papíru <span style={{ fontWeight: 400, color: "#64748b" }}>— opíše administrativa podle fotky</span></div>
        {!invoiceId ? (
          <div style={{ color: "#64748b" }}>Rozpis jde opsat po vystavení faktury (Fakturace → upravit fakturu → záložka „✍️ Papír“).</div>
        ) : (<>
          {rozpis.zapsal && <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Opsal(a) {rozpis.zapsal}{rozpis.zapsano_at ? `, ${new Date(rozpis.zapsano_at).toLocaleString("cs-CZ")}` : ""}</div>}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ color: "#64748b", fontSize: 10, textAlign: "left" }}>
                <th style={{ padding: 4 }}>Popis</th><th style={{ padding: 4, width: 70 }}>Množství</th><th style={{ padding: 4, width: 55 }}>Jedn.</th><th style={{ padding: 4, width: 85 }}>Cena/j</th><th style={{ padding: 4, width: 95 }}>Celkem na papíře</th><th style={{ padding: 4, width: 110, textAlign: "right" }}>Správně</th><th />
              </tr></thead>
              <tbody>
                {radky.map((r, i) => (
                  <tr key={i} style={{ background: r.chyba ? "#fef2f2" : undefined }}>
                    <td style={{ padding: 3 }}><input style={pole} value={r.popis} onChange={(e) => setRadek(i, { popis: e.target.value })} placeholder="např. práce 2 lidi" /></td>
                    <td style={{ padding: 3 }}><input style={pole} inputMode="decimal" value={r.mnozstvi} onChange={(e) => setRadek(i, { mnozstvi: e.target.value })} /></td>
                    <td style={{ padding: 3 }}><input style={pole} value={r.jednotka} onChange={(e) => setRadek(i, { jednotka: e.target.value })} placeholder="h" /></td>
                    <td style={{ padding: 3 }}><input style={pole} inputMode="decimal" value={r.cena} onChange={(e) => setRadek(i, { cena: e.target.value })} /></td>
                    <td style={{ padding: 3 }}><input style={{ ...pole, borderColor: r.chyba ? "#f87171" : pole.border }} inputMode="decimal" value={r.celkem_papir} onChange={(e) => setRadek(i, { celkem_papir: e.target.value })} /></td>
                    <td style={{ padding: "3px 6px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: r.chyba ? "#b91c1c" : "#0f172a" }}>
                      {r.spravne != null ? kc(r.spravne) : "–"}{r.chyba && <div style={{ fontSize: 10, fontWeight: 600 }}>chyba {kc(cislo(r.celkem_papir) - r.spravne)}</div>}
                    </td>
                    <td><button type="button" aria-label="Smazat řádek" onClick={() => setRozpis((x) => ({ ...x, radky: x.radky.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 15 }}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <button type="button" style={tl} onClick={() => setRozpis((x) => ({ ...x, radky: [...(x.radky || []), prazdnyRadek()] }))}>+ Řádek</button>
            <label style={{ fontSize: 12, color: "#475569", display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>Součet napsaný na papíře
              <input style={{ ...pole, width: 110, borderColor: chybSoucet ? "#f87171" : pole.border }} inputMode="decimal" value={rozpis.soucet_papir ?? ""} onChange={(e) => { setStav(""); setRozpis((x) => ({ ...x, soucet_papir: e.target.value })); }} />
            </label>
          </div>
        </>)}
      </div>

      {/* kontrola */}
      {invoiceId && vyplneno && (
        <div style={{ ...box, background: "#fff" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>🔎 Kontrola výpočtu</div>
          <div style={radek}><span>Řádky přepočítané správně</span><b>{kc(soucetSpravne)}</b></div>
          {radky.some((r) => r.chyba)
            ? <div style={{ color: "#b91c1c", fontWeight: 700 }}>⚠ Chyba v {radky.filter((r) => r.chyba).length === 1 ? "řádku" : "řádcích"} {radky.map((r, i) => (r.chyba ? i + 1 : null)).filter(Boolean).join(", ")} — množství × cena nedává částku z papíru.</div>
            : <div style={{ color: "#15803d", fontWeight: 700 }}>✓ Řádky jsou spočítané správně.</div>}
          {soucetPapir != null && (chybSoucet
            ? <div style={{ color: "#b91c1c", fontWeight: 700 }}>⚠ Součet na papíře {kc(soucetPapir)} nesedí se součtem řádků z papíru {kc(soucetRadkuPapir)} (rozdíl {kc(soucetPapir - soucetRadkuPapir)}).</div>
            : <div style={{ color: "#15803d", fontWeight: 700 }}>✓ Součet na papíře sedí.</div>)}
          <div style={{ ...radek, marginTop: 6 }}><span>Faktura (bez DPH)</span><span><b>{kc(fakturaBezDph)}</b> · {verdikt(fakturaBezDph - soucetSpravne, "správný výpočet")}</span></div>
          {contract && (
            <div style={{ ...radek }}><span>Podle zápisů na zakázce ({podleTypu.filter(([, v]) => v).map(([t, v]) => `${t} ${kc(v)}`).join(", ") || "nic"})</span><span><b>{kc(podleZapisu)}</b>{podleZapisu > 0 && <> · {verdikt(fakturaBezDph - podleZapisu, "zápisy")}</>}</span></div>
          )}
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Zápisy = hodiny ze schválených dnů, materiál a doprava na zakázce v prodejních cenách. Tolerance 1 %.</div>
        </div>
      )}
      {invoiceId && (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button type="button" onClick={ulozit} style={{ ...tl, background: "#0369a1", color: "#fff", border: "none", padding: "8px 16px" }}>💾 Uložit rozpis z papíru</button>
          {stav && <span role="status" style={{ fontSize: 13, color: stav.startsWith("✓") ? "#15803d" : "#b91c1c" }}>{stav}</span>}
        </div>
      )}
    </div>
  );
}
