// ─── Informace zaměstnanci o GPS ve služebních vozidlech ─────────────────────
// Text dokumentu k podpisu (Podpisy, doc_type „gps_informace“). Zaměstnanec
// podpisem potvrzuje, že byl informován (§ 316 odst. 3 zákoníku práce,
// čl. 13 GDPR) — nejde o souhlas. Před prvním rozesláním doporučujeme text
// nechat zkontrolovat právníkem / pověřencem; doby uchování jsou návrh.
import { COMPANY } from "./invoicingUtils.js";

export const GPS_DOC_TYPE = "gps_informace";
export const GPS_NAZEV = "Informace o sledování polohy služebních vozidel (GPS)";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// data dokumentu při vytvoření
export const gpsData = (empName, vozidla) => ({
  empName, datum: new Date().toISOString().slice(0, 10),
  firma: COMPANY.name, ico: COMPANY.ico, adresa: `${COMPANY.addressLine}, ${COMPANY.city}`,
  vozidla: (vozidla || []).map((v) => ({ nazev: v.nazev || v.kod, spz: v.spz || "" })),
});

export function gpsInformaceHtml(d) {
  const vozidla = (d.vozidla || []).length
    ? `<ul>${d.vozidla.map((v) => `<li>${esc(v.nazev)}${v.spz ? ` (SPZ ${esc(v.spz)})` : ""}</li>`).join("")}</ul>`
    : "<p>všechna služební vozidla vybavená GPS jednotkou</p>";
  return `
    <h2>Zaměstnanec: ${esc(d.empName)} · ${d.datum ? new Date(d.datum + "T00:00:00").toLocaleDateString("cs-CZ") : ""}</h2>
    <div class="gps">
      <p>Zaměstnavatel <b>${esc(d.firma)}</b>, IČO ${esc(d.ico)}, se sídlem ${esc(d.adresa)} (dále „zaměstnavatel“), tímto v souladu s § 316 odst. 3 zákoníku práce
      a čl. 13 obecného nařízení o ochraně osobních údajů (GDPR) informuje zaměstnance o používání systému sledování polohy služebních vozidel.</p>
      <h3>1. Která vozidla</h3>${vozidla}
      <h3>2. Co se zaznamenává</h3>
      <p>Poloha vozidla pomocí GPS jednotky ve vozidle: čas a místo začátku a konce jízdy, trasa, ujeté kilometry, doba jízdy a doba stání.
      Systém nesleduje mobilní telefon zaměstnance a nezaznamenává zvuk ani obraz.</p>
      <h3>3. K čemu záznamy slouží</h3>
      <ul>
        <li>vedení knihy jízd (povinnost podle daňových předpisů),</li>
        <li>kontrola používání služebních vozidel a ochrana majetku zaměstnavatele,</li>
        <li>ověření docházky a zápisu práce na zakázkách (porovnání zapsaných časů a míst s jízdami vozidla).</li>
      </ul>
      <h3>4. Právní základ</h3>
      <p>Plnění právních povinností zaměstnavatele (čl. 6 odst. 1 písm. c) GDPR) a oprávněný zájem zaměstnavatele na ochraně majetku a kontrole
      pracovní činnosti (čl. 6 odst. 1 písm. f) GDPR, § 316 zákoníku práce). Závažným důvodem je povaha práce v terénu na různých zakázkách
      a svěření vozidla a materiálu zaměstnanci.</p>
      <h3>5. Kdo má k údajům přístup</h3>
      <p>Jednatel a pověření vedoucí zaměstnanci zaměstnavatele. Údaje zpracovává také dodavatel GPS systému jako zpracovatel podle smlouvy
      se zaměstnavatelem. Údaje se nepředávají mimo EU.</p>
      <h3>6. Jak dlouho se údaje uchovávají</h3>
      <p>Údaje o jízdách potřebné pro knihu jízd po dobu stanovenou daňovými předpisy. Ostatní záznamy o poloze nejdéle 3 roky, poté se mažou.</p>
      <h3>7. Soukromé jízdy</h3>
      <p>Služební vozidlo lze pro soukromé účely používat jen se souhlasem zaměstnavatele. I tyto jízdy systém zaznamenává.</p>
      <h3>8. Práva zaměstnance</h3>
      <p>Zaměstnanec má právo na přístup ke svým údajům, jejich opravu, výmaz nebo omezení zpracování, právo vznést námitku proti zpracování
      a právo podat stížnost u Úřadu pro ochranu osobních údajů (www.uoou.cz). Žádosti vyřizuje jednatel zaměstnavatele.</p>
      <p class="potvrzeni"><b>Podpisem potvrzuji, že jsem byl(a) s výše uvedenými informacemi seznámen(a).</b> Podpis nevyjadřuje souhlas se zpracováním,
      jde pouze o potvrzení, že informace byla předána.</p>
    </div>`;
}

export const GPS_STYL = `.gps{font-size:13px;line-height:1.55;max-width:760px}.gps h3{font-size:14px;margin:16px 0 4px;color:#0E3B5E}.gps ul{margin:4px 0 4px 18px;padding:0}.gps .potvrzeni{margin-top:18px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}`;
