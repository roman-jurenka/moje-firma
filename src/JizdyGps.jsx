// ─── Kniha jízd → Jízdy z GPS (vedení) ───────────────────────────────────────
// Všechny jízdy služebních aut stažené z GPS Dozoru (gps-sync) po dnech:
// čas, odkud → kam, km, řidič, zakázka a schválení. Zakázka se navrhne podle
// adresy cíle (shoda s adresou zakázky), jde vybrat ručně. Přiřazení a
// schválení jsou v gps_jizdy_stav. Řidič auta se nastavuje nahoře u vozidla.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { shodaAdresy, slova } from "./gpsKontrola.js";

// Přísnější shoda pro návrh zakázky: když mají obě adresy číslo domu, musí sedět;
// adresa zakázky bez čísla (jen obec) musí být v adrese cíle celá a přesně
// (jinak by se pletly podobné obce — Postřelmov × Postřelmůvek).
function shodaJizdy(gps, adresaZakazky) {
  const sz = slova(adresaZakazky), sg = slova(gps);
  const cz = sz.filter((w) => /\d/.test(w)), cg = sg.filter((w) => /\d/.test(w));
  if (cz.length && cg.length && !cz.some((c) => cg.includes(c))) return 0;
  if (!cz.length && !sz.every((w) => sg.includes(w))) return 0;
  return shodaAdresy(gps, adresaZakazky);
}

const p2 = (n) => String(n).padStart(2, "0");
const hm = (t) => String(t || "").slice(0, 5);
const klic = (j) => `${j.vozidlo_kod}|${j.datum}|${hm(j.zacatek)}`;
const km = (v) => `${(Math.round((Number(v) || 0) * 10) / 10).toLocaleString("cs-CZ")} km`;
const minut = (m) => (m == null ? "" : m >= 60 ? `${Math.floor(m / 60)} h ${p2(m % 60)} min` : `${m} min`);
const kratkaAdresa = (a) => String(a || "").split(",").slice(0, 2).join(",").trim();

