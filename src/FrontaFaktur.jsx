// ─── Fronta přiřazování faktur ──────────────────────────────────────────────
// Faktury, které přišly e-mailem (nebo od účetní), čekají v invoice_queue.
// Každá řádka má navržené přiřazení (zakázka / sklad / nejasné / nic) a teprve
// po potvrzení se zapíše:
//   • zakázka → náklad zakázky (contract_cost_entries, typ materiál/práce/doprava),
//   • sklad   → příjem na sklad (warehouse_movements „in“ + navýšení stavu produktu;
//               když produkt ve skladu není, založí se s nákupní cenou z faktury).
// Řádka se nejdřív „zamkne“ (status navrh → schvaleno jen když byla ještě navrh),
// takže ani dvojklik nebo dva lidé najednou nezapíšou náklad dvakrát.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase.js";
import { zakazkaVeVyberu } from "./zakazkyVyber.js";
import { nactiPrirazku, ulozitPrirazku, prodejniCena, sPrirazkou, prirazkaPolozky, VYCHOZI_PRIRAZKA } from "./prirazkaMaterialu.js";

const BUCKET = "faktury-fronta";
const TYPY_NAKLADU = [["materiál", "Materiál"], ["práce", "Práce"], ["doprava", "Doprava"]];
const fmtKc = (n) => (n == null || n === "" ? "—" : `${Number(n).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč`);
const fmtDatum = (d) => (d ? new Date(d + (String(d).length === 10 ? "T00:00:00" : "")).toLocaleDateString("cs-CZ") : "—");
const dnes = () => new Date().toISOString().slice(0, 10);
const bezDiakritiky = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const jednotka = (u) => String(u || "ks").trim().toLowerCase() || "ks";
const cenaRadku = (it) => (it.amount != null ? Number(it.amount) : (Number(it.quantity) || 0) * (Number(it.unit_price) || 0));
// nákupní cena za jednotku z faktury
const nakupJ = (it) => { const q = Number(it.quantity) || 1; return Number(it.unit_price) || (q ? cenaRadku(it) / q : 0); };
// „1 250,50 Kč“ → 1250.5; prázdné → null; nesmysl → NaN
const cisloPole = (v) => { const t = String(v ?? "").replace(/kč/gi, "").replace(/\s/g, "").replace(",", "."); return t === "" ? null : Number(t); };

// Kandidáti zakázek z návrhu: [id], [{ id }], [{ contract_id }] — co přijde
const kandidati = (it) => {
  const c = it.suggested_candidates;
  if (!Array.isArray(c)) return [];
  return c.map((x) => (typeof x === "object" && x ? Number(x.contract_id ?? x.id) : Number(x))).filter(Boolean);
};
// Výchozí volba řádky: „sklad“, „z:<id zakázky>“ nebo "" (nevybráno)
const vychoziVolba = (it) => {
  if (it.assigned_to_sklad) return "sklad";
  if (it.assigned_contract_id) return `z:${it.assigned_contract_id}`;
  if (it.suggested_match_type === "sklad") return "sklad";
  if (it.suggested_contract_id) return `z:${it.suggested_contract_id}`;
  const k = kandidati(it);
  return it.suggested_match_type === "zakazka" && k.length === 1 ? `z:${k[0]}` : "";
};
const POPIS_NAVRHU = { zakazka: "návrh: zakázka", sklad: "návrh: sklad", ambiguous: "nejasné — vyber", none: "bez návrhu" };

