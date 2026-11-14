// ─── Plán příspěvků na Instagram z fotek realizací ──────────────────────────
// Bez napojení na Instagram API: z fotek zakázek (contract_photos) se sestaví
// návrhy příspěvků — formát, téma podle sezóny, fotky, text a hashtagy.
// Zveřejňuje se ručně (Sdílet v mobilu → Instagram), modul Instagram.jsx.
// „Trendy“ jsou sezónní témata a formáty, které u místních řemeslných firem
// fungují; nejsou to živá data z Instagramu.

export const FORMATY = {
  realizace: { label: "Karusel realizace", ikona: "ti-photo", barva: "#0E3B5E" },
  pred_po: { label: "Před a po", ikona: "ti-arrows-left-right", barva: "#7c3aed" },
  zakulisi: { label: "Zákulisí montáže", ikona: "ti-helmet", barva: "#B45309" },
  tip: { label: "Tip / téma měsíce", ikona: "ti-bulb", barva: "#1E7A3C" },
};

// Co teď na Instagramu funguje u místních firem (formát, ne konkrétní příspěvek).
export const TRENDY_FORMATU = [
  "Karusel 5–10 fotek z jedné realizace má u ukázek práce největší dosah — první fotka rozhoduje, dejte tu nejhezčí.",
  "„Před a po“ jako Reel: v Instagramu zvolte Reel, vložte fotky a dejte trendy zvuk — Reels se ukazují i lidem, kteří vás nesledují.",
  "Zákulisí s lidmi z party (bez detailů obličejů, pokud nechtějí) buduje důvěru víc než hotová střecha.",
  "Max. 5 hashtagů — Instagram už víc nepodporuje; víc pomůže označit místo (obec) přímo v příspěvku.",
  "Publikujte večer 18–20 h, nejlépe út / čt / ne. Pravidelnost je důležitější než množství.",
];

// Sezónní témata: [měsíc 0–11] → [{ nazev, text, tag }]
export const TEMATA_MESICE = [
  [
    { nazev: "Kolik vyrobí FVE v zimě", text: "I v lednu panely vyrábí — méně než v létě, ale každá vyrobená kWh je kWh, kterou nekoupíte. S baterií ji navíc využijete i večer.", tag: "#zimnivyroba" },
    { nazev: "Jarní termíny se plní", text: "Chcete fotovoltaiku do jara? Obhlídky a návrhy děláme už teď, aby montáž proběhla hned, jak to počasí dovolí.", tag: "#planujfve" },
  ],
  [
    { nazev: "Sníh na panelech", text: "Sníh z panelů neshrnujte košťětem ani lopatou — poškrábete sklo. Panely ho většinou samy rozpustí během pár slunečných hodin.", tag: "#tipfve" },
    { nazev: "Jarní termíny montáží", text: "Montážní sezóna je za dveřmi. Kdo se ozve teď, má fotovoltaiku hotovou v době, kdy slunce začne opravdu vyrábět.", tag: "#planujfve" },
  ],
  [
    { nazev: "Start sezóny", text: "Sezóna montáží začala! První střechy letošního roku už vyrábí.", tag: "#novasezona" },
    { nazev: "Čištění panelů po zimě", text: "Prach a pyl umí ubrat i několik procent výkonu. Jarní čištění a kontrola vrátí panelům plný výkon.", tag: "#cistenifve" },
  ],
  [
    { nazev: "Kontrola po zimě", text: "Po zimě se vyplatí zkontrolovat kabeláž, uchycení a výrobu ve střídači. Revizi a diagnostiku zajistíme i u FVE od jiných firem.", tag: "#revizefve" },
    { nazev: "Ohřev vody z přebytků", text: "Přebytky z poledne nemusí jít levně do sítě — můžou ohřát vodu v bojleru. Jednoduché a rychle návratné.", tag: "#ohrevvody" },
  ],
  [
    { nazev: "Rekordní výroba", text: "Květen = rekordní výroba. Takhle vypadá den, kdy dům běží celý ze slunce.", tag: "#vlastnielektrina" },
    { nazev: "Hromosvod před bouřkami", text: "Bouřková sezóna začíná. Hromosvod a přepěťová ochrana chrání dům i fotovoltaiku — a revize musí být platná.", tag: "#hromosvod" },
  ],
  [
    { nazev: "Bouřky a přepětí", text: "Úder blesku do okolí stačí, aby přepětí zničilo střídač i spotřebiče. Přepěťová ochrana stojí zlomek ceny opravy.", tag: "#hromosvod" },
    { nazev: "Vlastní spotřeba vs. přetoky", text: "Nejvíc ušetříte, když elektřinu spotřebujete doma. Pračka, myčka a bojler v poledne = nižší účet.", tag: "#usporaenergie" },
  ],
  [
    { nazev: "Léto na střeše", text: "Na střeše je v létě přes 50 °C — a my tam stejně jsme. Díky celé partě, která montuje i v horku!", tag: "#nasipartaci" },
    { nazev: "Půl roku s FVE", text: "Kolik ušetří fotovoltaika za půl roku? Ukážeme na reálných datech od našich zákazníků.", tag: "#uspora" },
  ],
  [
    { nazev: "Baterie k fotovoltaice", text: "Máte FVE bez baterie? Doplníme ji — přes den nabije, večer a v noci spotřebujete vlastní elektřinu.", tag: "#baterie" },
    { nazev: "Montáž ještě letos", text: "Chcete FVE ještě letos? Podzimní termíny se plní, ozvěte se s předstihem.", tag: "#planujfve" },
  ],
  [
    { nazev: "Poslední termíny v roce", text: "Zbývá posledních pár termínů montáže letos. Kdo chce vyrábět od jara, má nejvyšší čas.", tag: "#planujfve" },
    { nazev: "Baterie na zimu", text: "V zimě vyrábí panely hlavně přes poledne — baterie posune tu elektřinu na večer, kdy ji opravdu potřebujete.", tag: "#baterie" },
  ],
  [
    { nazev: "Příprava FVE na zimu", text: "Kontrola střídače, kabeláže a uchycení před zimou vás ušetří nepříjemných překvapení.", tag: "#servisfve" },
    { nazev: "Záloha při výpadku proudu", text: "Vypadl proud a u vás svítí? S hybridním střídačem a baterií to jde — záložní okruh pro lednici, kotel i internet.", tag: "#zaloha" },
  ],
  [
    { nazev: "Elektřina i za tmy", text: "Krátké dny = drahé večery. Baterie uloží polední výrobu a večer šetří tam, kde je elektřina nejdražší.", tag: "#baterie" },
    { nazev: "Záloha proti výpadku", text: "Výpadek proudu v zimě znamená studený kotel. Záložní napájení z baterie udrží topení i lednici v chodu.", tag: "#zaloha" },
    { nazev: "Kontrola před zimou", text: "Revize, diagnostika, čištění — postaráme se i o elektrárny, které stavěl někdo jiný.", tag: "#revizefve" },
    { nazev: "FVE na jaro", text: "Návrh a obhlídka teď, montáž hned na jaře. Kdo plánuje v zimě, vyrábí od prvního slunce.", tag: "#planujfve" },
  ],
  [
    { nazev: "Rok v realizacích", text: "Za rok jsme postavili a zapojili spoustu střech. Děkujeme všem, kteří nám dali důvěru!", tag: "#dekujeme" },
    { nazev: "Dárek pod stromeček", text: "Netradiční dárek pro rodiče s fotovoltaikou: kontrola a čištění elektrárny.", tag: "#darek" },
  ],
];

