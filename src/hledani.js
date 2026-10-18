// Hledání ve výběrech (SearchSelect): bez ohledu na velikost písmen
// a diakritiku, s tolerancí překlepů („kovarík“ najde „Sefy-Kovařik karel“,
// „novak“ i „Nowák“). Výsledky se řadí od nejpodobnějších.
export const bezDiakritiky = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const levenshtein = (a, b) => {
  if (a === b) return 0;
  let pred = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const rad = [i];
    for (let j = 1; j <= b.length; j++) {
      rad[j] = Math.min(pred[j] + 1, rad[j - 1] + 1, pred[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    pred = rad;
  }
  return pred[b.length];
};

// podobnost jednoho hledaného slova s jedním slovem textu (0–1)
const shodaSlova = (w, t) => {
  if (t === w) return 1;
  if (t.startsWith(w)) return 0.92;
  if (t.includes(w)) return 0.8;
  if (w.length < 3) return 0;
  const zacatek = t.slice(0, w.length);
  const s1 = 1 - levenshtein(w, zacatek) / w.length;
  const s2 = 1 - levenshtein(w, t) / Math.max(w.length, t.length);
  return Math.max(s1 * 0.85, s2 * 0.85);
};

// skóre shody dotazu s textem; 0 = nehodí se
export const skoreShody = (dotaz, text) => {
  const slova = bezDiakritiky(dotaz).trim().split(/\s+/).filter(Boolean);
  if (slova.length === 0) return 1;
  const cely = bezDiakritiky(text);
  const tokeny = cely.split(/[^a-z0-9]+/).filter(Boolean);
  let soucet = 0;
  for (const w of slova) {
    let nej = cely.includes(w) ? 0.75 : 0;
    for (const t of tokeny) nej = Math.max(nej, shodaSlova(w, t));
    if (nej < 0.6) return 0;
    soucet += nej;
  }
  return soucet / slova.length;
};

// vyfiltruje a seřadí položky podle podobnosti; text(o) = co se prohledává
export const seraditPodleShody = (polozky, dotaz, text) => {
  if (!bezDiakritiky(dotaz).trim()) return polozky;
  return polozky
    .map((o, i) => ({ o, i, s: skoreShody(dotaz, text(o)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.o);
};
