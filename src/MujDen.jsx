// ─── Můj den (hlavní obrazovka zaměstnance) ──────────────────────────────────
// Nahoře datum a počasí dnes / zítra (Open-Meteo podle obce první zakázky),
// souhrn úkolů a karty dnešních zakázek z kalendáře. Karta ukazuje čas, typ,
// název, adresu, s kým tam jsem (💪 sám / jména kolegů → vizitka) a počítadlo
// úkolů. Klepnutím se rozbalí: Příchod na zakázku (když už jsem v práci jinde),
// dlaždice Jet · Fotka · Servis · Zákazník a záložky Info (úkoly aktuální fáze
// z Průběhu + podklady pro realizaci) a Kontakt. Dole přilepená lišta směny:
// Příchod → Odchod.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase.js";
import { fazeById, ukolyPro, ukolHotovy } from "./prubehFaze.js";
import UkolyFazi from "./UkolyFazi.jsx";
import { PodkladyNahled } from "./PodkladyZakazky.jsx";
import { nahratFotkuZakazky } from "./fotkyZakazky.js";
import { dovednost, naStarosti } from "./dovednosti.js";

const dnesIso = () => new Date().toLocaleDateString("sv-SE");
const hm = (t) => String(t || "").slice(0, 5);
const inicialy = (j) => String(j || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const POCASI = (k) => (k === 0 ? "☀️" : k <= 2 ? "🌤" : k === 3 ? "☁️" : k <= 48 ? "🌫" : k <= 67 ? "🌧" : k <= 77 ? "🌨" : k <= 82 ? "🌧" : k <= 86 ? "🌨" : "⛈");
const obecZAdresy = (a) => String(a || "").split(",").map((x) => x.replace(/\d{3}\s?\d{2}/g, "").replace(/\d+[/\d]*/g, "").trim()).filter(Boolean).pop() || "";

export default function MujDen({ currentUser, employees = [], attendance = [], setAttendance, todayRecord, onPrichod, setTab, tasks = [], onToggleTask, onOtevritPrubeh }) {
  const mojeId = currentUser?.employeeId;
  const [akce, setAkce] = useState(null);       // dnešní akce z kalendáře s načtenou zakázkou
  const [otevrena, setOtevrena] = useState(null);
  const [zalozka, setZalozka] = useState({});
  const [pocasi, setPocasi] = useState(null);
  const [vizitka, setVizitka] = useState(null);
  const [zprava, setZprava] = useState("");
  const [pracuji, setPracuji] = useState(false);
  const fotoInput = useRef(null);
  const fotoCil = useRef(null);
  const casovac = useRef(null);
  const ukazat = (t) => { setZprava(t); clearTimeout(casovac.current); casovac.current = setTimeout(() => setZprava(""), 2600); };

  // dnešní akce + zakázky + kolegové
  useEffect(() => {
    if (!mojeId) { Promise.resolve().then(() => setAkce([])); return undefined; }
    let zruseno = false;
    (async () => {
      const d = dnesIso();
      const { data: vse } = await supabase.from("calendar_events").select("*").eq("date", d).order("id");
      const moje = (vse || []).filter((e) => String(e.employee_id) === String(mojeId));
      const prubehIds = [...new Set(moje.map((e) => e.prubeh_id).filter(Boolean))];
      const contractIds = [...new Set(moje.map((e) => e.contract_id).filter(Boolean))];
      const [{ data: pr1 }, { data: pr2 }, { data: kon }] = await Promise.all([
        prubehIds.length ? supabase.from("zakazky_prubeh").select("*").in("id", prubehIds) : { data: [] },
        contractIds.length ? supabase.from("zakazky_prubeh").select("*").in("contract_id", contractIds) : { data: [] },
        contractIds.length ? supabase.from("contracts").select("id, code, name, address, customer_id").in("id", contractIds) : { data: [] },
      ]);
      const prubehy = [...(pr1 || []), ...(pr2 || []).filter((x) => !(pr1 || []).some((y) => y.id === x.id))];
      const quoteIds = [...new Set(prubehy.map((z) => z.quote_id).filter(Boolean))];
      const custIds = [...new Set([...prubehy.map((z) => z.customer_id), ...(kon || []).map((k) => k.customer_id)].filter(Boolean))];
      const [{ data: quotes }, { data: zakaznici }] = await Promise.all([
        quoteIds.length ? supabase.from("quotes").select("id, cislo, name, type, data").in("id", quoteIds) : { data: [] },
        custIds.length ? supabase.from("customers").select("id, name, company, phone, email, address").in("id", custIds) : { data: [] },
      ]);
      const vysledek = moje.map((e) => {
        const zak = prubehy.find((z) => (e.prubeh_id && z.id === e.prubeh_id) || (!e.prubeh_id && e.contract_id && z.contract_id === e.contract_id)) || null;
        const k = (kon || []).find((x) => x.id === (zak?.contract_id || e.contract_id)) || null;
        const zk = (zakaznici || []).find((c) => c.id === (zak?.customer_id || k?.customer_id)) || null;
        const kolegove = (vse || []).filter((x) => String(x.employee_id) !== String(mojeId)
          && ((e.prubeh_id && x.prubeh_id === e.prubeh_id) || (e.contract_id && x.contract_id === e.contract_id)))
          .map((x) => x.employee_id).filter((v, i, a) => a.indexOf(v) === i);
        return { e, zak, k, zk, quote: (quotes || []).find((q) => q.id === zak?.quote_id) || null, kolegove, kolegoveAkce: (vse || []).filter((x) => kolegove.includes(x.employee_id)) };
      });
      if (!zruseno) setAkce(vysledek);
    })();
    return () => { zruseno = true; };
  }, [mojeId]);

  // počasí dnes / zítra podle obce první zakázky (jinak Zábřeh)
  const obec = useMemo(() => {
    const a = akce?.[0];
    return obecZAdresy(a?.e?.address || a?.zak?.misto_adresa || a?.k?.address || "") || "Zábřeh";
  }, [akce]);
  useEffect(() => {
    if (!akce) return undefined;
    let zruseno = false;
    (async () => {
      try {
        const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(obec)}&count=1&language=cs&countryCode=CZ`).then((r) => r.json());
        const m = g?.results?.[0] || { latitude: 49.88, longitude: 16.87, name: "Zábřeh" };
        const f = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${m.latitude}&longitude=${m.longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&hourly=precipitation_probability&timezone=Europe%2FPrague&forecast_days=2`).then((r) => r.json());
        const dd = f?.daily;
        if (!dd || zruseno) return;
        const zitraHod = (f.hourly?.time || []).map((t, i) => [t, f.hourly.precipitation_probability[i]]).filter(([t]) => t.startsWith(dd.time[1]));
        const desOd = zitraHod.find(([t, p]) => p >= 50 && Number(t.slice(11, 13)) >= 6);
        setPocasi({
          misto: m.name,
          dnes: { ikona: POCASI(dd.weathercode[0]), max: Math.round(dd.temperature_2m_max[0]) },
          zitra: { ikona: POCASI(dd.weathercode[1]), max: Math.round(dd.temperature_2m_max[1]), min: Math.round(dd.temperature_2m_min[1]), dest: dd.precipitation_probability_max[1], vitr: Math.round(dd.windspeed_10m_max[1]), desOd: desOd ? desOd[0].slice(11, 16) : null },
        });
      } catch { /* bez počasí */ }
    })();
    return () => { zruseno = true; };
  }, [akce, obec]);

  const vPraci = !!(todayRecord?.checkin && !todayRecord?.checkout);
  const aktualniContract = vPraci ? todayRecord.contract_id : null;
  const jeTady = (a) => vPraci && aktualniContract && (a.zak?.contract_id || a.e.contract_id) === aktualniContract;
  const contractAkce = (a) => a.zak?.contract_id || a.e.contract_id || null;
  const ukolyAkce = (a) => {
    const z = a.zak, f = z ? fazeById[z.faze] : null;
    if (!z || !f || z.stav !== "otevrena") return [];
    return ukolyPro(f, z.typ).map((u) => ({ u, f, hotovo: ukolHotovy(z, f, u) }));
  };
  const souhrn = (akce || []).reduce((s, a) => { const u = ukolyAkce(a); return { celk: s.celk + u.length, hot: s.hot + u.filter((x) => x.hotovo).length }; }, { celk: 0, hot: 0 });

  const odskrtnout = async (a, x, ano) => {
    const z = a.zak;
    const hotove = { ...(z.hotove_ukoly || {}), [`${x.f.id}.${x.u.id}`]: ano };
    if (!ano) delete hotove[`${x.f.id}.${x.u.id}`];
    const { error } = await supabase.from("zakazky_prubeh").update({ hotove_ukoly: hotove, updated_at: new Date().toISOString() }).eq("id", z.id);
    if (error) { ukazat("Nepodařilo se uložit: " + error.message); return; }
    await supabase.from("zakazky_poznamky").insert({ prubeh_id: z.id, kdo: currentUser?.name || "?", text: `${ano ? "Hotovo" : "Vráceno"}: ${x.u.text} (z terénu)` });
    setAkce((all) => all.map((y) => (y === a ? { ...y, zak: { ...z, hotove_ukoly: hotove } } : y)));
    ukazat(ano ? "✓ Zapsáno do Průběhu" : "Vráceno");
  };

  const fotit = (a, kategorie = null) => { fotoCil.current = { a, kategorie }; fotoInput.current?.click(); };
  const nahratFotky = async (soubory) => {
    const cil = fotoCil.current;
    if (!cil || !soubory.length) return;
    setPracuji(true);
    let ok = 0;
    for (let i = 0; i < soubory.length; i++) {
      try {
        await nahratFotkuZakazky(soubory[i], { slozka: cil.a.zak?.nazev || cil.a.k?.name || cil.a.e.title || "Zakázka", contractId: contractAkce(cil.a), prubehId: cil.a.zak?.id || null, kategorie: cil.kategorie || "Průběh montáže", nahral: mojeId, poradi: i + 1 });
        ok++;
      } catch { /* další */ }
    }
    setPracuji(false);
    ukazat(ok ? `✓ Nahráno ${ok} ${ok === 1 ? "fotka" : ok < 5 ? "fotky" : "fotek"}` : "Fotky se nepodařilo nahrát");
  };

  // přechod na jinou zakázku: ukončit běžící blok a začít nový
  const prejit = async (a) => {
    if (!todayRecord?.id) return;
    setPracuji(true);
    const ted = new Date(), cas = `${String(ted.getHours()).padStart(2, "0")}:${String(ted.getMinutes()).padStart(2, "0")}`;
    const { error } = await supabase.from("attendance").update({ checkout: cas }).eq("id", todayRecord.id);
    if (error) { setPracuji(false); ukazat("Nepodařilo se: " + error.message); return; }
    const { data: novy, error: e2 } = await supabase.from("attendance").insert({ employee_id: mojeId, date: dnesIso(), checkin: cas, checkout: null, contract_id: contractAkce(a) }).select().single();
    setPracuji(false);
    if (e2) { ukazat("Příchod se nezapsal: " + e2.message); return; }
    setAttendance?.((prev) => [...prev.map((x) => (x.id === todayRecord.id ? { ...x, checkout: cas } : x)), { ...novy, employeeId: novy.employee_id }]);
    ukazat(`✓ Příchod ${cas} na ${a.zak?.nazev || a.e.title}`);
  };

  const cilPrichodu = (akce || [])[otevrena ?? 0] || null;
  const nazevAkce = (a) => a?.zak?.nazev || a?.k?.name || a?.e?.title || "zakázku";
  const adresaAkce = (a) => a?.e?.address || a?.zak?.misto_adresa || a?.k?.address || a?.zk?.address || "";
  const telefonAkce = (a) => a?.e?.contact_phone || a?.zak?.misto_telefon || a?.zk?.phone || "";
  const emp = (id) => employees.find((x) => String(x.id) === String(id));

  const st = {
    karta: { background: "#fff", border: "1px solid #DDE2E8", borderRadius: 16, overflow: "hidden" },
    m: { fontSize: 12, color: "#5F6368" },
    chip: { borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", display: "inline-block" },
    tile: { background: "#F0F4F9", border: "none", borderRadius: 14, padding: "10px 2px", textAlign: "center", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, color: "#1F2937" },
    tab: (on) => ({ flex: 1, border: "none", borderRadius: 999, padding: 8, fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer", background: on ? "#fff" : "transparent", color: on ? "#0E3B5E" : "#5F6368", boxShadow: on ? "0 1px 2px #0001" : "none" }),
    sek: { fontSize: 11.5, fontWeight: 800, color: "#0E3B5E", letterSpacing: ".03em", margin: "6px 0 2px" },
  };
  const d = new Date();

  return (
    <div className="muj-den" style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 90, textAlign: "left" }}>
      <style>{`
        .muj-den-lista { position: fixed; left: 0; right: 0; bottom: 0; z-index: 145; background: #0E3B5E; color: #fff; display: flex; align-items: center; gap: 10px; padding: 10px 14px calc(12px + env(safe-area-inset-bottom)); }
        @media (min-width: 769px) { .muj-den-lista { left: 220px; } }
        @media (max-width: 768px) { .muj-den-lista { bottom: calc(64px + env(safe-area-inset-bottom)); padding-bottom: 10px; } .mobile-checkin-fab { display: none !important; } }
      `}</style>
      <input ref={fotoInput} type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }} onChange={(e) => { const f = [...e.target.files]; e.target.value = ""; nahratFotky(f); }} />

      <div style={st.m}>Dobré {d.getHours() < 10 ? "ráno" : d.getHours() < 18 ? "odpoledne" : "večer"}, {String(currentUser?.name || "").split(" ")[0]} 👋</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <b style={{ fontSize: 19, marginRight: "auto" }}>{d.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "numeric" }).replace(/^./, (c) => c.toUpperCase())}</b>
        {pocasi && <span style={{ ...st.chip, background: "#FFF8E1", color: "#8A5A00" }}>{pocasi.dnes.ikona} dnes {pocasi.dnes.max}°</span>}
        {pocasi && <span style={{ ...st.chip, background: "#FFF1E6", color: "#9A3412" }}>{pocasi.zitra.ikona} zítra {pocasi.zitra.max}°</span>}
      </div>
      {akce && akce.length > 0 && <div style={st.m}>{souhrn.hot} z {souhrn.celk} úkolů hotovo · {akce.length} {akce.length === 1 ? "zakázka" : akce.length < 5 ? "zakázky" : "zakázek"}</div>}

      {akce === null ? <div style={st.m}>Načítám dnešní den…</div> : akce.length === 0 ? (
        <div style={{ ...st.karta, padding: 14 }}>
          <b>Na dnešek nemáš v kalendáři žádnou akci.</b>
          <div style={st.m}>Příchod dole zapíše docházku bez zakázky. Zakázku můžeš vybrat v Docházce.</div>
        </div>
      ) : akce.map((a, i) => {
        const o = otevrena === i;
        const uk = ukolyAkce(a);
        const hot = uk.filter((x) => x.hotovo).length;
        const tady = jeTady(a);
        const zal = zalozka[i] || "info";
        return (
          <div key={a.e.id} style={{ ...st.karta, borderLeft: tady ? "4px solid #F5821F" : st.karta.border }}>
            <div style={{ padding: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <button type="button" onClick={() => setOtevrena(o ? null : i)} aria-expanded={o} style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit" }}>
                <span style={st.m}>{[a.e.work_type, a.zak?.typ, a.zak?.faze && fazeById[a.zak.faze]?.nazev].filter(Boolean).join(" · ")}</span>
                {tady && <span style={{ ...st.chip, background: "#FFF1E6", color: "#9A3412", padding: "1px 7px", marginLeft: 6 }}>jsi tady</span>}
                <span style={{ display: "block", fontWeight: 700, fontSize: 16 }}>{nazevAkce(a)}</span>
                <span style={st.m}>{adresaAkce(a)}</span>
              </button>
              <button type="button" onClick={() => setOtevrena(o ? null : i)} aria-label={o ? "Sbalit" : "Rozbalit"} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 0 }}>
                {uk.length > 0 && <span style={{ ...st.chip, background: hot === uk.length ? "#EAF6EE" : "#F0F4F9", color: hot === uk.length ? "#1E7A3C" : "#0E3B5E" }}>{hot}/{uk.length}</span>}
                <span style={{ color: "#5F6368" }}>{o ? "▲" : "▼"}</span>
              </button>
            </div>
            <div style={{ padding: "0 12px 10px", marginTop: -4 }}>
              {a.kolegove.length === 0 ? <span style={{ ...st.chip, background: "#F0F4F9", color: "#0E3B5E", padding: "2px 9px" }}>💪 sám</span> : (
                <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={st.m}>s</span>
                  {a.kolegove.map((id) => (
                    <button key={id} type="button" onClick={() => setVizitka({ id, a })} style={{ border: "1px solid #CDD2D8", background: "#fff", borderRadius: 999, padding: "2px 9px 2px 3px", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#0E3B5E", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#0F766E", color: "#fff", fontSize: 9.5, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{inicialy(emp(id)?.name)}</span>
                      {String(emp(id)?.name || "kolega").split(" ")[0]}
                    </button>
                  ))}
                </span>
              )}
            </div>

            {o && (
              <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                {vPraci && !tady && (
                  <button type="button" disabled={pracuji} onClick={() => prejit(a)} style={{ background: "#0E3B5E", color: "#fff", border: "none", borderRadius: 14, padding: 13, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>▶ Příchod na zakázku</button>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  <a href={adresaAkce(a) ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresaAkce(a))}` : undefined} target="_blank" rel="noreferrer" style={{ ...st.tile, textDecoration: "none", opacity: adresaAkce(a) ? 1 : 0.4 }}><span style={{ fontSize: 20, display: "block" }}>🧭</span>Jet</a>
                  <button type="button" style={st.tile} disabled={pracuji} onClick={() => fotit(a)}><span style={{ fontSize: 20, display: "block" }}>📷</span>{pracuji ? "…" : "Fotka"}</button>
                  <button type="button" style={st.tile} onClick={() => setTab?.("servis")}><span style={{ fontSize: 20, display: "block" }}>🔧</span>Servis</button>
                  <a href={telefonAkce(a) ? `tel:${telefonAkce(a).replace(/\s/g, "")}` : undefined} style={{ ...st.tile, textDecoration: "none", opacity: telefonAkce(a) ? 1 : 0.4 }}><span style={{ fontSize: 20, display: "block" }}>📞</span>Zákazník</a>
                </div>
                <div role="tablist" style={{ display: "flex", background: "#F0F4F9", borderRadius: 999, padding: 3 }}>
                  {[["info", "Info"], ["kontakt", "Kontakt"]].map(([k, t]) => (
                    <button key={k} type="button" role="tab" aria-selected={zal === k} style={st.tab(zal === k)} onClick={() => setZalozka((z) => ({ ...z, [i]: k }))}>{t}</button>
                  ))}
                </div>
                {zal === "info" ? (
                  <div>
                    {uk.length > 0 && <>
                      <div style={st.sek}>ÚKOLY · {hot}/{uk.length}</div>
                      {uk.map((x, j) => (
                        <label key={x.u.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0", borderTop: j ? "1px solid #EEF0F3" : "none", color: x.hotovo ? "#1E7A3C" : undefined, fontSize: 14 }}>
                          <input type="checkbox" checked={x.hotovo} onChange={(ev) => odskrtnout(a, x, ev.target.checked)} style={{ width: 18, height: 18 }} />
                          <span style={{ flex: 1 }}>{x.u.text}</span>
                          {x.u.fotky && <button type="button" onClick={(ev) => { ev.preventDefault(); fotit(a, x.u.fotky); }} style={{ background: "#F0F4F9", border: "none", borderRadius: 10, padding: "4px 9px", cursor: "pointer" }} aria-label={`Vyfotit: ${x.u.fotky}`}>📷</button>}
                        </label>
                      ))}
                    </>}
                    {a.e.work_description && <div style={{ background: "#FFF7ED", borderRadius: 12, padding: "8px 10px", color: "#7C3F0B", margin: "8px 0", fontSize: 13.5 }}><b>Pokyny k akci</b><br />{a.e.work_description}</div>}
                    {a.zak ? <div style={{ marginTop: 6 }}><PodkladyNahled zak={a.zak} quote={a.quote} zakaznik={a.zk} tym={[a.e, ...a.kolegoveAkce]} naStarostiId={a.e.na_starosti} /></div>
                      : <div style={st.m}>K akci není připojená zakázka z Průběhu.</div>}
                  </div>
                ) : (
                  <div style={{ fontSize: 14 }}>
                    {[["Zákazník", [a.zk?.company, a.zk?.name || a.e.customer_name].filter(Boolean).join(" – ")], ["Kontakt", a.e.contact_name || a.zak?.misto_kontakt], ["Telefon", telefonAkce(a)], ["E-mail", a.zk?.email], ["Adresa", adresaAkce(a)], ["Složka", a.zak?.podklady?.obecne?.odkaz_slozka]].filter(([, v]) => v).map(([l, v], j) => (
                      <div key={l} style={{ display: "grid", gridTemplateColumns: "100px minmax(0,1fr)", gap: 8, padding: "6px 0", borderTop: j ? "1px solid #EEF0F3" : "none" }}>
                        <span style={{ color: "#5F6368" }}>{l}</span>
                        <span style={{ overflowWrap: "anywhere" }}>{l === "Telefon" ? <a href={`tel:${String(v).replace(/\s/g, "")}`} style={{ color: "#0E3B5E" }}>{v}</a> : l === "E-mail" ? <a href={`mailto:${v}`} style={{ color: "#0E3B5E" }}>{v}</a> : l === "Složka" ? <a href={v} target="_blank" rel="noreferrer" style={{ color: "#0E3B5E" }}>otevřít</a> : v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Moje úkoly z modulu Úkoly (i mimo zakázky): dnes a po termínu, pak bez termínu */}
      {(() => {
        const dnesIso = new Date().toLocaleDateString("sv-SE");
        const moje = tasks.filter((t) => !t.done && t.assigned_to && t.assigned_to === currentUser?.name);
        const naDnes = moje.filter((t) => t.due && t.due <= dnesIso).sort((a, b) => String(a.due).localeCompare(String(b.due)));
        const bezTerminu = moje.filter((t) => !t.due);
        const ukaz = [...naDnes, ...bezTerminu].slice(0, 6);
        if (!ukaz.length) return null;
        return (
          <div style={{ ...st.karta, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <b style={{ fontSize: 14 }}>✓ Moje úkoly</b>
              <button type="button" onClick={() => setTab?.("tasks")} style={{ background: "none", border: "none", color: "#0369a1", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Všechny ({moje.length}) →</button>
            </div>
            {ukaz.map((t) => {
              const po = t.due && t.due < dnesIso;
              return (
                <label key={t.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderTop: "1px solid #F1F3F6", fontSize: 14, cursor: "pointer" }}>
                  <input type="checkbox" checked={false} onChange={() => onToggleTask?.(t.id)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{t.title}
                    {(t.due || t.created_by) && <span style={{ display: "block", fontSize: 12, color: po ? "#b91c1c" : "#6B7280", fontWeight: po ? 700 : 400 }}>{t.due ? (t.due === dnesIso ? "dnes" : `termín ${new Date(t.due + "T00:00:00").toLocaleDateString("cs-CZ")}${po ? " — po termínu" : ""}`) : "bez termínu"}{t.created_by && t.created_by !== currentUser?.name ? ` · zadal ${t.created_by}` : ""}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        );
      })()}

      <UkolyFazi ja={currentUser?.name} onOtevrit={onOtevritPrubeh} kompakt />

      {pocasi && (pocasi.zitra.dest >= 50 || pocasi.zitra.vitr >= 40) && (
        <div style={{ ...st.karta, padding: "11px 12px", background: "#FFF7ED", borderColor: "#F8DDC2", color: "#9A5B13", fontSize: 13.5 }}>
          {pocasi.zitra.ikona} Zítra {pocasi.zitra.max}° / {pocasi.zitra.min}°{pocasi.zitra.dest >= 50 ? ` · déšť ${pocasi.zitra.desOd ? `od ${pocasi.zitra.desOd}` : `(${pocasi.zitra.dest} %)`}` : ""}{pocasi.zitra.vitr >= 40 ? ` · vítr ${pocasi.zitra.vitr} km/h` : ""} ({pocasi.misto})
        </div>
      )}

      {zprava && <div role="status" style={{ position: "fixed", left: 12, right: 12, bottom: "calc(140px + env(safe-area-inset-bottom))", zIndex: 146, background: "#1F2937", color: "#fff", borderRadius: 10, padding: "9px 12px", fontSize: 13, maxWidth: 520, margin: "0 auto" }}>{zprava}</div>}

      <div className="muj-den-lista">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.75 }}>{vPraci ? `V PRÁCI OD ${hm(todayRecord.checkin)}` : todayRecord?.checkout ? `ODCHOD ${hm(todayRecord.checkout)}` : "SMĚNA NEZAČALA"}</div>
          <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {vPraci ? (nazevAkce((akce || []).find(jeTady)) || "v práci") : cilPrichodu ? `na: ${nazevAkce(cilPrichodu)}` : "bez zakázky"}
          </div>
        </div>
        <button type="button" disabled={pracuji} onClick={() => onPrichod?.(vPraci ? undefined : (contractAkce(cilPrichodu || {}) ?? undefined))}
          style={{ background: vPraci ? "#fff" : "#F5821F", color: vPraci ? "#B42318" : "#fff", border: "none", borderRadius: 12, padding: "12px 18px", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
          {vPraci ? "⏹ Odchod" : "▶ Příchod"}
        </button>
      </div>

      {vizitka && (() => {
        const p = emp(vizitka.id) || {};
        const jehoAkce = vizitka.a.kolegoveAkce.find((x) => String(x.employee_id) === String(vizitka.id));
        const jehoDoch = (attendance || []).filter((x) => String(x.employee_id) === String(vizitka.id) && x.date === dnesIso());
        const bezi = jehoDoch.find((x) => x.checkin && !x.checkout);
        return (
          <div role="dialog" aria-modal="true" aria-label={`Kolega ${p.name || ""}`} onClick={(e) => { if (e.target === e.currentTarget) setVizitka(null); }}
            style={{ position: "fixed", inset: 0, background: "#0006", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div style={{ background: "#fff", width: "100%", maxWidth: 520, borderRadius: "22px 22px 0 0", padding: "10px 16px calc(18px + env(safe-area-inset-bottom))" }}>
              <div style={{ width: 36, height: 4, background: "#CDD2D8", borderRadius: 2, margin: "0 auto 10px" }} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {p.photo_url ? <img src={p.photo_url} alt="" style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover" }} />
                  : <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#0F766E", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{inicialy(p.name)}</div>}
                <div><b style={{ fontSize: 17 }}>{p.name || "Kolega"}</b><div style={st.m}>{[p.position, jehoAkce?.na_starosti && `dnes: ${naStarosti(jehoAkce.na_starosti)?.label || jehoAkce.na_starosti}`].filter(Boolean).join(" · ")}</div></div>
              </div>
              {[["Stav", bezi ? `příchod ${hm(bezi.checkin)}` : jehoDoch.length ? "dnes už odešel" : "zatím bez příchodu"], ["Umí", (p.dovednosti || []).map((id) => `${dovednost(id).ikona} ${dovednost(id).label}`).join(" · ")], ["Telefon", p.phone], ["Poznámka", p.specialization]].filter(([, v]) => v).map(([l, v]) => (
                <div key={l} style={{ display: "grid", gridTemplateColumns: "90px minmax(0,1fr)", gap: 8, padding: "7px 0", borderTop: "1px solid #EEF0F3", fontSize: 14, marginTop: l === "Stav" ? 10 : 0 }}><span style={{ color: "#5F6368" }}>{l}</span><span>{v}</span></div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {p.phone && <a href={`tel:${p.phone.replace(/\s/g, "")}`} style={{ flex: 1, textAlign: "center", background: "#0E3B5E", color: "#fff", borderRadius: 12, padding: 11, fontWeight: 700, textDecoration: "none" }}>📞 Zavolat</a>}
                {p.phone && <a href={`sms:${p.phone.replace(/\s/g, "")}`} style={{ flex: 1, textAlign: "center", background: "#F0F4F9", color: "#0E3B5E", borderRadius: 12, padding: 11, fontWeight: 700, textDecoration: "none" }}>💬 SMS</a>}
                <button type="button" onClick={() => setVizitka(null)} style={{ background: "#F0F4F9", border: "none", borderRadius: 12, padding: "11px 14px", cursor: "pointer", fontWeight: 700 }}>✕</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