export const tematMesice = (datum = new Date()) => TEMATA_MESICE[new Date(datum).getMonth()];

// Druh realizace podle typu zakázky / průběhu (FVE, FVR, FVO, HRM, ELK, SRV…)
export function druhRealizace(typ) {
  const t = String(typ || "").toUpperCase();
  if (t.includes("FVR")) return "FVR";
  if (t.includes("FVO")) return "FVO";
  if (t.includes("HRM")) return "HRM";
  if (t.includes("ELK")) return "ELK";
  if (t.includes("SRV")) return "SRV";
  if (t.includes("FVE")) return "FVE";
  return "REA";
}

// Jen obec — ulice a číslo domu na Instagram nepatří.
// „Věry Pánkové 829/2, 779 00 Olomouc“ → „Olomouc“, „Cetkovice 270“ → „Cetkovice“
export function obecZAdresy(...zdroje) {
  for (const z of zdroje) {
    const s = String(z || "").trim();
    if (!s) continue;
    const psc = s.match(/\d{3}\s?\d{2}\s+([^,\d]+)/);
    if (psc) return psc[1].trim();
    const prvni = s.split(",")[0].replace(/\s+\d+[\w/]*\s*$/, "").replace(/\d.*$/, "").trim();
    if (prvni) return prvni;
  }
  return "";
}

const bezDiakritiky = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "");
const tagObce = (obec) => (obec ? "#" + bezDiakritiky(obec).toLowerCase().replace(/[^a-z0-9]/g, "") : "");

const TAGY_DRUHU = { FVE: "#fotovoltaika", FVR: "#baterie", FVO: "#ohrevvody", HRM: "#hromosvod", ELK: "#elektrikar", SRV: "#servisfve", REA: "#fotovoltaika" };

