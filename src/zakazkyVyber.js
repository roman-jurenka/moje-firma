// Které zakázky se nabízejí ve výběrech (docházka, rychlá obrazovka, fronta
// faktur…): všechny od Nové po Dokončenou. Fakturované (uzavřené) se schovají —
// kromě zakázky, která už je u záznamu vybraná, ať nezmizí.
export const STAVY_VE_VYBERU = ["Nová", "Aktivní", "Probíhá", "Dokončena"];
export const zakazkaVeVyberu = (c, vybraneId) => !c?.status || STAVY_VE_VYBERU.includes(c.status) || (vybraneId != null && vybraneId !== "" && String(c.id) === String(vybraneId));
