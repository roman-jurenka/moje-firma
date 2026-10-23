// ─── Mapa jízd (Kniha jízd → Jízdy z GPS) ─────────────────────────────────────
// Dva pohledy:
//  • Trasa dne — auto + den: čára trasy z GPS Dozoru (edge funkce gps-trasa)
//    a očíslované zastávky (konce jízd) s časem a adresou.
//  • Kdo tu byl — klik do mapy (nebo hledání adresy z jízd) najde zastávky aut
//    v okolí: kdy, jaké auto, kdo řídil a jak dlouho tam stálo.
// Mapa je OpenStreetMap přes Leaflet.

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "./supabase.js";

const p2 = (n) => String(n).padStart(2, "0");
const hm = (t) => String(t || "").slice(0, 5);
const casZIso = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const fmtDatum = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric", year: "numeric" }) : "");
const kratka = (a) => String(a || "").split(",").slice(0, 2).join(",").trim();
const BARVY = ["#0E3B5E", "#E8772E", "#0F766E", "#7C3AED", "#B42318"];
const vzdalenostM = (a, b) => {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const minut = (m) => (m == null ? "" : m >= 60 ? `${Math.floor(m / 60)} h ${p2(m % 60)} min` : `${m} min`);

export default function MapaJizd({ vozidla = [], employees = [], vychoziRezim = "trasa", vychoziDatum, vychoziAuto, onZavrit }) {
  const [rezim, setRezim] = useState(vychoziRezim);
  const [datum, setDatum] = useState(vychoziDatum || new Date().toLocaleDateString("sv-SE"));
  const [auto, setAuto] = useState(vychoziAuto || vozidla[0]?.kod || "");
  const [trasa, setTrasa] = useState(null); // { body, jizdy } | { chyba }
  const [bod, setBod] = useState(null);     // vybrané místo { lat, lng }
  const [okruh, setOkruh] = useState(300);
  const [vysledky, setVysledky] = useState(null);
  const [hledat, setHledat] = useState("");
  const [nacitam, setNacitam] = useState(false);
  const elMapy = useRef(null);
  const mapa = useRef(null);
  const vrstva = useRef(null);

  const nazevAuta = (kod) => String(vozidla.find((v) => v.kod === kod)?.nazev || kod).replace(/^\d+-/, "");
  const ridic = (kod) => employees.find((e) => String(e.id) === String(vozidla.find((v) => v.kod === kod)?.ridic_employee_id))?.name || "";

  // mapa
  useEffect(() => {
    const m = L.map(elMapy.current, { zoomControl: true }).setView([49.75, 16.95], 9);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    vrstva.current = L.layerGroup().addTo(m);
    mapa.current = m;
    setTimeout(() => m.invalidateSize(), 50);
    return () => { m.remove(); mapa.current = null; };
  }, []);

  // klik do mapy = vybrat místo (režim Kdo tu byl)
  useEffect(() => {
    const m = mapa.current;
    if (!m) return undefined;
    const h = (e) => { if (rezim === "kdo") setBod({ lat: e.latlng.lat, lng: e.latlng.lng }); };
    m.on("click", h);
    m.getContainer().style.cursor = rezim === "kdo" ? "crosshair" : "";
    return () => { m.off("click", h); };
  }, [rezim]);

  // načtení trasy dne
  useEffect(() => {
    if (rezim !== "trasa" || !auto || !datum) return undefined;
    let zruseno = false;
    Promise.resolve().then(() => { if (!zruseno) { setNacitam(true); setTrasa(null); } });
    supabase.functions.invoke("gps-trasa", { body: { kod: auto, datum } }).then(({ data, error }) => {
      if (zruseno) return;
      setNacitam(false);
      setTrasa(error || data?.error ? { chyba: data?.detail || error?.message || "Trasu se nepodařilo načíst." } : data);
    });
    return () => { zruseno = true; };
  }, [rezim, auto, datum]);

  // hledání zastávek v okolí bodu
  useEffect(() => {
    if (rezim !== "kdo" || !bod) return undefined;
    let zruseno = false;
    (async () => {
      setNacitam(true);
      const dLat = okruh / 111000, dLng = okruh / (111000 * Math.cos(bod.lat * Math.PI / 180));
      const { data } = await supabase.from("gps_jizdy").select("vozidlo_kod, datum, zacatek, konec, do_adresa, do_lat, do_lng, km")
        .gte("do_lat", bod.lat - dLat).lte("do_lat", bod.lat + dLat).gte("do_lng", bod.lng - dLng).lte("do_lng", bod.lng + dLng)
        .order("datum", { ascending: false }).limit(300);
      const blizko = (data || []).map((j) => ({ ...j, vzd: vzdalenostM(bod, { lat: j.do_lat, lng: j.do_lng }) })).filter((j) => j.vzd <= okruh);
      // odjezd = začátek další jízdy stejného auta ten den
      const kody = [...new Set(blizko.map((j) => j.vozidlo_kod))], dny = [...new Set(blizko.map((j) => j.datum))];
      let dalsi = [];
      if (blizko.length) {
        const { data: d } = await supabase.from("gps_jizdy").select("vozidlo_kod, datum, zacatek").in("vozidlo_kod", kody).in("datum", dny);
        dalsi = d || [];
      }
      const s = blizko.map((j) => {
        const odj = dalsi.filter((x) => x.vozidlo_kod === j.vozidlo_kod && x.datum === j.datum && hm(x.zacatek) > hm(j.konec)).map((x) => hm(x.zacatek)).sort()[0] || null;
        const [h1, m1] = hm(j.konec).split(":").map(Number), [h2, m2] = (odj || "").split(":").map(Number);
        return { ...j, odjezd: odj, stani: odj ? (h2 * 60 + m2) - (h1 * 60 + m1) : null };
      }).sort((a, b) => (b.datum + hm(b.konec)).localeCompare(a.datum + hm(a.konec)));
      if (!zruseno) { setVysledky(s); setNacitam(false); }
    })();
    return () => { zruseno = true; };
  }, [rezim, bod, okruh]);

  // kreslení
  useEffect(() => {
    const m = mapa.current, g = vrstva.current;
    if (!m || !g) return;
    g.clearLayers();
    if (rezim === "trasa" && trasa?.body) {
      const cara = trasa.body.map((b) => [b.lat, b.lng]);
      if (cara.length > 1) L.polyline(cara, { color: "#0E3B5E", weight: 4, opacity: 0.85 }).addTo(g);
      const zast = (trasa.jizdy || []).filter((j) => j.do);
      zast.forEach((j, i) => {
        const ikona = L.divIcon({ className: "", html: `<div style="background:#E8772E;color:#fff;border:2px solid #fff;border-radius:999px;min-width:22px;height:22px;display:flex;align-items:center;justify-content:center;font:700 12px system-ui;box-shadow:0 1px 4px #0006">${i + 1}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
        L.marker([j.do.lat, j.do.lng], { icon: ikona }).bindPopup(`<b>${i + 1}. ${casZIso(j.konec)}</b><br>${kratka(j.do_adresa)}${j.km != null ? `<br>${j.km} km` : ""}`).addTo(g);
      });
      const prvni = (trasa.jizdy || []).find((j) => j.z);
      if (prvni) L.circleMarker([prvni.z.lat, prvni.z.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#1E7A3C", fillOpacity: 1 }).bindPopup(`<b>Start ${casZIso(prvni.zacatek)}</b><br>${kratka(prvni.z_adresa)}`).addTo(g);
      const vse = [...cara, ...zast.map((j) => [j.do.lat, j.do.lng])];
      if (vse.length) m.fitBounds(vse, { padding: [30, 30], maxZoom: 15 });
    }
    if (rezim === "kdo" && bod) {
      L.circle([bod.lat, bod.lng], { radius: okruh, color: "#E8772E", weight: 2, fillOpacity: 0.08 }).addTo(g);
      L.circleMarker([bod.lat, bod.lng], { radius: 5, color: "#E8772E", fillColor: "#E8772E", fillOpacity: 1 }).addTo(g);
      (vysledky || []).forEach((j) => {
        const c = BARVY[Math.max(0, vozidla.findIndex((v) => v.kod === j.vozidlo_kod)) % BARVY.length];
        L.circleMarker([j.do_lat, j.do_lng], { radius: 6, color: "#fff", weight: 2, fillColor: c, fillOpacity: 1 })
          .bindPopup(`<b>${nazevAuta(j.vozidlo_kod)}</b><br>${fmtDatum(j.datum)} · ${hm(j.konec)}${j.odjezd ? `–${j.odjezd}` : ""}<br>${kratka(j.do_adresa)}`).addTo(g);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rezim, trasa, bod, vysledky, okruh]);

  // hledání místa podle adresy z uložených jízd (bez externího geokodéru)
  const najitAdresu = async () => {
    const t = hledat.trim();
    if (t.length < 3) return;
    const { data } = await supabase.from("gps_jizdy").select("do_adresa, do_lat, do_lng").ilike("do_adresa", `%${t}%`).not("do_lat", "is", null).limit(1);
    const j = data?.[0];
    if (!j) { setVysledky([]); setBod(null); return; }
    setBod({ lat: j.do_lat, lng: j.do_lng });
    mapa.current?.setView([j.do_lat, j.do_lng], 15);
  };

  const pole = { border: "1px solid #CDD2D8", borderRadius: 6, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", background: "#fff" };
  const tl = (on) => ({ border: `1px solid ${on ? "#0E3B5E" : "#CDD2D8"}`, background: on ? "#0E3B5E" : "#fff", color: on ? "#fff" : "#1F2937", borderRadius: 6, padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });
  const zastavky = (trasa?.jizdy || []).filter((j) => j.do);

  return (
    <div role="dialog" aria-modal="true" aria-label="Mapa jízd" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}
      onClick={(e) => { if (e.target === e.currentTarget) onZavrit?.(); }}>
      <div style={{ background: "#fff", borderRadius: 10, width: "min(1200px, 100%)", height: "min(820px, 100%)", display: "flex", flexDirection: "column", overflow: "hidden", textAlign: "left" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", borderBottom: "1px solid #E3E6EA" }}>
          <b style={{ fontSize: 15, marginRight: 6 }}>🗺 Mapa jízd</b>
          <button type="button" style={tl(rezim === "trasa")} aria-pressed={rezim === "trasa"} onClick={() => setRezim("trasa")}>Trasa dne</button>
          <button type="button" style={tl(rezim === "kdo")} aria-pressed={rezim === "kdo"} onClick={() => setRezim("kdo")}>📍 Kdo tu byl</button>
          {rezim === "trasa" ? (
            <>
              <select style={pole} value={auto} onChange={(e) => setAuto(e.target.value)} aria-label="Auto">
                {vozidla.map((v) => <option key={v.kod} value={v.kod}>{nazevAuta(v.kod)}{v.spz ? ` · ${v.spz}` : ""}</option>)}
              </select>
              <input type="date" style={pole} value={datum} onChange={(e) => setDatum(e.target.value)} aria-label="Den" />
            </>
          ) : (
            <>
              <input style={{ ...pole, width: 220 }} value={hledat} placeholder="Adresa / obec, např. Luhačovice" onChange={(e) => setHledat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") najitAdresu(); }} aria-label="Hledat místo" />
              <button type="button" style={tl(false)} onClick={najitAdresu}>Najít</button>
              <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>okruh
                <select style={pole} value={okruh} onChange={(e) => setOkruh(Number(e.target.value))}>{[100, 300, 500, 1000, 3000].map((r) => <option key={r} value={r}>{r >= 1000 ? `${r / 1000} km` : `${r} m`}</option>)}</select></label>
            </>
          )}
          {nacitam && <span style={{ fontSize: 12, color: "#6B7280" }}>Načítám…</span>}
          <button type="button" aria-label="Zavřít mapu" onClick={onZavrit} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6B7280" }}>✕</button>
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", minHeight: 0 }} className="mapa-jizd-telo">
          <div ref={elMapy} style={{ minHeight: 300 }} />
          <div style={{ borderLeft: "1px solid #E3E6EA", overflowY: "auto", fontSize: 13 }}>
            {rezim === "trasa" ? (
              trasa?.chyba ? <div style={{ padding: 12, color: "#B42318" }}>{trasa.chyba}</div>
                : !trasa ? <div style={{ padding: 12, color: "#6B7280" }}>Načítám trasu…</div>
                : !zastavky.length ? <div style={{ padding: 12, color: "#6B7280" }}>V tento den auto nejelo.</div>
                : <>
                  <div style={{ padding: "10px 12px", fontWeight: 700 }}>{nazevAuta(auto)} · {fmtDatum(datum)}<div style={{ fontWeight: 400, color: "#6B7280", fontSize: 12 }}>{zastavky.length} zastávek · {Math.round(zastavky.reduce((s, j) => s + (Number(j.km) || 0), 0))} km{ridic(auto) ? ` · ${ridic(auto)}` : ""}</div></div>
                  {zastavky.map((j, i) => (
                    <button key={i} type="button" onClick={() => mapa.current?.setView([j.do.lat, j.do.lng], 16)}
                      style={{ display: "grid", gridTemplateColumns: "26px minmax(0,1fr)", gap: 8, width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderTop: "1px solid #EEF0F3", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                      <span style={{ background: "#E8772E", color: "#fff", borderRadius: 999, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>{i + 1}</span>
                      <span><b>{casZIso(j.zacatek)}–{casZIso(j.konec)}</b>{j.km != null ? ` · ${j.km} km` : ""}<br /><span style={{ color: "#4B5563" }}>{kratka(j.do_adresa)}</span></span>
                    </button>
                  ))}
                </>
            ) : !bod ? (
              <div style={{ padding: 12, color: "#4B5563", lineHeight: 1.5 }}>Klikni do mapy na místo (nebo napiš adresu nahoře) a uvidíš, kdy tam které auto zastavilo, kdo řídil a jak dlouho tam stálo.</div>
            ) : !vysledky ? <div style={{ padding: 12, color: "#6B7280" }}>Hledám…</div>
              : !vysledky.length ? <div style={{ padding: 12, color: "#6B7280" }}>V okruhu {okruh >= 1000 ? `${okruh / 1000} km` : `${okruh} m`} žádné auto nezastavilo. Zkus větší okruh.</div>
              : <>
                <div style={{ padding: "10px 12px", fontWeight: 700 }}>{vysledky.length} {vysledky.length === 1 ? "zastávka" : vysledky.length < 5 ? "zastávky" : "zastávek"} v okolí</div>
                {vysledky.map((j, i) => (
                  <button key={i} type="button" onClick={() => mapa.current?.setView([j.do_lat, j.do_lng], 17)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderTop: "1px solid #EEF0F3", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                    <b>{fmtDatum(j.datum)}</b> · {hm(j.konec)}{j.odjezd ? `–${j.odjezd}` : ""}{j.stani != null ? ` (${minut(j.stani)})` : ""}
                    <br /><span style={{ color: BARVY[Math.max(0, vozidla.findIndex((v) => v.kod === j.vozidlo_kod)) % BARVY.length], fontWeight: 700 }}>{nazevAuta(j.vozidlo_kod)}</span>{ridic(j.vozidlo_kod) ? ` · ${ridic(j.vozidlo_kod)}` : ""} · {Math.round(j.vzd)} m
                    <br /><span style={{ color: "#4B5563" }}>{kratka(j.do_adresa)}</span>
                  </button>
                ))}
              </>}
          </div>
        </div>
        <style>{"@media (max-width: 760px) { .mapa-jizd-telo { grid-template-columns: minmax(0,1fr) !important; grid-template-rows: minmax(260px, 1fr) minmax(0, 40%); } .mapa-jizd-telo > div:last-child { border-left: none !important; border-top: 1px solid #E3E6EA; } }"}</style>
      </div>
    </div>
  );
}