// Instagram bere max. 5 hashtagů: druh, obec, kraj, firma, téma.
export function hashtagy(druh, obec, tema) {
  const t = [TAGY_DRUHU[druh] || "#fotovoltaika", tagObce(obec), "#olomouckykraj", "#jurenkaelektro", tema?.tag || "#energetickanezavislost"];
  return [...new Set(t.filter(Boolean))].slice(0, 5).join(" ");
}

const CO = {
  FVE: "fotovoltaickou elektrárnu", FVR: "rozšíření fotovoltaiky", FVO: "fotovoltaiku na ohřev vody",
  HRM: "nový hromosvod", ELK: "elektroinstalaci", SRV: "servis fotovoltaiky", REA: "další realizaci",
};
const VYZVA_FVE = "📩 Chcete taky vlastní elektřinu? Napište nám do zpráv nebo zavolejte — rádi spočítáme, co by to udělalo u vás.";
const vyzva = (druh) => (["HRM", "ELK"].includes(druh) ? "📩 Potřebujete elektrikáře? Napište nám do zpráv nebo zavolejte — domluvíme termín." : VYZVA_FVE);

const ve = (obec) => (obec ? ` · ${obec}` : "");

// Co realizace zákazníkovi přináší — druhá věta karuselu
const PRINOS = {
  FVE: "Od teď tu vyrábí vlastní elektřinu ze slunce.", FVR: "Elektrárna teď zvládne víc — a vlastní elektřina vydrží i na večer.",
  FVO: "Teplou vodu teď ohřívá slunce místo drahé elektřiny ze sítě.", HRM: "Dům je chráněný před bleskem a revize je v pořádku.",
  ELK: "Nová elektroinstalace — bezpečná, přehledná a připravená na další spotřebiče.", SRV: "Elektrárna zase vyrábí naplno.",
  REA: "Další dílo, za kterým si stojíme.",
};

export function popisek(format, { druh = "REA", obec = "", tema = null, varianta = 0 } = {}) {
  const co = CO[druh] || CO.REA;
  if (format === "tip") {
    return `💡 ${tema?.nazev || "Tip od elektrikáře"}\n\n${tema?.text || ""}\n\n${vyzva(druh)}`;
  }
  if (format === "pred_po") {
    return `Před ➡️ po${obec ? ` · ${obec}` : ""}\n\nTakhle vypadala střecha při obhlídce a takhle dnes, když už vyrábí. Posuňte doprava a uvidíte rozdíl 👉\n\n${vyzva(druh)}`;
  }
  if (format === "zakulisi") {
    return `🔧 Zákulisí montáže${obec ? ` · ${obec}` : ""}\n\nTakhle u nás vzniká ${co} — kus po kusu, s důrazem na detail, který potom nikdo nevidí, ale na kterém záleží.\n\n${vyzva(druh)}`;
  }
  const varianty = [
    `☀️ Hotovo${ve(obec)}!\n\nPředali jsme ${co}. ${PRINOS[druh] || PRINOS.REA}`,
    `Další spokojený zákazník${ve(obec)} ✅\n\nMáme za sebou ${co} — od návrhu přes montáž až po předání, všechno z jedné ruky. ${PRINOS[druh] || PRINOS.REA}`,
    `Nová realizace${ve(obec)} ⚡\n\nPředali jsme ${co}. ${PRINOS[druh] || PRINOS.REA} Děkujeme za důvěru!`,
  ];
  return `${varianty[varianta % varianty.length]}\n\n${vyzva(druh)}`;
}

// ─── Fotky ───────────────────────────────────────────────────────────────────

const OBRAZEK = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i;
const NE_NA_IG = ["Dokumenty", "Předávací protokol", "Uzemnění"];
export const jeFotkaProIg = (f) => {
  const cesta = String(f.storage_path || String(f.url || "").split("?")[0]);
  return OBRAZEK.test(cesta) && !NE_NA_IG.includes(f.category);
};

const PORADI_KAT = { "Po montáži": 0, "Střecha": 1, "Průběh montáže": 2, null: 3, "Ostatní": 4, "Obhlídka": 5 };
const poradiKat = (f) => PORADI_KAT[f.category ?? null] ?? 3;

export function fotkyProFormat(format, fotky) {
  const serazene = [...fotky].sort((a, b) => poradiKat(a) - poradiKat(b) || String(b.date || "").localeCompare(String(a.date || "")));
  if (format === "pred_po") {
    const pred = fotky.find((f) => f.category === "Obhlídka");
    const po = serazene.filter((f) => f.category === "Po montáži").slice(0, 3);
    return pred && po.length ? [pred, ...po] : [];
  }
  if (format === "zakulisi") return fotky.filter((f) => f.category === "Průběh montáže").slice(0, 10);
  if (format === "tip") return serazene.filter((f) => f.category !== "Obhlídka").slice(0, 1);
  return serazene.filter((f) => f.category !== "Obhlídka").slice(0, 10);
}

