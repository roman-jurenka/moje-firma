// ─── Formuláře k zakázce (vyplní aplikace, výstup PDF) ──────────────────────
// • NZÚ Light – Zpráva o instalaci, oblast C.2 (FV ohřev vody): oficiální
//   vyplnitelné PDF SFŽP ver. 1.0 (02/2025), public/formulare/nzu-light-c2.pdf
// • ČEZ Distribuce – Instalační dokument nesynchronního VM typu A1: oficiální
//   vyplnitelné PDF (platné od 1. 1. 2025), public/formulare/cez-a1-nesynchro.pdf
// • Protokol o nastavení ochran (ČEZ i EG.D) – vlastní dokument firmy, PDF z HTML.
// Hodnoty se předvyplní ze zakázky (zákazník, místo, EAN, výrobní čísla, firma)
// a z naposledy použitých hodnot (střídač, certifikát, ochrany…). Do PDF se
// píše písmem DejaVu Sans (čeština), pole zůstanou vyplnitelná.

export const POSLEDNI_KEY = "formulare_posledni"; // app_settings: { [formId]: {…}, ["formId:customerId"]: {…} }

const dnesCz = () => { const d = new Date(); return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`; };
const cislo = (v) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString("cs-CZ");

// „Bartoňov 18, 789 63 Bartoňov“ / „Riegrova 394/17, 779 00 Olomouc“ → části
export function rozdelAdresu(a) {
  const s = String(a || "").replace(/\s+/g, " ").trim();
  const psc = (s.match(/\b(\d{3}) ?(\d{2})\b/) || []).slice(1).join(" ");
  const [prvni, ...zbytek] = s.split(",").map((x) => x.trim());
  const m = String(prvni || "").match(/^(.*?)\s+((?:č\.\s*p\.\s*)?\d+[a-zA-Z]?(?:\/\d+[a-zA-Z]?)?)$/);
  const ulice = m ? m[1] : prvni || "";
  const cp = m ? m[2].replace(/^č\.\s*p\.\s*/, "") : "";
  const obecCast = zbytek.join(", ").replace(/\b\d{3} ?\d{2}\b/, "").trim();
  return { ulice, cp, psc, obec: obecCast || ulice };
}

// kraj podle obce (Open-Meteo geocoding, bez klíče) → „Olomoucký“
export async function krajObce(obec, psc) {
  if (!obec) return "";
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(obec)}&count=10&language=cs&countryCode=CZ`);
    const j = await r.json();
    const v = (j.results || []).find((x) => !psc || (x.postcodes || []).some((p) => String(p).replace(/\s/g, "") === psc.replace(/\s/g, ""))) || (j.results || [])[0];
    return String(v?.admin1 || "").replace(/\s*kraj$/i, "").replace(/^Kraj\s+/i, "");
  } catch { return ""; }
}

// Podklady zakázky pro předvyplnění
// ctx = { z, zakaznik, firma (znacky), sn: [vyrobni_cisla], technik, posledni: {formId: {...}} }
function zakladZakazky(ctx) {
  const { z, zakaznik: zk = {} } = ctx;
  const mistoAdr = rozdelAdresu(z?.misto_adresa || zk.address);
  const sidloAdr = rozdelAdresu(zk.sidlo || zk.address || z?.misto_adresa);
  const sn = ctx.sn || [];
  const stridac = sn.find((x) => x.druh === "stridac");
  const baterie = sn.filter((x) => x.druh === "baterie");
  const panely = sn.filter((x) => x.druh === "panel");
  return { mistoAdr, sidloAdr, stridac, baterie, panely, zk };
}

// formulář ČEZ má „CZ“ u DIČ a začátek EAN „859182400“ už natištěné
const bezCZ = (dic) => String(dic || "").replace(/^\s*CZ\s*/i, "");
const konecEan = (ean) => { const e = String(ean || "").replace(/\s/g, ""); return e.startsWith("859182400") ? e.slice(9) : e; };
const vykonPanelu = (nazev) => { const m = String(nazev || "").match(/(\d{3})\s*w?p?\b/i); return m ? Number(m[1]) : 0; };

