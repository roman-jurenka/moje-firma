// Porovnání variant (verzí) jedné nabídky — tabulka vedle sebe pro klienta.
// Stahuje se jako PDF (tisk do PDF) nebo jako Word (.doc), obojí z jednoho HTML.
import { konecnaCenaNabidky } from "./slevaNabidky.js";
import { stahnoutWord } from "./dokumentyZakazky.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const kc = (n) => (n == null || !isFinite(n) ? "—" : `${Math.round(n).toLocaleString("cs-CZ")} Kč`);
const ks = (x) => Number(x?.qty) || 0;

// Výkon FVE v kWp z počtu panelů a Wp v názvu („Aiko 500wp“).
export function vykonKwp(fve) {
  const wp = Number(String(fve?.panel?.name || "").match(/(\d{3})\s*w/i)?.[1]) || 0;
  const kwp = (ks(fve?.panel) * wp) / 1000;
  return kwp > 0 ? `${kwp.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} kWp` : "";
}

const polozka = (x) => (ks(x) > 0 && x?.name ? `${ks(x)}× ${x.name}` : "");

export function radkyPorovnani(varianty) {
  const fve = varianty.some((q) => q.data?.fve);
  const ceny = varianty.map((q) => {
    const c = konecnaCenaNabidky(q.data);
    return { bez: c.bez, s: c.s || Math.round(c.bez * (1 + (c.dph || 21) / 100)), dph: c.dph };
  });
  const radky = [];
  if (fve) {
    radky.push(["Výkon elektrárny", varianty.map((q) => vykonKwp(q.data?.fve))]);
    radky.push(["Panely", varianty.map((q) => polozka(q.data?.fve?.panel))]);
    radky.push(["Střídač", varianty.map((q) => polozka(q.data?.fve?.stridac))]);
    radky.push(["Baterie", varianty.map((q) => { const f = q.data?.fve; const b = polozka(f?.baterie); return b ? b + (ks(f?.bms) > 0 ? " + BMS" : "") : "bez baterie"; })]);
    radky.push(["Back-up", varianty.map((q) => polozka(q.data?.fve?.backup))]);
    radky.push(["Wallbox", varianty.map((q) => polozka(q.data?.fve?.wallbox))]);
    radky.push(["Regulace", varianty.map((q) => polozka(q.data?.fve?.regulace))]);
    radky.push(["Ohřev vody", varianty.map((q) => polozka(q.data?.fve?.bojler))]);
    radky.push(["Konstrukce", varianty.map((q) => polozka(q.data?.fve?.konstrukce))]);
    const dalsi = varianty.map((q) => (q.data?.fve?.customRows || []).filter((r) => r.sekce === "material" && r.name && ks(r) > 0).map((r) => `${ks(r)}× ${r.name}`).join(", "));
    if (dalsi.some(Boolean)) radky.push(["Další vybavení", dalsi]);
  } else {
    const nazvy = [...new Set(varianty.flatMap((q) => (q.data?.zakaznik?.sekce || []).map((s) => s.nazev).filter(Boolean)))];
    nazvy.forEach((n) => radky.push([n, varianty.map((q) => { const s = (q.data?.zakaznik?.sekce || []).find((x) => x.nazev === n); return s ? (Number(s.castka) ? kc(Number(s.castka)) : "ano") : "—"; })]));
  }
  // vynechat řádky, kde nemá nic žádná varianta
  const plne = radky.filter(([, h]) => h.some((v) => v && v !== "—"));
  plne.push(["Cena bez DPH", ceny.map((c) => kc(c.bez)), "cena"]);
  plne.push([`Cena s DPH`, ceny.map((c) => kc(c.s)), "cenaS"]);
  return plne;
}

export function htmlPorovnani(varianty, { zakaznik, firma = "Jurenka elektro s.r.o.", tisk = false } = {}) {
  const radky = radkyPorovnani(varianty);
  const hlavicka = varianty.map((q) => `<th>Varianta ${esc(q.verze || 1)}${q.cislo ? `<div class="c">${esc(q.cislo)}</div>` : ""}</th>`).join("");
  const telo = radky.map(([l, h, druh]) => {
    const lisi = !druh && new Set(h.map((v) => v || "—")).size > 1;
    return `<tr class="${druh || ""}${lisi ? " lisi" : ""}"><td class="l">${esc(l)}</td>${h.map((v) => `<td>${esc(v || "—")}</td>`).join("")}</tr>`;
  }).join("");
  const nazev = String(varianty[0]?.name || "Nabídka").replace(/ – verze \d+$/, "");
  return "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Porovnání variant – " + esc(nazev) + "</title>" +
    "<style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:20px;margin:0 0 4px;border-left:6px solid #0E3B5E;padding-left:12px}" +
    ".sub{font-size:13px;color:#555;margin:0 0 18px 18px}table{width:100%;border-collapse:collapse}th{background:#0E3B5E;color:#fff;padding:8px 10px;text-align:left;font-size:13px;vertical-align:top}" +
    "th .c{font-weight:normal;font-size:11px;opacity:.85}td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;vertical-align:top}td.l{font-weight:bold;color:#334155;width:22%}" +
    "tr.lisi td{background:#fffbeb}tr.cena td{font-weight:bold;font-size:14px;border-top:2px solid #0E3B5E}tr.cenaS td{font-weight:bold;font-size:15px;color:#0E3B5E}" +
    ".pozn{font-size:11px;color:#64748b;margin-top:14px}@media print{body{padding:12px}}</style></head><body>" +
    `<h1>Porovnání variant nabídky – ${esc(nazev)}</h1>` +
    `<div class="sub">${zakaznik ? esc(zakaznik) + " · " : ""}${esc(firma)} · ${new Date().toLocaleDateString("cs-CZ")}</div>` +
    `<table><thead><tr><th></th>${hlavicka}</tr></thead><tbody>${telo}</tbody></table>` +
    `<div class="pozn">Žlutě jsou zvýrazněné řádky, ve kterých se varianty liší. Podrobnosti každé varianty jsou v její nabídce.</div>` +
    (tisk ? "<script>window.onload=function(){window.print();}</script>" : "") +
    "</body></html>";
}

export function stahnoutPorovnani(varianty, format, opts = {}) {
  const nazev = String(varianty[0]?.name || "Nabídka").replace(/ – verze \d+$/, "");
  if (format === "word") {
    stahnoutWord(`Porovnání variant ${varianty[0]?.cislo ? varianty[0].cislo.replace(/-V\d+$/, "") + " " : ""}${nazev}`, htmlPorovnani(varianty, opts));
    return;
  }
  const w = window.open("", "_blank");
  if (!w) { alert("Prohlížeč zablokoval nové okno — povol vyskakovací okna pro tuto stránku."); return; }
  w.document.write(htmlPorovnani(varianty, { ...opts, tisk: true }));
  w.document.close();
}