// Fotky → realizace (jedna zakázka nebo průběh bez zakázky), nejnovější první.
export function realizaceZFotek({ fotky, contracts, prubehy }) {
  const cMap = new Map((contracts || []).map((c) => [c.id, c]));
  const pMap = new Map((prubehy || []).map((p) => [p.id, p]));
  const out = new Map();
  for (const f of fotky || []) {
    if (f.ticket_id || !jeFotkaProIg(f)) continue;
    const p = f.prubeh_id ? pMap.get(f.prubeh_id) : null;
    const contractId = f.contract_id || p?.contract_id || null;
    const key = contractId ? `c${contractId}` : p ? `p${p.id}` : null;
    if (!key) continue;
    if (!out.has(key)) {
      const c = contractId ? cMap.get(contractId) : null;
      const prubeh = p || (prubehy || []).find((x) => x.contract_id === contractId) || null;
      out.set(key, {
        key, contract_id: contractId, prubeh_id: prubeh?.id || null,
        nazev: c?.name || prubeh?.nazev || "Realizace",
        druh: druhRealizace(c?.type || prubeh?.typ),
        obec: obecZAdresy(c?.address, c?.name, prubeh?.nazev),
        fotky: [], posledni: "",
      });
    }
    const r = out.get(key);
    r.fotky.push(f);
    const d = String(f.date || f.created_at || "");
    if (d > r.posledni) r.posledni = d;
  }
  return [...out.values()].sort((a, b) => b.posledni.localeCompare(a.posledni));
}

export const klicRealizace = (x) => (x.contract_id ? `c${x.contract_id}` : x.prubeh_id ? `p${x.prubeh_id}` : null);

// ─── Plán ────────────────────────────────────────────────────────────────────

const iso = (d) => d.toLocaleDateString("sv-SE");

// Dny vydání od zítřka na `tydnu` týdnů dopředu; dny = čísla dne v týdnu (0 = ne).
export function terminy({ od = new Date(), tydnu = 4, dny = [2, 4, 0] } = {}) {
  const out = [];
  const d = new Date(od);
  d.setHours(12, 0, 0, 0);
  for (let i = 1; i <= tydnu * 7; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    if (dny.includes(x.getDay())) out.push(x);
  }
  return out;
}

// Vrátí nové příspěvky (bez id) do volných termínů. Realizace, které už v plánu
// jsou, se nepoužijí znovu; střídá se karusel → tip → před a po / zákulisí.
export function navrhnoutPlan({ realizace, existujici = [], od, tydnu, dny, cas = "18:30", vytvoril = null }) {
  const obsazene = new Set(existujici.map((p) => p.datum));
  const pouzite = new Set(existujici.map(klicRealizace).filter(Boolean));
  const volne = realizace.filter((r) => !pouzite.has(r.key));
  const uzitaTemata = new Set(existujici.filter((p) => p.format === "tip").map((p) => p.tema));
  const out = [];
  let krok = 0;
  for (const den of terminy({ od, tydnu, dny })) {
    const datum = iso(den);
    if (obsazene.has(datum)) continue;
    const temata = tematMesice(den);
    const tema = temata.find((t) => !uzitaTemata.has(t.nazev)) || temata[krok % temata.length];
    let format = ["realizace", "tip", "druhy"][krok % 3];
    let r = null, fotky = [];
    if (format === "druhy") {
      r = volne.find((x) => fotkyProFormat("pred_po", x.fotky).length) || volne.find((x) => fotkyProFormat("zakulisi", x.fotky).length >= 2);
      format = r ? (fotkyProFormat("pred_po", r.fotky).length ? "pred_po" : "zakulisi") : "realizace";
    }
    if (format !== "tip") {
      r = r || volne[0] || null;
      if (r) {
        volne.splice(volne.indexOf(r), 1);
        fotky = fotkyProFormat(format, r.fotky);
      } else format = "tip";
    }
    if (format === "tip") {
      uzitaTemata.add(tema.nazev);
      // tip ilustruje nejnovější fotka z kterékoli realizace
      fotky = realizace.length ? fotkyProFormat("tip", realizace[krok % realizace.length].fotky) : [];
    }
    const druh = r?.druh || "FVE";
    const obec = r?.obec || "";
    out.push({
      datum, cas, format, tema: format === "tip" ? tema.nazev : null,
      contract_id: r?.contract_id || null, prubeh_id: r?.prubeh_id || null,
      foto_ids: fotky.map((f) => f.id),
      popisek: popisek(format, { druh, obec, tema, varianta: krok }),
      hashtagy: hashtagy(druh, obec, format === "tip" ? tema : null),
      stav: "planovano", vytvoril,
    });
    krok++;
  }
  return out;
}
