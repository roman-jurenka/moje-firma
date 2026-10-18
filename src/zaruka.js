// ─── Záruka zakázky ──────────────────────────────────────────────────────────
// Záruka běží od data předání díla (contracts.datum_predani). Délka v měsících
// podle typu zakázky — nastavuje se v Servisu (app_settings, klíč ZARUKA_KEY,
// { "FVE": 24, … }), výchozí 24 měsíců.

export const ZARUKA_KEY = "zaruka_mesice";
export const VYCHOZI_MESICE = 24;
export const BRZY_KONCI_DNI = 30;

const isoDen = (d) => d.toLocaleDateString("sv-SE");
export const fmtDen = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("cs-CZ") : "");

export const mesiceZaruky = (typ, nastaveni) => {
  const v = Number(nastaveni?.[typ]);
  return v > 0 ? v : VYCHOZI_MESICE;
};

// Typ zakázky z kódu (FVE-2610-RJ-0001) nebo ze sloupce type.
export const typZakazky = (c) => c?.type || String(c?.code || "").split("-")[0] || "";

// null = datum předání neznámé
export function stavZaruky(contract, nastaveni, dnes = new Date()) {
  if (!contract?.datum_predani) return null;
  const mesice = mesiceZaruky(typZakazky(contract), nastaveni);
  const [y, m, d] = contract.datum_predani.split("-").map(Number);
  const konec = new Date(y, m - 1 + mesice, d);
  const dnesD = new Date(dnes.getFullYear(), dnes.getMonth(), dnes.getDate());
  const zbyvaDni = Math.round((konec - dnesD) / 86400000);
  return {
    od: contract.datum_predani, do: isoDen(konec), mesice,
    vZaruce: zbyvaDni >= 0, zbyvaDni, brzyKonci: zbyvaDni >= 0 && zbyvaDni <= BRZY_KONCI_DNI,
  };
}
