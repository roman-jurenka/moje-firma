// ─── Kontroly a průvodce procesem zakázky ─────────────────────────────────────
// Co musí být v které fázi hotové (fotky, technické údaje, nabídka, smlouva,
// protokol) a texty „co teď dělat“. Kontrola má fázi `faze`, ve které se musí
// splnit: dokud v ní zakázka je, chyba brání posunu dál. Ve fázích za ní se
// nesplněná kontrola ukazuje jen jako upozornění (starší zakázky se tak
// nezaseknou zpětně).

import { FAZE, fazePlati } from "./prubehFaze.js";

export const MIN_FOTEK = { "Obhlídka": 3, "Po montáži": 5 };

// Co v dané fázi udělat (krátce, pro průvodce).
export const NAVOD = {
  poptavka: "Zapiš kontakt a adresu místa, ujasni si se zákazníkem, co chce, a domluv obhlídku.",
  obhlidka: "Na místě nafoť stav (aspoň 3 fotky), zapiš EAN, hlavní jistič a počet fází. Pak odškrtni obhlídku.",
  nabidka: "V Nacenění vytvoř a ulož nabídku s cenou, připoj ji k zakázce a pošli zákazníkovi.",
  jednani: "Počkej na vyjádření zákazníka. Schválenou nabídku přepni v Nacenění na „Schváleno“.",
  smlouva: "Vygeneruj návrh smlouvy, zkontroluj ho a nech podepsat. Podepsanou smlouvu nafoť / nahraj.",
  zaloha: "Vystav zálohovou fakturu a počkej na její zaplacení.",
  dokumentace: "Připrav projekt nebo schéma zapojení.",
  distributor: "Podej žádost u distributora a počkej na souhlas.",
  dotace: "Podej žádost o dotaci.",
  material: "Objednej materiál, potvrď se zákazníkem termín a naplánuj tým.",
  priprava: "Vydej a nalož materiál, zajisti lidi a dopravu.",
  montaz: "Proveď práce a nafoť hotové dílo (aspoň 5 fotek). Změny oproti smlouvě řeš dodatkem.",
  zprovozneni: "Zprovozni a otestuj zařízení.",
  revize: "Nech udělat revizi a ulož revizní zprávu.",
  predani: "Vygeneruj předávací protokol, předej dílo, seznam zákazníka s obsluhou a nech protokol podepsat.",
  pripojeni: "Zajisti uvedení do provozu u distributora.",
  vyuctovani: "Vystav konečnou fakturu a zkontroluj doplatek.",
  archiv: "Ulož dokumenty a naplánuj servisní / revizní termín.",
};

const poradi = (id) => FAZE.findIndex((f) => f.id === id);
const pocetFotek = (n) => `${n} ${n === 1 ? "fotka" : n > 1 && n < 5 ? "fotky" : "fotek"}`;