export const FORMULARE = [
  // ── NZÚ Light C.2 ──────────────────────────────────────────────────────────
  {
    id: "nzu_c2", nazev: "Zpráva o instalaci – NZÚ Light C.2 (FV ohřev vody)", ikona: "💧", soubor: "Zprava o instalaci OZE NZU Light",
    sablona: "/formulare/nzu-light-c2.pdf",
    plati: (z, zk) => z?.typ === "FVO" || String(zk?.ico || "") === "25323601" || /ip\s*poln/i.test(`${zk?.company || ""} ${zk?.name || ""}`),
    sekce: [
      { nazev: "1. Nemovitost", pole: [
        { id: "obec", label: "Obec" }, { id: "psc", label: "PSČ" }, { id: "ulice", label: "Ulice" }, { id: "cp", label: "č. p. / č. ev." }, { id: "kraj", label: "Kraj" },
      ] },
      { nazev: "2. Stávající ohřev vody", pole: [
        { id: "stavajici", label: "Převládající zdroj", typ: "select", moznosti: ["Elektřina", "Plyn", "Centrální zásobování teplem", "Tuhá fosilní paliva", "Dřevo a jiná biomasa", "Jiný (v poznámce)"] },
      ] },
      { nazev: "3. Opatření", pole: [
        { id: "opatreni", label: "Typ opatření", typ: "select", moznosti: ["C.2: FV Solární fotovoltaický ohřev vody", "C.2: SOL Solární termický ohřev vody", "C.2: SOL+ Solární termický ohřev s přitápěním", "C.2: TČ-V Tepelné čerpadlo pro ohřev vody"] },
        { id: "byty", label: "Počet bytových jednotek (jen BD)" }, { id: "osoby", label: "Počet osob využívajících systém" },
      ] },
      { nazev: "4. Solární systém", pole: [
        { id: "panel", label: "Výrobce a typ panelu", sirka: 2 }, { id: "svt", label: "Kód SVT (nepovinné)" }, { id: "vykon", label: "Výkon [Wp/ks]" }, { id: "ks", label: "Počet kusů" },
        { id: "celkem_vykon", label: "Celkem výkon (nepovinné)" }, { id: "celkem_ks", label: "Celkem kusů" },
        { id: "objem", label: "Objem ohřívače (litry)" },
        { id: "ventil", label: "Termostatický směšovací ventil", typ: "check" }, { id: "termostat", label: "Termostat (max. teplota)", typ: "check" },
        { id: "menic", label: "FV střídač / měnič – výrobce, typ", sirka: 2 },
        { id: "mppt", label: "Vybaven funkcí MPPT", typ: "check" },
        { id: "splneni", label: "Splnění podmínky", typ: "select", moznosti: ["Napětí výstupu odpovídá jmenovitému napětí tělesa", "Výkon tělesa min. 75 % instal. výkonu", "—"] },
        { id: "vmp", label: "Napětí stringu Vmp [V]" }, { id: "uef", label: "Efektivní napětí výstupu [V]" },
        { id: "teleso_kw", label: "Topné těleso [kW]" }, { id: "teleso_v", label: "Při napětí [V]" },
        { id: "revize", label: "Datum revize / kontroly" },
      ] },
      { nazev: "Poznámky", pole: [{ id: "poznamka", label: "Poznámky, další údaje", typ: "dlouhe", sirka: 2 }] },
      { nazev: "6. Dodavatel opatření", pole: [
        { id: "firma", label: "Firma", sirka: 2 }, { id: "ico", label: "IČ" },
        { id: "opravneni", label: "Oprávnění dle zák. 406/2000 Sb.", typ: "select", moznosti: ["Elektromontér fotovoltaických systémů (26-014-H)", "Instalatér solárních termických soustav (23-099-M", "Instalatér soustav s tepelnými čerpadly a mělkých geotermálních systémů (26-074-M)", "—"] },
        { id: "kontakt", label: "Kontaktní osoba a telefon", sirka: 2 }, { id: "opravnena", label: "Oprávněná osoba" },
        { id: "dokonceno", label: "Instalace dokončena dne" }, { id: "misto", label: "V (místo)" }, { id: "dne", label: "Dne" },
      ] },
    ],
    // hodnoty, které se pamatují z minula (technika, dodavatel)
    pamatovat: ["panel", "svt", "vykon", "objem", "menic", "vmp", "uef", "teleso_kw", "teleso_v", "misto"],
    // dodavatel opatření se liší podle klienta (u IP Polná je to IP Polná) → pamatuje se pro zákazníka
    pamatovatZakaznik: ["firma", "ico", "kontakt", "opravnena", "opravneni"],
    predvyplnit(ctx) {
      const { mistoAdr, panely, stridac } = zakladZakazky(ctx);
      const f = ctx.firma || {};
      const ks = panely.length;
      const panel = panely[0]?.nazev || "";
      return {
        obec: mistoAdr.obec, psc: mistoAdr.psc, ulice: mistoAdr.ulice, cp: mistoAdr.cp, kraj: "",
        stavajici: "Elektřina", opatreni: "C.2: FV Solární fotovoltaický ohřev vody", byty: "1", osoby: "",
        panel, svt: "", vykon: vykonPanelu(panel) ? String(vykonPanelu(panel)) : "", ks: ks ? String(ks) : "", celkem_vykon: "", celkem_ks: ks ? String(ks) : "",
        objem: "", ventil: true, termostat: true, menic: stridac?.nazev || "", mppt: true, splneni: "Napětí výstupu odpovídá jmenovitému napětí tělesa",
        vmp: "", uef: "", teleso_kw: "", teleso_v: "230", revize: "",
        poznamka: "",
        firma: f.firmaNazev || "", ico: f.firmaIco || "", opravneni: "Elektromontér fotovoltaických systémů (26-014-H)",
        kontakt: [ctx.technik, f.firmaTelefon].filter(Boolean).join(" "), opravnena: ctx.technik || "",
        dokonceno: "", misto: String(f.firmaMesto || "").replace(/^\d{3} ?\d{2}\s*/, ""), dne: dnesCz(),
      };
    },
    // dopočty při změně (celkem kusů / výkon)
    dopocet(h) {
      const vykon = cislo(h.vykon), ks = cislo(h.ks);
      return { celkem_ks: h.celkem_ks || (ks ? String(ks) : ""), celkem_vykon: h.celkem_vykon || (vykon && ks ? `${fmt((vykon * ks) / 1000)} kWp` : "") };
    },
    doPdf(h) {
      const stav = ["Elektřina", "Plyn", "Centrální zásobování teplem", "Tuhá fosilní paliva", "Dřevo a jiná biomasa", "Jiný (v poznámce)"];
      const stavPole = ["toggle_1", "Plyn", "Centrální zásobování teplem", "Tuhá fosilní paliva", "toggle_4", "toggle_6"];
      const opPole = { "C.2: SOL Solární termický ohřev vody": "C2 SOL", "C.2: SOL+ Solární termický ohřev s přitápěním": "C2 SOL_2", "C.2: FV Solární fotovoltaický ohřev vody": "C2 FV", "C.2: TČ-V Tepelné čerpadlo pro ohřev vody": "toggle_10" };
      const text = {
        Obec: h.obec, fill_15: h.psc, Ulice: h.ulice, fill_17: h.cp, Kraj: h.kraj,
        fill_19: h.byty, fill_20: h.osoby,
        fill_1: h.panel, "Kód SVT nepovinnéRow1": h.svt, "Apertura nebo jmenovitý výkon m2ks nebo kWpksRow1": h.vykon, fill_4: h.ks,
        "Apertura nebo jmenovitý výkon m2ks nebo kWpksCelkem": h.celkem_vykon, fill_10: h.celkem_ks,
        fill_11: h.objem, "Výrobce typ": h.menic,
        fill_22: h.vmp, fill_23: h.uef, fill_24: h.teleso_kw, fill_25: h.teleso_v,
        "Datum provedení revize nebo kontroly nové instalace revizním technikem": h.revize,
        fill_9: h.poznamka, Firma: h.firma, fill_11_2: h.ico, "Kontaktní osoba a telefon": h.kontakt, fill_15_2: h.opravnena,
        fill_16: h.dokonceno, V: h.misto, dne: h.dne,
      };
      const zaskrtnout = {
        ...Object.fromEntries(stavPole.map((p, i) => [p, h.stavajici === stav[i]])),
        ...Object.fromEntries(Object.entries(opPole).map(([k, p]) => [p, h.opatreni === k])),
        undefined: !!h.ventil, undefined_2: !!h.termostat,
        "Vybaven funkcí MPPT povinné": !!h.mppt,
        toggle_14: h.splneni === "Napětí výstupu odpovídá jmenovitému napětí tělesa",
        toggle_15: h.splneni === "Výkon tělesa min. 75 % instal. výkonu",
        toggle_7: !!h.opravneni && h.opravneni !== "—",
      };
      const vybrat = { Dropdown1: h.opravneni && h.opravneni !== "—" ? h.opravneni : "VYBERTE POLOŽKU" };
      return { text, zaskrtnout, vybrat };
    },
  },

  // ── ČEZ Distribuce – instalační dokument VM A1 ─────────────────────────────
  {
    id: "cez_a1", nazev: "ČEZ Distribuce – Instalační dokument VM typu A1", ikona: "⚡", soubor: "Instalacni dokument VM A1 CEZ",
    sablona: "/formulare/cez-a1-nesynchro.pdf",
    plati: (z) => ["FVE", "FVR", "FVO", "REA"].includes(z?.typ) && /ČEZ|CEZ/i.test(String(z?.podklady?.odberne?.distribuce || "ČEZ")),
    sekce: [
      { nazev: "Subjekt provádějící instalaci", pole: [
        { id: "i_jmeno", label: "Obchodní firma", sirka: 2 }, { id: "i_ico", label: "IČO" }, { id: "i_dic", label: "DIČ (bez CZ)" },
        { id: "i_ulice", label: "Ulice" }, { id: "i_cp", label: "Č. p. / č. o." }, { id: "i_psc", label: "PSČ" }, { id: "i_obec", label: "Obec" }, { id: "i_cast", label: "Místní část" },
        { id: "i_zastoupena", label: "Zastoupená" }, { id: "i_mobil", label: "Mobil" }, { id: "i_email", label: "E-mail" }, { id: "i_datum", label: "Datum podpisu" },
      ] },
      { nazev: "Žadatel (vlastník Smlouvy o připojení)", pole: [
        { id: "z_jmeno", label: "Jméno a příjmení / firma", sirka: 2 }, { id: "z_ico", label: "Datum narození / IČO" }, { id: "z_dic", label: "DIČ (bez CZ)" },
        { id: "z_ulice", label: "Ulice" }, { id: "z_cp", label: "Č. p. / č. o." }, { id: "z_psc", label: "PSČ" }, { id: "z_obec", label: "Obec" }, { id: "z_cast", label: "Místní část" },
        { id: "z_or", label: "Zapsaná v OR / ŽR" }, { id: "z_spzn", label: "Sp. zn." }, { id: "z_zastoupena", label: "Zastoupená" },
        { id: "z_mobil", label: "Mobil" }, { id: "z_email", label: "E-mail" }, { id: "z_datum", label: "Datum podpisu" },
      ] },
      { nazev: "Specifikace výrobny", pole: [
        { id: "hladina", label: "Napěťová hladina" }, { id: "smlouva", label: "Číslo Smlouvy o připojení" },
        { id: "ean_odber", label: "EAN odběru (za 859182400…)" }, { id: "ean_dodavka", label: "EAN dodávky (za 859182400…)" },
        { id: "v_ulice", label: "Ulice" }, { id: "v_cp", label: "Č. p. / č. o." }, { id: "v_psc", label: "PSČ" }, { id: "v_obec", label: "Obec" }, { id: "v_cast", label: "Místní část" },
      ] },
      { nazev: "Informace o VM", pole: [
        { id: "zdroj", label: "Zdroj primární energie" }, { id: "vm_kw", label: "Instalovaný výkon VM [kW]" }, { id: "vm_kva", label: "[kVA]" },
        { id: "s_kw", label: "Střídač – výkon [kW]" }, { id: "s_kva", label: "[kVA]" }, { id: "s_vyrobce", label: "Výrobce střídače" }, { id: "s_typ", label: "Typ" },
        { id: "s_sn", label: "Výrobní číslo", sirka: 2 }, { id: "s_fw", label: "Verze firmware", sirka: 2 }, { id: "s_nastaveni", label: "Nastavení / skupina" },
        { id: "a_vyrobce", label: "Akumulace – výrobce" }, { id: "a_typ", label: "Typ" }, { id: "a_kw", label: "Výkon [kW]" }, { id: "a_kwh", label: "Kapacita [kWh]" },
        { id: "p_kwp", label: "Panely – celkem [kWp]" }, { id: "p_pocet", label: "Počet" }, { id: "p_vyrobce", label: "Výrobce panelů" }, { id: "p_typ", label: "Typ" },
        { id: "certifikaty", label: "Body 1–14 doloženy certifikátem", typ: "check" },
      ] },
      { nazev: "A) Certifikát zařízení", pole: [
        { id: "c_vydal", label: "Certifikát vydal", sirka: 2 }, { id: "c_cislo", label: "Číslo certifikátu" }, { id: "c_datum", label: "Datum vydání" },
      ] },
    ],
    pamatovat: ["i_jmeno", "i_ico", "i_dic", "i_ulice", "i_cp", "i_psc", "i_obec", "i_cast", "i_zastoupena", "i_mobil", "i_email", "hladina", "zdroj", "s_vyrobce", "s_fw", "s_nastaveni", "c_vydal", "c_cislo", "c_datum"],
    predvyplnit(ctx) {
      const { mistoAdr, sidloAdr, stridac, baterie, panely, zk } = zakladZakazky(ctx);
      const f = ctx.firma || {};
      const fAdr = rozdelAdresu(`${f.firmaUlice || ""}, ${f.firmaMesto || ""}`);
      const panel = panely[0]?.nazev || "";
      const kwp = panely.length && vykonPanelu(panel) ? (panely.length * vykonPanelu(panel)) / 1000 : 0;
      const [sVyrobce, ...sTyp] = String(stridac?.nazev || "").split(/\s+/);
      const [bVyrobce, ...bTyp] = String(baterie[0]?.nazev || "").split(/\s+/);
      const [pVyrobce, ...pTyp] = String(panel).split(/\s+/);
      return {
        i_jmeno: f.firmaNazev || "", i_ico: f.firmaIco || "", i_dic: bezCZ(f.firmaDic),
        i_ulice: fAdr.ulice, i_cp: fAdr.cp, i_psc: fAdr.psc, i_obec: fAdr.obec, i_cast: "",
        i_zastoupena: ctx.technik || "", i_mobil: f.firmaTelefon || "", i_email: f.firmaEmail || "", i_datum: dnesCz(),
        z_jmeno: zk.company || zk.name || "", z_ico: zk.ico || "", z_dic: bezCZ(zk.dic),
        z_ulice: sidloAdr.ulice, z_cp: sidloAdr.cp, z_psc: sidloAdr.psc, z_obec: sidloAdr.obec, z_cast: "",
        z_or: "", z_spzn: "", z_zastoupena: "", z_mobil: zk.phone || "", z_email: zk.email || "", z_datum: dnesCz(),
        hladina: "NN", smlouva: "", ean_odber: konecEan(ctx.z?.udaje?.ean), ean_dodavka: "",
        v_ulice: mistoAdr.ulice, v_cp: mistoAdr.cp, v_psc: mistoAdr.psc, v_obec: mistoAdr.obec, v_cast: "",
        zdroj: "slunce", vm_kw: "", vm_kva: "",
        s_kw: "", s_kva: "", s_vyrobce: sVyrobce || "", s_typ: sTyp.join(" "), s_sn: stridac?.sn || "", s_fw: "", s_nastaveni: "Czech",
        a_vyrobce: bVyrobce || "", a_typ: bTyp.join(" "), a_kw: "", a_kwh: "",
        p_kwp: kwp ? fmt(kwp) : "", p_pocet: panely.length ? String(panely.length) : "", p_vyrobce: pVyrobce || "", p_typ: pTyp.join(" "),
        certifikaty: true, c_vydal: "", c_cislo: "", c_datum: "",
      };
    },
    doPdf(h) {
      const text = {
        "Jmeno 1": h.i_jmeno, "ICO 1": h.i_ico, "DIC 1": h.i_dic, "Ulice 1": h.i_ulice, "C.p. 1": h.i_cp, "PSC 1": h.i_psc, "Obec 1": h.i_obec, "Mistni cast 1": h.i_cast,
        "Zastoupena 1": h.i_zastoupena, "Mobil 1": h.i_mobil, "E-mail 1": h.i_email, "Datum podpisu 1": h.i_datum,
        "Jmeno 2": h.z_jmeno, "ICO 2": h.z_ico, "DIC 2": h.z_dic, "Ulice 2": h.z_ulice, "C.p. 2": h.z_cp, "PSC 2": h.z_psc, "Obec 2": h.z_obec, "Mistni cast 2": h.z_cast,
        "OR/ZR": h.z_or, "Sp. zn": h.z_spzn, "Zastoupena 2": h.z_zastoupena, "Mobil 2": h.z_mobil, "E-mail 2": h.z_email, "Datum podpisu 2": h.z_datum,
        "Napetova hladina": h.hladina, "Cislo smlouvy": h.smlouva, "EAN odberu": h.ean_odber, "EAN dodavky": h.ean_dodavka,
        "Ulice 3": h.v_ulice, "C.p. 3": h.v_cp, "PSC 3": h.v_psc, "Obec 3": h.v_obec, "Mistni cast 3": h.v_cast,
        "Zdroj primarni energie": h.zdroj, "kW 1": h.vm_kw, "kVA 1": h.vm_kva, "kW 2": h.s_kw, "kVA 2": h.s_kva,
        "Vyrobce 1": h.s_vyrobce, "Typ 1": h.s_typ, "Vyrobni c. 1": h.s_sn, "Firmware 1": h.s_fw, Nastaveni: h.s_nastaveni,
        "Vyrobce 2": h.a_vyrobce, "Typ 2": h.a_typ, "kW 3": h.a_kw, kWh: h.a_kwh,
        kWp: h.p_kwp, Pocet: h.p_pocet, "Vyrobce 3": h.p_vyrobce, "Typ 3": h.p_typ,
        "Certifikat vydan": h.c_vydal, "Cislo certifikatu": h.c_cislo, "Datum vydani": h.c_datum,
      };
      const zaskrtnout = { Stridaci: true, "Asynchronim generatoru": false, ...Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`certifikat ${i + 1}`, !!h.certifikaty])) };
      return { text, zaskrtnout, vybrat: {} };
    },
  },

  // ── Protokol o nastavení ochran ────────────────────────────────────────────
  {
    id: "ochrany", nazev: "Protokol o nastavení ochran", ikona: "🛡️", soubor: "Protokol o nastaveni ochran", html: true,
    plati: (z) => ["FVE", "FVR", "FVO", "REA"].includes(z?.typ),
    sekce: [
      { nazev: "Střídač", pole: [{ id: "stridac", label: "Střídač (typ)" }, { id: "sn", label: "SN" }, { id: "distributor", label: "Distributor", typ: "select", moznosti: ["ČEZ Distribuci", "EG.D", "PREdistribuci"] }] },
      { nazev: "Napěťové ochrany", pole: [
        { id: "u1", label: "Nadpětí 1. stupeň [V]" }, { id: "u1t", label: "zpoždění" },
        { id: "u2", label: "Nadpětí 2. stupeň [V]" }, { id: "u2t", label: "zpoždění" },
        { id: "u3", label: "Nadpětí 3. stupeň [V]" }, { id: "u3t", label: "zpoždění" },
        { id: "up", label: "Podpětí 1. stupeň [V]" }, { id: "upt", label: "zpoždění" },
      ] },
      { nazev: "Frekvenční ochrany a náběh", pole: [
        { id: "fn", label: "Nadfrekvence [Hz]" }, { id: "fnt", label: "zpoždění" },
        { id: "fp", label: "Podfrekvence [Hz]" }, { id: "fpt", label: "zpoždění" },
        { id: "nabeh", label: "Zpoždění náběhu střídače" },
      ] },
      { nazev: "Výrobna a kontrola", pole: [
        { id: "vyrobce", label: "Jméno výrobce (zákazník)", sirka: 2 }, { id: "adresa", label: "Adresa výrobny", sirka: 2 },
        { id: "technik", label: "Jméno technika" }, { id: "datum", label: "Datum provedení kontroly" },
        { id: "funkce", label: "Funkce technika" },
      ] },
    ],
    pamatovat: ["u1", "u1t", "u2", "u2t", "u3", "u3t", "up", "upt", "fn", "fnt", "fp", "fpt", "nabeh", "funkce"],
    predvyplnit(ctx) {
      const { stridac, zk } = zakladZakazky(ctx);
      const dist = String(ctx.z?.podklady?.odberne?.distribuce || "");
      return {
        stridac: stridac?.nazev || "", sn: stridac?.sn || "",
        distributor: /EG/i.test(dist) ? "EG.D" : /PRE/i.test(dist) ? "PREdistribuci" : "ČEZ Distribuci",
        u1: "253", u1t: "5 s", u2: "264,5", u2t: "0,1 s", u3: "276", u3t: "0,1 s", up: "195,5", upt: "2,7 s",
        fn: "51,5", fnt: "0,1 s", fp: "47,5", fpt: "0,1 s", nabeh: "20 min",
        vyrobce: zk.company || zk.name || "", adresa: ctx.z?.misto_adresa || zk.address || "",
        technik: ctx.technik || "", datum: dnesCz(), funkce: "Technický specialista",
      };
    },
  },
];

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function htmlProtokolu(h, firma = {}) {
  const radek = (nazev, hodnota, zpozdeni) => `<tr><td>${esc(nazev)}</td><td>${esc(hodnota)}</td><td>${esc(zpozdeni)}</td></tr>`;
  const css = "font-family:Calibri,Arial,sans-serif;color:#111;";
  return `<div style="${css}padding:56px 64px;font-size:15px;line-height:1.45">
  <h1 style="text-align:center;font-size:26px;margin:0 0 22px">Protokol o nastavení ochran</h1>
  <div style="font-size:16px;margin-bottom:16px"><b>Střídač:</b> ${esc(h.stridac)}${h.sn ? `, <b>SN:</b> ${esc(h.sn)}` : ""}</div>
  <style>.po td,.po th{border:1px solid #333;padding:6px 10px;text-align:left}.po{border-collapse:collapse;width:100%;margin-bottom:16px}.po th{background:#f0f0f0}</style>
  <table class="po"><tr><th style="width:40%">Veličina</th><th>Hodnota</th><th>Zpoždění</th></tr>
    ${radek("Nadpětí 1. stupeň", `Un = ${h.u1} V`, h.u1t)}${radek("Nadpětí 2. stupeň", `Un = ${h.u2} V`, h.u2t)}${radek("Nadpětí 3. stupeň", `Un = ${h.u3} V`, h.u3t)}${radek("Podpětí 1. stupeň", `Up = ${h.up} V`, h.upt)}
  </table>
  <table class="po"><tr><th style="width:40%">Veličina</th><th>Hodnota</th><th>Zpoždění</th></tr>
    ${radek("Nadfrekvence", `Fn = ${h.fn} Hz`, h.fnt)}${radek("Podfrekvence", `Fn = ${h.fp} Hz`, h.fpt)}
  </table>
  <table class="po"><tr><th style="width:40%">Náběh střídače</th><th colspan="2">Hodnota</th></tr>
    <tr><td>Zpoždění náběhu střídače</td><td colspan="2">t = ${esc(h.nabeh)}</td></tr>
  </table>
  <table style="width:100%;margin-top:10px;font-size:15px"><tr><td style="width:42%;padding:3px 0">Jméno výrobce:</td><td><b>${esc(h.vyrobce)}</b></td></tr>
    <tr><td style="padding:3px 0">Adresa výrobny:</td><td><b>${esc(h.adresa)}</b></td></tr>
    <tr><td style="padding:3px 0">Jméno technika:</td><td><b>${esc(h.technik)}</b></td></tr>
    <tr><td style="padding:3px 0">Datum provedení kontroly:</td><td><b>${esc(h.datum)}</b></td></tr></table>
  <p style="margin:22px 0 40px">Na střídači byl proveden test a střídač splňuje podmínky platné pro ${esc(h.distributor)} dle uzavřené smlouvy o připojení a schválené projektové dokumentace.</p>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:30px">
    <div style="font-size:14px;line-height:1.5"><b>${esc(h.technik)}</b><br>${esc(h.funkce)}<br>${esc(firma.firmaNazev)}<br>${esc(firma.firmaUlice)}, ${esc(firma.firmaMesto)}<br>${firma.firmaEmail ? `E-mail: ${esc(firma.firmaEmail)}<br>` : ""}${firma.firmaWeb ? `${esc(firma.firmaWeb)}<br>` : ""}${esc(firma.firmaTelefon)}</div>
    <div style="width:260px;border-top:1px solid #333;text-align:center;padding-top:4px;font-size:13px;color:#444">razítko a podpis</div>
  </div>
</div>`;
}

