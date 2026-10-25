// ─── Výrobní čísla (SN) zařízení u zakázky ───────────────────────────────────
// Střídač, baterie, panely, wallbox…: každé SN má produkt, fakturu dodavatele,
// na které se koupilo (z fronty faktur, i s PDF), datum nákupu, záruku
// a dokumenty (záruční list, datasheet, certifikát). Při reklamaci se podle SN
// dohledá zakázka i doklad o koupi. Víc SN najednou = jedno na řádek.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";

const BUCKET = "vyrobni-cisla";
const BUCKET_FAKTUR = "faktury-fronta";
const DRUHY = [["stridac", "Střídač"], ["baterie", "Baterie"], ["panel", "Panel"], ["optimizer", "Optimizér"], ["wallbox", "Wallbox"], ["elektromer", "Elektroměr"], ["jine", "Jiné"]];
const nazevDruhu = (d) => (DRUHY.find((x) => x[0] === d) || DRUHY[DRUHY.length - 1])[1];
const fmtDatum = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("cs-CZ") : "");
const bezDia = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const bezpecneJmeno = (n) => String(n || "soubor").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80);
const prazdny = () => ({ sn: "", nazev: "", druh: "stridac", fakturaId: "", polozkaId: "", dodavatel: "", faktura_cislo: "", datum_nakupu: "", zaruka_do: "", poznamka: "", soubory: [] });

