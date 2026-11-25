// ─── Pohledy oddělení: Obchod · Back office · Realizace ─────────────────────
// Samostatné položky v menu nad stejnými daty jako Průběh zakázek (ten zůstává
// celkovým pohledem). Řádky jsou tabulka se sloupci vedle sebe, klik otevře
// práci se zakázkou: zápis poznámky (datum · iniciály · text · termín), rychlé
// akce a historii. Veškeré zápisy dělá Průběh (prop „akce“), tady je jen pohled.
import { useMemo, useState } from "react";
import { FAZE, fazeById, fazePlati, nazevFaze, ukolyPro, ukolHotovy, ZDROJE, zdrojById } from "./prubehFaze.js";
import { soubezne, stavOddeleni, aktivni, pohledOdd, oddeleniById, CEKA } from "./oddeleniZakazky.js";
import { konecnaCenaNabidky } from "./slevaNabidky.js";
import { bezDiakritiky } from "./hledani.js";
import { sekceProTyp, moznostiPole, predvyplnitZNabidky } from "./podkladyZakazky.js";
import { specifikaceZNabidky } from "./dokumentyZakazky.js";

// ── drobnosti ──
const inicialy = (jmeno) => {
  const s = String(jmeno || "").trim();
  if (!s) return "?";
  if (s === "Systém") return "—";
  return s.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
};
const kratce = (iso) => { if (!iso) return ""; const [, m, d] = String(iso).slice(0, 10).split("-"); return `${+d}.${+m}.`; };
const DNY = ["ne", "po", "út", "st", "čt", "pá", "so"];
const sDnem = (iso) => `${DNY[new Date(iso + "T00:00:00").getDay()]} ${kratce(iso)}`;
const tis = (v) => `${Math.round(v / 1000).toLocaleString("cs-CZ")}`;
const datumPozn = (p) => p.datum || String(p.created_at || "").slice(0, 10);
const seraditPozn = (a, b) => datumPozn(b).localeCompare(datumPozn(a)) || String(b.created_at || "").localeCompare(String(a.created_at || ""));

const C = {
  text: "#0f172a", sub: "#475569", mu: "#94a3b8", line: "#e2e8f0", bg: "#f8fafc",
  red: "#b91c1c", redBg: "#fee2e2", org: "#c2410c", orgBg: "#ffedd5",
};
const btnS = (hl, barva = "#0369a1") => ({
  border: `1px solid ${hl ? barva : "#cbd5e1"}`, background: hl ? barva : "#fff", color: hl ? "#fff" : "#334155",
  borderRadius: 8, padding: "6px 11px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
});
const inpS = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", minWidth: 0, background: "#fff", color: C.text };
const CSS = `
.po-g{display:grid;gap:10px;align-items:center;padding:8px 14px;font-size:13px}
.po-ob{grid-template-columns:minmax(0,1.5fr) 44px 104px 92px 112px minmax(0,2.3fr) 108px}
.po-od{grid-template-columns:minmax(0,1.5fr) 44px minmax(0,1.4fr) 40px minmax(0,2.2fr) 108px}
.po-th{font-size:11px;color:${C.sub};font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding-top:6px;padding-bottom:6px;border-bottom:1px solid ${C.line}}
.po-r{border-top:1px solid #f1f5f9;cursor:pointer}.po-r:hover{background:${C.bg}}
.po-ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.po-det{display:grid;grid-template-columns:250px minmax(0,1fr);gap:16px;padding:14px;background:${C.bg};border-top:1px solid ${C.line}}
.po-frm{display:grid;grid-template-columns:132px 44px minmax(0,1fr) 140px auto;gap:6px;align-items:center}
.po-tyden{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
@media(max-width:860px){
  .po-ob,.po-od{grid-template-columns:minmax(0,1fr) auto auto}
  .po-ob>:nth-child(2),.po-ob>:nth-child(3),.po-ob>:nth-child(4),.po-od>:nth-child(2),.po-od>:nth-child(4){display:none}
  .po-ob>:nth-child(6),.po-od>:nth-child(5),.po-od>:nth-child(3){grid-column:1/-1}
  .po-th{display:none}
  .po-det{grid-template-columns:1fr}
  .po-frm{grid-template-columns:1fr 44px}.po-frm>.po-txt{grid-column:1/-1}
  .po-tyden{grid-template-columns:repeat(2,minmax(0,1fr))}
}`;

export function Termin({ iso, dnes, prazdne = "bez termínu" }) {
  if (!iso) return <span style={{ fontSize: 12, color: C.mu }}>{prazdne}</span>;
  if (iso < dnes) {
    const dni = Math.round((new Date(dnes) - new Date(iso)) / 864e5);
    return (
      <span title={`Po termínu ${dni} ${dni === 1 ? "den" : dni < 5 ? "dny" : "dní"}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.redBg, color: C.red, fontWeight: 700, fontSize: 12, borderRadius: 7, padding: "2px 8px", whiteSpace: "nowrap" }}>
        <span aria-hidden="true" style={{ width: 15, height: 15, borderRadius: "50%", background: C.red, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>!</span>
        {sDnem(iso)}<span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}> (po termínu)</span>
      </span>
    );
  }
  if (iso === dnes) return <span style={{ background: C.orgBg, color: C.org, fontWeight: 700, fontSize: 12, borderRadius: 7, padding: "2px 8px", whiteSpace: "nowrap" }}>⏰ dnes</span>;
  return <span style={{ fontSize: 12, color: C.sub, whiteSpace: "nowrap" }}>{sDnem(iso)}</span>;
}
const pruhTerminu = (iso, dnes) => (!iso ? "none" : iso < dnes ? `inset 3px 0 0 ${C.red}` : iso === dnes ? "inset 3px 0 0 #f97316" : "none");

function Poznamka({ p, ja }) {
  return (
    <span style={{ color: p.system ? C.mu : C.text, fontSize: p.system ? 12 : 13 }}>
      <span style={{ color: C.sub, fontVariantNumeric: "tabular-nums" }}>{kratce(datumPozn(p))}</span>{" "}
      <b title={p.kdo || ""} style={{ fontWeight: 700, color: p.kdo === ja ? "#0369a1" : undefined }}>{inicialy(p.kdo)}</b> – {p.text}
    </span>
  );
}

function Historie({ pozn, ja }) {
  if (!pozn.length) return <div style={{ fontSize: 12, color: C.mu, marginTop: 10 }}>Zatím žádné poznámky.</div>;
  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${C.line}`, paddingTop: 4, maxHeight: 320, overflowY: "auto" }}>
      {pozn.map((p) => <div key={p.id} style={{ padding: "4px 0", borderBottom: "1px dashed #e2e8f0", lineHeight: 1.4 }}><Poznamka p={p} ja={ja} /></div>)}
    </div>
  );
}

