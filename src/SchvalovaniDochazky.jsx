// ─── Ke schválení: denní zápisy zaměstnanců (vedení) ────────────────────────
// Dny s neschválenými bloky / materiálem po zaměstnancích. U dne časová osa,
// úprava časů, zakázky, popisu; spárování materiálu se skladovou položkou,
// množství, zdroj (sklad / auto). „Schválit den“ (funkce schvalit_den v DB)
// teprve zapíše náklady práce, výdej materiálu z místa a náklad materiálu.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { blokyDne, dnyKeSchvaleni, hodinyBloku, hodinyDne, hhmm, fmtH, bezDiakritiky } from "./denniZapis.js";

const BARVY = ["#0369a1", "#15803d", "#7c3aed", "#be185d", "#0f766e", "#b45309", "#1d4ed8", "#9f1239"];
const barvaZakazky = (id) => (id ? BARVY[Number(id) % BARVY.length] : "#f59e0b");
const pole = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "7px 9px", fontSize: 14, fontFamily: "inherit", color: "#0f172a", background: "#fff", boxSizing: "border-box" };
const tl = (bg, fg = "#fff", extra = {}) => ({ background: bg, color: fg, border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", ...extra });
const tlObrys = (barva = "#475569", extra = {}) => ({ background: "#fff", color: barva, border: `1px solid ${barva === "#475569" ? "#cbd5e1" : barva}`, borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", ...extra });
const datumCz = (d) => new Date(d + "T00:00:00").toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", year: "numeric" });
const cislo = (v) => { const t = String(v ?? "").replace(/\s/g, "").replace(",", "."); return t === "" ? null : Number(t); };
const OSA_OD = 5, OSA_DO = 21; // časová osa 5:00–21:00
const predDny = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

export default function SchvalovaniDochazky({ attendance, setAttendance, employees, zakazky, products, setProducts, mista }) {
  const [materialy, setMaterialy] = useState([]);   // neschválené + materiál otevřeného dne
  const [otevreny, setOtevreny] = useState(null);   // klíč "empId|datum"
  const [filtrZam, setFiltrZam] = useState("");
  const [zprava, setZprava] = useState(null);
  const [pracuji, setPracuji] = useState(false);
  const [schvalene, setSchvalene] = useState(false);
  const hlavni = mista.find((m) => m.hlavni);

  const nacistMaterial = async () => {
    const { data } = await supabase.from("attendance_materials").select("*").eq("schvaleno", false).order("created_at");
    setMaterialy((m) => {
      const ostatni = m.filter((x) => x.schvaleno);
      return [...ostatni, ...(data || [])];
    });
  };
  useEffect(() => { Promise.resolve().then(nacistMaterial); }, []);

  const nacistDen = async (empId, datum) => {
    const [{ data: zaz }, { data: mat }] = await Promise.all([
      supabase.from("attendance").select("*").eq("employee_id", empId).eq("date", datum),
      supabase.from("attendance_materials").select("*").eq("employee_id", empId).eq("date", datum).order("created_at"),
    ]);
    setAttendance((prev) => [...prev.filter((a) => !(String(a.employee_id ?? a.employeeId) === String(empId) && a.date === datum)),
      ...(zaz || []).map((a) => ({ ...a, checkin: hhmm(a.checkin) + ":00", checkout: a.checkout ? hhmm(a.checkout) + ":00" : null, employeeId: a.employee_id }))]);
    setMaterialy((m) => [...m.filter((x) => !(String(x.employee_id) === String(empId) && x.date === datum)), ...(mat || [])]);
  };

  const dny = useMemo(() => {
    if (!schvalene) return dnyKeSchvaleni(attendance, materialy);
    const hranice = predDny(14);
    const klice = new Map();
    for (const a of attendance) if (a.schvaleno && a.date >= hranice && a.schvalil !== "převod starých záznamů") klice.set(`${a.employee_id ?? a.employeeId}|${a.date}`, { employee_id: a.employee_id ?? a.employeeId, date: a.date });
    return [...klice.values()].map((d) => ({ ...d, bloky: blokyDne(attendance, d.employee_id, d.date) })).sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, materialy, schvalene]);
  const zobrazene = dny.filter((d) => !filtrZam || String(d.employee_id) === filtrZam);
  const jmeno = (id) => employees.find((e) => String(e.id) === String(id))?.name || `#${id}`;
  const nazevZakazky = (id) => zakazky.find((z) => String(z.id) === String(id))?.label || (id ? `zakázka #${id}` : null);

  // ── úpravy ──
  const upravitBlok = async (b, patch) => {
    const { error } = await supabase.from("attendance").update(patch).eq("id", b.id);
    if (error) { setZprava({ chyba: true, text: "Uložení se nepovedlo: " + error.message }); return; }
    setAttendance((prev) => prev.map((a) => (a.id === b.id ? { ...a, ...patch } : a)));
  };
  const pridatBlok = async (d) => {
    const posl = d.bloky[d.bloky.length - 1];
    const od = posl?.checkout ? hhmm(posl.checkout) : "07:00";
    const { data, error } = await supabase.from("attendance").insert({ employee_id: d.employee_id, date: d.date, checkin: od, checkout: od }).select().single();
    if (error) { setZprava({ chyba: true, text: "Blok se nepodařilo přidat: " + error.message }); return; }
    setAttendance((prev) => [...prev, { ...data, employeeId: data.employee_id }]);
  };
  const smazatBlok = async (b) => {
    const { error } = await supabase.from("attendance").delete().eq("id", b.id);
    if (error) { setZprava({ chyba: true, text: "Blok se nepodařilo smazat: " + error.message }); return; }
    setAttendance((prev) => prev.filter((a) => a.id !== b.id));
    setMaterialy((m) => m.filter((x) => x.attendance_id !== b.id));
  };
  const upravitMaterial = async (m, patch) => {
    const { error } = await supabase.from("attendance_materials").update(patch).eq("id", m.id);
    if (error) { setZprava({ chyba: true, text: "Materiál se nepodařilo uložit: " + error.message }); return; }
    setMaterialy((x) => x.map((y) => (y.id === m.id ? { ...y, ...patch } : y)));
  };
  const smazatMaterial = async (m) => {
    const { error } = await supabase.from("attendance_materials").delete().eq("id", m.id);
    if (error) { setZprava({ chyba: true, text: "Materiál se nepodařilo smazat: " + error.message }); return; }
    setMaterialy((x) => x.filter((y) => y.id !== m.id));
  };
  const zalozitPolozku = async (m) => {
    const { data, error } = await supabase.from("products").insert({ name: m.item_name.trim(), unit: m.unit || "ks", price: 0, price_sell: 0, stock: 0, min_stock: 0, category: "" }).select().single();
    if (error) { setZprava({ chyba: true, text: "Položku se nepodařilo založit: " + error.message }); return; }
    setProducts?.((p) => [...p, { ...data, minStock: data.min_stock }]);
    await upravitMaterial(m, { product_id: data.id });
    setZprava({ chyba: false, text: `✓ Položka „${data.name}“ založena ve skladu (bez ceny — doplň nákupní cenu ve Skladu).` });
  };

  const schvalit = async (d) => {
    setPracuji(true); setZprava(null);
    const { data, error } = await supabase.rpc("schvalit_den", { p_employee_id: d.employee_id, p_date: d.date });
    setPracuji(false);
    if (error) { setZprava({ chyba: true, text: error.message }); return; }
    await nacistDen(d.employee_id, d.date);
    setOtevreny(null);
    setZprava({ chyba: false, text: `✓ Schváleno: ${jmeno(d.employee_id)}, ${datumCz(d.date)} — ${fmtH(data?.hodin)}${data?.materialu ? `, materiál ${data.materialu} ${data.materialu === 1 ? "řádek" : data.materialu < 5 ? "řádky" : "řádků"}` : ""}. Náklady a výdej ze skladu zapsány.` });
  };
  const zrusit = async (d) => {
    setPracuji(true); setZprava(null);
    const { error } = await supabase.rpc("zrusit_schvaleni_dne", { p_employee_id: d.employee_id, p_date: d.date });
    setPracuji(false);
    if (error) { setZprava({ chyba: true, text: error.message }); return; }
    await nacistDen(d.employee_id, d.date);
    setZprava({ chyba: false, text: `Schválení zrušeno — den je zpět ke schválení, materiál vrácen na místo.` });
  };

  const zamestnanciVeFronte = [...new Set(dny.map((d) => String(d.employee_id)))];

  return (
    <div style={{ textAlign: "left" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <select style={pole} value={filtrZam} onChange={(e) => setFiltrZam(e.target.value)} aria-label="Zaměstnanec">
          <option value="">Všichni zaměstnanci ({dny.length} {dny.length === 1 ? "den" : dny.length < 5 ? "dny" : "dnů"})</option>
          {zamestnanciVeFronte.map((id) => <option key={id} value={id}>{jmeno(id)} ({dny.filter((d) => String(d.employee_id) === id).length})</option>)}
        </select>
        <label style={{ fontSize: 13, color: "#334155", display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={schvalene} onChange={(e) => { setSchvalene(e.target.checked); setOtevreny(null); }} /> Schválené (posledních 14 dní)
        </label>
      </div>
      {zprava && <div role={zprava.chyba ? "alert" : "status"} style={{ borderRadius: 10, padding: "9px 12px", marginBottom: 12, fontSize: 14, background: zprava.chyba ? "#fef2f2" : "#f0fdf4", color: zprava.chyba ? "#991b1b" : "#166534", border: `1px solid ${zprava.chyba ? "#fecaca" : "#bbf7d0"}` }}>{zprava.text}</div>}
      {!zobrazene.length && <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, textAlign: "center", color: "#64748b" }}>{schvalene ? "Za posledních 14 dní nic schváleno." : "✓ Nic nečeká na schválení."}</div>}

      {zobrazene.map((d) => {
        const klic = `${d.employee_id}|${d.date}`;
        const otevren = otevreny === klic;
        const { hrube, pauza, efektivni } = hodinyDne(d.bloky);
        const mat = materialy.filter((m) => String(m.employee_id) === String(d.employee_id) && m.date === d.date);
        const bezZakazky = d.bloky.filter((b) => !b.contract_id).length;
        const nesparovano = mat.filter((m) => !m.schvaleno && !m.product_id).length;
        const bezi = d.bloky.some((b) => !b.checkout);
        const jeSchvaleny = d.bloky.length > 0 && d.bloky.every((b) => b.schvaleno) && mat.every((m) => m.schvaleno);
        return (
          <div key={klic} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, marginBottom: 10, overflow: "hidden" }}>
            <button type="button" onClick={() => { setOtevreny(otevren ? null : klic); if (!otevren) nacistDen(d.employee_id, d.date); }}
              style={{ display: "flex", width: "100%", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", background: otevren ? "#f8fafc" : "#fff", border: "none", padding: "12px 14px", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <span>
                <b style={{ fontSize: 15 }}>{jmeno(d.employee_id)}</b> <span style={{ color: "#475569", fontSize: 14 }}>· {datumCz(d.date)}</span>
                <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>
                  {d.bloky.length} {d.bloky.length === 1 ? "blok" : "bloky"} · {fmtH(efektivni)}
                  {bezi && <span style={{ color: "#b91c1c", fontWeight: 700 }}> · chybí odchod</span>}
                  {bezZakazky > 0 && <span style={{ color: "#b45309", fontWeight: 700 }}> · {bezZakazky} bez zakázky</span>}
                  {mat.length > 0 && ` · materiál ${mat.length}`}
                  {nesparovano > 0 && <span style={{ color: "#b45309", fontWeight: 700 }}> ({nesparovano} nespárováno)</span>}
                  {jeSchvaleny && <span style={{ color: "#15803d", fontWeight: 700 }}> · ✓ schváleno {d.bloky[0]?.schvalil ? `(${d.bloky[0].schvalil})` : ""}</span>}
                </span>
              </span>
              {/* mini časová osa */}
              <span style={{ position: "relative", flex: "1 1 220px", maxWidth: 360, height: 14, background: "#f1f5f9", borderRadius: 7, overflow: "hidden" }} aria-hidden="true">
                {d.bloky.map((b) => {
                  const a = (Number(hhmm(b.checkin).slice(0, 2)) + Number(hhmm(b.checkin).slice(3, 5)) / 60 - OSA_OD) / (OSA_DO - OSA_OD);
                  const kon = b.checkout ? (Number(hhmm(b.checkout).slice(0, 2)) + Number(hhmm(b.checkout).slice(3, 5)) / 60 - OSA_OD) / (OSA_DO - OSA_OD) : a + 0.02;
                  return <span key={b.id} style={{ position: "absolute", top: 0, bottom: 0, left: `${Math.max(0, a) * 100}%`, width: `${Math.max(1, (kon - a) * 100)}%`, background: barvaZakazky(b.contract_id), opacity: b.checkout ? 1 : 0.5 }} />;
                })}
              </span>
              <span style={{ fontSize: 13, color: "#0369a1", fontWeight: 700 }}>{otevren ? "▲" : "▼"}</span>
            </button>

            {otevren && (
              <div style={{ padding: "6px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, color: "#64748b" }}>Časová osa {OSA_OD}:00–{OSA_DO}:00 · barva = zakázka, <span style={{ color: "#b45309", fontWeight: 700 }}>oranžová = bez zakázky</span>. Hrubě {fmtH(hrube)}{pauza ? ` − pauza 1 h = ${fmtH(efektivni)}` : " (bez pauzy, den do 6 h)"}.</div>

                {/* bloky */}
                {d.bloky.map((b, i) => (
                  <div key={b.id} style={{ border: "1px solid #e2e8f0", borderLeft: `6px solid ${barvaZakazky(b.contract_id)}`, borderRadius: 10, padding: 10, display: "grid", gridTemplateColumns: "auto auto 1fr auto", gap: 8, alignItems: "center" }}>
                    <input type="time" style={pole} value={hhmm(b.checkin)} disabled={b.schvaleno} aria-label={`Od — blok ${i + 1}`} onChange={(e) => upravitBlok(b, { checkin: e.target.value })} />
                    <input type="time" style={{ ...pole, borderColor: b.checkout ? "#cbd5e1" : "#f87171" }} value={hhmm(b.checkout)} disabled={b.schvaleno} aria-label={`Do — blok ${i + 1}`} onChange={(e) => upravitBlok(b, { checkout: e.target.value || null })} />
                    <select style={{ ...pole, width: "100%", borderColor: b.contract_id ? "#cbd5e1" : "#fbbf24" }} value={b.contract_id || ""} disabled={b.schvaleno} aria-label={`Zakázka — blok ${i + 1}`}
                      onChange={(e) => upravitBlok(b, { contract_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">— bez zakázky (režie) —</option>
                      {zakazky.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
                      {b.contract_id && !zakazky.some((z) => String(z.id) === String(b.contract_id)) && <option value={b.contract_id}>{nazevZakazky(b.contract_id)}</option>}
                    </select>
                    <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>
                      {fmtH(hrube > 0 ? hodinyBloku(b.checkin, b.checkout) * (hrube - pauza) / hrube : 0)}
                      {!b.schvaleno && <button type="button" aria-label={`Smazat blok ${i + 1}`} style={{ ...tlObrys("#b91c1c", { marginLeft: 6, padding: "3px 8px" }) }} onClick={() => smazatBlok(b)}>✕</button>}
                    </span>
                    <textarea style={{ ...pole, gridColumn: "1 / -1", minHeight: 44, width: "100%" }} defaultValue={b.popis_prace || ""} disabled={b.schvaleno} placeholder="Co se dělalo…"
                      aria-label={`Popis práce — blok ${i + 1}`} onBlur={(e) => { if ((e.target.value || "") !== (b.popis_prace || "")) upravitBlok(b, { popis_prace: e.target.value.trim() || null }); }} />
                  </div>
                ))}
                {!jeSchvaleny && <button type="button" style={tlObrys("#0369a1", { alignSelf: "flex-start" })} onClick={() => pridatBlok(d)}>+ Přidat blok</button>}

                {/* materiál */}
                {mat.length > 0 && (
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, overflowX: "auto" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>🧰 Materiál</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
                      <thead><tr style={{ color: "#64748b", fontSize: 11, textAlign: "left" }}>
                        <th style={{ padding: 4 }}>Zapsal(a)</th><th style={{ padding: 4 }}>Skladová položka</th><th style={{ padding: 4 }}>Množství</th><th style={{ padding: 4 }}>Zdroj</th><th style={{ padding: 4 }}>Zakázka</th><th />
                      </tr></thead>
                      <tbody>
                        {mat.map((m) => {
                          const blok = d.bloky.find((b) => b.id === m.attendance_id);
                          const kandidati = products.filter((p) => bezDiakritiky(p.name).includes(bezDiakritiky(m.item_name).split(" ")[0] || ""));
                          return (
                            <tr key={m.id} style={{ borderTop: "1px solid #f1f5f9", verticalAlign: "top" }}>
                              <td style={{ padding: 4 }}>{m.item_name}</td>
                              <td style={{ padding: 4 }}>
                                <select style={{ ...pole, width: 220, borderColor: m.product_id ? "#cbd5e1" : "#fbbf24" }} value={m.product_id || ""} disabled={m.schvaleno} aria-label="Skladová položka"
                                  onChange={(e) => (e.target.value === "__nova" ? zalozitPolozku(m) : upravitMaterial(m, { product_id: e.target.value ? Number(e.target.value) : null }))}>
                                  <option value="">— spáruj —</option>
                                  {kandidati.length > 0 && <optgroup label="Podobné">{kandidati.map((p) => <option key={`k${p.id}`} value={p.id}>{p.name}</option>)}</optgroup>}
                                  <optgroup label="Všechny položky">{[...products].sort((a, b) => String(a.name).localeCompare(String(b.name), "cs")).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                                  <option value="__nova">➕ Založit novou položku „{m.item_name}“</option>
                                </select>
                              </td>
                              <td style={{ padding: 4, whiteSpace: "nowrap" }}>
                                <input style={{ ...pole, width: 72 }} inputMode="decimal" defaultValue={String(m.quantity).replace(".", ",")} disabled={m.schvaleno} aria-label="Množství"
                                  onBlur={(e) => { const q = cislo(e.target.value); if (q && q > 0 && q !== Number(m.quantity)) upravitMaterial(m, { quantity: q }); }} /> {m.unit}
                              </td>
                              <td style={{ padding: 4 }}>
                                <select style={pole} value={m.zdroj_misto_id || hlavni?.id || ""} disabled={m.schvaleno} aria-label="Zdroj" onChange={(e) => upravitMaterial(m, { zdroj_misto_id: Number(e.target.value) })}>
                                  {mista.map((mi) => <option key={mi.id} value={mi.id}>{mi.typ === "auto" ? "🚚" : "📦"} {mi.nazev}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: 4 }}>
                                <select style={{ ...pole, width: 200 }} value={m.contract_id || ""} disabled={m.schvaleno} aria-label="Zakázka materiálu" onChange={(e) => upravitMaterial(m, { contract_id: e.target.value ? Number(e.target.value) : null })}>
                                  <option value="">{blok?.contract_id ? `podle bloku: ${nazevZakazky(blok.contract_id)}` : "— vyber —"}</option>
                                  {zakazky.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: 4 }}>{m.schvaleno ? <span style={{ color: "#15803d", fontWeight: 700 }}>✓</span> : <button type="button" aria-label="Smazat materiál" style={tlObrys("#b91c1c", { padding: "3px 8px" })} onClick={() => smazatMaterial(m)}>✕</button>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  {jeSchvaleny ? (
                    <button type="button" style={tlObrys("#b91c1c")} disabled={pracuji} onClick={() => zrusit(d)}>↩ Zrušit schválení</button>
                  ) : (
                    <button type="button" style={tl("#15803d", "#fff", { opacity: bezi || nesparovano ? 0.6 : 1 })} disabled={pracuji} onClick={() => schvalit(d)}
                      title={bezi ? "Nejdřív doplň čas odchodu" : nesparovano ? "Nejdřív spáruj materiál" : ""}>
                      {pracuji ? "Zapisuji…" : `✓ Schválit den${bezZakazky ? ` (${bezZakazky} blok${bezZakazky > 1 ? "y" : ""} jako režie)` : ""}`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