// ctx: { quote, fotky: [contract_photos], zakaznik, typ }
// Vrací [{ uroven: "chyba" | "pozor" | "ok", text, akce?, blokuje }]
export function kontrolyZakazky(z, ctx) {
  const iTed = poradi(z.faze);
  const fotky = ctx.fotky || [];
  const kat = (k) => fotky.filter((p) => p.category === k).length;
  const q = ctx.quote;
  const cenaNabidky = Math.round(Number(q?.data?.zakaznik?.cilovaCena) || 0);
  const dok = z.dokumenty || {};
  const vysledky = [];

  // faze = kde se musí splnit; platí jen, když zakázka tu fázi má a už v ní je (nebo za ní).
  const pridat = (faze, splneno, chyba, ok, akce, jenPozor = false) => {
    const f = FAZE.find((x) => x.id === faze);
    if (!f || !fazePlati(f, z) || iTed < poradi(faze)) return;
    if (splneno) { vysledky.push({ uroven: "ok", text: ok }); return; }
    const vTeto = iTed === poradi(faze);
    const uroven = vTeto && !jenPozor ? "chyba" : "pozor";
    vysledky.push({ uroven, text: chyba, akce, blokuje: uroven === "chyba" });
  };

  pridat("poptavka", !!z.customer_id, "Zakázka nemá vybraného zákazníka.", "Zákazník vybraný", null, true);
  pridat("poptavka", !!(z.misto_adresa || ctx.zakaznik?.address), "Chybí adresa místa realizace.", "Adresa místa zapsaná", "misto", true);

  const nObh = kat("Obhlídka");
  pridat("obhlidka", nObh >= 1, "Nemáš nahrané fotky z obhlídky.", `${pocetFotek(nObh)} z obhlídky`, "fotky:Obhlídka");
  if (nObh >= 1 && nObh < MIN_FOTEK["Obhlídka"] && iTed >= poradi("obhlidka")) {
    vysledky.push({ uroven: "pozor", text: `Jen ${pocetFotek(nObh)} z obhlídky — doporučeno aspoň ${MIN_FOTEK["Obhlídka"]}.`, akce: "fotky:Obhlídka" });
  }
  if (z.typ !== "HRM") {
    const u = z.udaje || {};
    pridat("obhlidka", !!(u.ean && u.jistic_a && u.faze), "Chybí technické údaje (EAN, jistič, počet fází).", `EAN ${u.ean || ""} · ${u.jistic_a || "?"} A · ${u.faze || "?"}f`, "udaje");
  }

  pridat("nabidka", !!q, "Nabídka není vytvořená ani připojená k zakázce.", `Nabídka ${q?.cislo || q?.name || ""} připojená`, "nabidka");
  if (q) {
    pridat("nabidka", cenaNabidky > 0, "Nabídka nemá cenu — dopočítej ji v Nacenění a ulož.", `Cena nabídky ${cenaNabidky.toLocaleString("cs-CZ")} Kč bez DPH`, "nabidka");
    pridat("nabidka", q.status !== "Návrh", "Nabídka ještě není odeslaná zákazníkovi.", `Nabídka ve stavu ${q.status}`, "nabidka");
    if (iTed >= poradi("jednani") && q.status === "Zamítnuto") {
      vysledky.push({ uroven: iTed === poradi("jednani") ? "chyba" : "pozor", text: "Zákazník nabídku zamítl — uprav nabídku, nebo zakázku označ jako prohranou.", akce: "nabidka", blokuje: iTed === poradi("jednani") });
    } else {
      pridat("jednani", q.status === "Schváleno", "Nabídka ještě není schválená zákazníkem.", "Nabídka schválená", "nabidka");
    }
  }

  const skenSmlouvy = kat("Smlouva");
  pridat("smlouva", !!dok.smlouva || skenSmlouvy > 0, "Smlouva není vygenerovaná ani nahraná.",
    skenSmlouvy ? `Podepsaná smlouva nahraná (${pocetFotek(skenSmlouvy)})` : "Návrh smlouvy vygenerovaný", "smlouva");
  if (dok.smlouva && !skenSmlouvy && iTed >= poradi("smlouva")) {
    vysledky.push({ uroven: "pozor", text: "Podepsaná smlouva zatím není nahraná (foto / sken).", akce: "sken:Smlouva" });
  }

  const nMont = kat("Po montáži");
  pridat("montaz", nMont >= 1, "Nemáš nahrané fotky hotového díla.", `${pocetFotek(nMont)} po montáži`, "fotky:Po montáži");
  if (nMont >= 1 && nMont < MIN_FOTEK["Po montáži"] && iTed >= poradi("montaz")) {
    vysledky.push({ uroven: "pozor", text: `Jen ${pocetFotek(nMont)} po montáži — doporučeno aspoň ${MIN_FOTEK["Po montáži"]}.`, akce: "fotky:Po montáži" });
  }

  const skenProt = kat("Předávací protokol");
  pridat("predani", !!dok.protokol || skenProt > 0, "Předávací protokol není vygenerovaný ani nahraný.",
    skenProt ? `Podepsaný protokol nahraný (${pocetFotek(skenProt)})` : "Předávací protokol vygenerovaný", "protokol");

  if ((dok.dodatky || []).length) {
    vysledky.push({ uroven: "ok", text: `Dodatky ke smlouvě: ${dok.dodatky.map((d) => `č. ${d.cislo}`).join(", ")}` });
  }
  // Nejdřív chyby, pak upozornění, nakonec splněné.
  const vaha = { chyba: 0, pozor: 1, ok: 2 };
  return vysledky.sort((a, b) => vaha[a.uroven] - vaha[b.uroven]);
}
