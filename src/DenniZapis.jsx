// ─── Zápis práce dne (zaměstnanec, mobil) ───────────────────────────────────
// Příchod a odchod se zapisují normálně; den se pak (kdykoli, i další den,
// dokud není schválený) rozdělí MILNÍKY na části (řádky docházky). U každé
// části: zakázka (nemusí být — doplní kancelář), co se dělalo, materiál
// (řádky s našeptáváním ze skladu, zdroj sklad / auto). Do skladu ani nákladů
// se nic nezapisuje — to až po schválení dne vedením (Ke schválení).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { hhmm, hodinyBloku, hodinyDne, fmtH, bezDiakritiky } from "./denniZapis.js";

const JEDNOTKY = ["ks", "m", "kg", "bal", "kpl", "l", "hod"];
const ZDROJ_KEY = "proudos-zdroj-materialu";

const btn = (bg, fg = "#fff", extra = {}) => ({ background: bg, color: fg, border: "none", borderRadius: 14, padding: "14px 18px", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", minHeight: 52, ...extra });
const btnObrys = (barva = "#0369a1", extra = {}) => ({ background: "#fff", color: barva, border: `2px solid ${barva}`, borderRadius: 12, padding: "10px 14px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minHeight: 46, ...extra });
const pole = { width: "100%", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 10, padding: "12px", fontSize: 16, fontFamily: "inherit", color: "#0f172a", background: "#fff" };
const karta = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 14, textAlign: "left" };
const cislo = (v) => { const t = String(v ?? "").replace(/\s/g, "").replace(",", "."); return t === "" ? null : Number(t); };

const naMin = (t) => { const [h, m] = String(t || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const ted = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export default function DenniZapis({ bloky, zakazky, produkty, mista, zamestnanecId, datum, dnes, onRozdelit, onPosunMilnik, onSloucit, onZmenaBloku, zamceno = false }) {
  const [materialy, setMaterialy] = useState({}); // { [attendanceId]: [...] }
  const [milnik, setMilnik] = useState(null);     // nový milník: { cas }
  const [upravaMilniku, setUpravaMilniku] = useState(null); // { index, cas }
  const [pracuji, setPracuji] = useState(false);
  const [chyba, setChyba] = useState(null);
  const [novyRadek, setNovyRadek] = useState(null); // { blokId, nazev, product_id, mnozstvi, jednotka, zdroj }
  const [popisy, setPopisy] = useState({}); // rozpracované popisy { [blokId]: text }

  const hlavni = mista.find((m) => m.hlavni);
  const auta = mista.filter((m) => m.typ === "auto" && m.aktivni !== false);
  const vychoziZdroj = () => { try { const z = localStorage.getItem(ZDROJ_KEY); if (z && mista.some((m) => String(m.id) === z)) return z; } catch { /* bez úložiště */ } return hlavni ? String(hlavni.id) : ""; };
  const bezi = bloky.find((b) => b.checkin && !b.checkout);
  const { hrube, pauza, efektivni } = hodinyDne(bloky);
  const ids = bloky.map((b) => b.id).filter((id) => typeof id === "number").join(",");

  useEffect(() => {
    if (!ids) return undefined;
    let zruseno = false;
    supabase.from("attendance_materials").select("*").in("attendance_id", ids.split(",").map(Number)).order("created_at")
      .then(({ data }) => {
        if (zruseno) return;
        const podle = {};
        (data || []).forEach((m) => { (podle[m.attendance_id] = podle[m.attendance_id] || []).push(m); });
        setMaterialy(podle);
      });
    return () => { zruseno = true; };
  }, [ids]);

  const napoveda = useMemo(() => {
    const q = bezDiakritiky(novyRadek?.nazev);
    if (!q || novyRadek?.product_id) return [];
    const slova = q.split(/\s+/);
    return produkty.filter((p) => slova.every((s) => bezDiakritiky(`${p.name} ${p.sku || ""}`).includes(s))).slice(0, 6);
  }, [novyRadek, produkty]);

  // ── milníky (rozdělení dne) ──
  const konecBloku = (b) => (b.checkout ? hhmm(b.checkout) : (datum === dnes ? ted() : "23:59"));
  const navrhMilniku = () => {
    if (bezi && datum === dnes) return ted();
    const posl = bloky[bloky.length - 1];
    const a = naMin(posl.checkin), z = naMin(konecBloku(posl));
    const stred = Math.round((a + z) / 2 / 15) * 15;
    return `${String(Math.floor(stred / 60)).padStart(2, "0")}:${String(stred % 60).padStart(2, "0")}`;
  };
  const provest = async (fn) => { setPracuji(true); setChyba(null); try { await fn(); return true; } catch (e) { setChyba(e.message || String(e)); return false; } finally { setPracuji(false); } };
  const pridatMilnik = async () => {
    const m = naMin(milnik.cas);
    const blok = bloky.find((b) => naMin(b.checkin) < m && m < naMin(konecBloku(b)));
    if (!blok) { setChyba(`Čas ${milnik.cas} neleží uvnitř žádné části dne (${hhmm(bloky[0].checkin)}–${konecBloku(bloky[bloky.length - 1])}).`); return; }
    if (blok.schvaleno) { setChyba("Tahle část dne je už schválená."); return; }
    if (await provest(() => onRozdelit(blok, milnik.cas))) setMilnik(null);
  };
  const posunoutMilnik = async (i) => {
    const pred = bloky[i - 1], po = bloky[i];
    const m = naMin(upravaMilniku.cas);
    if (!(naMin(pred.checkin) < m && m < naMin(konecBloku(po)))) { setChyba(`Milník musí být mezi ${hhmm(pred.checkin)} a ${konecBloku(po)}.`); return; }
    if (await provest(() => onPosunMilnik(pred, po, upravaMilniku.cas))) setUpravaMilniku(null);
  };
  const smazatMilnik = (i) => provest(() => onSloucit(bloky[i - 1], bloky[i]));

  const ulozitPopis = async (blok) => {
    const text = popisy[blok.id];
    if (text == null || text === (blok.popis_prace || "")) return;
    try { await onZmenaBloku(blok.id, { popis_prace: text.trim() || null }); setPopisy((p) => { const x = { ...p }; delete x[blok.id]; return x; }); }
    catch (e) { setChyba("Popis se nepodařilo uložit: " + (e.message || e)); }
  };

  const pridatMaterial = async () => {
    const r = novyRadek;
    const q = cislo(r.mnozstvi);
    if (!String(r.nazev || "").trim()) { setChyba("Napiš název materiálu."); return; }
    if (q == null || Number.isNaN(q) || q <= 0) { setChyba("Zadej množství (např. 2 nebo 12,5)."); return; }
    const blok = bloky.find((b) => b.id === r.blokId);
    const radek = {
      attendance_id: r.blokId, employee_id: zamestnanecId, contract_id: blok?.contract_id || null, date: datum,
      item_name: r.nazev.trim(), product_id: r.product_id || null, quantity: q, unit: r.jednotka || "ks",
      zdroj_misto_id: r.zdroj ? Number(r.zdroj) : null,
    };
    setPracuji(true); setChyba(null);
    const { data, error } = await supabase.from("attendance_materials").insert(radek).select().single();
    setPracuji(false);
    if (error) { setChyba("Materiál se nepodařilo uložit: " + error.message); return; }
    try { localStorage.setItem(ZDROJ_KEY, String(r.zdroj || "")); } catch { /* bez úložiště */ }
    setMaterialy((m) => ({ ...m, [r.blokId]: [...(m[r.blokId] || []), data] }));
    setNovyRadek({ blokId: r.blokId, nazev: "", product_id: null, mnozstvi: "", jednotka: "ks", zdroj: r.zdroj });
  };

  const smazatMaterial = async (m) => {
    const { error } = await supabase.from("attendance_materials").delete().eq("id", m.id);
    if (error) { setChyba("Řádek se nepodařilo smazat: " + error.message); return; }
    setMaterialy((x) => ({ ...x, [m.attendance_id]: (x[m.attendance_id] || []).filter((y) => y.id !== m.id) }));
  };

  const mistoNazev = (id) => { const m = mista.find((x) => String(x.id) === String(id)); return m ? (m.typ === "auto" ? `🚚 ${m.nazev}` : `📦 ${m.nazev}`) : "📦 Sklad"; };

  if (!bloky.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>📋 Zápis práce{datum !== dnes ? ` — ${new Date(datum + "T00:00:00").toLocaleDateString("cs-CZ")}` : ""}</div>
        <div style={{ fontSize: 13, color: "#475569" }}>
          {bloky.length} {bloky.length === 1 ? "část" : bloky.length < 5 ? "části" : "částí"} · {fmtH(efektivni)}{pauza ? " (po pauze 1 h)" : ""}{bezi ? " · běží" : ""}
        </div>
      </div>

      {chyba && <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 12, padding: "10px 12px", fontSize: 14 }}>{chyba}</div>}

      {/* Bloky dne */}
      {bloky.map((b, i) => {
        const zamcenyBlok = zamceno || b.schvaleno;
        const mat = materialy[b.id] || [];
        const h = hodinyBloku(b.checkin, b.checkout);
        const hEf = hrube > 0 && h ? h * (hrube - pauza) / hrube : 0;
        return (
          <div key={b.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {i > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "0 6px" }}>
              <span style={{ flex: 1, height: 2, background: "#cbd5e1" }} />
              {upravaMilniku?.index === i ? (
                <>
                  <input type="time" style={{ ...pole, width: 130, padding: 8 }} value={upravaMilniku.cas} onChange={(e) => setUpravaMilniku({ index: i, cas: e.target.value })} aria-label="Čas milníku" />
                  <button type="button" style={btn("#0369a1", "#fff", { minHeight: 42, padding: "8px 14px", fontSize: 14 })} disabled={pracuji} onClick={() => posunoutMilnik(i)}>Uložit</button>
                  <button type="button" style={btnObrys("#475569", { minHeight: 42, padding: "6px 12px" })} onClick={() => setUpravaMilniku(null)}>✕</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#334155" }}>⏱ milník {hhmm(b.checkin)}</span>
                  {!zamceno && !b.schvaleno && !bloky[i - 1].schvaleno && (
                    <>
                      <button type="button" aria-label={`Upravit čas milníku ${hhmm(b.checkin)}`} style={btnObrys("#0369a1", { minHeight: 38, padding: "4px 10px", fontSize: 13 })} onClick={() => setUpravaMilniku({ index: i, cas: hhmm(b.checkin) })}>✎</button>
                      <button type="button" aria-label={`Smazat milník ${hhmm(b.checkin)} (spojit části)`} style={btnObrys("#b91c1c", { minHeight: 38, padding: "4px 10px", fontSize: 13 })} disabled={pracuji} onClick={() => smazatMilnik(i)}>✕</button>
                    </>
                  )}
                </>
              )}
              <span style={{ flex: 1, height: 2, background: "#cbd5e1" }} />
            </div>
          )}
          <div style={{ ...karta, borderLeft: `6px solid ${b.contract_id ? "#0369a1" : "#f59e0b"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>
                {i + 1}. {hhmm(b.checkin)} – {b.checkout ? hhmm(b.checkout) : <span style={{ color: "#f59e0b" }}>běží</span>}
                {b.checkout && <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}> · {fmtH(hEf)}</span>}
              </div>
              {b.schvaleno ? <span style={{ fontSize: 12, fontWeight: 800, color: "#15803d", background: "#dcfce7", borderRadius: 999, padding: "3px 10px" }}>✓ schváleno</span>
                : !b.contract_id && <span style={{ fontSize: 12, fontWeight: 800, color: "#b45309", background: "#fef3c7", borderRadius: 999, padding: "3px 10px" }}>bez zakázky</span>}
            </div>

            <select style={{ ...pole, marginTop: 8 }} value={b.contract_id || ""} disabled={zamcenyBlok} aria-label={`Zakázka bloku ${i + 1}`}
              onChange={(e) => onZmenaBloku(b.id, { contract_id: e.target.value ? Number(e.target.value) : null }).catch((er) => setChyba(er.message || String(er)))}>
              <option value="">— bez zakázky (doplní kancelář) —</option>
              {zakazky.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
              {b.contract_id && !zakazky.some((z) => String(z.id) === String(b.contract_id)) && <option value={b.contract_id}>zakázka #{b.contract_id}</option>}
            </select>

            <textarea style={{ ...pole, minHeight: 64, marginTop: 8 }} disabled={zamcenyBlok} aria-label={`Co se dělalo — blok ${i + 1}`}
              placeholder="Co se dělalo…" value={popisy[b.id] ?? b.popis_prace ?? ""}
              onChange={(e) => setPopisy((p) => ({ ...p, [b.id]: e.target.value }))} onBlur={() => ulozitPopis(b)} />

            {/* Materiál */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#334155", marginBottom: 4 }}>🧰 Materiál</div>
              {mat.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid #f1f5f9", fontSize: 15 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{m.item_name}</b> · {String(m.quantity).replace(".", ",")} {m.unit}
                    <span style={{ display: "block", fontSize: 12, color: m.product_id ? "#15803d" : "#b45309" }}>
                      {m.product_id ? "✓ ze skladu" : "volný text — spáruje kancelář"} · {mistoNazev(m.zdroj_misto_id)}{m.schvaleno ? " · schváleno" : ""}
                    </span>
                  </span>
                  {!m.schvaleno && !zamcenyBlok && <button type="button" aria-label={`Smazat ${m.item_name}`} onClick={() => smazatMaterial(m)} style={{ ...btnObrys("#b91c1c", { minHeight: 40, padding: "6px 12px" }) }}>✕</button>}
                </div>
              ))}
              {!zamcenyBlok && (novyRadek?.blokId === b.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6, background: "#f8fafc", borderRadius: 12, padding: 10 }}>
                  <div style={{ position: "relative" }}>
                    <input style={pole} autoFocus placeholder="Materiál (začni psát…)" value={novyRadek.nazev}
                      onChange={(e) => setNovyRadek({ ...novyRadek, nazev: e.target.value, product_id: null })} />
                    {novyRadek.product_id && <div style={{ fontSize: 12, color: "#15803d", marginTop: 3 }}>✓ spárováno se skladovou položkou</div>}
                    {napoveda.length > 0 && (
                      <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 50, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 12, boxShadow: "0 8px 20px rgba(0,0,0,.12)", overflow: "hidden" }}>
                        {napoveda.map((p) => (
                          <button key={p.id} type="button" onClick={() => setNovyRadek({ ...novyRadek, nazev: p.name, product_id: p.id, jednotka: p.unit || novyRadek.jednotka })}
                            style={{ display: "block", width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid #f1f5f9", background: "none", padding: "12px", fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                            {p.name} <span style={{ color: "#64748b", fontSize: 12 }}>{p.unit || ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input style={pole} inputMode="decimal" placeholder="Množství" value={novyRadek.mnozstvi} onChange={(e) => setNovyRadek({ ...novyRadek, mnozstvi: e.target.value })} />
                    <select style={pole} value={novyRadek.jednotka} onChange={(e) => setNovyRadek({ ...novyRadek, jednotka: e.target.value })} aria-label="Jednotka">
                      {[...new Set([novyRadek.jednotka, ...JEDNOTKY])].map((j) => <option key={j}>{j}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[hlavni, ...auta].filter(Boolean).map((mi) => {
                      const vyb = String(novyRadek.zdroj) === String(mi.id);
                      return <button key={mi.id} type="button" aria-pressed={vyb} onClick={() => setNovyRadek({ ...novyRadek, zdroj: String(mi.id) })}
                        style={{ ...btnObrys(vyb ? "#0369a1" : "#94a3b8", { background: vyb ? "#eff6ff" : "#fff", minHeight: 42, fontSize: 14 }) }}>
                        {mi.typ === "auto" ? "🚚" : "📦"} {mi.nazev}
                      </button>;
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" style={btnObrys("#475569", { flex: 1 })} onClick={() => setNovyRadek(null)}>Zrušit</button>
                    <button type="button" style={btn("#15803d", "#fff", { flex: 2 })} disabled={pracuji} onClick={pridatMaterial}>✓ Uložit řádek</button>
                  </div>
                </div>
              ) : (
                <button type="button" style={btnObrys("#15803d", { width: "100%", marginTop: 6 })}
                  onClick={() => { setChyba(null); setNovyRadek({ blokId: b.id, nazev: "", product_id: null, mnozstvi: "", jednotka: "ks", zdroj: vychoziZdroj() }); }}>
                  + Přidat řádek materiálu
                </button>
              ))}
            </div>
          </div>
          </div>
        );
      })}

      {/* Přidat milník = rozdělit den na části */}
      {!zamceno && bloky.some((b) => !b.schvaleno) && (
        milnik ? (
          <div style={{ ...karta, border: "2px solid #0369a1", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Kdy jsi přešel na jinou zakázku / práci?</div>
            <input type="time" style={pole} value={milnik.cas} onChange={(e) => setMilnik({ cas: e.target.value })} aria-label="Čas milníku" />
            <div style={{ fontSize: 13, color: "#64748b" }}>Část dne se v tomto čase rozdělí na dvě — u nové části pak vybereš zakázku, popis a materiál.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={btnObrys("#475569", { flex: 1 })} onClick={() => setMilnik(null)}>Zpět</button>
              <button type="button" style={btn("#0369a1", "#fff", { flex: 2 })} disabled={pracuji || !milnik.cas} onClick={pridatMilnik}>{pracuji ? "Ukládám…" : "＋ Přidat milník"}</button>
            </div>
          </div>
        ) : (
          <button type="button" style={btn("#0369a1", "#fff", { width: "100%", fontSize: 17, minHeight: 56 })} onClick={() => { setChyba(null); setMilnik({ cas: navrhMilniku() }); }}>
            ＋ Přidat milník (rozdělit den)
          </button>
        )
      )}
      {!zamceno && <div style={{ fontSize: 12, color: "#64748b" }}>Milníky a materiál můžeš doplnit i později (vyber den nahoře). Zápis zkontroluje a schválí kancelář — teprve potom se materiál odepíše ze skladu a náklady zapíšou k zakázce.</div>}
    </div>
  );
}
