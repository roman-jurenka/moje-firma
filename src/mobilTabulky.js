// Tabulky na telefonu jako karty (platí pro celou appku).
// Široké tabulky (faktury, zakázky, sklad…) se na úzké obrazovce dřív jen vodorovně
// posouvaly — nepoužitelné. Tady každé tabulce se záhlavím (<thead>) doplníme ke
// každé buňce popisek z hlavičky sloupce (data-label) a třídu „mobil-karty“;
// CSS v index.css pak na telefonu vykreslí každý řádek jako kartu:
// první buňka = nadpis karty, ostatní „Popisek …… hodnota“.
// Výjimky (zůstanou tabulkou s posouváním): tabulky s víc než 12 sloupci
// (měsíční přehledy po dnech apod.), bez záhlaví, nebo s třídou „bez-karet“.

const MAX_SLOUPCU = 12;

function hlavicky(table) {
  const radky = table.tHead?.rows;
  if (!radky?.length) return null;
  const out = [];
  for (const th of radky[radky.length - 1].cells) {
    const text = (th.textContent || "").replace(/\s+/g, " ").trim();
    for (let i = 0; i < (th.colSpan || 1); i++) out.push(text);
  }
  return out;
}

function oznacTabulku(table) {
  if (table.classList.contains("bez-karet")) return;
  const h = hlavicky(table);
  if (!h || h.length < 2 || h.length > MAX_SLOUPCU) { table.classList.remove("mobil-karty"); return; }
  table.classList.add("mobil-karty");
  for (const tbody of table.tBodies) {
    for (const tr of tbody.rows) {
      let sloupec = 0;
      for (const td of tr.cells) {
        const label = (td.colSpan || 1) > 1 ? "" : h[sloupec] || "";
        if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
        sloupec += td.colSpan || 1;
      }
    }
  }
}

export function spustitMobilniTabulky() {
  if (typeof window === "undefined" || !window.matchMedia) return;
  const mq = window.matchMedia("(max-width: 768px)");
  let naplanovano = false;
  const projit = () => {
    naplanovano = false;
    if (!mq.matches) return;
    document.querySelectorAll("table").forEach(oznacTabulku);
  };
  const naplanovat = () => {
    if (naplanovano) return;
    naplanovano = true;
    setTimeout(projit, 120);
  };
  new MutationObserver(naplanovat).observe(document.body, { childList: true, subtree: true, characterData: true });
  mq.addEventListener?.("change", naplanovat);
  naplanovat();
}