let fontCache = null;
// Vyplní PDF šablonu formuláře → Blob (pole zůstanou upravitelná)
export async function vyplnitPdf(def, h) {
  const [{ PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown }, fontkit] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit").then((m) => m.default || m)]);
  const [sablona, font] = await Promise.all([
    fetch(def.sablona).then((r) => { if (!r.ok) throw new Error("Šablona formuláře nenalezena"); return r.arrayBuffer(); }),
    fontCache || fetch("/fonts/DejaVuSans.ttf").then((r) => r.arrayBuffer()).then((b) => (fontCache = b)),
  ]);
  const doc = await PDFDocument.load(sablona);
  doc.registerFontkit(fontkit);
  const pismo = await doc.embedFont(font, { subset: true });
  const form = doc.getForm();
  const { text, zaskrtnout, vybrat } = def.doPdf({ ...h, ...(def.dopocet ? def.dopocet(h) : {}) });
  for (const [jmeno, v] of Object.entries(text)) {
    const p = form.getFieldMaybe(jmeno);
    if (p instanceof PDFTextField) p.setText(String(v ?? ""));
  }
  for (const [jmeno, v] of Object.entries(zaskrtnout)) {
    const p = form.getFieldMaybe(jmeno);
    if (p instanceof PDFCheckBox) { if (v) p.check(); else p.uncheck(); }
  }
  for (const [jmeno, v] of Object.entries(vybrat)) {
    const p = form.getFieldMaybe(jmeno);
    if (p instanceof PDFDropdown && v) { try { p.select(v); } catch { /* hodnota mimo nabídku */ } }
  }
  form.updateFieldAppearances(pismo);
  return new Blob([await doc.save()], { type: "application/pdf" });
}

// Protokol (HTML → PDF, stejně jako servisní zpráva)
export async function protokolPdf(h, firma) {
  const [{ jsPDF }, h2c] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const el = document.createElement("div");
  Object.assign(el.style, { position: "fixed", left: "-10000px", top: "0", width: "794px", background: "#fff" });
  el.innerHTML = htmlProtokolu(h, firma);
  document.body.appendChild(el);
  try {
    const canvas = await h2c.default(el, { scale: 2, backgroundColor: "#ffffff" });
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, Math.min(297, (canvas.height / canvas.width) * 210));
    return doc.output("blob");
  } finally {
    document.body.removeChild(el);
  }
}
