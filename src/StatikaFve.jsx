// ─── Statika FVE: zjednodušené statické posouzení šikmé i ploché střechy ────
// Formulář → živý výpočet (statikaFve.js) → PDF protokol (statikaProtokol.js),
// který jde stáhnout nebo uložit do Dokumentů zakázky. Vstupy lze převzít
// z 3D návrhu FVE; rozpracovaný posudek se pamatuje v zařízení.

import { useState, useEffect, useMemo } from "react";
import * as ui from "./ui.js";
import {
  SNEH_OBLASTI, EXPOZICE, VITR_OBLASTI, TERENY, KRYTINY, VRSTVY, DREVA, ZONY_SIKMA, vychoziPosudek, vypocet, zNavrhu3D,
} from "./statikaFve.js";
import { vyskaHrebene, roztecRad } from "./navrh3dGeometrie.js";
import { zakazkaVeVyberu } from "./zakazkyVyber.js";
import { nahratFotkuZakazky } from "./fotkyZakazky.js";

const KLIC = "statika.posudek";
const nactiPosudek = () => { try { return { ...vychoziPosudek(), ...JSON.parse(localStorage.getItem(KLIC) || "{}") }; } catch { return vychoziPosudek(); } };
const navrhy3D = () => { try { return JSON.parse(localStorage.getItem("navrh3d.navrhy") || "[]"); } catch { return []; } };

const cislo = (x, d = 2) => Number(x || 0).toLocaleString("cs-CZ", { minimumFractionDigits: d, maximumFractionDigits: d });
const pr = (x) => `${cislo(100 * x, 0)} %`;

const S = {
  karta: { ...ui.karta, padding: 16, marginBottom: 12 },
  pole: { ...ui.pole, padding: "7px 9px" },
  popisek: ui.popisek,
  btn: (c, v = "normal") => ({ ...ui.tlacitko(c, v), cursor: "pointer" }),
  obrys: { ...ui.tlacitkoObrys("normal"), cursor: "pointer" },
  mrizka: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 },
  stitek: (a) => ({ padding: "7px 12px", borderRadius: 8, border: `1px solid ${a ? ui.barvy.primarni : ui.barvy.okraj}`, background: a ? ui.barvy.primarni : "#fff", color: a ? "#fff" : ui.barvy.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }),
  h3: { fontSize: 14, fontWeight: 700, margin: "0 0 10px", color: ui.barvy.primarniTmava },
  maly: { fontSize: 12, color: ui.barvy.textMekky },
};

function Pole({ label, children, napoveda }) {
  return (
    <label style={{ display: "block" }} title={napoveda}>
      <span style={S.popisek}>{label}</span>
      {children}
    </label>
  );
}

// Řádek výsledku s pruhem využití
function Vyuziti({ nazev, u, detail }) {
  const ok = u <= 1;
  const barva = u > 1 ? ui.barvy.chyba : u > 0.85 ? ui.barvy.varovani : ui.barvy.uspech;
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <span>{nazev}</span>
        <b style={{ color: ok ? ui.barvy.text : ui.barvy.chyba }}>{pr(u)}</b>
      </div>
      <div style={{ height: 6, background: ui.barvy.okrajJemny, borderRadius: 3, overflow: "hidden", margin: "3px 0" }}>
        <div style={{ width: `${Math.min(100, u * 100)}%`, height: "100%", background: barva }} />
      </div>
      {detail && <div style={S.maly}>{detail}</div>}
    </div>
  );
}

