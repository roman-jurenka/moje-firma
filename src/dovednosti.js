// ─── Dovednosti zaměstnanců a „Na starosti“ v kalendáři ──────────────────────
// Dovednosti se zaškrtávají v profilu zaměstnance (employees.dovednosti,
// pole textů). U akce v kalendáři se vybírá, co má člověk na starosti
// (calendar_events.na_starosti) — podle toho appka seřadí, kdo to umí, a
// upozorní, když vybraný zaměstnanec danou dovednost nemá.

export const DOVEDNOSTI = [
  { id: "strecha", label: "Montáž na střeše (FVE)", ikona: "🏠" },
  { id: "elektro", label: "Elektro zapojení FVE", ikona: "⚡" },
  { id: "hromosvody", label: "Hromosvody a uzemnění", ikona: "⏚" },
  { id: "elektroinstalace", label: "Elektroinstalace", ikona: "🔌" },
  { id: "revize", label: "Revize", ikona: "📋" },
  { id: "servis", label: "Servis FVE", ikona: "🔧" },
  { id: "vysky", label: "Práce ve výškách", ikona: "🪜" },
  { id: "vyhl6", label: "Vyhláška 50 — §6 (pracovník znalý)", ikona: "🎓" },
  { id: "vyhl7", label: "Vyhláška 50 — §7 (samostatný)", ikona: "🎓" },
  { id: "vyhl8", label: "Vyhláška 50 — §8 (vedoucí)", ikona: "🎓" },
  { id: "ridic", label: "Řidičák B", ikona: "🚗" },
];
export const dovednost = (id) => DOVEDNOSTI.find((d) => d.id === id) || { id, label: id, ikona: "•" };

// Co má zaměstnanec u akce na starosti → jaká dovednost je k tomu potřeba.
export const NA_STAROSTI = [
  { id: "strecha", label: "Střecha", ikona: "🏠", dovednost: "strecha" },
  { id: "elektro", label: "Elektro", ikona: "⚡", dovednost: "elektro" },
  { id: "uzemneni", label: "Uzemnění", ikona: "⏚", dovednost: "hromosvody" },
  { id: "elektroinstalace", label: "Elektroinstalace", ikona: "🔌", dovednost: "elektroinstalace" },
  { id: "revize", label: "Revize", ikona: "📋", dovednost: "revize" },
  { id: "servis", label: "Servis", ikona: "🔧", dovednost: "servis" },
  { id: "cela", label: "Celá zakázka / vedoucí party", ikona: "👷", dovednost: null },
];
export const naStarosti = (id) => NA_STAROSTI.find((n) => n.id === id) || null;

// Umí zaměstnanec, co je potřeba? (null = nic konkrétního se nevyžaduje)
export function umi(zamestnanec, naStarostiId) {
  const potreba = naStarosti(naStarostiId)?.dovednost;
  if (!potreba) return null;
  return (zamestnanec?.dovednosti || []).includes(potreba);
}

// Zaměstnanci seřazení tak, že ti, kdo danou věc umí, jsou nahoře.
export function seraditPodleDovednosti(zamestnanci, naStarostiId) {
  return [...(zamestnanci || [])].sort((a, b) => Number(umi(b, naStarostiId) === true) - Number(umi(a, naStarostiId) === true)
    || String(a.name || "").localeCompare(String(b.name || ""), "cs"));
}
