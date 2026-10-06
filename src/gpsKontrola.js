// ─── Kontrola milníků docházky podle GPS (jízdy z GPS Dozoru) ───────────────
// Ze jízd auta za den spočítá zastávky (kde a jak dlouho auto stálo), spáruje
// je s adresami zakázek, zkontroluje zapsané milníky a navrhne rozdělení dne.
import { bezDiakritiky, hhmm } from "./denniZapis.js";

const naMin = (t) => { const [h, m] = String(t || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const zMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const MIN_ZASTAVKA = 10;   // kratší stání (benzinka, semafor…) se neberou
const TOLERANCE_MILNIKU = 30;     // milník smí být od odjezdu/příjezdu vzdálen max. 30 min

// zastávky mezi jízdami: [{ od, do, minut, adresa }]
export function zastavky(jizdy) {
  const j = [...(jizdy || [])].filter((x) => x.zacatek && x.konec).sort((a, b) => naMin(a.zacatek) - naMin(b.zacatek));
  const out = [];
  for (let i = 0; i < j.length - 1; i++) {
    const od = naMin(j[i].konec), doo = naMin(j[i + 1].zacatek);
    if (doo - od >= MIN_ZASTAVKA) out.push({ od: zMin(od), do: zMin(doo), minut: doo - od, adresa: j[i].do_adresa || j[i + 1].z_adresa || "" });
  }
  return out;
}

// slova adresy bez diakritiky; PSČ a „CZ“ pryč
const slova = (a) => bezDiakritiky(a).replace(/\b\d{3}\s?\d{2}\b/g, " ").replace(/[,.]/g, " ").split(/\s+/)
  .filter((w) => w && w !== "cz" && w !== "ceska" && w !== "republika" && w !== "kraj" && (w.length >= 3 || /\d/.test(w)));

// jak moc adresa zastávky odpovídá adrese zakázky (0–1)
export function shodaAdresy(gps, zakazka) {
  if (!gps || !zakazka) return 0;
  const z = slova(zakazka), g = new Set(slova(gps));
  if (!z.length) return 0;
  const cislo = z.find((w) => /\d/.test(w));
  const zasah = z.filter((w) => g.has(w) || [...g].some((x) => x.length >= 5 && w.length >= 5 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))).length / z.length;
  if (cislo && g.has(cislo)) return Math.max(zasah, 0.8);
  // GPS u vesnic uvádí jen obec („Bratrušov, Olomoucký kraj“) — stačí shoda obce
  const gSlova = slova(gps);
  if (!gSlova.some((w) => /\d/.test(w)) && gSlova[0] && z.includes(gSlova[0])) return Math.max(zasah, 0.7);
  return zasah;
}

// nejlépe odpovídající zakázka zastávky
export function zakazkaZastavky(zastavka, zakazky) {
  let nej = null;
  for (const z of zakazky || []) {
    if (!z.adresa) continue;
    const s = shodaAdresy(zastavka.adresa, z.adresa);
    if (s >= 0.6 && (!nej || s > nej.shoda)) nej = { ...z, shoda: s };
  }
  return nej;
}

// upozornění: [{ typ, text }]
export function kontrolaDne(bloky, zast, zakazky, jizdy) {
  const upozorneni = [];
  if (!zast.length && !(jizdy || []).length) return upozorneni;
  const odjezdy = (jizdy || []).map((j) => naMin(j.zacatek)).filter((x) => x != null);
  const prijezdy = (jizdy || []).map((j) => naMin(j.konec)).filter((x) => x != null);
  // milníky (začátky částí kromě první) vs. odjezdy / příjezdy auta
  bloky.slice(1).forEach((b) => {
    const m = naMin(b.checkin);
    const nej = [...odjezdy, ...prijezdy].reduce((best, t) => (best == null || Math.abs(t - m) < Math.abs(best - m) ? t : best), null);
    if (nej != null && Math.abs(nej - m) > TOLERANCE_MILNIKU) {
      upozorneni.push({ typ: "milnik", text: `Milník ${hhmm(b.checkin)} — auto v tu dobu nejelo (nejbližší odjezd/příjezd ${zMin(nej)}).` });
    }
  });
  // části se zakázkou: stálo auto během části u adresy zakázky?
  bloky.forEach((b) => {
    if (!b.contract_id || !b.checkout) return;
    const zak = (zakazky || []).find((z) => String(z.id) === String(b.contract_id));
    if (!zak) return;
    if (!zak.adresa) { upozorneni.push({ typ: "info", text: `Zakázka „${zak.label}“ nemá adresu místa — GPS ji nemůže ověřit.` }); return; }
    const a = naMin(b.checkin), z = naMin(b.checkout);
    const prekryv = zast.filter((s) => naMin(s.od) < z && naMin(s.do) > a);
    if (!prekryv.some((s) => shodaAdresy(s.adresa, zak.adresa) >= 0.6)) {
      upozorneni.push({ typ: "zakazka", text: `${hhmm(b.checkin)}–${hhmm(b.checkout)} zapsáno „${zak.label}“, ale auto u adresy zakázky nestálo${prekryv.length ? ` (stálo: ${prekryv.map((s) => s.adresa.split(",")[0]).join("; ")})` : ""}.` });
    }
  });
  return upozorneni;
}

// návrh rozdělení dne: hranice = odjezd ze zastávky u zakázky; jízda patří k cíli
export function navrhMilniku(bloky, zast, zakazky) {
  if (!bloky.length) return [];
  const zacatek = naMin(bloky[0].checkin);
  const konec = naMin(bloky[bloky.length - 1].checkout || bloky[bloky.length - 1].checkin);
  const sparovane = zast.map((s) => ({ ...s, zakazka: zakazkaZastavky(s, zakazky) })).filter((s) => s.zakazka);
  if (!sparovane.length) return [];
  // sloučit po sobě jdoucí zastávky u stejné zakázky
  const skupiny = [];
  for (const s of sparovane) {
    const posl = skupiny[skupiny.length - 1];
    if (posl && posl.zakazka.id === s.zakazka.id) posl.do = s.do; else skupiny.push({ ...s });
  }
  const navrh = [];
  let od = zacatek;
  skupiny.forEach((s, i) => {
    const doo = i === skupiny.length - 1 ? konec : Math.min(konec, naMin(s.do));
    if (doo > od) navrh.push({ od: zMin(od), do: zMin(doo), contract_id: s.zakazka.id, label: s.zakazka.label, adresa: s.adresa });
    od = doo;
  });
  return navrh;
}

// liší se návrh od zápisu? (jiné zakázky nebo hranice o víc než 15 min)
export function navrhSeLisi(bloky, navrh) {
  if (!navrh.length) return false;
  if (navrh.length !== bloky.length) return true;
  return navrh.some((n, i) => String(n.contract_id) !== String(bloky[i].contract_id || "")
    || Math.abs(naMin(n.od) - naMin(bloky[i].checkin)) > 15);
}
