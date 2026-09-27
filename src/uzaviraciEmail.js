// ─── Uzavírací e-mail objednateli (realizace na objednávku, typ REA) ─────────
// Po dokončení zakázky dostane objednatel odkaz na fotky z realizace a
// podepsaný předávací protokol. Šablonu jde v Průběhu upravit (admin /
// vedoucí) — uloží se do app_settings pod klíčem UZAVIRACI_EMAIL_KEY.
// Značky {…} se doplní z dat zakázky; neznámá značka zůstane, jak je.

export const UZAVIRACI_EMAIL_KEY = "prubeh_uzaviraci_email";

export const ZNACKY_UZAVIRACIHO_EMAILU = [
  ["objednatel", "jméno objednatele"],
  ["zakazka", "název zakázky"],
  ["cislo", "číslo zakázky"],
  ["misto", "místo realizace"],
  ["datum", "datum předání"],
  ["odkaz_fotky", "odkaz na fotky"],
  ["pocet_fotek", "počet fotek"],
  ["podpis", "kdo e-mail posílá"],
];

export const VYCHOZI_UZAVIRACI_EMAIL = {
  predmet: "Dokončení zakázky {zakazka} – fotodokumentace a předávací protokol",
  text: `Dobrý den,

zakázku {zakazka}{cislo} na adrese {misto} jsme dokončili a předali dne {datum}.

Fotodokumentaci z realizace ({pocet_fotek}) najdete zde:
{odkaz_fotky}

V příloze posíláme podepsaný předávací protokol.

Děkujeme za spolupráci. Kdybyste k zakázce cokoliv potřebovali, jsme Vám k dispozici — a rádi Vám pomůžeme i s dalšími zakázkami.

S pozdravem
{podpis}
Jurenka Elektro s.r.o.
+420 702 172 622 · info@jurenkaelektro.cz · www.jurenkaelektro.cz`,
};

export function vyplnitSablonu(sablona, hodnoty) {
  return String(sablona || "").replace(/\{([a-z_]+)\}/g, (m, k) => (k in hodnoty ? String(hodnoty[k] ?? "") : m));
}