// Řádek pro zápis poznámky: datum zápisu (volí zapisovatel) · iniciály · text · termín dalšího kroku.
function ZapisPoznamky({ ja, dnes, termin, onZapsat, idPrefix, placeholder }) {
  const [datum, setDatum] = useState(dnes);
  const [text, setText] = useState("");
  // Prošlý termín se nenabízí — předvyplní se nejbližší pracovní den.
  const [ter, setTer] = useState(() => {
    if (termin && termin >= dnes) return termin;
    const d = new Date(dnes + "T00:00:00");
    do d.setDate(d.getDate() + 1); while (d.getDay() % 6 === 0);
    return d.toLocaleDateString("sv-SE");
  });
  const [ukladam, setUkladam] = useState(false);
  const zapsat = async () => {
    if (!text.trim() || ukladam) return;
    setUkladam(true);
    const ok = await onZapsat({ text: text.trim(), datum: datum || dnes, termin: ter || null });
    setUkladam(false);
    if (ok !== false) setText("");
  };
  return (
    <div>
      <div className="po-frm">
        <input type="date" aria-label="Datum zápisu" title="Datum zápisu" style={inpS} value={datum} max={dnes} onChange={(e) => setDatum(e.target.value)} />
        <span title={ja} style={{ textAlign: "center", fontWeight: 700, background: "#f1f5f9", borderRadius: 8, padding: "6px 0", fontSize: 13 }}>{inicialy(ja)}</span>
        <input id={`${idPrefix}-txt`} className="po-txt" autoFocus aria-label="Obsah poznámky" style={inpS} value={text} placeholder={placeholder || "co se stalo, např. klient volán, nezvedá telefon, poslán e-mail"}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") zapsat(); }} />
        <input type="date" aria-label="Termín dalšího kroku" title="Termín dalšího kroku" style={inpS} value={ter} onChange={(e) => setTer(e.target.value)} />
        <button type="button" style={btnS(true)} disabled={!text.trim() || ukladam} onClick={zapsat}>{ukladam ? "…" : "Zapsat"}</button>
      </div>
      <div style={{ fontSize: 11, color: C.mu, marginTop: 3 }}>datum zápisu · iniciály · poznámka · termín dalšího kroku · Enter = zapsat</div>
    </div>
  );
}

