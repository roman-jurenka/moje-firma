// ─── Kniha jízd → Jízdy z GPS (vedení) ───────────────────────────────────────
// Všechny jízdy služebních aut stažené z GPS Dozoru (gps-sync) po dnech:
// čas, odkud → kam, km, řidič, zakázka a schválení. Zakázka se navrhne podle
// adresy cíle (shoda s adresou zakázky), jde vybrat ručně. Přiřazení a
// schválení jsou v gps_jizdy_stav. Řidič auta se nastavuje nahoře u vozidla.
// Jízdu jde ručně upravit (km, jiný řidič, účel, soukromá) — úpravy jsou taky
// v gps_jizdy_stav, takže je další stažení z GPS nepřepíše. Zaškrtnutím víc
// jízd se jim najednou přiřadí zakázka nebo se schválí.
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { shodaAdresy, slova } from "./gpsKontrola.js";
import VyberZakazky from "./VyberZakazky.jsx";
import { zakazkaVeVyberu } from "./zakazkyVyber.js";

// Přísnější shoda pro návrh zakázky: když mají obě adresy číslo domu, musí sedět;
// adresa zakázky bez čísla (jen obec) musí být v adrese cíle celá a přesně
// (jinak by se pletly podobné obce — Postřelmov × Postřelmůvek).
function shodaJizdy(gps, adresaZakazky) {
  const sz = slova(adresaZakazky), sg = slova(gps);
  const cz = sz.filter((w) => /\d/.test(w)), cg = sg.filter((w) => /\d/.test(w));
  if (cz.length && cg.length && !cz.some((c) => cg.includes(c))) {
    // GPS často vrátí číslo vedlejší budovy (Kuželova 895 × 896) — sousední
    // číslo projde, jen když sedí ulice i obec
    const cisloDomu = (w) => parseInt(String(w).split("/")[0], 10);
    const blizko = (a, b) => { const x = cisloDomu(a), y = cisloDomu(b); return x > 0 && y > 0 && Math.abs(x - y) <= 4; };
    if (!cz.some((c) => cg.some((g) => blizko(c, g)))) return 0;
    const ostatni = sz.filter((w) => !/\d/.test(w));
    return ostatni.length >= 2 && ostatni.every((w) => sg.includes(w)) ? 0.75 : 0;
  }
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
  const [vybrane, setVybrane] = useState(() => new Set()); // klíče zaškrtnutých jízd
  const [uprava, setUprava] = useState(null); // { k, ridic, km, poznamka, soukroma }
  const [hromadne, setHromadne] = useState({}); // datum → contract_id pro zaškrtnuté jízdy

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
    const puvodni = { ...(stavy[k] || {}) };
    delete puvodni.updated_at;
    const radek = { ...puvodni, vozidlo_kod: j.vozidlo_kod, datum: j.datum, zacatek: hm(j.zacatek), ...zmena, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from("gps_jizdy_stav").upsert(radek, { onConflict: "vozidlo_kod,datum,zacatek" }).select().single();
    if (error) { setChyba("Nepodařilo se uložit: " + error.message); return; }
    setStavy((s) => ({ ...s, [k]: data }));
    return true;
  };
  // km a řidič jízdy po ruční úpravě
  const kmJ = (j) => { const u = stavy[klic(j)]?.km_upraveno; return u != null ? Number(u) : Number(j.km) || 0; };
  const ridicJ = (j) => { const id = stavy[klic(j)]?.ridic_employee_id; return id ? (employees.find((e) => e.id === id)?.name || "—") : ridic(j.vozidlo_kod); };
  const otevritUpravu = (j) => {
    const st = stavy[klic(j)] || {};
    setUprava({ k: klic(j), ridic: st.ridic_employee_id ? String(st.ridic_employee_id) : "", km: st.km_upraveno != null ? String(st.km_upraveno).replace(".", ",") : "", poznamka: st.poznamka || "", soukroma: !!st.soukroma });
  };
  const ulozitUpravu = async (j) => {
    const kmText = String(uprava.km || "").replace(/\s/g, "").replace(",", ".");
    const kmCislo = kmText === "" ? null : Number(kmText);
    if (kmCislo != null && !(kmCislo >= 0)) { setChyba("Km musí být číslo (např. 16,5)."); return; }
    const ok = await ulozitStav(j, {
      km_upraveno: kmCislo != null && Math.abs(kmCislo - (Number(j.km) || 0)) > 0.04 ? kmCislo : null,
      ridic_employee_id: uprava.ridic ? Number(uprava.ridic) : null,
      poznamka: uprava.poznamka.trim() || null, soukroma: uprava.soukroma,
      ...(uprava.soukroma ? { contract_id: null } : {}),
      upravil: currentUser?.name || null,
    });
    if (ok) { setUprava(null); setChyba(""); }
  };
  const prepnoutVyber = (keys, zapnout) => setVybrane((v) => { const n = new Set(v); keys.forEach((k) => (zapnout ? n.add(k) : n.delete(k))); return n; });
  const hromadneUlozit = async (js, zmena) => { for (const j of js) await ulozitStav(j, zmena); };
  const schvalit = (j, ano = true) => ulozitStav(j, ano
    ? { schvaleno: true, schvalil: currentUser?.name || null, schvaleno_at: new Date().toISOString(), ...(stavy[klic(j)]?.contract_id == null && !stavy[klic(j)]?.soukroma && navrh(j) ? { contract_id: navrh(j).id } : {}) }
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
  const kmCelkem = vse.filter((j) => !stavy[klic(j)]?.soukroma).reduce((s, j) => s + kmJ(j), 0);
  const kmSoukrome = vse.filter((j) => stavy[klic(j)]?.soukroma).reduce((s, j) => s + kmJ(j), 0);
  const nabidkaZakazek = contracts.filter((c) => zakazkaVeVyberu(c));
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
          <b>{vse.length}</b> jízd · služebně <b>{km(kmCelkem)}</b>{kmSoukrome > 0 ? <> · soukromě {km(kmSoukrome)}</> : null} · schváleno <b>{schvaleno}/{vse.length}</b> · se zakázkou <b>{sZakazkou}/{vse.length}</b>
        </span>
      </div>
      {syncInfo && <div style={{ fontSize: 12, color: syncInfo.ok ? "#64748b" : "#b91c1c" }}>{syncInfo.ok ? "✓" : "⚠"} Poslední stažení z GPS Dozoru: {new Date(syncInfo.cas).toLocaleString("cs-CZ")}{syncInfo.ok ? "" : ` — chyba: ${syncInfo.chyba}`} · stahuje se samo 2× denně</div>}
      {chyba && <div role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{chyba}</div>}

      {jizdy === null ? <div style={{ color: "#64748b" }}>Načítám jízdy…</div> : !dny.length ? <div style={{ color: "#64748b" }}>V tomto měsíci nejsou žádné jízdy{jenCekajici ? " ke schválení" : ""}.</div> : dny.map(([datum, js]) => {
        const neschv = js.filter((j) => !stavy[klic(j)]?.schvaleno);
        const klice = js.map(klic);
        const vybraneDne = js.filter((j) => vybrane.has(klic(j)));
        const vseVybrane = vybraneDne.length === js.length;
        return (
          <div key={datum} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", flexWrap: "wrap" }}>
              <input type="checkbox" aria-label="Vybrat všechny jízdy dne" checked={vseVybrane} ref={(el) => { if (el) el.indeterminate = vybraneDne.length > 0 && !vseVybrane; }}
                onChange={(e) => prepnoutVyber(klice, e.target.checked)} style={{ width: 16, height: 16 }} />
              <b>{new Date(datum + "T00:00:00").toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" })}</b>
              <span style={{ fontSize: 12, color: "#64748b" }}>{js.length} jízd · {km(js.filter((j) => !stavy[klic(j)]?.soukroma).reduce((s, j) => s + kmJ(j), 0))}</span>
              {neschv.length > 0 && <button type="button" style={tlac("#15803d", "#fff", { marginLeft: "auto" })} onClick={async () => { for (const j of neschv) await schvalit(j); }}>✓ Schválit den ({neschv.length})</button>}
            </div>
            {vybraneDne.length > 0 && (
              <div role="toolbar" aria-label="Hromadná úprava vybraných jízd" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 12px", background: "#fff7ed", borderBottom: "1px solid #fed7aa" }}>
                <b style={{ fontSize: 13 }}>Vybráno {vybraneDne.length} {vybraneDne.length === 1 ? "jízda" : vybraneDne.length < 5 ? "jízdy" : "jízd"} · {km(vybraneDne.reduce((s, j) => s + kmJ(j), 0))}</b>
                <VyberZakazky contracts={nabidkaZakazek} customers={zakaznici} value={hromadne[datum] || ""} placeholder="Vyber zakázku pro vybrané…"
                  onChange={(cid) => setHromadne((h) => ({ ...h, [datum]: cid }))} style={{ width: 260 }} ariaLabel="Zakázka pro vybrané jízdy" />
                <button type="button" style={tlac("#F5821F", "#fff")} disabled={!hromadne[datum]}
                  onClick={async () => { await hromadneUlozit(vybraneDne, { contract_id: Number(hromadne[datum]), soukroma: false }); prepnoutVyber(klice, false); }}>Přiřadit k zakázce</button>
                <button type="button" style={tlac("#15803d", "#fff")} onClick={async () => { for (const j of vybraneDne) await schvalit(j); prepnoutVyber(klice, false); }}>✓ Schválit vybrané</button>
                <button type="button" style={tlac("#fff", "#334155")} onClick={async () => { await hromadneUlozit(vybraneDne, { contract_id: null }); prepnoutVyber(klice, false); }}>Odebrat zakázku</button>
                <button type="button" style={{ ...tlac("#fff", "#64748b"), marginLeft: "auto" }} onClick={() => prepnoutVyber(klice, false)}>Zrušit výběr</button>
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ fontSize: 11, color: "#64748b", textAlign: "left" }}>
                  <th style={{ ...td, width: 24 }}><span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Vybrat</span></th><th style={td}>Čas</th><th style={td}>Auto / řidič</th><th style={td}>Odkud → kam</th><th style={{ ...td, textAlign: "right" }}>Km</th><th style={td}>Zakázka</th><th style={td}>Stav</th>
                </tr></thead>
                <tbody>
                  {js.map((j) => {
                    const st = stavy[klic(j)];
                    const nvs = !st?.contract_id ? navrhSeShodou(j) : null;
                    const nv = nvs?.c || null;
                    const prirazena = st?.contract_id ? zakazka(st.contract_id) : null;
                    const k = klic(j);
                    const upravuji = uprava?.k === k;
                    return (
                      <Fragment key={k}>
                      <tr style={{ borderTop: "1px solid #f1f5f9", background: vybrane.has(k) ? "#fff7ed" : st?.schvaleno ? "#f0fdf4" : undefined }}>
                        <td style={td}><input type="checkbox" aria-label={`Vybrat jízdu ${hm(j.zacatek)}`} checked={vybrane.has(k)} onChange={(e) => prepnoutVyber([k], e.target.checked)} style={{ width: 16, height: 16 }} /></td>
                        <td style={{ ...td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}><b>{hm(j.zacatek)}–{hm(j.konec)}</b><div style={{ fontSize: 11, color: "#64748b" }}>{minut(j.doba_min)}{j.stani_min ? ` · stání ${minut(j.stani_min)}` : ""}</div></td>
                        <td style={td}>{nazevAuta(vozidlo(j.vozidlo_kod))}<div style={{ fontSize: 11, color: st?.ridic_employee_id ? "#c2410c" : "#64748b", fontWeight: st?.ridic_employee_id ? 700 : 400 }}>{ridicJ(j)}</div></td>
                        <td style={{ ...td, minWidth: 220 }}><span style={{ color: "#64748b" }}>{kratkaAdresa(j.z_adresa)}</span> → <b>{kratkaAdresa(j.do_adresa)}</b>
                          {(st?.poznamka || st?.soukroma) && <div style={{ fontSize: 11, marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {st?.soukroma && <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: 999, padding: "0 7px", fontWeight: 700 }}>soukromá</span>}
                            {st?.poznamka && <span style={{ color: "#475569" }}>📝 {st.poznamka}</span>}</div>}</td>
                        <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{st?.km_upraveno != null
                          ? <><b title={`Upraveno ručně${st.upravil ? ` (${st.upravil})` : ""}, z GPS ${km(j.km)}`}>{km(st.km_upraveno)}</b><div style={{ fontSize: 11, color: "#94a3b8", textDecoration: "line-through" }}>{km(j.km)}</div></>
                          : km(j.km)}</td>
                        <td style={{ ...td, minWidth: 220 }}>
                          <VyberZakazky contracts={nabidkaZakazek.some((c) => c.id === st?.contract_id) || !prirazena ? nabidkaZakazek : [prirazena, ...nabidkaZakazek]}
                            customers={zakaznici} value={st?.contract_id || ""} disabled={!!st?.soukroma} placeholder={st?.soukroma ? "soukromá jízda" : "— bez zakázky —"}
                            onChange={(cid) => ulozitStav(j, { contract_id: cid ? Number(cid) : null })} style={{ maxWidth: 260 }} ariaLabel="Zakázka jízdy" />
                          {nv && !st?.soukroma && <div style={{ fontSize: 11, marginTop: 3, position: "relative" }}>návrh: <button type="button" {...hoverProps(`n${klic(j)}`)} aria-describedby={infoKlic === `n${klic(j)}` ? `info-${klic(j)}` : undefined}
                            style={{ background: "none", border: "none", color: "#0369a1", fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "inherit", fontSize: 11, textDecoration: "underline dotted" }} onClick={() => ulozitStav(j, { contract_id: nv.id })}>{nv.code || nv.name} ✓</button>
                            {infoKlic === `n${klic(j)}` && <div id={`info-${klic(j)}`}>{infoZakazky(nv, j, nvs.s)}</div>}</div>}
                          {prirazena && <div style={{ fontSize: 11, color: "#15803d", position: "relative" }}>
                            <span tabIndex={0} {...hoverProps(`p${klic(j)}`)} style={{ cursor: "help", textDecoration: "underline dotted" }}>✓ přiřazeno{prirazena.code ? ` · ${prirazena.code}` : ""}</span>
                            {infoKlic === `p${klic(j)}` && infoZakazky(prirazena, j, prirazena.address ? shodaJizdy(j.do_adresa, prirazena.address) : null)}</div>}
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          <button type="button" aria-label="Upravit jízdu" title="Upravit jízdu (km, řidič, účel, soukromá)" aria-expanded={upravuji}
                            onClick={() => (upravuji ? setUprava(null) : otevritUpravu(j))}
                            style={{ ...tlac("#fff", "#334155"), padding: "5px 8px", marginRight: 6 }}>✏️</button>
                          {st?.schvaleno
                            ? <><span style={{ color: "#15803d", fontWeight: 800 }}>✓ schváleno</span><div style={{ fontSize: 11, color: "#64748b" }}>{st.schvalil || ""}</div>
                                <button type="button" style={{ background: "none", border: "none", color: "#64748b", fontSize: 11, cursor: "pointer", padding: 0, fontFamily: "inherit" }} onClick={() => schvalit(j, false)}>zrušit</button></>
                            : <button type="button" style={tlac("#fff", "#15803d")} onClick={() => schvalit(j)}>✓ Schválit</button>}
                        </td>
                      </tr>
                      {upravuji && (
                        <tr style={{ background: "#f8fafc" }}>
                          <td />
                          <td colSpan={6} style={{ ...td, paddingBottom: 12 }}>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                              <label style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>Řidič
                                <select style={pole} value={uprava.ridic} onChange={(e) => setUprava((u) => ({ ...u, ridic: e.target.value }))}>
                                  <option value="">{ridic(j.vozidlo_kod)} (řidič auta)</option>
                                  {employees.filter((e) => !e.archived).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select></label>
                              <label style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>Km (z GPS {km(j.km)})
                                <input style={{ ...pole, width: 100 }} inputMode="decimal" placeholder={String(Number(j.km) || 0).replace(".", ",")} value={uprava.km} onChange={(e) => setUprava((u) => ({ ...u, km: e.target.value }))} /></label>
                              <label style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 3, flex: "1 1 220px" }}>Účel / poznámka
                                <input style={pole} value={uprava.poznamka} placeholder="např. nákup materiálu, převoz lešení" onChange={(e) => setUprava((u) => ({ ...u, poznamka: e.target.value }))} /></label>
                              <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", paddingBottom: 6 }}>
                                <input type="checkbox" checked={uprava.soukroma} onChange={(e) => setUprava((u) => ({ ...u, soukroma: e.target.checked }))} /> Soukromá jízda</label>
                              <button type="button" style={tlac("#0E3B5E", "#fff")} onClick={() => ulozitUpravu(j)}>Uložit</button>
                              <button type="button" style={tlac("#fff", "#334155")} onClick={() => setUprava(null)}>Zrušit</button>
                            </div>
                            {st?.upravil && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Naposledy upravil {st.upravil}</div>}
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 12, color: "#64748b" }}>Zakázka se navrhne podle adresy cíle jízdy (shoda s adresou zakázky). Schválením jízdy bez vybrané zakázky se převezme návrh, pokud existuje. Víc jízd k jedné zakázce: zaškrtni je a nahoře u dne vyber zakázku. ✏️ upraví km, řidiče, účel nebo označí soukromou jízdu.</div>
    </div>
  );
}