function Verdikt({ ok, text }) {
  const barva = ok == null ? ui.barvy.neutralni : ok ? ui.barvy.uspech : ui.barvy.chyba;
  return (
    <div style={{ border: `2px solid ${barva}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, background: ok == null ? "#f8fafc" : ok ? "#f0fdf4" : "#fef2f2" }}>
      <div style={{ fontWeight: 800, fontSize: 16, color: barva }}>{ok == null ? "NUTNO DOPLNIT" : ok ? "VYHOVUJE" : "NEVYHOVUJE"}</div>
      <div style={{ fontSize: 13, marginTop: 3 }}>{text}</div>
    </div>
  );
}

export default function StatikaFve({ contracts = [], customers = [], currentUser }) {
  const [v, setV] = useState(nactiPosudek);
  const [generuji, setGeneruji] = useState(false);
  const [zprava, setZprava] = useState(null); // { text, chyba }
  useEffect(() => { try { localStorage.setItem(KLIC, JSON.stringify(v)); } catch { /* plné úložiště */ } }, [v]);

  const nastav = (k) => (e) => setV(p => ({ ...p, [k]: e.target.value }));
  const r = useMemo(() => vypocet(v), [v]);
  const sikma = v.typ !== "plocha";
  const zakazky = contracts.filter(c => zakazkaVeVyberu(c, v.contractId));
  const [navrhy] = useState(navrhy3D);

  const vyberZakazku = (e) => {
    const c = contracts.find(x => String(x.id) === e.target.value);
    if (!c) { setV(p => ({ ...p, contractId: "" })); return; }
    const cust = customers.find(x => String(x.id) === String(c.customer_id));
    setV(p => ({ ...p, contractId: String(c.id), nazev: c.name || p.nazev, zakaznik: cust?.name || p.zakaznik, adresa: c.address || cust?.address || p.adresa }));
  };
  const prevzit3D = (e) => {
    const n = navrhy.find(x => x.id === e.target.value);
    e.target.value = "";
    if (!n) return;
    const z = zNavrhu3D(n, vyskaHrebene, roztecRad);
    setV(p => ({ ...p, ...z, nazev: p.contractId ? p.nazev : z.nazev, zakaznik: p.zakaznik || z.zakaznik }));
    setZprava({ text: `Převzato z 3D návrhu „${n.nazev}“: ${z.pocet ?? "–"} panelů, výška ${cislo(z.vyska, 1)} m.` });
  };
  const novy = () => {
    if (!window.confirm("Začít nový posudek? Zadané hodnoty se smažou.")) return;
    setV(vychoziPosudek()); setZprava(null);
  };

  const pdf = async (doZakazky) => {
    setGeneruji(true); setZprava(null);
    try {
      const { vytvorProtokolStatiky, nazevSouboruPosudku } = await import("./statikaProtokol.js");
      const blob = await vytvorProtokolStatiky({ vstupy: v, vysledek: r, zpracoval: currentUser?.name, stahnout: !doZakazky });
      if (doZakazky) {
        const c = contracts.find(x => String(x.id) === String(v.contractId));
        if (!c) throw new Error("Vyberte zakázku.");
        const file = new File([blob], nazevSouboruPosudku(v), { type: "application/pdf" });
        await nahratFotkuZakazky(file, { slozka: c.name || String(c.id), contractId: c.id, kategorie: "Dokumenty", nahral: currentUser?.name || null, popis: "Statické posouzení FVE", pripraveno: true });
        setZprava({ text: `Protokol uložen do Dokumentů zakázky ${c.name}.` });
      }
    } catch (e) {
      setZprava({ text: "PDF se nepodařilo vytvořit: " + (e?.message || e), chyba: true });
    } finally {
      setGeneruji(false);
    }
  };

  const vstup = (k, props = {}) => <input type="number" style={S.pole} value={v[k] ?? ""} onChange={nastav(k)} {...props} />;
  const vyber = (k, moznosti) => (
    <select style={S.pole} value={v[k]} onChange={nastav(k)}>
      {moznosti.map(([hod, txt]) => <option key={hod} value={hod}>{txt}</option>)}
    </select>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <h1 style={ui.nadpis}>Statika FVE</h1>
          <div style={S.maly}>Zjednodušené statické posouzení fotovoltaiky na střeše – sníh a vítr podle ČSN EN 1991, krokve podle ČSN EN 1995</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {navrhy.length > 0 && (
            <select style={{ ...S.pole, width: "auto" }} defaultValue="" onChange={prevzit3D}>
              <option value="" disabled>Převzít z 3D návrhu…</option>
              {navrhy.map(n => <option key={n.id} value={n.id}>{n.nazev}{n.zakaznik ? ` – ${n.zakaznik}` : ""}</option>)}
            </select>
          )}
          <button style={S.obrys} onClick={novy}><i className="ti ti-file-plus" /> Nový</button>
        </div>
      </div>

      {zprava && <div style={{ ...S.karta, padding: "10px 14px", borderColor: zprava.chyba ? ui.barvy.chyba : ui.barvy.uspech, color: zprava.chyba ? ui.barvy.chyba : ui.barvy.text, fontSize: 13 }}>{zprava.text}</div>}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 520px", minWidth: 0 }}>
          <div style={S.karta}>
            <h3 style={S.h3}>Objekt</h3>
            <div style={S.mrizka}>
              <Pole label="Zakázka">
                <select style={S.pole} value={v.contractId} onChange={vyberZakazku}>
                  <option value="">— bez zakázky —</option>
                  {zakazky.map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} · ` : ""}{c.name}</option>)}
                </select>
              </Pole>
              <Pole label="Název objektu"><input style={S.pole} value={v.nazev} onChange={nastav("nazev")} /></Pole>
              <Pole label="Investor"><input style={S.pole} value={v.zakaznik} onChange={nastav("zakaznik")} /></Pole>
              <Pole label="Adresa"><input style={S.pole} value={v.adresa} onChange={nastav("adresa")} /></Pole>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <button style={S.stitek(sikma)} onClick={() => setV(p => ({ ...p, typ: "sikma" }))}><i className="ti ti-home" /> Šikmá střecha – háky</button>
              <button style={S.stitek(!sikma)} onClick={() => setV(p => ({ ...p, typ: "plocha" }))}><i className="ti ti-building" /> Plochá střecha – zátěž</button>
            </div>
          </div>

          <div style={S.karta}>
            <h3 style={S.h3}>Lokalita</h3>
            <div style={S.mrizka}>
              <Pole label="Sněhová oblast" napoveda="Mapa sněhových oblastí ČSN EN 1991-1-3 / snehovamapa.cz">
                {vyber("snehOblast", SNEH_OBLASTI.map(x => [x.id, x.sk ? `${x.id} (sk = ${cislo(x.sk, 1)} kN/m²)` : `${x.id} (zadat sk)`]))}
              </Pole>
              {v.snehOblast === "VIII" && <Pole label="sk (kN/m²)">{vstup("skVlastni", { step: 0.1 })}</Pole>}
              <Pole label="Expozice">{vyber("ce", EXPOZICE.map(x => [x.k, x.t]))}</Pole>
              <Pole label="Větrná oblast">{vyber("vitrOblast", VITR_OBLASTI.map(x => [x.id, `${x.id} (vb = ${cislo(x.vb, 1)} m/s)`]))}</Pole>
              <Pole label="Kategorie terénu">{vyber("teren", TERENY.map(x => [x.id, x.t]))}</Pole>
              <Pole label={sikma ? "Výška hřebene (m)" : "Výška střechy / atiky (m)"}>{vstup("vyska", { step: 0.5 })}</Pole>
            </div>
          </div>

          <div style={S.karta}>
            <h3 style={S.h3}>Fotovoltaické panely</h3>
            <div style={S.mrizka}>
              <Pole label="Počet panelů">{vstup("pocet")}</Pole>
              <Pole label="Delší strana (m)">{vstup("panelDelka", { step: 0.001 })}</Pole>
              <Pole label="Kratší strana (m)">{vstup("panelSirka", { step: 0.001 })}</Pole>
              <Pole label="Hmotnost panelu (kg)">{vstup("panelHmotnost", { step: 0.5 })}</Pole>
              {sikma
                ? <Pole label="Konstrukce (kg/m²)" napoveda="Lišty, háky, svorky – obvykle 2–4 kg/m²">{vstup("konstrukceKgM2", { step: 0.5 })}</Pole>
                : <Pole label="Konstrukce (kg/panel)" napoveda="Hliníkové trojúhelníky, vany, podložky">{vstup("konstrukceKgPanel", { step: 0.5 })}</Pole>}
            </div>
          </div>

          {sikma ? (
            <>
              <div style={S.karta}>
                <h3 style={S.h3}>Střecha a krokve</h3>
                <div style={S.mrizka}>
                  <Pole label="Sklon střechy (°)">{vstup("sklon")}</Pole>
                  <Pole label="Krytina">{vyber("krytina", KRYTINY.map(x => [x.id, `${x.t} (${cislo(x.g)} kN/m²)`]))}</Pole>
                  <Pole label="Dřevo krokví">{vyber("drevo", DREVA.map(x => [x.id, x.t]))}</Pole>
                  <Pole label="Šířka krokve b (mm)">{vstup("krokevB")}</Pole>
                  <Pole label="Výška krokve h (mm)">{vstup("krokevH")}</Pole>
                  <Pole label="Rozteč krokví (m)">{vstup("krokevRozestup", { step: 0.05 })}</Pole>
                  <Pole label="Rozpětí mezi podporami (m)" napoveda="Největší vodorovná vzdálenost podpor krokve (vaznice, pozednice) pod polem FVE">{vstup("krokevRozpeti", { step: 0.1 })}</Pole>
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
                  {VRSTVY.map(x => (
                    <label key={x.id} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={(v.vrstvy || []).includes(x.id)}
                        onChange={(e) => setV(p => ({ ...p, vrstvy: e.target.checked ? [...(p.vrstvy || []), x.id] : (p.vrstvy || []).filter(y => y !== x.id) }))} />
                      {x.t} ({cislo(x.g)} kN/m²)
                    </label>
                  ))}
                </div>
              </div>
              <div style={S.karta}>
                <h3 style={S.h3}>Kotvení – střešní háky</h3>
                <div style={S.mrizka}>
                  <Pole label="Poloha pole na střeše">{vyber("zonaSikma", ZONY_SIKMA.map(x => [x.id, x.t]))}</Pole>
                  <Pole label="Rozteč háků na liště (m)">{vstup("hakRozestup", { step: 0.1 })}</Pole>
                  <Pole label="Únosnost háku – tlak Rd (kN)" napoveda="Návrhová únosnost podle výrobce háku pro danou krytinu">{vstup("hakTlakRd", { step: 0.1 })}</Pole>
                  <Pole label="Únosnost háku – tah Rd (kN)" napoveda="Návrhová únosnost včetně vrutů do krokve podle výrobce">{vstup("hakTahRd", { step: 0.1 })}</Pole>
                </div>
              </div>
            </>
          ) : (
            <div style={S.karta}>
              <h3 style={S.h3}>Zátěžový systém</h3>
              <div style={S.mrizka}>
                <Pole label="Sklon panelů (°)">{vstup("naklon")}</Pole>
                <Pole label="Rozteč řad (m)">{vstup("roztecRad", { step: 0.05 })}</Pole>
                <Pole label="Součinitel tření μ" napoveda="Podložka systému na krytině – údaj výrobce, obvykle 0,4–0,6">{vstup("treni", { step: 0.05 })}</Pole>
                <Pole label="Zátěžový prvek (kg/ks)" napoveda="Např. betonová dlažba 50×50×5 cm ≈ 28 kg">{vstup("zatezPrvekKg")}</Pole>
                <Pole label="Panelů v krajních řadách">{vstup("pocetOkraj")}</Pole>
                <Pole label="Součinitel k – vnitřní řady" napoveda="Krytí řadami před panelem; snižovat jen podle podkladů výrobce">{vstup("kStred", { step: 0.05 })}</Pole>
                <Pole label="Součinitel k – krajní řady">{vstup("kOkraj", { step: 0.05 })}</Pole>
                <Pole label="Rezerva únosnosti střechy (kN/m²)" napoveda="Od statika / z projektu: kolik střecha unese navíc k současnému zatížení">{vstup("rezerva", { step: 0.05, placeholder: "nezadáno" })}</Pole>
              </div>
            </div>
          )}

          <div style={S.karta}>
            <h3 style={S.h3}>Poznámka do protokolu</h3>
            <textarea style={{ ...S.pole, minHeight: 70, resize: "vertical" }} value={v.poznamka} onChange={nastav("poznamka")} placeholder="Např. stav krovu při obhlídce, zjištěné oslabení…" />
          </div>
        </div>

        <div style={{ flex: "1 1 340px", minWidth: 0, position: "sticky", top: 10 }}>
          <div style={S.karta}>
            <h3 style={S.h3}>Výsledek</h3>
            {sikma ? (
              <>
                <Verdikt ok={r.vyhovuje} text={
                  !r.predOk ? "Krokve nevyhovují už bez FVE – nutný posudek statika."
                    : r.vyhovuje ? `Krokve i háky vyhovují. Využití krokve vzroste o ${pr(r.narust)}.`
                      : !r.krokevOk ? "Krokve s FVE nevyhovují – zesílení nebo posudek statika." : "Háky nevyhovují – zhustit háky nebo silnější háky."} />
                <Vyuziti nazev="Krokev – ohyb (bez FVE)" u={r.pred.uM} />
                <Vyuziti nazev="Krokev – ohyb (s FVE)" u={r.po.uM} detail={`σ = ${cislo(r.po.sigma)} MPa, fm,d = ${cislo(r.fmd)} MPa`} />
                <Vyuziti nazev="Krokev – smyk (s FVE)" u={r.po.uV} />
                <Vyuziti nazev="Krokev – průhyb (informativně)" u={r.po.uW} detail={`${cislo(r.po.wFin, 1)} mm, limit L/200 = ${cislo(r.po.wLim, 1)} mm`} />
                <Vyuziti nazev="Hák – tah (sání větru)" u={r.hakyUTah} detail={`${cislo(Math.max(0, r.hakTah))} kN na hák`} />
                <Vyuziti nazev="Hák – tlak (sníh, vítr)" u={r.hakyUTlak} detail={`${cislo(r.hakTlak)} kN na hák, odhad ${r.pocetHaku} háků`} />
                <div style={{ ...S.maly, marginTop: 8, lineHeight: 1.6 }}>
                  Sníh na střeše s = {cislo(r.s)} kN/m² (μ1 = {cislo(r.mu1)}) · vítr qp = {cislo(r.vitr.qp, 3)} kN/m²<br />
                  cpe tlak / sání = {cislo(r.cp.tlak)} / {cislo(r.cp.sani)} · FVE g = {cislo(r.gFve, 3)} kN/m² · střecha g = {cislo(r.gStrecha, 3)} kN/m²
                </div>
              </>
            ) : (
              <>
                <Verdikt ok={r.vyhovuje} text={r.rezerva == null
                  ? `Přitížení až ${cislo(r.maxPritizeni)} kN/m² – zadejte rezervu únosnosti střechy.`
                  : r.vyhovuje ? `Přitížení ${cislo(r.maxPritizeni)} kN/m² ≤ rezerva ${cislo(r.rezerva)} kN/m².` : `Přitížení ${cislo(r.maxPritizeni)} kN/m² > rezerva ${cislo(r.rezerva)} kN/m².`} />
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr><th style={ui.th}></th><th style={{ ...ui.th, textAlign: "right" }}>Vnitřní</th><th style={{ ...ui.th, textAlign: "right" }}>Krajní</th></tr></thead>
                  <tbody>
                    {[
                      ["Zátěž na panel", (x) => `${x.kusy} × ${cislo(r.prvek, 0)} kg`],
                      ["", (x) => `${cislo(x.balastKg, 0)} kg`],
                      ["Rozhoduje", (x) => x.rozhoduje],
                      ["Přitížení střechy", (x) => `${cislo(x.pritizeni)} kN/m²`],
                    ].map(([n, f], i) => (
                      <tr key={i}><td style={ui.td}>{n}</td><td style={{ ...ui.td, textAlign: "right", color: ui.barvy.text }}>{f(r.stred)}</td><td style={{ ...ui.td, textAlign: "right", color: ui.barvy.text }}>{r.pocetOkraj ? f(r.okraj) : "–"}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ ...S.maly, marginTop: 10, lineHeight: 1.6 }}>
                  Zátěž celkem <b>{cislo(r.balastCelkemKg, 0)} kg</b>, FVE se zátěží {cislo(r.hmotnostCelkemKg, 0)} kg<br />
                  vítr qp = {cislo(r.vitr.qp, 3)} kN/m² · cf sání / tlak = {cislo(r.cf.min)} / {cislo(r.cf.max)} · sníh s = {cislo(r.s)} kN/m²<br />
                  Zátěž je na straně bezpečnosti; s větrnými zkouškami výrobce systému bývá nižší.
                </div>
              </>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              <button style={S.btn(ui.barvy.akcent)} disabled={generuji} onClick={() => pdf(false)}><i className="ti ti-file-type-pdf" /> {generuji ? "Vytvářím…" : "Protokol PDF"}</button>
              <button style={S.btn(ui.barvy.primarni)} disabled={generuji || !v.contractId} onClick={() => pdf(true)}
                title={v.contractId ? "Uložit protokol do Dokumentů zakázky" : "Nejdřív vyberte zakázku"}><i className="ti ti-folder-up" /> Uložit do zakázky</button>
            </div>
          </div>
          <div style={{ ...S.maly, padding: "0 4px", lineHeight: 1.5 }}>
            Orientační posouzení – nenahrazuje statický posudek autorizované osoby. Předpokládá krov bez poruch; při pochybnostech o stavu konstrukce nebo nevyhovujícím výsledku přizvěte statika.
          </div>
        </div>
      </div>
    </div>
  );
}