function KartaKontaktu({ z, zakaznik, children }) {
  const c = zakaznik(z.customer_id) || {};
  const tel = z.misto_telefon || c.phone;
  const adresa = z.misto_adresa || c.address;
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 1.7, alignSelf: "start" }}>
      <div style={{ fontWeight: 700 }}>{c.name || z.nazev}</div>
      {z.misto_kontakt && z.misto_kontakt !== c.name && <div style={{ color: C.sub }}>kontakt: {z.misto_kontakt}</div>}
      {tel && <div>📞 <a href={`tel:${String(tel).replace(/\s/g, "")}`} style={{ color: "#0369a1", fontWeight: 600 }}>{tel}</a></div>}
      {c.email && <div className="po-ell">✉️ <a href={`mailto:${c.email}`} style={{ color: "#0369a1" }}>{c.email}</a></div>}
      {adresa && <div className="po-ell" title={adresa}>📍 <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresa)}`} target="_blank" rel="noreferrer" style={{ color: "#0369a1" }}>{adresa}</a></div>}
      {children}
    </div>
  );
}

function Hlavicka({ jmeno, barva, pocet, doplnek, poTerminu, dnes }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#f1f5f9", flexWrap: "wrap" }}>
      <span style={{ width: 30, height: 30, borderRadius: "50%", background: barva, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{inicialy(jmeno)}</span>
      <b style={{ fontSize: 15 }}>{jmeno}</b>
      <span style={{ fontSize: 12, color: C.sub }}>{pocet}{doplnek ? ` · ${doplnek}` : ""}</span>
      <span style={{ flex: 1 }} />
      {poTerminu > 0 && <span style={{ background: C.redBg, color: C.red, fontWeight: 700, fontSize: 12, borderRadius: 7, padding: "2px 8px" }}>! {poTerminu} po termínu</span>}
      {dnes > 0 && <span style={{ background: C.orgBg, color: C.org, fontWeight: 700, fontSize: 12, borderRadius: 7, padding: "2px 8px" }}>{dnes} dnes</span>}
    </div>
  );
}

const chip = (aktivni, barva) => ({ ...btnS(aktivni, barva), borderRadius: 999, padding: "5px 12px" });
const ulozene = (klic, vychozi) => { try { return localStorage.getItem(klic) || vychozi; } catch { return vychozi; } };
const ulozit = (klic, v) => { try { localStorage.setItem(klic, v); } catch { /* bez úložiště */ } };

// ═══ OBCHOD ═══════════════════════════════════════════════════════════════
const cenaNabidky = (q) => konecnaCenaNabidky(q?.data).bez || 0;
// Hodnota obchodu z propojené nabídky: schválená verze, jinak rozpětí otevřených verzí.
function hodnotaObchodu(z, quotes) {
  const q = z.quote_id ? quotes.find((x) => x.id === z.quote_id) : null;
  if (q) {
    const koren = q.verze_od || q.id;
    const skupina = quotes.filter((x) => (x.verze_od || x.id) === koren).sort((a, b) => (a.verze || 1) - (b.verze || 1));
    const schv = skupina.find((x) => x.status === "Schváleno");
    const varianty = schv ? [schv] : (skupina.filter((x) => x.status !== "Zamítnuto").length ? skupina.filter((x) => x.status !== "Zamítnuto") : [q]);
    const ceny = varianty.map(cenaNabidky).filter((v) => v > 0);
    const korenQ = quotes.find((x) => x.id === koren) || q;
    return { q, korenQ, skupina, varianty, schvalena: !!schv, min: ceny.length ? Math.min(...ceny) : 0, max: ceny.length ? Math.max(...ceny) : 0 };
  }
  if (Number(z.hodnota) > 0) return { odhad: true, min: Number(z.hodnota), max: Number(z.hodnota) };
  return null;
}

function BunkaHodnoty({ h, onNacenit }) {
  if (!h) return <button type="button" style={{ ...btnS(false), padding: "3px 9px", fontSize: 12 }} onClick={(e) => { e.stopPropagation(); onNacenit(); }}>Nacenit ↗</button>;
  if (h.odhad) return <span title="Odhad — zatím bez nabídky"><span style={{ color: C.sub }}>~{tis(h.min)} tis.</span><div style={{ fontSize: 11, color: C.mu }}>odhad</div></span>;
  const txt = !h.max ? "—" : h.min === h.max ? `${tis(h.min)} tis.` : `${tis(h.min)}–${tis(h.max)} tis.`;
  return (
    <span title="bez DPH, z nabídky">
      <b style={{ fontWeight: 700 }}>{txt}</b>
      <div style={{ fontSize: 11, color: C.mu }} className="po-ell">{h.korenQ?.cislo || h.q.name}{h.varianty.length > 1 ? ` · ${h.varianty.length} var.` : h.schvalena ? " · schv." : ""}</div>
    </span>
  );
}

const FAZE_BARVY = { poptavka: ["#f1f5f9", "#334155"], obhlidka: ["#e0f2fe", "#075985"], nabidka: ["#fef3c7", "#92400e"], jednani: ["#ede9fe", "#5b21b6"], smlouva: ["#dcfce7", "#166534"] };
const StitekFaze = ({ z }) => {
  const [bg, fg] = FAZE_BARVY[z.faze] || ["#f1f5f9", "#334155"];
  return <span style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>{nazevFaze(fazeById[z.faze], z.typ) || z.faze}</span>;
};

// ── Specifikace elektrárny / zakázky ──
// Nahoře co je v propojené nabídce (jen ke čtení, mění se v Nacenění), pod tím
// ruční údaje. Ty se ukládají do podkladů pro realizaci (zakazky_prubeh.podklady),
// takže je pak vidí back office, plánovač i montéři.
const SEKCE_SPECIFIKACE = ["technicka", "hromosvod", "elektroinstalace", "servis", "realizace", "odberne"];
const cislo = (v) => Math.round(v * 100) / 100;
const fmtCislo = (v) => String(cislo(v)).replace(".", ",");
function zNabidky(quote) {
  const fve = quote?.data?.fve;
  const ks = (x) => Number(x?.qty) || 0;
  const realne = (x) => ks(x) > 0 && x?.name && !/^bez\b/i.test(x.name);
  if (!fve) {
    const t = specifikaceZNabidky(quote?.data, "");
    return t ? t.split("\n").filter(Boolean).map((r) => ["", r]) : [];
  }
  const radky = [];
  const wp = Number((String(fve.panel?.name || "").match(/(\d{3})\s*w/i) || [])[1]) || 0;
  if (realne(fve.panel)) {
    if (wp) radky.push(["Výkon", `${fmtCislo((ks(fve.panel) * wp) / 1000)} kWp`]);
    radky.push(["Panely", `${ks(fve.panel)} × ${fve.panel.name}`]);
  }
  if (realne(fve.stridac)) radky.push(["Střídač", `${ks(fve.stridac)} × ${fve.stridac.name}`]);
  if (realne(fve.baterie)) {
    const kwh = Number((String(fve.baterie.name).match(/(\d+(?:[.,]\d+)?)\s*kWh/i) || [])[1]?.replace(",", ".")) || 0;
    radky.push(["Baterie", `${ks(fve.baterie)} × ${fve.baterie.name}${kwh ? ` (celkem ${fmtCislo(kwh * ks(fve.baterie))} kWh)` : ""}${ks(fve.bms) > 0 ? " + BMS" : ""}`]);
  } else radky.push(["Baterie", "bez baterie"]);
  if (realne(fve.backup)) radky.push(["Back-up", fve.backup.name.replace(/\s*\(\)\s*$/, "")]);
  if (realne(fve.wallbox)) radky.push(["Wallbox", fve.wallbox.name]);
  if (realne(fve.regulace)) radky.push(["Regulace", fve.regulace.name]);
  if (realne(fve.bojler)) radky.push(["Ohřev vody", fve.bojler.name]);
  if (realne(fve.konstrukce)) radky.push(["Konstrukce", `${fve.konstrukce.name} (${ks(fve.konstrukce)} ks)`]);
  if (fve.elmr && !/^bez\b/i.test(fve.elmr)) radky.push(["Úprava ELMR", fve.elmr]);
  (fve.customRows || []).filter((r) => r.sekce === "material" && r.name && ks(r) > 0).forEach((r) => radky.push(["Navíc", `${ks(r)} × ${r.name}`]));
  return radky;
}

// Stringy: počet + u každého směr (a volitelně počet panelů). Ukládá se jako
// text do podklady.technicka.stringy („String 1: J (8 panelů)“ po řádcích),
// takže ho dál čte náhled podkladů v kalendáři i formulář v Průběhu.
const SMERY = ["J", "JV", "JZ", "V", "Z", "S", "SV", "SZ"];
const SMERY_NAZEV = { J: "jih", JV: "jihovýchod", JZ: "jihozápad", V: "východ", Z: "západ", S: "sever", SV: "severovýchod", SZ: "severozápad" };
const parsujStringy = (text) => {
  const radky = String(text || "").split("\n").map((r) => r.trim()).filter(Boolean);
  const out = radky.map((r) => r.match(/^String\s+\d+:\s*([A-Z]{1,2})?\s*(?:\((\d+)\s*panel[^)]*\))?\s*$/i));
  if (!radky.length || out.some((m) => !m)) return null;
  return out.map((m) => ({ smer: (m[1] || "").toUpperCase(), panelu: m[2] || "" }));
};
const textStringu = (arr) => arr.map((s, i) => `String ${i + 1}: ${s.smer || ""}${s.panelu ? ` (${s.panelu} panelů)` : ""}`.trim()).join("\n");

function StringyEditor({ idPrefix, text, panelu, onChange }) {
  const parsed = parsujStringy(text);
  const puvodni = !parsed && String(text || "").trim() ? text : "";
  const arr = parsed || [];
  const nastavit = (nove) => onChange(nove.length ? textStringu(nove) : "");
  const pocet = (n) => nastavit(Array.from({ length: n }, (_, i) => arr[i] || { smer: "", panelu: "" }));
  const zmen = (i, k, v) => nastavit(arr.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const soucet = arr.reduce((s, x) => s + (Number(x.panelu) || 0), 0);
  return (
    <div style={{ gridColumn: "1 / -1", fontSize: 12, color: C.sub }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span>Počet stringů</span>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button key={n} type="button" aria-pressed={arr.length === n} onClick={() => pocet(arr.length === n ? 0 : n)}
            style={{ ...btnS(arr.length === n), padding: "3px 10px", fontSize: 12 }}>{n}</button>
        ))}
        {panelu > 0 && arr.length > 0 && (
          <span style={{ marginLeft: 6, color: soucet === panelu ? "#166534" : soucet > panelu ? C.red : C.sub, fontWeight: 600 }}>
            rozděleno {soucet} z {panelu} panelů{soucet === panelu ? " ✓" : ""}
          </span>
        )}
      </div>
      {puvodni && <div style={{ marginTop: 4, color: C.org }}>Původní zápis: „{puvodni}“ — výběrem počtu stringů se nahradí.</div>}
      {arr.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 6, marginTop: 6 }}>
          {arr.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${C.line}`, borderRadius: 8, padding: "5px 8px", background: C.bg }}>
              <b style={{ color: C.text, whiteSpace: "nowrap" }}>String {i + 1}</b>
              <select id={`${idPrefix}-${i}-smer`} aria-label={`Směr stringu ${i + 1}`} style={{ ...inpS, padding: "4px 6px" }} value={s.smer} onChange={(e) => zmen(i, "smer", e.target.value)}>
                <option value="">směr…</option>
                {SMERY.map((x) => <option key={x} value={x}>{x} — {SMERY_NAZEV[x]}</option>)}
              </select>
              <input aria-label={`Počet panelů ve stringu ${i + 1}`} type="number" min="0" placeholder="panelů" style={{ ...inpS, width: 70, padding: "4px 6px" }}
                value={s.panelu} onChange={(e) => zmen(i, "panelu", e.target.value.replace(/\D/g, ""))} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpecifikaceZakazky({ z, quote, onUlozit }) {
  const sekce = sekceProTyp(z.typ || null).filter((s) => SEKCE_SPECIFIKACE.includes(s.id));
  const vychozi = useMemo(() => predvyplnitZNabidky(z.podklady, quote, z).podklady, [z, quote]);
  const [p, setP] = useState(vychozi);
  const [ukladam, setUkladam] = useState(false);
  const auto = quote ? zNabidky(quote) : [];
  const fv = ["FVE", "FVR", "FVO"].includes(z.typ) || !!quote?.data?.fve;
  const klic = (s, f) => p?.[s]?.[f] ?? "";
  const zmeneno = sekce.some((s) => s.pole.some((f) => String(klic(s.id, f.id)) !== String(z.podklady?.[s.id]?.[f.id] ?? "")));
  const nastav = (s, f, v) => setP((x) => ({ ...x, [s]: { ...(x?.[s] || {}), [f]: v } }));
  const ulozitSpec = async () => { setUkladam(true); await onUlozit(p); setUkladam(false); };
  if (!sekce.length && !auto.length) return null;
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <b style={{ fontSize: 15 }}>{fv ? "⚡ Specifikace elektrárny" : "Specifikace zakázky"}</b>
        <span style={{ fontSize: 12, color: C.sub }}>{quote ? `podle nabídky ${quote.cislo || quote.name}` : "zatím bez nabídky — po nacenění se doplní sama"}</span>
        <span style={{ flex: 1 }} />
        {zmeneno && <button type="button" style={btnS(true)} disabled={ukladam} onClick={ulozitSpec}>{ukladam ? "Ukládám…" : "Uložit specifikaci"}</button>}
      </div>
      {auto.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "4px 18px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13 }}>
          {auto.map(([k, v], i) => (
            <div key={i} style={{ display: "flex", gap: 6, minWidth: 0 }}>
              {k && <span style={{ color: C.sub, flexShrink: 0 }}>{k}:</span>}
              <b style={{ fontWeight: k === "Výkon" ? 800 : 600 }} className="po-ell" title={v}>{v}</b>
            </div>
          ))}
        </div>
      )}
      {sekce.map((s) => (
        <div key={s.id} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 4 }}>{s.ikona} {s.nazev} <span style={{ fontWeight: 400, color: C.mu }}>— doplnit ručně</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
            {s.pole.map((f) => {
              const id = `sp-${z.id}-${s.id}-${f.id}`;
              const moz = moznostiPole(f, {});
              if (s.id === "technicka" && f.id === "stringy") {
                return <StringyEditor key={f.id} idPrefix={id} text={klic(s.id, f.id)} panelu={Number(quote?.data?.fve?.panel?.qty) || 0} onChange={(t) => nastav(s.id, f.id, t)} />;
              }
              return (
                <label key={f.id} htmlFor={id} style={{ fontSize: 12, color: C.sub, gridColumn: f.dlouhe ? "1 / -1" : undefined, minWidth: 0 }}>
                  {f.label}
                  {f.dlouhe
                    ? <textarea id={id} rows={2} style={{ ...inpS, width: "100%", boxSizing: "border-box", marginTop: 2, resize: "vertical" }} value={klic(s.id, f.id)} onChange={(e) => nastav(s.id, f.id, e.target.value)} />
                    : <>
                      <input id={id} list={moz.length ? `${id}-m` : undefined} style={{ ...inpS, width: "100%", boxSizing: "border-box", marginTop: 2 }} value={klic(s.id, f.id)} onChange={(e) => nastav(s.id, f.id, e.target.value)} />
                      {moz.length > 0 && <datalist id={`${id}-m`}>{moz.map((m) => <option key={m} value={m} />)}</datalist>}
                    </>}
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {zmeneno && <div style={{ display: "flex", justifyContent: "flex-end" }}><button type="button" style={btnS(true)} disabled={ukladam} onClick={ulozitSpec}>{ukladam ? "Ukládám…" : "Uložit specifikaci"}</button></div>}
    </div>
  );
}

const StitekZdroje = ({ z }) => {
  const x = zdrojById[z.zdroj];
  if (!x) return <span style={{ fontSize: 12, color: C.mu }}>—</span>;
  return (
    <span title={[x.label, z.kampan].filter(Boolean).join(" · ")} style={{ display: "inline-block", maxWidth: "100%", background: x.svetla, color: x.barva, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "middle" }}>
      {x.kratky}{z.kampan && z.zdroj === "doporuceni" ? ` · ${z.kampan}` : ""}
    </span>
  );
};

// Kampaň v detailu obchodu: odkud poptávka přišla + podrobnost (název kampaně, kdo doporučil…).
function UpravaZdroje({ z, onUlozit }) {
  const [zd, setZd] = useState(z.zdroj || "");
  const [kampan, setKampan] = useState(z.kampan || "");
  const zmeneno = zd !== (z.zdroj || "") || kampan.trim() !== (z.kampan || "");
  const popisek = zd === "doporuceni" ? "Kdo doporučil" : zd === "web" ? "Stránka / formulář" : zd === "jine" ? "Odkud" : "Název kampaně";
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, fontSize: 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Kampaň</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
        {ZDROJE.map((x) => (
          <button key={x.id} type="button" aria-pressed={zd === x.id} onClick={() => setZd(zd === x.id ? "" : x.id)}
            style={{ ...btnS(zd === x.id, x.barva), padding: "3px 8px", fontSize: 12 }}>{x.label}</button>
        ))}
      </div>
      {zd && <input aria-label={popisek} placeholder={popisek} value={kampan} onChange={(e) => setKampan(e.target.value)} style={{ ...inpS, width: "100%", boxSizing: "border-box" }} />}
      {zmeneno && <button type="button" style={{ ...btnS(true), marginTop: 6 }} onClick={() => onUlozit(zd || null, zd ? kampan.trim() || null : null)}>Uložit kampaň</button>}
    </div>
  );
}

export function PohledObchod({ rows, quotes, poznamky, zakaznik, ja, lide, dnes, currentUser, akce }) {
  const vedeni = ["admin", "manager"].includes(currentUser?.role);
  const obchody = useMemo(() => rows.filter((z) => z.stav === "otevrena" && !soubezne(z) && fazeById[z.faze]?.sekce === "ob"), [rows]);
  const kdoZ = (z) => z.vlastnik_obchod || z.dalsi_krok_kdo || "Nepřiřazeno";
  const obchodnici = [...new Set(obchody.map(kdoZ))].sort((a, b) => (a === ja ? -1 : b === ja ? 1 : a.localeCompare(b, "cs")));
  const [kdo, setKdoS] = useState(() => ulozene("obchod_kdo", !vedeni && obchodnici.includes(ja) ? ja : "vse"));
  const setKdo = (v) => { setKdoS(v); ulozit("obchod_kdo", v); };
  const [razeni, setRazeniS] = useState(() => ulozene("obchod_razeni", "termin"));
  const setRazeni = (v) => { setRazeniS(v); ulozit("obchod_razeni", v); };
  const [hledat, setHledat] = useState("");
  const [zdroj, setZdrojS] = useState(() => ulozene("obchod_zdroj", "vse"));
  const setZdroj = (v) => { setZdrojS(v); ulozit("obchod_zdroj", v); };
  const [otevreno, setOtevreno] = useState(null);
  const [dotaz, setDotaz] = useState(null); // { id, typ: "obhlidka" | "varianta", datum }

  const poznZ = useMemo(() => {
    const m = {};
    for (const p of poznamky) (m[p.prubeh_id] ||= []).push(p);
    for (const k in m) m[k].sort(seraditPozn);
    return m;
  }, [poznamky]);
  const lidskePozn = (z) => (poznZ[z.id] || []).filter((p) => !p.system);

  const h = bezDiakritiky(hledat.trim().toLowerCase());
  const vZdroji = (z) => zdroj === "vse" || (zdroj === "nezadano" ? !z.zdroj : z.zdroj === zdroj);
  const vybrane = obchody.filter((z) => (kdo === "vse" || !obchodnici.includes(kdo) || kdoZ(z) === kdo) && vZdroji(z)
    && (!h || bezDiakritiky(`${z.nazev} ${zakaznik(z.customer_id)?.name || ""} ${z.misto_adresa || ""} ${z.kampan || ""}`.toLowerCase()).includes(h)));
  const pocetZdroje = (id) => obchody.filter((z) => (id === "nezadano" ? !z.zdroj : z.zdroj === id)).length;
  const poradiF = (z) => FAZE.findIndex((f) => f.id === z.faze);
  const ser = {
    termin: (a, b) => (a.dalsi_krok_termin || "9999").localeCompare(b.dalsi_krok_termin || "9999"),
    faze: (a, b) => poradiF(a) - poradiF(b) || (a.dalsi_krok_termin || "9999").localeCompare(b.dalsi_krok_termin || "9999"),
    hodnota: (a, b) => (hodnotaObchodu(b, quotes)?.max || 0) - (hodnotaObchodu(a, quotes)?.max || 0),
  }[razeni];
  const skupiny = obchodnici.filter((o) => kdo === "vse" || !obchodnici.includes(kdo) || o === kdo)
    .map((o) => ({ o, ks: vybrane.filter((z) => kdoZ(z) === o).sort(ser) })).filter((s) => s.ks.length);

  const akceFaze = (z) => {
    const ma = !!z.quote_id;
    const h2 = hodnotaObchodu(z, quotes);
    const A = [];
    const nacenit = ma ? null : ["Nacenit (nová nabídka)", () => akce.nacenit(z), z.faze === "nabidka"];
    if (z.faze === "poptavka") A.push(["Domluvena obhlídka…", () => setDotaz({ id: z.id, typ: "obhlidka", datum: "" }), true], ["Nezvedá → zkusit zítra", () => akce.obchod(z, "nezvedá")], nacenit);
    if (z.faze === "obhlidka") A.push(["Obhlídka hotová → nacenit", () => akce.obchod(z, "obhlidkaHotova"), true], ["Přesunout obhlídku…", () => setDotaz({ id: z.id, typ: "obhlidka", datum: "" })], nacenit);
    if (z.faze === "nabidka") A.push(ma ? ["Nabídka odeslána → jednání", () => akce.obchod(z, "odeslana"), true] : nacenit);
    if (z.faze === "jednani") A.push(["Souhlasí → vybrat variantu…", () => (h2?.varianty?.length > 1 ? setDotaz({ id: z.id, typ: "varianta" }) : akce.obchod(z, "souhlasi", { quoteId: h2?.varianty?.[0]?.id })), true],
      ["Připomenout se za 3 dny", () => akce.obchod(z, "pripomenout")], ["Nezvedá → zkusit zítra", () => akce.obchod(z, "nezvedá")]);
    if (z.faze === "smlouva") A.push(["Vygenerovat smlouvu", () => akce.vygenerovatSmlouvu(z)], ["Smlouva podepsaná → předat back office", () => akce.obchod(z, "podepsano"), true]);
    if (ma && z.faze !== "poptavka") A.push(["Otevřít nabídku ↗", () => akce.otevritNabidku(z.quote_id)]);
    return A.filter(Boolean);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{CSS}</style>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: C.sub }}>Obchodník:</span>
        <button type="button" style={chip(kdo === "vse" || !obchodnici.includes(kdo), "#0369a1")} onClick={() => setKdo("vse")}>Všichni</button>
        {obchodnici.map((o) => <button key={o} type="button" style={chip(kdo === o, "#0369a1")} onClick={() => setKdo(o)}>{o === ja ? `Já (${o.split(" ")[0]})` : o}</button>)}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: C.sub }}>Řadit:</span>
        {[["termin", "Termín"], ["faze", "Fáze"], ["hodnota", "Hodnota"]].map(([v, l]) => <button key={v} type="button" style={chip(razeni === v, "#334155")} onClick={() => setRazeni(v)}>{l}</button>)}
        <input type="search" aria-label="Hledat obchod" placeholder="Hledat…" value={hledat} onChange={(e) => setHledat(e.target.value)} style={{ ...inpS, width: 170 }} />
      </div>
      <div role="group" aria-label="Kampaň" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: -4 }}>
        <span style={{ fontSize: 13, color: C.sub }}>Kampaň:</span>
        <button type="button" style={chip(zdroj === "vse", "#334155")} onClick={() => setZdroj("vse")}>Vše ({obchody.length})</button>
        {[...ZDROJE, { id: "nezadano", label: "Nezadáno", barva: "#94a3b8" }].map((x) => {
          const n = pocetZdroje(x.id);
          if (!n && zdroj !== x.id) return null;
          return <button key={x.id} type="button" style={chip(zdroj === x.id, x.barva)} onClick={() => setZdroj(x.id)}>{x.label} ({n})</button>;
        })}
      </div>

      {!skupiny.length && <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 24, color: C.sub, fontSize: 14 }}>Žádné rozjednané obchody{hledat ? " pro hledaný text" : ""}.</div>}

      {skupiny.map(({ o, ks }) => {
        const hs = ks.map((z) => hodnotaObchodu(z, quotes)).filter(Boolean);
        const sMin = hs.reduce((s, x) => s + x.min, 0), sMax = hs.reduce((s, x) => s + x.max, 0);
        return (
          <div key={o} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
            <Hlavicka jmeno={o} barva="#0369a1" pocet={`${ks.length} ${ks.length === 1 ? "obchod" : ks.length < 5 ? "obchody" : "obchodů"}`}
              doplnek={sMax ? `rozjednáno ${sMin === sMax ? tis(sMin) : `${tis(sMin)}–${tis(sMax)}`} tis. Kč bez DPH` : ""}
              poTerminu={ks.filter((z) => z.dalsi_krok_termin && z.dalsi_krok_termin < dnes).length} dnes={ks.filter((z) => z.dalsi_krok_termin === dnes).length} />
            <div className="po-g po-ob po-th"><span>Zákazník</span><span>Typ</span><span>Kampaň</span><span>Fáze</span><span style={{ textAlign: "right" }}>Hodnota</span><span>Poslední poznámka</span><span>Termín</span></div>
            {ks.map((z) => {
              const pz = lidskePozn(z);
              const posl = pz[0];
              const hz = hodnotaObchodu(z, quotes);
              const otev = otevreno === z.id;
              const c = zakaznik(z.customer_id);
              return (
                <div key={z.id}>
                  <div className="po-g po-ob po-r" role="button" tabIndex={0} aria-expanded={otev}
                    onClick={() => { setOtevreno(otev ? null : z.id); setDotaz(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOtevreno(otev ? null : z.id); } }}
                    style={{ boxShadow: pruhTerminu(z.dalsi_krok_termin, dnes), background: otev ? C.bg : undefined }}>
                    <span className="po-ell">
                      {!pz.length && z.faze === "poptavka" && <span style={{ background: "#0369a1", color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 5, padding: "1px 5px", marginRight: 6, letterSpacing: ".03em" }}>NOVÝ</span>}
                      <b style={{ fontWeight: 700 }}>{z.nazev}</b>
                      {c?.name && !z.nazev?.includes(c.name) && <span style={{ color: C.sub }}> · {c.name}</span>}
                    </span>
                    <span style={{ color: z.typ ? C.sub : C.org, fontSize: 12, fontWeight: z.typ ? 400 : 700 }}>{z.typ || "⚠ typ"}</span>
                    <span className="po-ell"><StitekZdroje z={z} /></span>
                    <span><StitekFaze z={z} /></span>
                    <span style={{ textAlign: "right", lineHeight: 1.25 }}><BunkaHodnoty h={hz} onNacenit={() => akce.nacenit(z)} /></span>
                    <span className="po-ell">{posl ? <Poznamka p={posl} ja={ja} /> : <span style={{ color: C.mu }}>{z.dalsi_krok || "zatím bez poznámky — klikněte a zapište"}</span>}{pz.length > 1 && <span style={{ fontSize: 11, color: C.mu, marginLeft: 6 }}>+{pz.length - 1}</span>}</span>
                    <span><Termin iso={z.dalsi_krok_termin} dnes={dnes} /></span>
                  </div>
                  {otev && (
                    <div className="po-det">
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <KartaKontaktu z={z} zakaznik={zakaznik} />
                        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, fontSize: 13 }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>Nabídka</div>
                          {hz?.q ? hz.skupina.map((q) => (
                            <div key={q.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "3px 0", opacity: q.status === "Zamítnuto" ? 0.5 : 1 }}>
                              <button type="button" onClick={() => akce.otevritNabidku(q.id)} style={{ background: "none", border: "none", padding: 0, color: "#0369a1", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textAlign: "left" }} className="po-ell">{q.cislo || q.name}</button>
                              <span style={{ flex: 1 }} />
                              <b style={{ fontWeight: 700 }}>{cenaNabidky(q) ? `${tis(cenaNabidky(q))} tis.` : "—"}</b>
                              <span style={{ fontSize: 11, color: q.status === "Schváleno" ? "#166534" : C.sub }}>{q.status}</span>
                            </div>
                          )) : <div style={{ color: C.sub }}>{hz?.odhad ? `Odhad ${tis(hz.min)} tis. — nabídka zatím není.` : "Zatím bez nabídky."}</div>}
                          {!z.quote_id && <button type="button" style={{ ...btnS(true), marginTop: 8 }} onClick={() => akce.nacenit(z)}>Nacenit ↗</button>}
                        </div>
                        <UpravaZdroje key={`zd-${z.id}`} z={z} onUlozit={(zd, kampan) => akce.zmenitZdroj(z, zd, kampan)} />
                        <label style={{ fontSize: 12, color: C.sub }}>Obchodník
                          <select style={{ ...inpS, width: "100%", marginTop: 3 }} value={z.vlastnik_obchod || ""} onChange={(e) => akce.zmenitObchodnika(z, e.target.value)}>
                            <option value="">— nepřiřazeno —</option>
                            {lide.map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </label>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
                          {FAZE.filter((f) => f.sekce === "ob" && fazePlati(f, z)).map((f) => {
                            const i = FAZE.indexOf(f), ted = FAZE.findIndex((x) => x.id === z.faze);
                            return <span key={f.id} style={{ flex: 1, textAlign: "center", fontSize: 11, padding: "4px 0", borderRadius: 6, fontWeight: i === ted ? 700 : 500,
                              background: i < ted ? "#dcfce7" : i === ted ? "#0369a1" : "#f1f5f9", color: i < ted ? "#166534" : i === ted ? "#fff" : C.mu }}>{nazevFaze(f, z.typ)}</span>;
                          })}
                        </div>
                        <ZapisPoznamky key={z.id} idPrefix={`po-${z.id}`} ja={ja} dnes={dnes} termin={z.dalsi_krok_termin}
                          onZapsat={(d) => akce.zapsatPoznamku(z, { ...d, odd: "ob" })} />
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                          {akceFaze(z).map(([l, fn, hl]) => <button key={l} type="button" style={btnS(!!hl)} onClick={fn}>{l}</button>)}
                          <span style={{ flex: 1 }} />
                          <button type="button" style={{ ...btnS(false), color: C.red }} onClick={() => akce.prohra(z)}>Prohráno…</button>
                          <button type="button" style={btnS(false)} onClick={() => akce.otevrit(z.id)}>Celá zakázka ↗</button>
                        </div>
                        {dotaz?.id === z.id && dotaz.typ === "obhlidka" && (
                          <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "#f1f5f9", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13 }}>Obhlídka kdy?</span>
                            <input type="date" autoFocus style={inpS} value={dotaz.datum} min={dnes} onChange={(e) => setDotaz({ ...dotaz, datum: e.target.value })} />
                            <button type="button" style={btnS(true)} disabled={!dotaz.datum} onClick={() => { akce.obchod(z, "obhlidka", { datum: dotaz.datum }); setDotaz(null); }}>Uložit</button>
                            <button type="button" style={btnS(false)} onClick={() => setDotaz(null)}>Zrušit</button>
                            <span style={{ fontSize: 11, color: C.mu }}>zapíše poznámku, termín = den obhlídky{z.faze === "poptavka" ? ", fáze → Obhlídka" : ""}</span>
                          </div>
                        )}
                        {dotaz?.id === z.id && dotaz.typ === "varianta" && hz?.varianty && (
                          <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "#f1f5f9" }}>
                            <div style={{ fontSize: 13, marginBottom: 6 }}>Kterou variantu zákazník vybral? Ostatní se v Nacenění označí jako Zamítnuto.</div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {hz.varianty.map((q) => (
                                <button key={q.id} type="button" style={{ ...btnS(false), textAlign: "left", padding: "8px 12px" }} onClick={() => { akce.obchod(z, "souhlasi", { quoteId: q.id }); setDotaz(null); }}>
                                  <div>{q.cislo || q.name}</div><b>{cenaNabidky(q) ? `${tis(cenaNabidky(q))} tis. Kč` : "—"}</b>
                                </button>
                              ))}
                              <button type="button" style={btnS(false)} onClick={() => setDotaz(null)}>Zrušit</button>
                            </div>
                          </div>
                        )}
                        <Historie pozn={poznZ[z.id] || []} ja={ja} />
                        <div style={{ marginTop: 12 }}>
                          <SpecifikaceZakazky key={`sp-${z.id}-${z.quote_id || 0}`} z={z} quote={hz?.q || null} onUlozit={(p) => akce.ulozitPodklady(z, p)} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ═══ BACK OFFICE / REALIZACE ══════════════════════════════════════════════
const pondeli = (iso) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const isoD = (d) => d.toLocaleDateString("sv-SE");

function TydenRealizace({ zakazky, calendarEvents, dnes, onOtevrit }) {
  const [posun, setPosun] = useState(0);
  const start = pondeli(dnes); start.setDate(start.getDate() + posun * 7);
  const dny = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return isoD(d); });
  const podleId = Object.fromEntries(zakazky.map((z) => [z.id, z]));
  const podleContract = Object.fromEntries(zakazky.filter((z) => z.contract_id).map((z) => [z.contract_id, z]));
  const vDen = (den) => {
    const m = new Map();
    for (const e of calendarEvents) {
      if (e.date !== den) continue;
      const z = podleId[e.prubeh_id] || podleContract[e.contract_id];
      if (!z) continue;
      if (!m.has(z.id)) m.set(z.id, { z, lide: [] });
      if (e.employee_name) m.get(z.id).lide.push(e.employee_name);
    }
    return [...m.values()];
  };
  const naplanovane = new Set(calendarEvents.filter((e) => e.date >= dnes).map((e) => e.prubeh_id || podleContract[e.contract_id]?.id).filter(Boolean));
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>Plán týdne</b>
        <button type="button" style={btnS(false)} aria-label="Předchozí týden" onClick={() => setPosun(posun - 1)}>‹</button>
        <span style={{ fontSize: 13, color: C.sub }}>{kratce(dny[0])} – {kratce(dny[6])}</span>
        <button type="button" style={btnS(false)} aria-label="Další týden" onClick={() => setPosun(posun + 1)}>›</button>
        {posun !== 0 && <button type="button" style={btnS(false)} onClick={() => setPosun(0)}>Tento týden</button>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: C.sub }}>{zakazky.filter((z) => !naplanovane.has(z.id)).length} zakázek bez naplánované práce</span>
      </div>
      <div className="po-tyden">
        {dny.map((den) => {
          const akce = vDen(den);
          const vikend = [0, 6].includes(new Date(den + "T00:00:00").getDay());
          return (
            <div key={den} style={{ border: `1px solid ${den === dnes ? "#f97316" : C.line}`, borderRadius: 10, padding: 6, minHeight: 74, background: vikend ? C.bg : "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: den === dnes ? C.org : C.sub, marginBottom: 4 }}>{sDnem(den)}{den === dnes ? " · dnes" : ""}</div>
              {akce.map(({ z, lide }) => (
                <button key={z.id} type="button" onClick={() => onOtevrit(z.id)} title={`${z.nazev}${lide.length ? " — " + lide.join(", ") : ""}`}
                  style={{ display: "block", width: "100%", textAlign: "left", border: "none", borderRadius: 6, background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 600, padding: "3px 5px", marginBottom: 3, cursor: "pointer", fontFamily: "inherit" }}>
                  <div className="po-ell">{z.nazev}</div>
                  {lide.length > 0 && <div style={{ fontWeight: 400 }} className="po-ell">{[...new Set(lide)].map(inicialy).join(" · ")}</div>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PohledOddeleni({ odd, rows, poznamky, zakaznik, ja, dnes, autoZ, calendarEvents = [], kodZakazky, akce }) {
  const o = oddeleniById[odd];
  const [jen, setJenS] = useState(() => ulozene(`odd_${odd}_jen`, "vse"));
  const setJen = (v) => { setJenS(v); ulozit(`odd_${odd}_jen`, v); };
  const [hledat, setHledat] = useState("");
  const [otevreno, setOtevreno] = useState(null);
  const [cekajiciOtev, setCekajiciOtev] = useState(false);

  const poznZ = useMemo(() => {
    const m = {};
    for (const p of poznamky) (m[p.prubeh_id] ||= []).push(p);
    for (const k in m) m[k].sort(seraditPozn);
    return m;
  }, [poznamky]);

  const vse = useMemo(() => rows.filter((z) => z.stav === "otevrena" && soubezne(z)).map((z) => ({ z, st: stavOddeleni(z) })), [rows]);
  const moje = vse.filter(({ st }) => aktivni(st[odd]));
  const cekajici = odd === "bo" ? vse.filter(({ st }) => st.bo?.faze === CEKA) : [];
  const kdoZ = (z, st) => st[odd]?.kdo || z[o.vlastnik] || null;
  const h = bezDiakritiky(hledat.trim().toLowerCase());
  const filtr = ({ z, st }) => (jen === "vse" || kdoZ(z, st) === ja)
    && (!h || bezDiakritiky(`${z.nazev} ${zakaznik(z.customer_id)?.name || ""} ${z.misto_adresa || ""} ${kodZakazky(z) || ""}`.toLowerCase()).includes(h));
  const vybrane = moje.filter(filtr);
  const skupiny = FAZE.filter((f) => vybrane.some(({ st }) => st[odd].faze === f.id))
    .map((f) => ({ f, ks: vybrane.filter(({ st }) => st[odd].faze === f.id).sort((a, b) => (a.st[odd].termin || "9999").localeCompare(b.st[odd].termin || "9999")) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{CSS}</style>
      {odd === "re" && <TydenRealizace zakazky={moje.map((x) => x.z)} calendarEvents={calendarEvents} dnes={dnes} onOtevrit={(id) => setOtevreno(id)} />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" style={chip(jen === "vse", o.barva)} onClick={() => setJen("vse")}>Všechny ({moje.length})</button>
        <button type="button" style={chip(jen === "moje", o.barva)} onClick={() => setJen("moje")}>Moje ({moje.filter(({ z, st }) => kdoZ(z, st) === ja).length})</button>
        <span style={{ fontSize: 12, color: C.sub }}>{moje.filter(({ st }) => st[odd].termin && st[odd].termin < dnes).length} po termínu</span>
        <span style={{ flex: 1 }} />
        <input type="search" aria-label="Hledat zakázku" placeholder="Hledat…" value={hledat} onChange={(e) => setHledat(e.target.value)} style={{ ...inpS, width: 190 }} />
      </div>

      {!skupiny.length && <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 24, color: C.sub, fontSize: 14 }}>Nic k řešení{jen === "moje" ? " u tebe" : ""}{hledat ? " pro hledaný text" : ""}.</div>}

      {skupiny.map(({ f, ks }) => (
        <div key={f.id} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: o.svetla, flexWrap: "wrap" }}>
            <b style={{ fontSize: 15, color: o.tmava }}>{f.sekce === "uz" ? "Uzavření · " : ""}{f.nazev}</b>
            <span style={{ fontSize: 12, color: C.sub }}>{ks.length} {ks.length === 1 ? "zakázka" : ks.length < 5 ? "zakázky" : "zakázek"}</span>
            <span style={{ flex: 1 }} />
            {ks.filter(({ st }) => st[odd].termin && st[odd].termin < dnes).length > 0 && <span style={{ background: C.redBg, color: C.red, fontWeight: 700, fontSize: 12, borderRadius: 7, padding: "2px 8px" }}>! {ks.filter(({ st }) => st[odd].termin && st[odd].termin < dnes).length} po termínu</span>}
            {ks.filter(({ st }) => st[odd].termin === dnes).length > 0 && <span style={{ background: C.orgBg, color: C.org, fontWeight: 700, fontSize: 12, borderRadius: 7, padding: "2px 8px" }}>{ks.filter(({ st }) => st[odd].termin === dnes).length} dnes</span>}
          </div>
          <div className="po-g po-od po-th"><span>Zakázka</span><span>Typ</span><span>Co je na řadě</span><span>Kdo</span><span>Poslední poznámka</span><span>Termín</span></div>
          {ks.map(({ z, st }) => {
            const zv = pohledOdd(z, odd);
            const auto = autoZ(zv);
            const ukoly = ukolyPro(f, zv);
            const hotovo = ukoly.filter((u) => ukolHotovy(zv, f, u, auto)).length;
            const dalsi = ukoly.find((u) => !ukolHotovy(zv, f, u, auto));
            const pz = (poznZ[z.id] || []).filter((p) => !p.system);
            const kdo = kdoZ(z, st);
            const otev = otevreno === z.id;
            const ter = st[odd].termin || null;
            const c = zakaznik(z.customer_id);
            return (
              <div key={z.id}>
                <div className="po-g po-od po-r" role="button" tabIndex={0} aria-expanded={otev}
                  onClick={() => setOtevreno(otev ? null : z.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOtevreno(otev ? null : z.id); } }}
                  style={{ boxShadow: pruhTerminu(ter, dnes), background: otev ? C.bg : undefined }}>
                  <span className="po-ell"><b style={{ fontWeight: 700 }}>{z.nazev}</b>{kodZakazky(z) ? <span style={{ color: C.mu, fontSize: 12 }}> · {kodZakazky(z)}</span> : c?.name && !z.nazev?.includes(c.name) ? <span style={{ color: C.sub }}> · {c.name}</span> : null}</span>
                  <span style={{ color: z.typ ? C.sub : C.org, fontSize: 12, fontWeight: z.typ ? 400 : 700 }}>{z.typ || "⚠ typ"}</span>
                  <span className="po-ell">{dalsi ? dalsi.text : <span style={{ color: "#166534", fontWeight: 700 }}>✓ hotovo — posunout dál</span>}{ukoly.length > 1 && <span style={{ fontSize: 11, color: C.mu, marginLeft: 6 }}>{hotovo}/{ukoly.length}</span>}</span>
                  <span title={kdo || ""} style={{ fontSize: 12, fontWeight: 700, color: kdo === ja ? o.barva : C.sub }}>{kdo ? inicialy(kdo) : "—"}</span>
                  <span className="po-ell">{pz[0] ? <Poznamka p={pz[0]} ja={ja} /> : <span style={{ color: C.mu }}>bez poznámky</span>}{pz.length > 1 && <span style={{ fontSize: 11, color: C.mu, marginLeft: 6 }}>+{pz.length - 1}</span>}</span>
                  <span><Termin iso={ter} dnes={dnes} /></span>
                </div>
                {otev && (
                  <div className="po-det">
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <KartaKontaktu z={z} zakaznik={zakaznik}>
                        {kodZakazky(z) && <div style={{ color: C.sub }}>zakázka {kodZakazky(z)}</div>}
                      </KartaKontaktu>
                      {odd === "re" && (() => {
                        const akcePlan = calendarEvents.filter((e) => (e.prubeh_id === z.id || (z.contract_id && e.contract_id === z.contract_id)) && e.date >= dnes).sort((a, b) => a.date.localeCompare(b.date));
                        const dnyPlan = [...new Set(akcePlan.map((e) => e.date))];
                        return (
                          <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, fontSize: 13 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>Naplánováno</div>
                            {dnyPlan.length ? dnyPlan.slice(0, 6).map((d) => <div key={d}>{sDnem(d)} — {[...new Set(akcePlan.filter((e) => e.date === d).map((e) => e.employee_name).filter(Boolean))].join(", ")}</div>)
                              : <div style={{ color: C.org }}>zatím nic</div>}
                            <button type="button" style={{ ...btnS(true, o.barva), marginTop: 8 }} onClick={() => akce.naplanovat(z)}>📅 Naplánovat</button>
                          </div>
                        );
                      })()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <ZapisPoznamky key={z.id} idPrefix={`po-${z.id}`} ja={ja} dnes={dnes} termin={ter}
                        placeholder={odd === "bo" ? "např. žádost o připojení podána, čeká se na distributora" : "např. montáž hotová, chybí 2 m kabelu"}
                        onZapsat={(d) => akce.zapsatPoznamku(z, { ...d, odd })} />
                      <div style={{ marginTop: 10, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 12px" }}>
                        <div style={{ fontSize: 12, color: C.sub, fontWeight: 700, marginBottom: 4 }}>{nazevFaze(f, z.typ)} — úkoly</div>
                        {ukoly.map((u) => {
                          const hot = ukolHotovy(zv, f, u, auto);
                          return (
                            <label key={u.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "3px 0", color: hot ? C.sub : C.text, cursor: u.auto ? "default" : "pointer" }}>
                              <input type="checkbox" checked={hot} disabled={!!u.auto} onChange={() => akce.toggleUkol(zv, f, u)} />
                              <span style={{ textDecoration: hot ? "line-through" : "none" }}>{u.text}</span>
                              {u.auto && <span style={{ fontSize: 11, color: C.mu }}>(odškrtne se samo)</span>}
                            </label>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                        <button type="button" style={btnS(!dalsi, o.barva)} onClick={() => akce.posunOdd(z, odd)}>Hotovo → další krok</button>
                        <span style={{ flex: 1 }} />
                        <button type="button" style={btnS(false)} onClick={() => akce.otevrit(z.id, odd)}>Celá zakázka ↗</button>
                      </div>
                      <Historie pozn={poznZ[z.id] || []} ja={ja} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {cekajici.length > 0 && (
        <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: "10px 14px", fontSize: 13 }}>
          <button type="button" onClick={() => setCekajiciOtev(!cekajiciOtev)} aria-expanded={cekajiciOtev} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: C.sub, fontWeight: 700 }}>
            {cekajiciOtev ? "▾" : "▸"} Příprava hotová · čeká na dokončení realizace ({cekajici.length})
          </button>
          {cekajiciOtev && <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {cekajici.map(({ z }) => <button key={z.id} type="button" style={btnS(false)} onClick={() => akce.otevrit(z.id, "bo")}>{z.nazev}</button>)}
          </div>}
        </div>
      )}
    </div>
  );
}