// Stáhne všechny řádky dotazu po stránkách po 1000 (PostgREST vrací max. 1000 najednou).
async function vsechnyStranky(dotaz) {
  const vse = [];
  for (let od = 0; ; od += 1000) {
    const { data, error } = await dotaz(od, od + 999);
    if (error) return { data: vse, error };
    vse.push(...(data || []));
    if (!data || data.length < 1000) return { data: vse, error: null };
  }
}
const OBDOBI = [["vse", "Celé období"], ["mesic", "Tento měsíc"], ["minuly", "Minulý měsíc"], ["kvartal", "Poslední 3 měsíce"], ["letos", "Letos"], ["loni", "Loni"], ["vlastni", "Vlastní…"]];
const rozsahObdobi = (k, od, doo) => {
  const d = new Date(); const y = d.getFullYear(); const m = d.getMonth();
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  if (k === "mesic") return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (k === "minuly") return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (k === "kvartal") return [iso(new Date(y, m - 2, 1)), iso(new Date(y, m + 1, 0))];
  if (k === "letos") return [`${y}-01-01`, `${y}-12-31`];
  if (k === "loni") return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  if (k === "vlastni") return [od || null, doo || null];
  return [null, null];
};
const nazevDodavatele = (f) => String(f.supplier_name || "").trim() || "Neznámý dodavatel";
// Štítky faktur (nabídka se dá rozšířit, ukládá se v app_settings)
const STITKY_KEY = "fronta_stitky";
const VYCHOZI_STITKY = ["Fixní náklady", "Opravy aut", "Pohonné hmoty", "Materiál", "Režie", "Nářadí", "Telefon a internet"];
const BARVY_STITKU = [["#e0f2fe", "#0369a1"], ["#fef3c7", "#b45309"], ["#dcfce7", "#15803d"], ["#fce7f3", "#be185d"], ["#ede9fe", "#6d28d9"], ["#fee2e2", "#b91c1c"], ["#f1f5f9", "#334155"], ["#ccfbf1", "#0f766e"]];
const barvaStitku = (t) => BARVY_STITKU[[...String(t)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % BARVY_STITKU.length];

export default function FrontaFaktur({ contracts = [], customers = [], currentUser, onZmenaPoctu }) {
  const [faktury, setFaktury] = useState(null);
  const [polozky, setPolozky] = useState({});      // { [queueId]: [...] }
  const [produkty, setProdukty] = useState([]);
  const [volby, setVolby] = useState({});          // { [itemId]: { cil, typ, prodej? } }
  const [prirazka, setPrirazka] = useState(VYCHOZI_PRIRAZKA); // výchozí přirážka na materiál v %
  const [prirazkaPole, setPrirazkaPole] = useState(null);      // rozpracovaná úprava (text) — null = zavřeno
  const [pracuji, setPracuji] = useState({});      // { [itemId | "f"+queueId]: true }
  const [zprava, setZprava] = useState(null);      // { text, chyba }
  const [vyrizene, setVyrizene] = useState(false);
  const [rozbaleno, setRozbaleno] = useState({});
  const ja = currentUser?.name || null;
  // Filtry: dodavatel, období (datum vystavení), hledání
  const [filtrDodavatel, setFiltrDodavatel] = useState("");
  const [filtrObdobi, setFiltrObdobi] = useState("vse");
  const [filtrOd, setFiltrOd] = useState("");
  const [filtrDo, setFiltrDo] = useState("");
  const [hledat, setHledat] = useState("");
  const [pridani, setPridani] = useState(null); // ruční řádka: { fId, popis, mnozstvi, jednotka, cena }
  const [nabidkaStitku, setNabidkaStitku] = useState(VYCHOZI_STITKY);
  const [filtrStitek, setFiltrStitek] = useState(""); // "" = všechny, "__bez" = bez štítku
  const [stitkovani, setStitkovani] = useState(null);  // id faktury s otevřeným výběrem štítků
  const [novyStitek, setNovyStitek] = useState("");

  const nacist = async () => {
    const stavy = vyrizene ? ["nova", "castecne_prirazena", "schvalena", "zamitnuta"] : ["nova", "castecne_prirazena"];
    const [{ data: f, error }, { data: p }] = await Promise.all([
      vsechnyStranky((od, doo) => supabase.from("invoice_queue").select("*").in("status", stavy).order("issue_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).range(od, doo)),
      supabase.from("products").select("id, name, stock, unit, price, price_sell, prirazka_pct"),
    ]);
    if (error) { setZprava({ chyba: true, text: "Frontu se nepodařilo načíst: " + error.message }); setFaktury([]); return; }
    setProdukty(p || []);
    setPrirazka(await nactiPrirazku());
    const { data: nast } = await supabase.from("app_settings").select("value").eq("key", STITKY_KEY).maybeSingle();
    if (Array.isArray(nast?.value?.stitky) && nast.value.stitky.length) setNabidkaStitku(nast.value.stitky);
    const ids = (f || []).map((x) => x.id);
    // řádky po dávkách faktur (dotaz má limit řádků na odpověď)
    const it = [];
    for (let i = 0; i < ids.length; i += 80) {
      const davka = ids.slice(i, i + 80);
      const { data } = await vsechnyStranky((od, doo) => supabase.from("invoice_queue_items").select("*").in("invoice_queue_id", davka).order("line_no", { ascending: true }).range(od, doo));
      it.push(...(data || []));
    }
    const podle = {};
    (it || []).forEach((x) => { (podle[x.invoice_queue_id] = podle[x.invoice_queue_id] || []).push(x); });
    setPolozky(podle);
    setVolby((v) => {
      const nove = { ...v };
      (it || []).forEach((x) => { if (!nove[x.id]) nove[x.id] = { cil: vychoziVolba(x), typ: "materiál" }; });
      return nove;
    });
    setFaktury(f || []);
    onZmenaPoctu?.((f || []).filter((x) => ["nova", "castecne_prirazena"].includes(x.status)).length);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { Promise.resolve().then(nacist); }, [vyrizene]);

  const zakazkaById = useMemo(() => Object.fromEntries(contracts.map((c) => [c.id, c])), [contracts]);
  const zakaznikById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const popisZakazky = (c) => [c.code, c.name, zakaznikById[c.customer_id]?.name].filter(Boolean).join(" · ");
  const otevrene = useMemo(() => contracts.filter((c) => zakazkaVeVyberu(c))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "cs")), [contracts]);
  const produktProRadek = (it) => produkty.find((p) => bezDiakritiky(p.name) === bezDiakritiky(it.description));

  const otevritPdf = async (f) => {
    const okno = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.pdf_storage_path, 600);
    if (error || !data?.signedUrl) { okno?.close(); setZprava({ chyba: true, text: "PDF se nepodařilo otevřít: " + (error?.message || "soubor nenalezen") }); return; }
    if (okno) okno.location.href = data.signedUrl; else window.open(data.signedUrl, "_blank");
  };

  // Stav faktury podle jejích řádek
  const prepocitatFakturu = async (f) => {
    const { data: it } = await supabase.from("invoice_queue_items").select("status").eq("invoice_queue_id", f.id);
    const st = (it || []).map((x) => x.status);
    const status = st.every((s) => s !== "navrh") ? (st.some((s) => s === "schvaleno") ? "schvalena" : "zamitnuta")
      : st.some((s) => s !== "navrh") ? "castecne_prirazena" : "nova";
    await supabase.from("invoice_queue").update({ status, updated_at: new Date().toISOString(), ...(status !== "nova" ? { reviewed_at: new Date().toISOString(), reviewed_by: ja } : {}) }).eq("id", f.id);
  };

  // Potvrzení jedné řádky. Vrací text chyby, nebo null.
  const potvrditRadek = async (f, it) => {
    const v = volby[it.id] || {};
    if (!v.cil) return `Řádka ${it.line_no ?? ""}: vyber zakázku nebo sklad`;
    // zamknout řádku (jen když je ještě „navrh“)
    const { data: zamek, error: zErr } = await supabase.from("invoice_queue_items").update({ status: "schvaleno" }).eq("id", it.id).eq("status", "navrh").select("id");
    if (zErr) return zErr.message;
    if (!zamek?.length) return null; // už ji vyřídil někdo jiný
    const odemknout = () => supabase.from("invoice_queue_items").update({ status: "navrh" }).eq("id", it.id);
    const mnozstvi = Number(it.quantity) || 1;
    const cena = Number(it.unit_price) || (mnozstvi ? cenaRadku(it) / mnozstvi : 0);
    const doklad = [f.supplier_name, f.invoice_number ? `faktura ${f.invoice_number}` : null].filter(Boolean).join(", ");
    const zalozene = []; // pohyby vytvořené teď — při chybě se smažou
    const novyPohyb = async (data) => {
      const { data: p, error } = await supabase.from("warehouse_movements").insert({ unit: jednotka(it.unit), created_by: ja || "?", ...data }).select().single();
      if (error) throw error;
      zalozene.push(p.id);
      return p;
    };
    // produkt ve skladu (když chybí, založí se s nákupní cenou z faktury; chybějící cenu doplní)
    // prodejní cena za jednotku: zadaná u řádky, jinak cena produktu / nákup + přirážka
    const zadanyProdej = cisloPole(v.prodej);
    if (Number.isNaN(zadanyProdej)) { await odemknout(); return `Řádka ${it.line_no ?? ""}: prodejní cena není číslo`; }
    const prodej = zadanyProdej ?? prodejniCena(produktProRadek(it), cena, prirazka);
    // ručně změněná cena / přirážka u řádky se uloží jako přirážka položky
    const novaPrirazka = zadanyProdej != null && cena > 0 ? Math.round((zadanyProdej / cena - 1) * 1000) / 10 : null;
    const zajistitProdukt = async () => {
      let prod = produktProRadek(it);
      if (!prod) {
        const { data: novy, error } = await supabase.from("products").insert({
          name: String(it.description || "").trim() || `Položka z faktury ${f.invoice_number || ""}`.trim(),
          unit: jednotka(it.unit), price: Math.round(cena * 100) / 100, price_sell: prodej, prirazka_pct: novaPrirazka, stock: 0, min_stock: 0, category: "",
        }).select().single();
        if (error) throw error;
        prod = novy;
      } else {
        // chybějící nákupní / prodejní cenu doplnit (existující nepřepisovat)
        const doplnit = {};
        if (!(Number(prod.price) > 0) && cena > 0) doplnit.price = Math.round(cena * 100) / 100;
        if (!(Number(prod.price_sell) > 0) && prodej > 0) doplnit.price_sell = prodej;
        if (novaPrirazka != null && novaPrirazka !== prirazkaPolozky(prod)) { doplnit.prirazka_pct = novaPrirazka; doplnit.price_sell = prodej; }
        if (Object.keys(doplnit).length) await supabase.from("products").update(doplnit).eq("id", prod.id);
      }
      return prod;
    };
    try {
      if (v.cil === "rezie") {
        // náklad firmy bez zakázky a skladu — řádka je vyřízená, nic se nezapisuje
        await supabase.from("invoice_queue_items").update({ assigned_to_sklad: false, assigned_contract_id: null }).eq("id", it.id);
      } else if (v.cil === "sklad") {
        const prod = await zajistitProdukt();
        const pohyb = await novyPohyb({
          product_name: prod.name, quantity: mnozstvi, movement_type: "in",
          from_location: f.supplier_name || "Dodavatel", to_location: "Sklad",
          note: `Příjem z faktury${doklad ? ` (${doklad})` : ""}`,
        });
        // aktuální stav až teď (mezitím mohl někdo vydávat); bez něj stav neměnit
        const { data: aktualni, error: sErr } = await supabase.from("products").select("stock").eq("id", prod.id).single();
        if (sErr || !aktualni) throw new Error("nepodařilo se načíst stav skladu — příjem se nezapsal, zkus to znovu");
        const { error: uErr } = await supabase.from("products").update({ stock: Math.max(0, Math.round((Number(aktualni.stock) || 0) + mnozstvi)) }).eq("id", prod.id);
        if (uErr) throw uErr;
        await supabase.from("invoice_queue_items").update({ assigned_to_sklad: true, assigned_contract_id: null, warehouse_movement_id: pohyb.id, warehouse_movement_out_id: null }).eq("id", it.id);
      } else {
        const contractId = Number(v.cil.slice(2));
        const typ = v.typ || "materiál";
        // Materiál projde skladem: příjem a hned výdej na zakázku (stav skladu se nemění)
        let prijem = null, vydej = null;
        if (typ === "materiál") {
          const prod = await zajistitProdukt();
          prijem = await novyPohyb({
            product_name: prod.name, quantity: mnozstvi, movement_type: "in",
            from_location: f.supplier_name || "Dodavatel", to_location: "Sklad",
            note: `Příjem z faktury${doklad ? ` (${doklad})` : ""} — rovnou vydáno na zakázku`,
          });
          vydej = await novyPohyb({
            product_name: prod.name, quantity: mnozstvi, movement_type: "out_contract", contract_id: contractId,
            from_location: "Sklad", to_location: zakazkaById[contractId]?.name || "Zakázka",
            note: `Výdej na zakázku z faktury${doklad ? ` (${doklad})` : ""}`,
          });
        }
        const { data: naklad, error } = await supabase.from("contract_cost_entries").insert({
          contract_id: contractId, cost_type: typ, is_extra: false, date: f.issue_date || dnes(),
          description: `${String(it.description || "").trim()}${doklad ? ` (${doklad})` : ""}`,
          quantity: mnozstvi, unit: jednotka(it.unit),
          unit_price_cost: Math.round(cena * 100) / 100, unit_price_client: prodej,
        }).select().single();
        if (error) throw error;
        await supabase.from("invoice_queue_items").update({
          assigned_contract_id: contractId, assigned_to_sklad: false, cost_entry_id: naklad.id,
          warehouse_movement_id: prijem?.id || null, warehouse_movement_out_id: vydej?.id || null,
        }).eq("id", it.id);
      }
      return null;
    } catch (e) {
      if (zalozene.length) await supabase.from("warehouse_movements").delete().in("id", zalozene);
      await odemknout();
      return `Řádka ${it.line_no ?? ""}: ${e.message || e}`;
    }
  };

  const potvrdit = async (f, radky) => {
    const klic = radky.length === 1 ? radky[0].id : `f${f.id}`;
    setPracuji((m) => ({ ...m, [klic]: true }));
    setZprava(null);
    const chyby = [];
    let ok = 0;
    for (const it of radky) {
      const ch = await potvrditRadek(f, it);
      if (ch) chyby.push(ch); else ok++;
    }
    await prepocitatFakturu(f);
    setPracuji((m) => { const x = { ...m }; delete x[klic]; return x; });
    setZprava(chyby.length
      ? { chyba: true, text: `Potvrzeno ${ok} z ${radky.length}. ${chyby.join(" · ")}` }
      : { chyba: false, text: `✓ Potvrzeno ${ok} ${ok === 1 ? "řádka" : ok < 5 ? "řádky" : "řádek"} — zapsáno do zakázek / na sklad.` });
    await nacist();
  };

  const zamitnoutRadek = async (f, it) => {
    setPracuji((m) => ({ ...m, [it.id]: true }));
    await supabase.from("invoice_queue_items").update({ status: "zamitnuto" }).eq("id", it.id).eq("status", "navrh");
    await prepocitatFakturu(f);
    setPracuji((m) => { const x = { ...m }; delete x[it.id]; return x; });
    await nacist();
  };
  // Změna přiřazení u potvrzené (nebo zamítnuté) řádky: vrátí, co se zapsalo
  // (smaže náklad zakázky / vrátí příjem na sklad) a řádka jde přiřadit znovu.
  const [zmena, setZmena] = useState(null); // { f, it } — potvrzení v appce
  const zmenitPrirazeni = async ({ f, it }) => {
    setPracuji((m) => ({ ...m, [it.id]: true }));
    setZprava(null);
    try {
      if (it.cost_entry_id) {
        const { data: naklad } = await supabase.from("contract_cost_entries").select("id, billed").eq("id", it.cost_entry_id).maybeSingle();
        if (naklad?.billed) throw new Error("náklad už je na zakázce vyfakturovaný — nejdřív ho v zakázce vrať z fakturace");
        if (naklad) {
          // nejdřív odpojit odkaz (cizí klíč), pak smazat náklad
          await supabase.from("invoice_queue_items").update({ cost_entry_id: null }).eq("id", it.id);
          const { error } = await supabase.from("contract_cost_entries").delete().eq("id", naklad.id);
          if (error) { await supabase.from("invoice_queue_items").update({ cost_entry_id: naklad.id }).eq("id", it.id); throw error; }
        }
      }
      if (it.warehouse_movement_out_id) {
        // materiál do zakázky přes sklad: smazat příjem i výdej — stav skladu se nemění
        const ids = [it.warehouse_movement_id, it.warehouse_movement_out_id].filter(Boolean);
        await supabase.from("invoice_queue_items").update({ warehouse_movement_id: null, warehouse_movement_out_id: null }).eq("id", it.id);
        const { error } = await supabase.from("warehouse_movements").delete().in("id", ids);
        if (error) { await supabase.from("invoice_queue_items").update({ warehouse_movement_id: it.warehouse_movement_id, warehouse_movement_out_id: it.warehouse_movement_out_id }).eq("id", it.id); throw error; }
      } else if (it.warehouse_movement_id) {
        const { data: pohyb } = await supabase.from("warehouse_movements").select("id, product_name, quantity").eq("id", it.warehouse_movement_id).maybeSingle();
        if (pohyb) {
          const { data: prod } = await supabase.from("products").select("id, stock").ilike("name", pohyb.product_name).maybeSingle();
          await supabase.from("invoice_queue_items").update({ warehouse_movement_id: null }).eq("id", it.id);
          const { error } = await supabase.from("warehouse_movements").delete().eq("id", pohyb.id);
          if (error) { await supabase.from("invoice_queue_items").update({ warehouse_movement_id: pohyb.id }).eq("id", it.id); throw error; }
          if (prod) await supabase.from("products").update({ stock: Math.max(0, Math.round((Number(prod.stock) || 0) - (Number(pohyb.quantity) || 0))) }).eq("id", prod.id);
        }
      }
      const { error } = await supabase.from("invoice_queue_items").update({
        status: "navrh", assigned_contract_id: null, assigned_to_sklad: false, cost_entry_id: null, warehouse_movement_id: null, warehouse_movement_out_id: null,
      }).eq("id", it.id);
      if (error) throw error;
      // výběr předvyplnit tím, co bylo přiřazené
      setVolby((m) => ({ ...m, [it.id]: { ...(m[it.id] || { typ: "materiál" }), cil: it.assigned_to_sklad ? "sklad" : it.assigned_contract_id ? `z:${it.assigned_contract_id}` : (m[it.id]?.cil || "") } }));
      await prepocitatFakturu(f);
      setZprava({ chyba: false, text: `Řádka ${it.line_no ?? ""} je zpět k přiřazení — vyber nové přiřazení a potvrď.` });
    } catch (e) {
      setZprava({ chyba: true, text: `Přiřazení řádky ${it.line_no ?? ""} se nepodařilo změnit: ${e.message || e}` });
    }
    setPracuji((m) => { const x = { ...m }; delete x[it.id]; return x; });
    setZmena(null);
    await nacist();
  };
  const [zamitani, setZamitani] = useState(null); // faktura k zamítnutí (potvrzení v appce)
  const zamitnoutFakturu = async (f) => {
    setPracuji((m) => ({ ...m, [`f${f.id}`]: true }));
    await supabase.from("invoice_queue_items").update({ status: "zamitnuto" }).eq("invoice_queue_id", f.id).eq("status", "navrh");
    await prepocitatFakturu(f);
    setPracuji((m) => { const x = { ...m }; delete x[`f${f.id}`]; return x; });
    setZamitani(null);
    setZprava({ chyba: false, text: "Faktura je zamítnutá — nic se nezapsalo." });
    await nacist();
  };

  const tl = (bg, fg = "#fff", extra = {}) => ({ background: bg, color: fg, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", ...extra });
  const tlObrys = (barva = "#475569") => ({ background: "#fff", color: barva, border: `1px solid ${barva === "#475569" ? "#cbd5e1" : barva}`, borderRadius: 8, padding: "5px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" });
  const pole = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: "inherit", background: "#fff", color: "#0f172a", maxWidth: "100%" };
  const STAV_FAKTURY = { nova: ["Nová", "#0369a1", "#e0f2fe"], castecne_prirazena: ["Částečně přiřazená", "#b45309", "#fef3c7"], schvalena: ["Vyřízená", "#15803d", "#dcfce7"], zamitnuta: ["Zamítnutá", "#64748b", "#f1f5f9"] };

  if (faktury === null) return <div style={{ padding: 20, color: "#64748b", fontSize: 14 }}>Načítám frontu faktur…</div>;

  const dodavatele = Object.entries(faktury.reduce((m, x) => { const k = nazevDodavatele(x); m[k] = (m[k] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "cs"));
  const [obdobiOd, obdobiDo] = rozsahObdobi(filtrObdobi, filtrOd, filtrDo);
  const hledano = bezDiakritiky(hledat);
  const zobrazene = faktury.filter((x) =>
    (!filtrDodavatel || nazevDodavatele(x) === filtrDodavatel) &&
    (!obdobiOd || (x.issue_date && x.issue_date >= obdobiOd)) &&
    (!obdobiDo || (x.issue_date && x.issue_date <= obdobiDo)) &&
    (!hledano || bezDiakritiky(`${x.invoice_number || ""} ${x.variable_symbol || ""} ${x.supplier_name || ""} ${x.supplier_ico || ""}`).includes(hledano)) &&
    (!filtrStitek || (filtrStitek === "__bez" ? !(x.stitky || []).length : (x.stitky || []).includes(filtrStitek))));
  const pocetSeStitkem = (t) => faktury.filter((x) => (x.stitky || []).includes(t)).length;
  const vsechnyStitky = [...new Set([...nabidkaStitku, ...faktury.flatMap((x) => x.stitky || [])])];

  // ── Štítky ──
  const ulozitStitky = async (ids, upravit) => {
    const zmeny = faktury.filter((x) => ids.includes(x.id)).map((x) => ({ id: x.id, stitky: upravit(x.stitky || []) }));
    for (const z of zmeny) {
      const { error } = await supabase.from("invoice_queue").update({ stitky: z.stitky, updated_at: new Date().toISOString() }).eq("id", z.id);
      if (error) { setZprava({ chyba: true, text: "Štítek se nepodařilo uložit: " + error.message }); return false; }
    }
    setFaktury((fs) => fs.map((x) => { const z = zmeny.find((y) => y.id === x.id); return z ? { ...x, stitky: z.stitky } : x; }));
    return true;
  };
  const prepnoutStitek = (fa, t) => ulozitStitky([fa.id], (st) => (st.includes(t) ? st.filter((x) => x !== t) : [...st, t]));
  const stitekDodavateli = async (fa, t) => {
    const ids = faktury.filter((x) => nazevDodavatele(x) === nazevDodavatele(fa) && !(x.stitky || []).includes(t)).map((x) => x.id);
    if (!ids.length) return;
    if (await ulozitStitky(ids, (st) => (st.includes(t) ? st : [...st, t]))) setZprava({ chyba: false, text: `✓ Štítek „${t}“ přidán k ${ids.length} ${ids.length === 1 ? "faktuře" : "fakturám"} od ${nazevDodavatele(fa).replace(/\.$/, "")}.` });
  };
  const pridatDoNabidky = async (fa) => {
    const t = novyStitek.trim();
    if (!t) return;
    if (!nabidkaStitku.includes(t)) {
      const nova = [...nabidkaStitku, t];
      await supabase.from("app_settings").upsert({ key: STITKY_KEY, value: { stitky: nova }, updated_at: new Date().toISOString() });
      setNabidkaStitku(nova);
    }
    setNovyStitek("");
    if (!(fa.stitky || []).includes(t)) await prepnoutStitek(fa, t);
  };
  const soucetSDph = zobrazene.reduce((a, x) => a + (Number(x.total_amount) || 0), 0);
  const bezRadku = zobrazene.filter((x) => !(polozky[x.id] || []).length).length;
  const filtrovano = filtrDodavatel || filtrObdobi !== "vse" || hledano || filtrStitek;

  // Ruční řádka (faktury, ze kterých se řádky nepodařilo vyčíst)
  const otevritPridani = (fa) => {
    const total = Number(fa.total_amount) || 0;
    setPridani({ fId: fa.id, popis: `Faktura ${fa.invoice_number || ""} — ${nazevDodavatele(fa)}`.replace(/\s+/g, " "), mnozstvi: "1", jednotka: "ks", cena: total ? String(Math.round(total / 1.21 * 100) / 100).replace(".", ",") : "" });
  };
  const ulozitRadek = async () => {
    const q = cisloPole(pridani.mnozstvi), c = cisloPole(pridani.cena);
    if (!String(pridani.popis).trim() || !q || q <= 0 || c == null || Number.isNaN(c) || Number.isNaN(q)) { setZprava({ chyba: true, text: "Vyplň popis, množství a cenu za jednotku bez DPH (čísla, např. 1 a 1250,50)." }); return; }
    const stavajici = polozky[pridani.fId] || [];
    const { error } = await supabase.from("invoice_queue_items").insert({
      invoice_queue_id: pridani.fId, line_no: stavajici.reduce((mx, x) => Math.max(mx, Number(x.line_no) || 0), 0) + 1,
      description: String(pridani.popis).trim(), quantity: q, unit: pridani.jednotka || "ks", unit_price: c, amount: Math.round(q * c * 100) / 100,
      suggested_match_type: "none", status: "navrh",
    });
    if (error) { setZprava({ chyba: true, text: "Řádku se nepodařilo přidat: " + error.message }); return; }
    setRozbaleno((m) => ({ ...m, [pridani.fId]: true }));
    setPridani(null);
    setZprava({ chyba: false, text: "✓ Řádka přidaná — vyber přiřazení a potvrď." });
    await nacist();
  };

  return (
    <div style={{ textAlign: "left" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#475569", maxWidth: 640 }}>
          Faktury od dodavatelů čekají na přiřazení. U každé řádky zkontroluj návrh (zakázka nebo sklad) a potvrď —
          teprve potom se zapíše <b>náklad zakázky</b> nebo <b>příjem na sklad</b>.
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {prirazkaPole == null ? (
            <button type="button" onClick={() => setPrirazkaPole(String(prirazka))} title="Prodejní cena materiálu = nákup + přirážka (když produkt nemá vlastní prodejní cenu)"
              style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#0369a1", borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Přirážka na materiál: {String(prirazka).replace(".", ",")} % ✏️
            </button>
          ) : (
            <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#334155" }}>
              Přirážka na materiál
              <input style={{ ...pole, width: 60 }} inputMode="decimal" autoFocus value={prirazkaPole} aria-label="Výchozí přirážka na materiál v procentech"
                onChange={(e) => setPrirazkaPole(e.target.value)} /> %
              <button type="button" style={tl("#0369a1")} onClick={async () => {
                const pct = cisloPole(prirazkaPole);
                if (pct == null || Number.isNaN(pct) || pct < 0) { setZprava({ chyba: true, text: "Přirážka musí být číslo (např. 30)." }); return; }
                const { error } = await ulozitPrirazku(pct);
                if (error) { setZprava({ chyba: true, text: "Přirážku se nepodařilo uložit: " + error.message }); return; }
                setPrirazka(pct); setPrirazkaPole(null);
                setZprava({ chyba: false, text: `✓ Výchozí přirážka na materiál je ${String(pct).replace(".", ",")} % — platí pro celou firmu (fronta faktur i výdej ze skladu).` });
              }}>Uložit</button>
              <button type="button" style={tlObrys()} onClick={() => setPrirazkaPole(null)}>Zrušit</button>
            </span>
          )}
          <label style={{ fontSize: 13, color: "#334155", display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={vyrizene} onChange={(e) => setVyrizene(e.target.checked)} /> Zobrazit i vyřízené
          </label>
        </div>
      </div>

      {zprava && (
        <div role={zprava.chyba ? "alert" : "status"} style={{ borderRadius: 10, padding: "9px 12px", marginBottom: 12, fontSize: 13, background: zprava.chyba ? "#fef2f2" : "#f0fdf4", color: zprava.chyba ? "#991b1b" : "#166534", border: `1px solid ${zprava.chyba ? "#fecaca" : "#bbf7d0"}` }}>{zprava.text}</div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 3, minWidth: 220, flex: "1 1 220px" }}>
          Dodavatel
          <select style={{ ...pole, maxWidth: "none" }} value={filtrDodavatel} onChange={(e) => setFiltrDodavatel(e.target.value)}>
            <option value="">Všichni dodavatelé ({faktury.length})</option>
            {dodavatele.map(([d, c]) => <option key={d} value={d}>{d} ({c})</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
          Období (vystavení)
          <select style={pole} value={filtrObdobi} onChange={(e) => setFiltrObdobi(e.target.value)}>
            {OBDOBI.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        {filtrObdobi === "vlastni" && (
          <>
            <label style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>Od<input type="date" style={pole} value={filtrOd} onChange={(e) => setFiltrOd(e.target.value)} /></label>
            <label style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>Do<input type="date" style={pole} value={filtrDo} onChange={(e) => setFiltrDo(e.target.value)} /></label>
          </>
        )}
        <label style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
          Štítek
          <select style={pole} value={filtrStitek} onChange={(e) => setFiltrStitek(e.target.value)}>
            <option value="">Všechny štítky</option>
            <option value="__bez">Bez štítku ({faktury.filter((x) => !(x.stitky || []).length).length})</option>
            {vsechnyStitky.map((t) => <option key={t} value={t}>{t} ({pocetSeStitkem(t)})</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: "#475569", display: "flex", flexDirection: "column", gap: 3, flex: "1 1 160px" }}>
          Hledat
          <input type="search" style={{ ...pole, maxWidth: "none" }} value={hledat} placeholder="číslo faktury, VS, IČO…" onChange={(e) => setHledat(e.target.value)} />
        </label>
        {filtrovano && <button type="button" style={tlObrys()} onClick={() => { setFiltrDodavatel(""); setFiltrObdobi("vse"); setFiltrOd(""); setFiltrDo(""); setHledat(""); setFiltrStitek(""); }}>✕ Zrušit filtry</button>}
        <div style={{ flexBasis: "100%", fontSize: 12, color: "#475569" }}>
          Zobrazeno <b>{zobrazene.length}</b> z {faktury.length} faktur · celkem <b>{fmtKc(Math.round(soucetSDph))}</b> s DPH
          {bezRadku > 0 && <span style={{ color: "#b45309" }}> · {bezRadku} bez vyčtených řádek (přidej řádek ručně)</span>}
        </div>
      </div>

      {!zobrazene.length && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, textAlign: "center", color: "#64748b", fontSize: 14 }}>
          {faktury.length ? "Filtrům neodpovídá žádná faktura." : vyrizene ? "Ve frontě nejsou žádné faktury." : "✓ Žádné faktury nečekají na přiřazení."}
        </div>
      )}

      {zobrazene.map((f) => {
        const radky = polozky[f.id] || [];
        const cekajici = radky.filter((x) => x.status === "navrh");
        const pripravene = cekajici.filter((x) => volby[x.id]?.cil);
        const [stavText, stavBarva, stavPozadi] = STAV_FAKTURY[f.status] || [f.status, "#475569", "#f1f5f9"];
        const otevrena = rozbaleno[f.id] ?? ["nova", "castecne_prirazena"].includes(f.status);
        return (
          <div key={f.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, marginBottom: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", padding: "12px 16px", background: "#f8fafc", borderBottom: otevrena ? "1px solid #e2e8f0" : "none" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{f.supplier_name || "Neznámý dodavatel"}</span>
                  <span style={{ background: stavPozadi, color: stavBarva, borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 800 }}>{stavText}</span>
                  {f.direction === "vydana" && <span style={{ fontSize: 11, color: "#64748b" }}>vydaná</span>}
                  {(f.stitky || []).map((t) => { const [bg, fg] = barvaStitku(t); return (
                    <button key={t} type="button" onClick={() => setFiltrStitek(t)} title={`Zobrazit jen „${t}“`}
                      style={{ background: bg, color: fg, border: "none", borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>🏷 {t}</button>
                  ); })}
                  <button type="button" onClick={() => { setStitkovani(stitkovani === f.id ? null : f.id); setNovyStitek(""); }}
                    style={{ background: "#fff", color: "#475569", border: "1px dashed #cbd5e1", borderRadius: 999, padding: "1px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    {stitkovani === f.id ? "✕ zavřít" : "+ štítek"}
                  </button>
                </div>
                {stitkovani === f.id && (() => {
                  const dalsi = faktury.filter((x) => x.id !== f.id && nazevDodavatele(x) === nazevDodavatele(f)).length;
                  return (
                    <div style={{ marginTop: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 6, maxWidth: 560 }}>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {vsechnyStitky.map((t) => { const ma = (f.stitky || []).includes(t); const [bg, fg] = barvaStitku(t); return (
                          <button key={t} type="button" aria-pressed={ma} onClick={() => prepnoutStitek(f, t)}
                            style={{ background: ma ? bg : "#fff", color: ma ? fg : "#475569", border: `1px solid ${ma ? fg : "#cbd5e1"}`, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            {ma ? "✓ " : ""}{t}
                          </button>
                        ); })}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <input style={pole} value={novyStitek} placeholder="Nový štítek…" onChange={(e) => setNovyStitek(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") pridatDoNabidky(f); }} />
                        <button type="button" style={tlObrys("#0369a1")} disabled={!novyStitek.trim()} onClick={() => pridatDoNabidky(f)}>+ Přidat štítek</button>
                      </div>
                      {dalsi > 0 && (f.stitky || []).length > 0 && (
                        <div style={{ fontSize: 12, color: "#475569", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          Použít i na dalších {dalsi} {dalsi === 1 ? "fakturu" : dalsi < 5 ? "faktury" : "faktur"} od {nazevDodavatele(f)}:
                          {(f.stitky || []).map((t) => <button key={t} type="button" style={tlObrys("#0369a1")} onClick={() => stitekDodavateli(f, t)}>🏷 {t}</button>)}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>
                  {[f.invoice_number && `Faktura ${f.invoice_number}`, f.supplier_ico && `IČO ${f.supplier_ico}`, f.variable_symbol && `VS ${f.variable_symbol}`,
                    `vystavena ${fmtDatum(f.issue_date)}`, `splatnost ${fmtDatum(f.due_date)}`].filter(Boolean).join(" · ")}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {radky.length} {radky.length === 1 ? "řádka" : radky.length < 5 ? "řádky" : "řádek"} · čeká {cekajici.length}
                  {f.onedrive_status === "uploaded" ? " · ☁️ na OneDrivu" : f.onedrive_status === "failed" ? " · ⚠ OneDrive: nenahráno" : ""}
                  {f.note ? ` · ${f.note}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                {(() => {
                  const bez = radky.reduce((a, x) => a + cenaRadku(x), 0);
                  const total = Number(f.total_amount) || 0;
                  const sazba = [21, 12, 0].find((d) => total && bez && Math.abs(bez * (1 + d / 100) - total) <= Math.max(1, total * 0.002));
                  return (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{f.total_amount != null ? fmtKc(f.total_amount) : "—"} <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>s DPH</span>{f.currency && f.currency !== "CZK" ? ` ${f.currency}` : ""}</div>
                      {radky.length > 0 && (
                        <div style={{ fontSize: 12, color: "#475569" }}>
                          řádky bez DPH {fmtKc(Math.round(bez * 100) / 100)}
                          {total ? (sazba != null
                            ? <span style={{ color: "#15803d", fontWeight: 700 }}> · ✓ sedí{sazba ? ` (DPH ${sazba} %)` : ""}</span>
                            : <span style={{ color: "#b91c1c", fontWeight: 700 }}> · ⚠ nesedí s fakturou</span>) : null}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {f.pdf_storage_path && <button type="button" style={tlObrys()} onClick={() => otevritPdf(f)}>📄 PDF</button>}
                  <button type="button" style={tlObrys()} onClick={() => setRozbaleno((r) => ({ ...r, [f.id]: !otevrena }))}>{otevrena ? "▲ Sbalit" : "▼ Řádky"}</button>
                </div>
              </div>
            </div>

            {otevrena && (
              <div style={{ padding: "8px 16px 14px", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 760 }}>
                  <thead>
                    <tr style={{ color: "#64748b", fontSize: 11, textTransform: "uppercase", textAlign: "left" }}>
                      <th style={{ padding: "6px 4px", width: 28 }}>#</th>
                      <th style={{ padding: "6px 4px" }}>Položka</th>
                      <th style={{ padding: "6px 4px", textAlign: "right" }}>Množství</th>
                      <th style={{ padding: "6px 4px", textAlign: "right" }}>Cena/j. bez DPH</th>
                      <th style={{ padding: "6px 4px", textAlign: "right" }}>Celkem bez DPH</th>
                      <th style={{ padding: "6px 4px", width: 300 }}>Přiřazení</th>
                      <th style={{ padding: "6px 4px", width: 150 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {radky.map((it) => {
                      const v = volby[it.id] || { cil: "", typ: "materiál" };
                      const setV = (patch) => setVolby((m) => ({ ...m, [it.id]: { ...v, ...patch } }));
                      const navrh = it.status === "navrh";
                      const kand = kandidati(it).map((id) => zakazkaById[id]).filter(Boolean);
                      const prod = produktProRadek(it);
                      const vybranaZ = v.cil.startsWith("z:") ? zakazkaById[Number(v.cil.slice(2))] : null;
                      const hotovoZ = it.assigned_contract_id ? zakazkaById[it.assigned_contract_id] : null;
                      return (
                        <tr key={it.id} style={{ borderTop: "1px solid #f1f5f9", verticalAlign: "top", opacity: it.status === "zamitnuto" ? 0.5 : 1 }}>
                          <td style={{ padding: "8px 4px", color: "#94a3b8" }}>{it.line_no ?? ""}</td>
                          <td style={{ padding: "8px 4px" }}>
                            <div style={{ fontWeight: 600, color: "#0f172a" }}>{it.description || "—"}</div>
                            {it.order_reference && <div style={{ fontSize: 11, color: "#64748b" }}>Objednávka / odkaz: {it.order_reference}</div>}
                          </td>
                          <td style={{ padding: "8px 4px", textAlign: "right", whiteSpace: "nowrap" }}>{Number(it.quantity ?? 0).toLocaleString("cs-CZ")} {jednotka(it.unit)}</td>
                          <td style={{ padding: "8px 4px", textAlign: "right", whiteSpace: "nowrap" }}>{fmtKc(it.unit_price)}</td>
                          <td style={{ padding: "8px 4px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>{fmtKc(cenaRadku(it))}</td>
                          <td style={{ padding: "8px 4px" }}>
                            {navrh ? (
                              <>
                                <div style={{ fontSize: 11, color: it.suggested_match_type === "ambiguous" ? "#b45309" : "#64748b", marginBottom: 3 }}>
                                  {POPIS_NAVRHU[it.suggested_match_type] || "bez návrhu"}
                                </div>
                                <select style={{ ...pole, width: "100%", borderColor: v.cil ? "#cbd5e1" : "#fbbf24" }} value={v.cil} aria-label={`Přiřazení řádky ${it.line_no ?? ""}`}
                                  onChange={(e) => setV({ cil: e.target.value })}>
                                  <option value="">— vyber zakázku nebo sklad —</option>
                                  <option value="sklad">📦 Sklad (příjem materiálu)</option>
                                  <option value="rezie">🏢 Režie firmy (telefon, software… — nic se nezapíše)</option>
                                  {kand.length > 0 && (
                                    <optgroup label="Navržené zakázky">
                                      {kand.map((c) => <option key={`k${c.id}`} value={`z:${c.id}`}>{popisZakazky(c)}</option>)}
                                    </optgroup>
                                  )}
                                  <optgroup label="Zakázky">
                                    {otevrene.map((c) => <option key={c.id} value={`z:${c.id}`}>{popisZakazky(c)}</option>)}
                                    {vybranaZ && !otevrene.includes(vybranaZ) && <option value={`z:${vybranaZ.id}`}>{popisZakazky(vybranaZ)} ({vybranaZ.status})</option>}
                                  </optgroup>
                                </select>
                                {v.cil === "sklad" && (
                                  <div style={{ fontSize: 11, marginTop: 3, color: prod ? "#15803d" : "#0369a1" }}>
                                    {prod ? `✓ ${prod.name} — skladem ${prod.stock ?? 0} ${prod.unit || ""}, přibude ${Number(it.quantity ?? 0).toLocaleString("cs-CZ")}`
                                      : "➕ Ve skladu zatím není — po kliknutí na ✓ Potvrdit se založí jako nový produkt s nákupní cenou z faktury"}
                                  </div>
                                )}
                                {v.cil.startsWith("z:") && (
                                  <>
                                    <select style={{ ...pole, marginTop: 4 }} value={v.typ} aria-label="Typ nákladu" onChange={(e) => setV({ typ: e.target.value })}>
                                      {TYPY_NAKLADU.map(([id, t]) => <option key={id} value={id}>Náklad: {t}</option>)}
                                    </select>
                                    {(() => {
                                      const nakup = nakupJ(it);
                                      const vychozi = prodejniCena(prod, nakup, prirazka);
                                      const zadano = cisloPole(v.prodej);
                                      const prodejJ = zadano ?? vychozi;
                                      const pct = nakup > 0 && Number.isFinite(prodejJ) ? Math.round((prodejJ / nakup - 1) * 1000) / 10 : null;
                                      const zdroj = prirazkaPolozky(prod) != null ? "přirážka položky" : Number(prod?.price_sell) > 0 ? "prodejní cena položky" : "výchozí přirážka";
                                      return (
                                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 11, color: "#475569", flexWrap: "wrap" }}>
                                          <span>Přirážka</span>
                                          <input style={{ ...pole, width: 52 }} inputMode="decimal" aria-label="Přirážka v procentech"
                                            value={v.pct ?? (pct != null ? String(pct).replace(".", ",") : "")}
                                            onChange={(e) => { const p = cisloPole(e.target.value); setV({ pct: e.target.value, prodej: p != null && !Number.isNaN(p) ? String(sPrirazkou(nakup, p)).replace(".", ",") : v.prodej }); }} />
                                          <span>% → prodej/j.</span>
                                          <input style={{ ...pole, width: 82, borderColor: Number.isNaN(zadano) ? "#f87171" : "#cbd5e1" }} inputMode="decimal" aria-label="Prodejní cena za jednotku"
                                            value={v.prodej ?? String(vychozi).replace(".", ",")} onChange={(e) => setV({ prodej: e.target.value, pct: undefined })} />
                                          <span>Kč</span>
                                          {v.prodej != null ? (
                                            <>
                                              <span style={{ color: "#0369a1" }}>· uloží se k položce</span>
                                              <button type="button" onClick={() => setV({ prodej: undefined, pct: undefined })} style={{ border: "none", background: "none", color: "#0369a1", cursor: "pointer", fontSize: 11, padding: 0, fontFamily: "inherit" }}
                                                title="Vrátit původní cenu">↺</button>
                                            </>
                                          ) : <span style={{ color: "#94a3b8" }}>· {zdroj}</span>}
                                        </div>
                                      );
                                    })()}
                                    {v.typ === "materiál" && (
                                      <div style={{ fontSize: 11, marginTop: 3, color: "#0369a1" }}>
                                        📦 Projde skladem: příjem a hned výdej na zakázku{prod ? "" : " (produkt se ve skladu založí)"}
                                      </div>
                                    )}
                                  </>
                                )}
                              </>
                            ) : it.status === "zamitnuto" ? (
                              <span style={{ fontSize: 12, color: "#64748b" }}>Nepřiřazeno (zamítnuto)</span>
                            ) : (
                              <span style={{ fontSize: 12, color: "#15803d", fontWeight: 700 }}>
                                ✓ {it.assigned_to_sklad ? "Příjem na sklad" : !it.assigned_contract_id ? "Režie firmy (nic se nezapsalo)" : `Náklad zakázky ${hotovoZ ? popisZakazky(hotovoZ) : ""}${it.warehouse_movement_out_id ? " · přes sklad (příjem + výdej)" : ""}`}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "8px 4px", textAlign: "right" }}>
                            {navrh ? (
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                                <button type="button" style={tl("#15803d", "#fff", { opacity: v.cil ? 1 : 0.5 })} disabled={!v.cil || !!pracuji[it.id] || !!pracuji[`f${f.id}`]}
                                  onClick={() => potvrdit(f, [it])}>{pracuji[it.id] ? "…" : "✓ Potvrdit"}</button>
                                <button type="button" style={tlObrys()} disabled={!!pracuji[it.id]} title="Řádku nepřiřazovat (nic se nezapíše)"
                                  onClick={() => zamitnoutRadek(f, it)}>✕</button>
                              </div>
                            ) : (
                              <button type="button" style={tlObrys("#0369a1")} disabled={!!pracuji[it.id]}
                                title={it.status === "zamitnuto" ? "Vrátit řádku k přiřazení" : "Vrátí zápis (náklad zakázky / příjem na sklad) a řádka půjde přiřadit znovu"}
                                onClick={() => (it.status === "zamitnuto" ? zmenitPrirazeni({ f, it }) : setZmena({ f, it }))}>
                                {pracuji[it.id] ? "…" : "✏️ Změnit"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {!radky.length && (
                  <div style={{ fontSize: 13, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", marginTop: 6 }}>
                    Z této faktury se nepodařilo vyčíst řádky. Otevři 📄 PDF a přidej řádek ručně (stačí jeden za celou fakturu) — pak ho přiřadíš jako ostatní. Režijní faktury (telefon, software…) přiřaď jako 🏢 Režie firmy.
                  </div>
                )}
                {pridani?.fId === f.id ? (
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 120px auto", gap: 6, alignItems: "end", marginTop: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
                    <label style={{ fontSize: 11, color: "#475569" }}>Popis<input style={{ ...pole, width: "100%", boxSizing: "border-box" }} value={pridani.popis} onChange={(e) => setPridani({ ...pridani, popis: e.target.value })} /></label>
                    <label style={{ fontSize: 11, color: "#475569" }}>Množství<input style={{ ...pole, width: "100%", boxSizing: "border-box" }} inputMode="decimal" value={pridani.mnozstvi} onChange={(e) => setPridani({ ...pridani, mnozstvi: e.target.value })} /></label>
                    <label style={{ fontSize: 11, color: "#475569" }}>Jedn.<input style={{ ...pole, width: "100%", boxSizing: "border-box" }} value={pridani.jednotka} onChange={(e) => setPridani({ ...pridani, jednotka: e.target.value })} /></label>
                    <label style={{ fontSize: 11, color: "#475569" }}>Cena/j. bez DPH<input style={{ ...pole, width: "100%", boxSizing: "border-box" }} inputMode="decimal" value={pridani.cena} onChange={(e) => setPridani({ ...pridani, cena: e.target.value })} /></label>
                    <span style={{ display: "flex", gap: 4 }}>
                      <button type="button" style={tl("#0369a1")} onClick={ulozitRadek}>Přidat</button>
                      <button type="button" style={tlObrys()} onClick={() => setPridani(null)}>✕</button>
                    </span>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-start", marginTop: 8, flexWrap: "wrap" }}>
                    <button type="button" style={tlObrys("#0369a1")} onClick={() => otevritPridani(f)}>+ Přidat řádek ručně</button>
                    {!radky.length && <button type="button" style={tlObrys("#b91c1c")} disabled={!!pracuji[`f${f.id}`]} onClick={() => setZamitani(f)}>✕ Zamítnout fakturu</button>}
                  </div>
                )}
                {cekajici.length > 0 && (
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
                    <button type="button" style={tlObrys("#b91c1c")} disabled={!!pracuji[`f${f.id}`]} onClick={() => setZamitani(f)}>✕ Zamítnout celou fakturu</button>
                    <button type="button" style={tl("#15803d", "#fff", { opacity: pripravene.length ? 1 : 0.5 })} disabled={!pripravene.length || !!pracuji[`f${f.id}`]}
                      onClick={() => potvrdit(f, pripravene)}>
                      {pracuji[`f${f.id}`] ? "Zapisuji…" : `✓ Potvrdit vybrané (${pripravene.length} z ${cekajici.length})`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {zmena && (
        <div role="dialog" aria-modal="true" aria-labelledby="fronta-zmena" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 20, maxWidth: 440, width: "100%", textAlign: "left" }}>
            <div id="fronta-zmena" style={{ fontSize: 17, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>Změnit přiřazení řádky {zmena.it.line_no ?? ""}?</div>
            <div style={{ fontSize: 14, color: "#334155", marginBottom: 16 }}>
              <b>{zmena.it.description}</b><br />
              {zmena.it.assigned_to_sklad
                ? "Příjem na sklad se vrátí — pohyb se smaže a stav produktu se sníží o přijaté množství (produkt ve skladu zůstane)."
                : zmena.it.warehouse_movement_out_id ? "Náklad se ze zakázky smaže a smaže se i příjem a výdej materiálu ve skladu (stav skladu se nezmění)." : "Náklad se ze zakázky smaže."}
              {" "}Řádka se vrátí k přiřazení a pak vybereš nové přiřazení a potvrdíš.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={tlObrys()} onClick={() => setZmena(null)}>Zpět</button>
              <button type="button" style={tl("#0369a1")} onClick={() => zmenitPrirazeni(zmena)}>Vrátit a změnit</button>
            </div>
          </div>
        </div>
      )}

      {zamitani && (
        <div role="dialog" aria-modal="true" aria-labelledby="fronta-zamitnout" style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 20, maxWidth: 420, width: "100%", textAlign: "left" }}>
            <div id="fronta-zamitnout" style={{ fontSize: 17, fontWeight: 800, color: "#991b1b", marginBottom: 8 }}>Zamítnout fakturu?</div>
            <div style={{ fontSize: 14, color: "#334155", marginBottom: 16 }}>
              {zamitani.supplier_name || "Faktura"} {zamitani.invoice_number || ""} — nepotvrzené řádky se označí jako nepřiřazené a nic se nezapíše do zakázek ani na sklad. Už potvrzené řádky zůstanou.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={tlObrys()} onClick={() => setZamitani(null)}>Zpět</button>
              <button type="button" style={tl("#dc2626")} onClick={() => zamitnoutFakturu(zamitani)}>Zamítnout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
