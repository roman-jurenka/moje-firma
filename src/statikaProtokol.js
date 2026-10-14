// ─── PDF protokol zjednodušeného statického posouzení FVE ────────────────────
// Stránky jako HTML → ulozPdf (html2canvas + jsPDF) z montážní dokumentace.

import { COMPANY } from "./invoicingUtils.js";
import { ulozPdf } from "./montazniDokumentace.js";
import { EXPOZICE, TERENY, ZONY_SIKMA, KMOD, GAMMA_M, KDEF } from "./statikaFve.js";

const cislo = (x, d = 2) => Number(x || 0).toLocaleString("cs-CZ", { minimumFractionDigits: d, maximumFractionDigits: d });
const pr = (x) => `${cislo(100 * x, 0)} %`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const vysl = (ok) => (ok == null ? `<span>neposouzeno</span>` : `<span class="${ok ? "ok" : "ne"}">${ok ? "VYHOVUJE" : "NEVYHOVUJE"}</span>`);
export const nazevSouboruPosudku = (v) => `Staticke_posouzeni_FVE_${(v.nazev || v.zakaznik || "posudek").replace(/[^\p{L}\p{N}_-]+/gu, "_")}.pdf`;

export async function vytvorProtokolStatiky({ vstupy: v, vysledek: r, zpracoval, stahnout = true }) {
  const datum = new Date().toLocaleDateString("cs-CZ");
  const strany = [];
  const hlava = (nazev) => `<div class="hl"><div><b>${esc(COMPANY.name)}</b><br><span>${esc(COMPANY.addressLine)}, ${esc(COMPANY.city)} · IČO ${esc(COMPANY.ico)}</span></div><div style="text-align:right"><b>${esc(nazev)}</b><br><span>${esc(v.nazev)}${v.zakaznik ? " · " + esc(v.zakaznik) : ""}</span></div></div>`;
  const pata = () => `<div class="pata"><span>Zjednodušené statické posouzení FVE · ${esc(v.nazev || v.zakaznik)}</span><span>${datum} · strana {S}/{N}</span></div>`;
  const stranka = (nazev, obsah) => strany.push(`<div class="str">${hlava(nazev)}${obsah}${pata()}</div>`);
  const radek = (nazev, ozn, hodn, zdroj = "") => `<tr><td>${nazev}</td><td>${ozn}</td><td class="r">${hodn}</td><td>${zdroj}</td></tr>`;
  const sikma = v.typ !== "plocha";
  const T = TERENY.find(x => x.id === v.teren);
  const w = r.vitr;

  const zatizeni = `
    <h3>Zatížení sněhem a větrem</h3>
    <table><thead><tr><th>Parametr</th><th>Označení</th><th class="r">Hodnota</th><th>Zdroj</th></tr></thead><tbody>
      ${radek(`Sněhová oblast ${esc(v.snehOblast)}`, "s<sub>k</sub>", `${cislo(r.sk)} kN/m²`, "ČSN EN 1991-1-3, NA")}
      ${radek(`Expozice – ${esc((EXPOZICE.find(x => x.k === Number(v.ce)) || {}).t || "")}`, "C<sub>e</sub>", cislo(r.ce, 1), "tab. 5.1")}
      ${sikma ? radek(`Tvarový součinitel pro sklon ${cislo(r.sklon, 0)}°`, "μ<sub>1</sub>", cislo(r.mu1), "tab. 5.2") : radek("Tvarový součinitel (plochá střecha)", "μ<sub>1</sub>", "0,80", "tab. 5.2")}
      ${radek("Zatížení sněhem na střeše s = μ<sub>1</sub>·C<sub>e</sub>·C<sub>t</sub>·s<sub>k</sub>", "s", `${cislo(r.s)} kN/m²`, "(5.1)")}
      ${radek(`Větrná oblast ${esc(v.vitrOblast)}`, "v<sub>b,0</sub>", `${cislo(r.vb, 1)} m/s`, "ČSN EN 1991-1-4, NA")}
      ${radek(`Kategorie terénu ${esc(T?.t || v.teren)}`, "z<sub>0</sub>; k<sub>r</sub>", `${cislo(w.z0, 2)} m; ${cislo(w.kr, 3)}`, "tab. 4.1, (4.5)")}
      ${radek("Referenční výška", "z", `${cislo(w.z, 1)} m`, "")}
      ${radek("Střední rychlost větru v<sub>m</sub> = c<sub>r</sub>·c<sub>o</sub>·v<sub>b</sub>", "v<sub>m</sub>", `${cislo(w.vm, 1)} m/s`, "(4.3)")}
      ${radek("Intenzita turbulence", "I<sub>v</sub>", cislo(w.Iv, 3), "(4.7)")}
      ${radek("Maximální dynamický tlak q<sub>p</sub> = (1 + 7·I<sub>v</sub>)·½·ρ·v<sub>m</sub>²", "q<sub>p</sub>(z)", `${cislo(w.qp, 3)} kN/m²`, "(4.8)")}
    </tbody></table>`;

  const uvod = `
    <h1>Zjednodušené statické posouzení</h1>
    <div style="font-size:14px;margin-bottom:10px">Fotovoltaická elektrárna na ${sikma ? "šikmé střeše (kotvení střešními háky)" : "ploché střeše (zátěžový systém)"}</div>
    <table style="margin-bottom:6px"><tbody>
      <tr><th style="width:30%">Objekt / zakázka</th><td>${esc(v.nazev)}</td></tr>
      <tr><th>Investor</th><td>${esc(v.zakaznik)}</td></tr>
      <tr><th>Adresa</th><td>${esc(v.adresa)}</td></tr>
      <tr><th>Zpracovatel / datum</th><td>${esc(COMPANY.name)}${zpracoval ? ", " + esc(zpracoval) : ""} · ${datum}</td></tr>
      <tr><th>FVE</th><td>${r.pocet} ks panelů ${cislo(v.panelDelka, 3)} × ${cislo(v.panelSirka, 3)} m (${cislo(r.Ap)} m²), ${cislo(v.panelHmotnost, 1)} kg/ks, celkem ${cislo(r.pocet * r.Ap, 1)} m²</td></tr>
    </tbody></table>`;

  const zaver = (ok, text) => `
    <h3>Závěr</h3>
    <div style="font-size:13px;line-height:1.5;border:2px solid ${ok == null ? "#94a3b8" : ok ? "#15803d" : "#b91c1c"};padding:8px 10px;border-radius:4px">${text}</div>
    ${v.poznamka ? `<h3>Poznámka</h3><div style="font-size:12px;white-space:pre-wrap">${esc(v.poznamka)}</div>` : ""}
    <div style="font-size:10px;color:#475569;margin-top:10px">Jde o orientační posouzení podle ČSN EN 1990, ČSN EN 1991-1-3, ČSN EN 1991-1-4 a ČSN EN 1995-1-1 se zjednodušujícími předpoklady uvedenými výše. Předpokládá se nosná konstrukce bez poruch (hniloba, poškození škůdci, oslabení zásahy) a správné provedení podle montážního návodu výrobce. Posouzení nenahrazuje statický posudek autorizovaného inženýra; při nevyhovujícím výsledku, nejasném stavu konstrukce nebo u veřejných a průmyslových budov je nutné jej zajistit.</div>
    <table style="margin-top:24px"><tbody>
      <tr><th style="width:50%">Zpracoval</th><th>Podpis</th></tr>
      <tr><td style="height:56px">${esc(COMPANY.name)}${zpracoval ? "<br>" + esc(zpracoval) : ""}<br>${datum}</td><td></td></tr>
    </tbody></table>`;

  if (sikma) {
    const d = r.drevo;
    stranka("Statické posouzení FVE", `${uvod}
      <h3>Střecha a krokve</h3>
      <table><tbody>
        <tr><th style="width:30%">Sklon / krytina</th><td>${cislo(r.sklon, 0)}° · ${esc(r.krytina.t)}${r.vrstvy.length ? " + " + r.vrstvy.map(x => esc(x.t.toLowerCase())).join(", ") : ""}</td></tr>
        <tr><th>Krokev</th><td>${cislo(v.krokevB, 0)} × ${cislo(v.krokevH, 0)} mm, ${esc(d.t)}, rozteč ${cislo(v.krokevRozestup)} m, rozpětí mezi podporami ${cislo(v.krokevRozpeti)} m (vodorovně) = ${cislo(r.Ls)} m po spádu</td></tr>
        <tr><th>Poloha pole</th><td>${esc((ZONY_SIKMA.find(x => x.id === v.zonaSikma) || {}).t || "")}</td></tr>
        <tr><th>Kotvení</th><td>střešní háky po ${cislo(v.hakRozestup)} m, únosnost (návrhová, dle výrobce) tlak ${cislo(r.tlakRd)} kN / tah ${cislo(r.tahRd)} kN</td></tr>
      </tbody></table>
      ${zatizeni}
      <h3>Stálá zatížení a vítr na střechu</h3>
      <table><thead><tr><th>Parametr</th><th>Označení</th><th class="r">Hodnota</th><th>Zdroj</th></tr></thead><tbody>
        ${radek(`Krytina a vrstvy včetně krokví (${cislo(r.gKrokev, 3)} kN/m²)`, "g<sub>k</sub>", `${cislo(r.gStrecha, 3)} kN/m²`, "ČSN EN 1991-1-1")}
        ${radek(`FVE – panely ${cislo(v.panelHmotnost / (r.Ap || 1), 1)} kg/m² + konstrukce ${cislo(v.konstrukceKgM2, 1)} kg/m²`, "g<sub>FVE</sub>", `${cislo(r.gFve, 3)} kN/m²`, "výrobce")}
        ${radek("Součinitel vnějšího tlaku – tlak / sání", "c<sub>pe,10</sub>", `${cislo(r.cp.tlak)} / ${cislo(r.cp.sani)}`, "tab. 7.4a, 7.4b")}
        ${radek("Vítr – tlak / sání w = c<sub>pe</sub>·q<sub>p</sub>", "w<sub>e</sub>", `${cislo(r.wTlak, 3)} / ${cislo(r.wSani, 3)} kN/m²`, "(5.1)")}
      </tbody></table>
    `);
    const sl = (x) => `
      <tr><td>Zatížení kolmo na krokev – stálé / sníh / vítr</td><td class="r">${cislo(x.gp, 3)} / ${cislo(x.sp, 3)} / ${cislo(x.wp, 3)} kN/m</td></tr>
      <tr><td>q<sub>d</sub> = max(1,35g + 1,5s + 1,5·0,6w; 1,35g + 1,5w + 1,5·0,5s)</td><td class="r">${cislo(x.qd, 3)} kN/m</td></tr>
      <tr><td>M<sub>d</sub> = q<sub>d</sub>·L²/8 · V<sub>d</sub> = q<sub>d</sub>·L/2</td><td class="r">${cislo(x.M)} kNm · ${cislo(x.V)} kN</td></tr>
      <tr><td>Ohyb σ<sub>m,d</sub> = M<sub>d</sub>/W ≤ f<sub>m,d</sub></td><td class="r">${cislo(x.sigma)} / ${cislo(r.fmd)} MPa = <b class="${x.uM <= 1 ? "ok" : "ne"}">${pr(x.uM)}</b></td></tr>
      <tr><td>Smyk τ<sub>d</sub> = 1,5·V<sub>d</sub>/(k<sub>cr</sub>·b·h) ≤ f<sub>v,d</sub></td><td class="r">${cislo(x.tau)} / ${cislo(r.fvd)} MPa = <b class="${x.uV <= 1 ? "ok" : "ne"}">${pr(x.uV)}</b></td></tr>
      <tr><td>Průhyb w<sub>fin</sub> = w<sub>G</sub>·(1 + k<sub>def</sub>) + w<sub>S</sub> ≤ L/200 (informativně)</td><td class="r">${cislo(x.wFin, 1)} / ${cislo(x.wLim, 1)} mm = ${pr(x.uW)}</td></tr>`;
    stranka("Posouzení krokve a háků", `
      <h2>Posouzení krokve</h2>
      <div style="font-size:11px;margin-bottom:6px">Krokev jako prostý nosník o rozpětí L = ${cislo(r.Ls)} m (po spádu), průřez W = ${cislo(r.W / 1e3, 0)}·10³ mm³, I = ${cislo(r.I / 1e6, 1)}·10⁶ mm⁴.
        f<sub>m,d</sub> = k<sub>mod</sub>·k<sub>h</sub>·f<sub>m,k</sub>/γ<sub>M</sub> = ${cislo(KMOD, 1)}·${cislo(r.kh)}·${d.fmk}/${cislo(GAMMA_M, 1)} = ${cislo(r.fmd)} MPa; f<sub>v,d</sub> = ${cislo(KMOD, 1)}·${cislo(d.fvk, 1)}/${cislo(GAMMA_M, 1)} = ${cislo(r.fvd)} MPa; E<sub>0,mean</sub> = ${d.E} MPa; k<sub>def</sub> = ${cislo(KDEF, 1)}.
        Osová síla v krokvi se zanedbává (vaznicová soustava).</div>
      <h3>Původní stav (bez FVE)</h3>
      <table><tbody>${sl(r.pred)}</tbody></table>
      <h3>Stav po montáži FVE</h3>
      <table><tbody>${sl(r.po)}</tbody></table>
      <div style="font-size:12px;margin-top:6px">Nárůst využití krokve v ohybu montáží FVE: <b>${pr(r.narust)}</b>. Krokev s FVE: ${vysl(r.krokevOk)}</div>
      <h2 style="margin-top:14px">Posouzení střešních háků</h2>
      <table><tbody>
        <tr><td style="width:62%">Zatěžovací plocha háku A = ${cislo(v.hakRozestup)} m × ${cislo(r.sirkaListy, 3)} m</td><td class="r">${cislo(r.Ah, 3)} m²</td></tr>
        <tr><td>Tah (sání): F = (1,5·|w<sub>sání</sub>| − 1,0·g<sub>FVE</sub>·cos α)·A ≤ R<sub>d,tah</sub></td><td class="r">${cislo(Math.max(0, r.hakTah))} / ${cislo(r.tahRd)} kN = <b class="${r.hakyUTah <= 1 ? "ok" : "ne"}">${pr(r.hakyUTah)}</b></td></tr>
        <tr><td>Tlak: F = max(1,35g<sub>FVE</sub>cos α + 1,5s cos²α + 0,9w; 1,35g<sub>FVE</sub>cos α + 1,5w + 0,75s cos²α)·A ≤ R<sub>d,tlak</sub></td><td class="r">${cislo(r.hakTlak)} / ${cislo(r.tlakRd)} kN = <b class="${r.hakyUTlak <= 1 ? "ok" : "ne"}">${pr(r.hakyUTlak)}</b></td></tr>
        <tr><td>Síla ve směru spádu (informativně)</td><td class="r">${cislo(r.hakSpad)} kN</td></tr>
        <tr><td>Odhadovaný počet háků</td><td class="r">${r.pocetHaku} ks</td></tr>
      </tbody></table>
      <div style="font-size:12px;margin-top:6px">Háky: ${vysl(r.hakyOk)}. Únosnost háku zahrnuje i ukotvení vruty do krokve podle údajů výrobce.</div>
      ${zaver(r.vyhovuje, `${!r.predOk ? "<b class='ne'>Krokve nevyhovují už v původním stavu bez FVE</b> – nutný statický posudek autorizované osoby. " : ""}
        Krokve po montáži FVE ${r.krokevOk ? "vyhovují" : "<b>nevyhovují</b>"} (ohyb ${pr(r.po.uM)}, smyk ${pr(r.po.uV)}), střešní háky ${r.hakyOk ? "vyhovují" : "<b>nevyhovují</b>"} (tah ${pr(r.hakyUTah)}, tlak ${pr(r.hakyUTlak)}).
        Celkově: <b>${vysl(r.vyhovuje)}</b>${r.vyhovuje ? "" : r.krokevOk ? " – zhustit háky nebo použít háky s vyšší únosností." : " – nutné zesílení krokví nebo statický posudek."}`)}
    `);
  } else {
    const z = (x, nazev) => `
      <tr><th colspan="2">${nazev} (k = ${cislo(x.k)})</th></tr>
      <tr><td style="width:62%">Sání / tlak na panel F = c<sub>f</sub>·k·q<sub>p</sub>·A</td><td class="r">${cislo(x.Fup)} / ${cislo(x.Fdn)} kN</td></tr>
      <tr><td>Potřebná zátěž – nadzvednutí: 0,9·(G<sub>0</sub> + B) ≥ 1,5·F<sub>sání</sub>·cos β</td><td class="r">${cislo(x.bNadzv / 9.81 * 1000, 0)} kg</td></tr>
      <tr><td>Potřebná zátěž – posun (sání): 1,5·F·sin β ≤ μ·(0,9·(G<sub>0</sub> + B) − 1,5·F·cos β)</td><td class="r">${cislo(x.bPosunSani / 9.81 * 1000, 0)} kg</td></tr>
      <tr><td>Potřebná zátěž – posun (tlak)</td><td class="r">${cislo(x.bPosunTlak / 9.81 * 1000, 0)} kg</td></tr>
      <tr><td>Rozhoduje: ${x.rozhoduje} → zátěž na panel</td><td class="r"><b>${x.kusy} ks × ${cislo(r.prvek, 0)} kg = ${cislo(x.balastKg, 0)} kg</b></td></tr>
      <tr><td>Celková hmotnost na panel · přitížení střechy</td><td class="r">${cislo(x.celkemKg, 0)} kg · <b>${cislo(x.pritizeni)} kN/m²</b></td></tr>`;
    stranka("Statické posouzení FVE", `${uvod}
      <h3>Zátěžový systém</h3>
      <table><tbody>
        <tr><th style="width:30%">Sklon panelů</th><td>${cislo(r.naklon, 0)}°, rozteč řad ${cislo(v.roztecRad)} m, půdorys na panel ${cislo(r.pudorys)} m²</td></tr>
        <tr><th>Vlastní tíha na panel</th><td>panel ${cislo(v.panelHmotnost, 1)} kg + konstrukce ${cislo(v.konstrukceKgPanel, 1)} kg = G<sub>0</sub> = ${cislo(r.G0)} kN</td></tr>
        <tr><th>Tření na střešní krytině</th><td>μ = ${cislo(r.mu)} (podle podložky a krytiny, údaj výrobce)</td></tr>
        <tr><th>Zátěžový prvek</th><td>${cislo(r.prvek, 0)} kg/ks</td></tr>
        <tr><th>Panely v krajních řadách</th><td>${r.pocetOkraj} z ${r.pocet} ks</td></tr>
      </tbody></table>
      ${zatizeni}
    `);
    stranka("Výpočet zátěže", `
      <h2>Výpočet potřebné zátěže</h2>
      <div style="font-size:11px;margin-bottom:6px">Součinitele síly na panel podle ČSN EN 1991-1-4 tab. 7.6 (pultová volně stojící střecha, φ = 0) pro sklon ${cislo(r.naklon, 0)}°:
        c<sub>f,sání</sub> = ${cislo(r.cf.min)}, c<sub>f,tlak</sub> = ${cislo(r.cf.max)}. Součinitel polohy k zohledňuje krytí vnitřních řad řadami před nimi (zjednodušení).
        Příznivě působící vlastní tíha γ<sub>G</sub> = 0,9, vítr γ<sub>Q</sub> = 1,5.</div>
      <table><tbody>${z(r.stred, "Vnitřní řady")}${r.pocetOkraj ? z(r.okraj, "Krajní řady a okrajové pásy") : ""}</tbody></table>
      <h3>Souhrn</h3>
      <table><tbody>
        <tr><td style="width:62%">Zátěž celkem</td><td class="r"><b>${cislo(r.balastCelkemKg, 0)} kg</b></td></tr>
        <tr><td>Hmotnost FVE se zátěží celkem</td><td class="r">${cislo(r.hmotnostCelkemKg, 0)} kg</td></tr>
        <tr><td>Průměrné / maximální přitížení střechy pod polem</td><td class="r">${cislo(r.prumer)} / <b>${cislo(r.maxPritizeni)} kN/m²</b></td></tr>
        <tr><td>Rezerva únosnosti střechy (zadaná)</td><td class="r">${r.rezerva == null ? "nezadána" : cislo(r.rezerva) + " kN/m²"}</td></tr>
        <tr><td>Zatížení sněhem (informativně, bez návějí u panelů)</td><td class="r">${cislo(r.s)} kN/m²</td></tr>
      </tbody></table>
      ${zaver(r.vyhovuje, r.rezerva == null
        ? `Potřebná zátěž je ${cislo(r.stred.balastKg, 0)} kg na panel ve vnitřních řadách${r.pocetOkraj ? ` a ${cislo(r.okraj.balastKg, 0)} kg v krajních řadách` : ""}, přitížení střechy až <b>${cislo(r.maxPritizeni)} kN/m²</b>. <b>Rezerva únosnosti střechy nebyla zadána – přitížení je nutné porovnat s únosností nosné konstrukce střechy (statik / projektová dokumentace).</b>`
        : `Přitížení střechy až <b>${cislo(r.maxPritizeni)} kN/m²</b> ${r.vyhovuje ? "nepřekračuje" : "<b>překračuje</b>"} zadanou rezervu únosnosti ${cislo(r.rezerva)} kN/m². Celkově: <b>${vysl(r.vyhovuje)}</b>${r.vyhovuje ? "" : " – snížit zátěž (systém s deflektory, kotvení do konstrukce) nebo posoudit střechu statikem."}`)}
      <div style="font-size:10px;color:#475569;margin-top:6px">Zátěž je třeba rozmístit podle kladečského plánu výrobce systému; při použití hodnot výrobce ze zkoušek ve větrném tunelu lze zátěž snížit. Lokální namáhání tepelné izolace pod podložkami a odvodnění střechy se posuzují samostatně.</div>
    `);
  }
  return ulozPdf(strany, nazevSouboruPosudku(v), { stahnout });
}
