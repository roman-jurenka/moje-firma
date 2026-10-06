// ─── Denní zápis práce: bloky dne a hodiny ───────────────────────────────────
// Den zaměstnance = jeden nebo víc bloků (řádků docházky). Nový blok vzniká
// tlačítkem „Přepnout zakázku“ (konec jedné zakázky = začátek další).
// Pauza: 60 min JEDNOU ZA DEN, a jen když den trvá víc než 6 h. U víc bloků
// se rozpočítá poměrně podle délky bloků (stejně jako při schválení v DB,
// funkce schvalit_den), ať součet nákladů práce sedí s hodinami dne.

export const PAUZA_NAD_H = 6;
export const PAUZA_H = 1;

const naMinuty = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number(m) || 0) : null;
};

// hrubé hodiny bloku (bez pauzy); běžící blok = 0
export const hodinyBloku = (checkin, checkout) => {
  const a = naMinuty(checkin), b = naMinuty(checkout);
  return a == null || b == null ? 0 : Math.max(0, (b - a) / 60);
};

const empId = (r) => r.employee_id ?? r.employeeId;

// bloky jednoho zaměstnance v jednom dni, seřazené podle příchodu
export const blokyDne = (zaznamy, zamestnanecId, datum) => (zaznamy || [])
  .filter((a) => String(empId(a)) === String(zamestnanecId) && a.date === datum)
  .sort((a, b) => String(a.checkin || "").localeCompare(String(b.checkin || "")));

// běžící blok (bez odchodu), jinak poslední blok dne
export const aktualniBlok = (bloky) => (bloky || []).find((b) => b.checkin && !b.checkout) || (bloky || [])[bloky.length - 1] || null;

// souhrn dne pro zobrazení: první příchod, poslední odchod (null, dokud den běží)
export const souhrnDne = (bloky) => {
  if (!bloky?.length) return null;
  const bezi = bloky.some((b) => b.checkin && !b.checkout);
  return { checkin: bloky[0].checkin, checkout: bezi ? null : bloky[bloky.length - 1].checkout, bezi, pocet: bloky.length };
};

// hodiny dne: hrubé, pauza, efektivní
export const hodinyDne = (bloky) => {
  const hrube = (bloky || []).reduce((s, b) => s + hodinyBloku(b.checkin, b.checkout), 0);
  const pauza = hrube > PAUZA_NAD_H ? PAUZA_H : 0;
  return { hrube, pauza, efektivni: Math.max(0, hrube - pauza) };
};

// efektivní hodiny jednoho záznamu s poměrným dílem denní pauzy
export const efektivniHodinyZaznamu = (zaznam, vsechny) => {
  const h = hodinyBloku(zaznam.checkin, zaznam.checkout);
  if (!h) return 0;
  const den = blokyDne(vsechny && vsechny.length ? vsechny : [zaznam], empId(zaznam), zaznam.date);
  const { hrube, pauza } = hodinyDne(den.length ? den : [zaznam]);
  return hrube > 0 ? h * (hrube - pauza) / hrube : 0;
};

// dny čekající na schválení: [{ employee_id, date, bloky }]
export const dnyKeSchvaleni = (zaznamy, materialy = []) => {
  const klice = new Map();
  for (const a of zaznamy || []) {
    if (a.schvaleno) continue;
    klice.set(`${empId(a)}|${a.date}`, { employee_id: empId(a), date: a.date });
  }
  for (const m of materialy || []) {
    if (m.schvaleno || !m.date) continue;
    klice.set(`${m.employee_id}|${m.date}`, { employee_id: m.employee_id, date: m.date });
  }
  return [...klice.values()]
    .map((d) => ({ ...d, bloky: blokyDne(zaznamy, d.employee_id, d.date) }))
    .sort((a, b) => b.date.localeCompare(a.date) || String(a.employee_id).localeCompare(String(b.employee_id)));
};

export const hhmm = (t) => (t ? String(t).slice(0, 5) : "");
export const fmtH = (h) => { const m = Math.round((Number(h) || 0) * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`; };
export const bezDiakritiky = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