export default function VyrobniCisla({ contractId, prubehId, currentUser }) {
  const [zaznamy, setZaznamy] = useState(null);
  const [faktury, setFaktury] = useState([]);       // fronta faktur (pro výběr)
  const [fakturyZakazky, setFakturyZakazky] = useState(new Set()); // faktury s řádkami přiřazenými k zakázce
  const [polozky, setPolozky] = useState([]);       // řádky vybrané faktury
  const [form, setForm] = useState(null);           // přidání / úprava
  const [hledatFakturu, setHledatFakturu] = useState("");
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState("");

  const nacist = async () => {
    if (!contractId && !prubehId) { setZaznamy([]); return; }
    // z Ekonomiky zakázek (jen contract_id) dohledat i SN zapsaná v Průběhu dřív, než vznikla zakázka
    let pid = prubehId;
    if (!pid && contractId) {
      const { data: pr } = await supabase.from("zakazky_prubeh").select("id").eq("contract_id", contractId).limit(1);
      pid = pr?.[0]?.id || null;
    }
    const podminka = [contractId && `contract_id.eq.${contractId}`, pid && `prubeh_id.eq.${pid}`].filter(Boolean).join(",");
    const { data, error } = await supabase.from("vyrobni_cisla").select("*").or(podminka).order("druh").order("sn");
    if (error) setChyba(error.message);
    setZaznamy(data || []);
  };
  useEffect(() => {
    Promise.resolve().then(nacist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, prubehId]);

  // faktury se načtou až při otevření formuláře
  const otevritFormular = async (z) => {
    setChyba("");
    setForm(z ? { ...prazdny(), ...z, id: z.id, fakturaId: z.invoice_queue_id ? String(z.invoice_queue_id) : "", polozkaId: z.invoice_queue_item_id ? String(z.invoice_queue_item_id) : "", soubory: [] } : prazdny());
    if (!faktury.length) {
      const [{ data: f }, { data: prirazene }] = await Promise.all([
        supabase.from("invoice_queue").select("id, supplier_name, invoice_number, issue_date, pdf_storage_path, fotky").order("issue_date", { ascending: false, nullsFirst: false }).limit(1500),
        contractId ? supabase.from("invoice_queue_items").select("invoice_queue_id").eq("assigned_contract_id", contractId) : Promise.resolve({ data: [] }),
      ]);
      setFaktury(f || []);
      setFakturyZakazky(new Set((prirazene || []).map((x) => x.invoice_queue_id)));
    }
    if (z?.invoice_queue_id) nactiPolozky(z.invoice_queue_id);
    else setPolozky([]);
  };
  const nactiPolozky = async (fid) => {
    const { data } = await supabase.from("invoice_queue_items").select("id, line_no, description, quantity, unit").eq("invoice_queue_id", fid).order("line_no");
    setPolozky(data || []);
  };
  const vybratFakturu = (fid) => {
    const f = faktury.find((x) => String(x.id) === String(fid));
    setForm((s) => ({ ...s, fakturaId: fid ? String(fid) : "", polozkaId: "", dodavatel: f?.supplier_name || s.dodavatel, faktura_cislo: f?.invoice_number || s.faktura_cislo, datum_nakupu: f?.issue_date || s.datum_nakupu }));
    setHledatFakturu("");
    if (fid) nactiPolozky(fid); else setPolozky([]);
  };

  const nabidkaFaktur = useMemo(() => {
    const q = bezDia(hledatFakturu);
    const seznam = faktury.filter((f) => !q || bezDia(`${f.supplier_name} ${f.invoice_number}`).includes(q));
    return [...seznam.filter((f) => fakturyZakazky.has(f.id)), ...seznam.filter((f) => !fakturyZakazky.has(f.id))].slice(0, 40);
  }, [faktury, fakturyZakazky, hledatFakturu]);

  const ulozit = async () => {
    const sns = String(form.sn || "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
    if (!sns.length) { setChyba("Zadej výrobní číslo (víc čísel = každé na nový řádek)."); return; }
    setPracuji(true); setChyba("");
    try {
      // dokumenty se nahrají jednou a sdílí je všechna SN z formuláře
      const nove = [];
      for (const soubor of form.soubory) {
        const cesta = `${contractId || "p" + prubehId}/${Date.now()}-${bezpecneJmeno(soubor.name)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(cesta, soubor, { contentType: soubor.type || undefined });
        if (error) throw new Error(`Soubor ${soubor.name}: ${error.message}`);
        nove.push({ cesta, nazev: soubor.name });
      }
      const zaklad = {
        nazev: form.nazev.trim() || null, druh: form.druh || null,
        contract_id: contractId || null, prubeh_id: prubehId || null,
        invoice_queue_id: form.fakturaId ? Number(form.fakturaId) : null,
        invoice_queue_item_id: form.polozkaId ? Number(form.polozkaId) : null,
        dodavatel: form.dodavatel.trim() || null, faktura_cislo: form.faktura_cislo.trim() || null,
        datum_nakupu: form.datum_nakupu || null, zaruka_do: form.zaruka_do || null, poznamka: form.poznamka.trim() || null,
      };
      if (form.id) {
        const puvodni = zaznamy.find((x) => x.id === form.id);
        const { error } = await supabase.from("vyrobni_cisla").update({ ...zaklad, sn: sns[0], dokumenty: [...(puvodni?.dokumenty || []), ...nove] }).eq("id", form.id);
        if (error) throw error;
      } else {
        const radky = sns.map((sn) => ({ ...zaklad, sn, dokumenty: nove, zapsal: currentUser?.name || null }));
        const { error } = await supabase.from("vyrobni_cisla").insert(radky);
        if (error) throw error;
      }
      setForm(null);
      await nacist();
    } catch (e) {
      setChyba("Nepodařilo se uložit: " + (e.message || e));
    }
    setPracuji(false);
  };
  const smazat = async (z) => {
    if (!window.confirm(`Smazat výrobní číslo ${z.sn}?`)) return;
    const { error } = await supabase.from("vyrobni_cisla").delete().eq("id", z.id);
    if (error) { setChyba(error.message); return; }
    setZaznamy((s) => s.filter((x) => x.id !== z.id));
  };
  const otevritSoubor = async (bucket, cesta) => {
    const okno = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(cesta, 600);
    if (error || !data?.signedUrl) { okno?.close(); setChyba("Soubor se nepodařilo otevřít: " + (error?.message || "nenalezen")); return; }
    if (okno) okno.location.href = data.signedUrl; else window.open(data.signedUrl, "_blank");
  };
  const otevritFakturu = async (fid) => {
    let f = faktury.find((x) => x.id === fid);
    if (!f) { const { data } = await supabase.from("invoice_queue").select("id, pdf_storage_path, fotky").eq("id", fid).maybeSingle(); f = data; }
    const cesta = f?.pdf_storage_path || (Array.isArray(f?.fotky) ? f.fotky[0] : null);
    if (!cesta) { setChyba("Faktura nemá uložené PDF ani fotku."); return; }
    otevritSoubor(BUCKET_FAKTUR, cesta);
  };

  const dnes = new Date().toLocaleDateString("sv-SE");
  const pole = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 9px", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box", background: "#fff" };
  const lbl = { fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 3 };
  const tl = (bg, fg = "#fff") => ({ background: bg, color: fg, border: bg === "#fff" ? "1px solid #cbd5e1" : "none", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });

  if (!zaznamy) return <div style={{ fontSize: 13, color: "#64748b" }}>Načítám výrobní čísla…</div>;
  const vybranaF = form?.fakturaId ? faktury.find((x) => String(x.id) === form.fakturaId) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>🔢 Výrobní čísla ({zaznamy.length})</b>
        {!form && <button type="button" style={tl("#0369a1")} onClick={() => otevritFormular(null)}>+ Přidat SN</button>}
      </div>
      {chyba && <div role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{chyba}</div>}

      {form && (
        <div style={{ border: "1px solid #bae6fd", background: "#f0f9ff", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
            <div>
              <label style={lbl} htmlFor="sn-cisla">Výrobní číslo{form.id ? "" : " (víc = každé na řádek)"}</label>
              {form.id
                ? <input id="sn-cisla" style={pole} value={form.sn} onChange={(e) => setForm({ ...form, sn: e.target.value })} />
                : <textarea id="sn-cisla" style={{ ...pole, minHeight: 64, fontFamily: "ui-monospace, monospace" }} value={form.sn} placeholder={"např. 2307A1234567\n(skener čárových kódů píše rovnou sem)"} onChange={(e) => setForm({ ...form, sn: e.target.value })} />}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div><label style={lbl} htmlFor="sn-druh">Druh</label>
                <select id="sn-druh" style={pole} value={form.druh} onChange={(e) => setForm({ ...form, druh: e.target.value })}>{DRUHY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div><label style={lbl} htmlFor="sn-nazev">Produkt / model</label>
                <input id="sn-nazev" style={pole} value={form.nazev} placeholder="např. GoodWe GW10K-ET" onChange={(e) => setForm({ ...form, nazev: e.target.value })} /></div>
            </div>
          </div>

          <div>
            <label style={lbl} htmlFor="sn-faktura">Faktura, na které se kupovalo</label>
            {vybranaF ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                <span style={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, padding: "5px 9px" }}>🧾 {vybranaF.supplier_name || "?"} · {vybranaF.invoice_number || "bez čísla"} · {fmtDatum(vybranaF.issue_date)}</span>
                <button type="button" style={tl("#fff", "#334155")} onClick={() => otevritFakturu(vybranaF.id)}>📄 Otevřít</button>
                <button type="button" style={tl("#fff", "#b91c1c")} onClick={() => vybratFakturu("")}>Odebrat</button>
              </div>
            ) : (
              <>
                <input id="sn-faktura" style={pole} value={hledatFakturu} placeholder="Hledej dodavatele nebo číslo faktury…" onChange={(e) => setHledatFakturu(e.target.value)} />
                <div style={{ maxHeight: 180, overflowY: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 4 }}>
                  {nabidkaFaktur.length === 0 && <div style={{ padding: 8, fontSize: 12.5, color: "#64748b" }}>Nic nenalezeno — dodavatele a číslo faktury můžeš vyplnit ručně níž.</div>}
                  {nabidkaFaktur.map((f) => (
                    <button key={f.id} type="button" onClick={() => vybratFakturu(f.id)}
                      style={{ display: "flex", justifyContent: "space-between", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid #f1f5f9", padding: "6px 9px", fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
                      <span><b>{f.supplier_name || "?"}</b> · {f.invoice_number || "bez čísla"}{fakturyZakazky.has(f.id) && <span style={{ color: "#15803d", fontWeight: 700 }}> · u této zakázky</span>}</span>
                      <span style={{ color: "#64748b" }}>{fmtDatum(f.issue_date)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {vybranaF && polozky.length > 0 && (
            <div><label style={lbl} htmlFor="sn-polozka">Řádek faktury (nepovinné)</label>
              <select id="sn-polozka" style={pole} value={form.polozkaId} onChange={(e) => { const it = polozky.find((x) => String(x.id) === e.target.value); setForm({ ...form, polozkaId: e.target.value, nazev: form.nazev || it?.description || "" }); }}>
                <option value="">— celá faktura —</option>
                {polozky.map((it) => <option key={it.id} value={it.id}>{it.line_no ? `${it.line_no}. ` : ""}{it.description} ({Number(it.quantity ?? 0).toLocaleString("cs-CZ")} {it.unit || "ks"})</option>)}
              </select></div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            <div><label style={lbl} htmlFor="sn-dod">Dodavatel</label><input id="sn-dod" style={pole} value={form.dodavatel} onChange={(e) => setForm({ ...form, dodavatel: e.target.value })} /></div>
            <div><label style={lbl} htmlFor="sn-fc">Číslo faktury</label><input id="sn-fc" style={pole} value={form.faktura_cislo} onChange={(e) => setForm({ ...form, faktura_cislo: e.target.value })} /></div>
            <div><label style={lbl} htmlFor="sn-dn">Datum nákupu</label><input id="sn-dn" type="date" style={pole} value={form.datum_nakupu || ""} onChange={(e) => setForm({ ...form, datum_nakupu: e.target.value })} /></div>
            <div><label style={lbl} htmlFor="sn-zd">Záruka do</label><input id="sn-zd" type="date" style={pole} value={form.zaruka_do || ""} onChange={(e) => setForm({ ...form, zaruka_do: e.target.value })} />
              {form.datum_nakupu && <div style={{ display: "flex", gap: 4, marginTop: 4 }}>{[2, 5, 10, 12].map((r) => (
                <button key={r} type="button" style={{ ...tl("#fff", "#334155"), padding: "2px 7px", fontSize: 11 }}
                  onClick={() => { const d = new Date(form.datum_nakupu + "T00:00:00"); d.setFullYear(d.getFullYear() + r); setForm({ ...form, zaruka_do: d.toLocaleDateString("sv-SE") }); }}>+{r} let</button>
              ))}</div>}</div>
          </div>
          <div>
            <label style={lbl} htmlFor="sn-dok">Dokumenty (záruční list, datasheet, certifikát…)</label>
            <input id="sn-dok" type="file" multiple accept=".pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => setForm({ ...form, soubory: [...e.target.files] })} />
            {form.soubory.length > 0 && <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>{form.soubory.length} {form.soubory.length === 1 ? "soubor" : form.soubory.length < 5 ? "soubory" : "souborů"} se nahraje{form.id ? "" : " ke všem zadaným SN"}</div>}
          </div>
          <div><label style={lbl} htmlFor="sn-pozn">Poznámka</label><input id="sn-pozn" style={pole} value={form.poznamka} placeholder="např. umístění, string 1…" onChange={(e) => setForm({ ...form, poznamka: e.target.value })} /></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={tl("#0369a1")} disabled={pracuji} onClick={ulozit}>{pracuji ? "Ukládám…" : form.id ? "Uložit" : (() => { const n = String(form.sn || "").split(/[\n,;]+/).filter((x) => x.trim()).length; return n > 1 ? `Uložit ${n} SN` : "Uložit"; })()}</button>
            <button type="button" style={tl("#fff", "#334155")} onClick={() => setForm(null)}>Zrušit</button>
          </div>
        </div>
      )}

      {zaznamy.length === 0 && !form && <div style={{ fontSize: 13, color: "#64748b" }}>Zatím žádná výrobní čísla. Zapiš SN střídače, baterie, panelů… a přiřaď fakturu, na které se kupovaly — při reklamaci pak máš všechno pohromadě.</div>}
      {zaznamy.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
            <thead><tr style={{ color: "#64748b", fontSize: 11, textAlign: "left", textTransform: "uppercase" }}>
              <th style={{ padding: "5px 6px" }}>SN</th><th style={{ padding: "5px 6px" }}>Produkt</th><th style={{ padding: "5px 6px" }}>Faktura</th><th style={{ padding: "5px 6px" }}>Záruka</th><th style={{ padding: "5px 6px" }}>Dokumenty</th><th />
            </tr></thead>
            <tbody>
              {zaznamy.map((z) => {
                const poZaruce = z.zaruka_do && z.zaruka_do < dnes;
                return (
                  <tr key={z.id} style={{ borderTop: "1px solid #f1f5f9", verticalAlign: "top" }}>
                    <td style={{ padding: "6px", fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>{z.sn}
                      <div style={{ fontFamily: "inherit", fontWeight: 400, fontSize: 11, color: "#64748b" }}>{nazevDruhu(z.druh)}</div></td>
                    <td style={{ padding: "6px" }}>{z.nazev || "—"}{z.poznamka && <div style={{ fontSize: 11, color: "#64748b" }}>{z.poznamka}</div>}</td>
                    <td style={{ padding: "6px" }}>
                      {z.dodavatel || z.faktura_cislo ? <>{z.dodavatel}{z.faktura_cislo ? ` · ${z.faktura_cislo}` : ""}</> : <span style={{ color: "#b45309" }}>bez faktury</span>}
                      {z.datum_nakupu && <div style={{ fontSize: 11, color: "#64748b" }}>koupeno {fmtDatum(z.datum_nakupu)}</div>}
                      {z.invoice_queue_id && <button type="button" style={{ background: "none", border: "none", color: "#0369a1", padding: 0, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }} onClick={() => otevritFakturu(z.invoice_queue_id)}>📄 faktura</button>}
                    </td>
                    <td style={{ padding: "6px", whiteSpace: "nowrap", color: poZaruce ? "#b91c1c" : z.zaruka_do ? "#15803d" : "#94a3b8", fontWeight: z.zaruka_do ? 700 : 400 }}>{z.zaruka_do ? `${poZaruce ? "skončila" : "do"} ${fmtDatum(z.zaruka_do)}` : "—"}</td>
                    <td style={{ padding: "6px" }}>
                      {(z.dokumenty || []).length ? (z.dokumenty || []).map((d) => (
                        <button key={d.cesta} type="button" title={d.nazev} onClick={() => otevritSoubor(BUCKET, d.cesta)}
                          style={{ display: "block", background: "none", border: "none", color: "#0369a1", padding: 0, fontSize: 12, cursor: "pointer", fontFamily: "inherit", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>📎 {d.nazev}</button>
                      )) : <span style={{ color: "#94a3b8" }}>—</span>}
                    </td>
                    <td style={{ padding: "6px", whiteSpace: "nowrap" }}>
                      <button type="button" aria-label={`Upravit ${z.sn}`} style={{ ...tl("#fff", "#334155"), padding: "3px 8px" }} onClick={() => otevritFormular(z)}>✏️</button>{" "}
                      <button type="button" aria-label={`Smazat ${z.sn}`} style={{ ...tl("#fff", "#b91c1c"), padding: "3px 8px" }} onClick={() => smazat(z)}>🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