export default function JizdyGps({ currentUser, employees = [], contracts = [] }) {
  const dnes = new Date();
  const [mesic, setMesic] = useState(`${dnes.getFullYear()}-${p2(dnes.getMonth() + 1)}`);
  const [auto, setAuto] = useState("");
  const [jenCekajici, setJenCekajici] = useState(false);
  const [vozidla, setVozidla] = useState([]);
  const [jizdy, setJizdy] = useState(null);
  const [stavy, setStavy] = useState({}); // klíč → řádek gps_jizdy_stav
  const [syncInfo, setSyncInfo] = useState(null);
  const [chyba, setChyba] = useState("");

  useEffect(() => {
    let zruseno = false;
    const [r, m] = mesic.split("-").map(Number);
    const od = `${mesic}-01`, doo = `${mesic}-${p2(new Date(r, m, 0).getDate())}`;
    Promise.resolve().then(() => { if (!zruseno) setJizdy(null); });
    Promise.all([
      supabase.from("gps_vozidla").select("*").order("nazev"),
      supabase.from("gps_jizdy").select("*").gte("datum", od).lte("datum", doo).order("datum", { ascending: false }).order("zacatek"),
      supabase.from("gps_jizdy_stav").select("*").gte("datum", od).lte("datum", doo),
      supabase.from("app_settings").select("value").eq("key", "gps_sync_stav").maybeSingle(),
    ]).then(([v, j, s, info]) => {
      if (zruseno) return;
      const e = [v, j, s].find((x) => x.error)?.error;
      if (e) setChyba(e.message);
      setVozidla(v.data || []);
      setJizdy(j.data || []);
      setStavy(Object.fromEntries((s.data || []).map((x) => [klic(x), x])));
      setSyncInfo(info.data?.value || null);
    });
    return () => { zruseno = true; };
  }, [mesic]);

  const zakazkySAdresou = contracts.filter((c) => c.address);
  const navrhSeShodou = (j) => {
    let nej = null;
    for (const c of zakazkySAdresou) {
      const s = shodaJizdy(j.do_adresa, c.address);
      if (s >= 0.6 && (!nej || s > nej.s)) nej = { c, s };
    }
    return nej;
  };
  const navrh = (j) => navrhSeShodou(j)?.c || null;
  // našeptávač s podrobnostmi o zakázce (po najetí myší / fokusu)
  const [info, setInfo] = useState(null); // { k, x, y } — poloha na obrazovce (tabulka se posouvá, tooltip je fixed)
  const infoKlic = info?.k || null;
  const [zakaznici, setZakaznici] = useState([]);
  useEffect(() => {
    supabase.from("customers").select("id, name, company, phone").then(({ data }) => setZakaznici(data || []));
  }, []);
  const infoZakazky = (c, j, shoda) => {
    const zk = zakaznici.find((x) => x.id === c.customer_id);
    const radek = (l, v) => (v ? <div style={{ display: "flex", gap: 6 }}><span style={{ color: "#94a3b8", minWidth: 74 }}>{l}</span><span style={{ fontWeight: 600 }}>{v}</span></div> : null);
    return (
      <div role="tooltip" style={{ position: "fixed", zIndex: 1000, top: info?.y ?? 0, left: info?.x ?? 0, width: 300, background: "#0f172a", color: "#e2e8f0", borderRadius: 10, padding: "10px 12px", fontSize: 12, lineHeight: 1.45, boxShadow: "0 10px 30px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", gap: 3, textAlign: "left", whiteSpace: "normal" }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>{c.name}</div>
        {radek("Kód", [c.code, c.type].filter(Boolean).join(" · "))}
        {radek("Stav", c.status)}
        {radek("Zákazník", zk ? [zk.company || zk.name, zk.phone].filter(Boolean).join(" · ") : "")}
        {radek("Adresa", c.address)}
        {radek("Cíl jízdy", kratkaAdresa(j.do_adresa))}
        {Number(c.price) > 0 && radek("Cena", `${Math.round(Number(c.price)).toLocaleString("cs-CZ")} Kč`)}
        {shoda != null && <div style={{ marginTop: 3, color: shoda >= 0.8 ? "#86efac" : "#fcd34d" }}>Shoda adresy {Math.round(shoda * 100)} %{shoda >= 0.8 ? " — sedí číslo domu / obec" : " — zkontroluj"}</div>}
      </div>
    );
  };
  const ukazInfo = (k, el) => {
    const r = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left, window.innerWidth - 308));
    const y = r.bottom + 220 > window.innerHeight ? Math.max(8, r.top - 220) : r.bottom + 4;
    setInfo({ k, x, y });
  };
  const skryjInfo = (k) => setInfo((i) => (i?.k === k ? null : i));
  const hoverProps = (k) => ({ onMouseEnter: (e) => ukazInfo(k, e.currentTarget), onMouseLeave: () => skryjInfo(k), onFocus: (e) => ukazInfo(k, e.currentTarget), onBlur: () => skryjInfo(k) });
  const vozidlo = (kod) => vozidla.find((v) => v.kod === kod);
  const ridic = (kod) => employees.find((e) => String(e.id) === String(vozidlo(kod)?.ridic_employee_id))?.name || "—";
  const nazevAuta = (v) => String(v?.nazev || v?.kod || "").replace(/^\d+-/, "");
  const zakazka = (id) => contracts.find((c) => String(c.id) === String(id));

  const ulozitStav = async (j, zmena) => {
    const k = klic(j);
    const radek = { vozidlo_kod: j.vozidlo_kod, datum: j.datum, zacatek: hm(j.zacatek), ...(stavy[k] ? { contract_id: stavy[k].contract_id, schvaleno: stavy[k].schvaleno, schvalil: stavy[k].schvalil, schvaleno_at: stavy[k].schvaleno_at } : {}), ...zmena, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from("gps_jizdy_stav").upsert(radek, { onConflict: "vozidlo_kod,datum,zacatek" }).select().single();
    if (error) { setChyba("Nepodařilo se uložit: " + error.message); return; }
    setStavy((s) => ({ ...s, [k]: data }));
  };
  const schvalit = (j, ano = true) => ulozitStav(j, ano
    ? { schvaleno: true, schvalil: currentUser?.name || null, schvaleno_at: new Date().toISOString(), ...(stavy[klic(j)]?.contract_id == null && navrh(j) ? { contract_id: navrh(j).id } : {}) }
    : { schvaleno: false, schvalil: null, schvaleno_at: null });
  const zmenitRidice = async (kod, empId) => {
    const { error } = await supabase.from("gps_vozidla").update({ ridic_employee_id: empId ? Number(empId) : null }).eq("kod", kod);
    if (error) { setChyba("Řidiče se nepodařilo uložit: " + error.message); return; }
    setVozidla((vs) => vs.map((v) => (v.kod === kod ? { ...v, ridic_employee_id: empId ? Number(empId) : null } : v)));
  };

  const zobrazene = useMemo(() => (jizdy || [])
    .filter((j) => !auto || j.vozidlo_kod === auto)
    .filter((j) => !jenCekajici || !stavy[klic(j)]?.schvaleno), [jizdy, auto, jenCekajici, stavy]);
  const dny = useMemo(() => {
    const m = new Map();
    for (const j of zobrazene) { if (!m.has(j.datum)) m.set(j.datum, []); m.get(j.datum).push(j); }
    return [...m.entries()];
  }, [zobrazene]);

  const vse = (jizdy || []).filter((j) => !auto || j.vozidlo_kod === auto);
  const kmCelkem = vse.reduce((s, j) => s + (Number(j.km) || 0), 0);
  const schvaleno = vse.filter((j) => stavy[klic(j)]?.schvaleno).length;
  const sZakazkou = vse.filter((j) => stavy[klic(j)]?.contract_id).length;
  const mesice = Array.from({ length: 12 }, (_, i) => { const d = new Date(dnes.getFullYear(), dnes.getMonth() - i, 1); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; });

  const pole = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", background: "#fff" };
  const td = { padding: "7px 8px", fontSize: 13, verticalAlign: "top" };
  const tlac = (bg, fg, extra = {}) => ({ background: bg, color: fg, border: bg === "#fff" ? "1px solid #cbd5e1" : "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", ...extra });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "left" }}>
      {/* vozidla a řidiči */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {vozidla.map((v) => (
          <div key={v.kod} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div><div style={{ fontWeight: 800 }}>🚐 {nazevAuta(v)}</div><div style={{ fontSize: 12, color: "#64748b" }}>{v.spz || v.kod}</div></div>
            <label style={{ fontSize: 12, color: "#475569", display: "flex", alignItems: "center", gap: 6 }}>Řidič
              <select style={pole} value={v.ridic_employee_id || ""} onChange={(e) => zmenitRidice(v.kod, e.target.value)}>
                <option value="">— nikdo —</option>
                {employees.filter((e) => !e.archived).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
          </div>
        ))}
      </div>

      {/* filtry a souhrn */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select style={pole} value={mesic} onChange={(e) => setMesic(e.target.value)} aria-label="Měsíc">
          {mesice.map((m) => <option key={m} value={m}>{new Date(m + "-01T00:00:00").toLocaleDateString("cs-CZ", { month: "long", year: "numeric" })}</option>)}
        </select>
        <select style={pole} value={auto} onChange={(e) => setAuto(e.target.value)} aria-label="Auto">
          <option value="">Všechna auta</option>
          {vozidla.map((v) => <option key={v.kod} value={v.kod}>{nazevAuta(v)} · {v.spz}</option>)}
        </select>
        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={jenCekajici} onChange={(e) => setJenCekajici(e.target.checked)} /> Jen neschválené</label>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#334155" }}>
          <b>{vse.length}</b> jízd · <b>{km(kmCelkem)}</b> · schváleno <b>{schvaleno}/{vse.length}</b> · se zakázkou <b>{sZakazkou}/{vse.length}</b>
        </span>
      </div>
      {syncInfo && <div style={{ fontSize: 12, color: syncInfo.ok ? "#64748b" : "#b91c1c" }}>{syncInfo.ok ? "✓" : "⚠"} Poslední stažení z GPS Dozoru: {new Date(syncInfo.cas).toLocaleString("cs-CZ")}{syncInfo.ok ? "" : ` — chyba: ${syncInfo.chyba}`} · stahuje se samo 2× denně</div>}
      {chyba && <div role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{chyba}</div>}

      {jizdy === null ? <div style={{ color: "#64748b" }}>Načítám jízdy…</div> : !dny.length ? <div style={{ color: "#64748b" }}>V tomto měsíci nejsou žádné jízdy{jenCekajici ? " ke schválení" : ""}.</div> : dny.map(([datum, js]) => {
        const neschv = js.filter((j) => !stavy[klic(j)]?.schvaleno);
        return (
          <div key={datum} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap" }}>
              <b>{new Date(datum + "T00:00:00").toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" })}</b>
              <span style={{ fontSize: 12, color: "#64748b" }}>{js.length} jízd · {km(js.reduce((s, j) => s + (Number(j.km) || 0), 0))}</span>
              {neschv.length > 0 && <button type="button" style={tlac("#15803d", "#fff", { marginLeft: "auto" })} onClick={async () => { for (const j of neschv) await schvalit(j); }}>✓ Schválit den ({neschv.length})</button>}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ fontSize: 11, color: "#64748b", textAlign: "left" }}>
                  <th style={td}>Čas</th><th style={td}>Auto / řidič</th><th style={td}>Odkud → kam</th><th style={{ ...td, textAlign: "right" }}>Km</th><th style={td}>Zakázka</th><th style={td}>Stav</th>
                </tr></thead>
                <tbody>
                  {js.map((j) => {
                    const st = stavy[klic(j)];
                    const nvs = !st?.contract_id ? navrhSeShodou(j) : null;
                    const nv = nvs?.c || null;
                    const prirazena = st?.contract_id ? zakazka(st.contract_id) : null;
                    return (
                      <tr key={klic(j)} style={{ borderTop: "1px solid #f1f5f9", background: st?.schvaleno ? "#f0fdf4" : undefined }}>
                        <td style={{ ...td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}><b>{hm(j.zacatek)}–{hm(j.konec)}</b><div style={{ fontSize: 11, color: "#64748b" }}>{minut(j.doba_min)}{j.stani_min ? ` · stání ${minut(j.stani_min)}` : ""}</div></td>
                        <td style={td}>{nazevAuta(vozidlo(j.vozidlo_kod))}<div style={{ fontSize: 11, color: "#64748b" }}>{ridic(j.vozidlo_kod)}</div></td>
                        <td style={{ ...td, minWidth: 220 }}><span style={{ color: "#64748b" }}>{kratkaAdresa(j.z_adresa)}</span> → <b>{kratkaAdresa(j.do_adresa)}</b></td>
                        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{km(j.km)}</td>
                        <td style={{ ...td, minWidth: 200 }}>
                          <select style={{ ...pole, maxWidth: 240, borderColor: st?.contract_id ? "#86efac" : "#cbd5e1" }} value={st?.contract_id || ""} aria-label="Zakázka jízdy"
                            onChange={(e) => ulozitStav(j, { contract_id: e.target.value ? Number(e.target.value) : null })}>
                            <option value="">— bez zakázky —</option>
                            {contracts.map((c) => <option key={c.id} value={c.id}>{c.code ? `${c.code} · ` : ""}{c.name}</option>)}
                          </select>
                          {nv && <div style={{ fontSize: 11, marginTop: 3, position: "relative" }}>návrh: <button type="button" {...hoverProps(`n${klic(j)}`)} aria-describedby={infoKlic === `n${klic(j)}` ? `info-${klic(j)}` : undefined}
                            style={{ background: "none", border: "none", color: "#0369a1", fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 11, textDecoration: "underline dotted" }} onClick={() => ulozitStav(j, { contract_id: nv.id })}>{nv.code || nv.name} ✓</button>
                            {infoKlic === `n${klic(j)}` && <div id={`info-${klic(j)}`}>{infoZakazky(nv, j, nvs.s)}</div>}</div>}
                          {prirazena && <div style={{ fontSize: 11, color: "#15803d", position: "relative" }}>
                            <span tabIndex={0} {...hoverProps(`p${klic(j)}`)} style={{ cursor: "help", textDecoration: "underline dotted" }}>✓ přiřazeno{prirazena.code ? ` · ${prirazena.code}` : ""}</span>
                            {infoKlic === `p${klic(j)}` && infoZakazky(prirazena, j, prirazena.address ? shodaJizdy(j.do_adresa, prirazena.address) : null)}</div>}
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {st?.schvaleno
                            ? <><span style={{ color: "#15803d", fontWeight: 800 }}>✓ schváleno</span><div style={{ fontSize: 11, color: "#64748b" }}>{st.schvalil || ""}</div>
                                <button type="button" style={{ background: "none", border: "none", color: "#64748b", fontSize: 11, cursor: "pointer", padding: 0, fontFamily: "inherit" }} onClick={() => schvalit(j, false)}>zrušit</button></>
                            : <button type="button" style={tlac("#fff", "#15803d")} onClick={() => schvalit(j)}>✓ Schválit</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 12, color: "#64748b" }}>Zakázka se navrhne podle adresy cíle jízdy (shoda s adresou zakázky). Schválením jízdy bez vybrané zakázky se převezme návrh, pokud existuje.</div>
    </div>
  );
}
