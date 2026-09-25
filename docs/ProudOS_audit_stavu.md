## ProudOS — audit stavu appky (srpen 2026)

Kompletní průchod celou aplikací (App.jsx + všechny moduly) s cílem zjistit, co je hotové, co je nedodělané a co chybí pro rychlé zadávání a přehledný výčet informací. Audit je založený na čtení kódu, ne na živém testování appky (přihlašovací údaje z bezpečnostních důvodů nepoužívám).

---

### Nejdůležitější zjištění napříč celou appkou

Tohle jsou věci, které stojí za pozornost jako první — buď jde o reálné chyby/rizika, nebo o místa, kde appka vypadá hotová, ale není.

1. **AI asistent je nefunkční.** Modul volá přímo z prohlížeče Anthropic API bez klíče a bez serverové vrstvy, která by klíč doplnila. Každý dotaz skončí chybou. Vypadá to jako hotová funkce (hezké UI, chat, návrhy otázek), ale nikdy nic neudělá.
2. **Riziko dvojí fakturace.** Vystavení faktury "ze zakázky" sečte všechny náklady zakázky bez ohledu na to, jestli už byly v Zakázkách označené jako "schváleno k fakturaci" nebo "vyfakturováno". Dvě různá místa appky ("K fakturaci" v Zakázkách a vystavení faktury ve Fakturaci) spolu nekomunikují.
3. **Tři nezávislé evidence nákladů** (Náklady, náklady na zakázce, Finanční tok) se nikde skutečně nesčítají — jen v Reportech jako čtecí souhrn. Hlavní číslo "Zisk" na Analytice navíc počítá jen z jedné z nich, takže může být podhodnocené, pokud se náklady zapisují primárně u zakázek.
4. **Dvě nepropojené evidence fotek** ke stejné zakázce — fotky nahrané přes Docházku a fotky nahrané přes modul Nahrát fotky se ukládají jinam a navzájem se nezobrazují. Není jasné, kde je "kompletní" fotodokumentace zakázky.
5. **Zakázkový list (papírová karta) má vlastní, ručně přepisovaná čísla** pro fakturaci a ekonomiku/marži, oddělená od skutečných faktur a od živého výpočtu zisku v Zakázkách — reálné riziko, že se čísla na kartě a ve skutečnosti rozejdou.
6. **Možná chyba ve výpočtu marže zakázky** s dodacími listy — marže z materiálu na dodacím listu se podle všeho nepočítá do celkového zisku zakázky. Stojí za rychlé ověření, jestli je to záměr, nebo bug.
7. **Appka nemá žádnou odolnost proti výpadku signálu.** Zápis docházky, km, fotek i podpisů jde přímo do databáze bez ošetření chyby — když v terénu vypadne signál, záznam tiše zmizí a člověk neví, že se nic neuložilo.
8. **Záloha na OneDrive hlásí "100 % hotovo" i když část dat reálně selhala** nahrát — chybí souhrn "co se nepovedlo".
9. **Úkoly nejsou nikde řazené podle termínu** (hlavní seznam úkolů, přehled na dashboardu majitele i zaměstnance) — zobrazují se v náhodném pořadí, ne podle toho, co hoří nejvíc.
10. **Přepínač roku v Reportech je jen naoko** — momentálně je dostupný jen rok 2026, takže to nevadí, ale výpočty mají rok napevno zadrátovaný v kódu, ne navázaný na přepínač.
11. **Dovolenou zaměstnance nejde upravit z appky** — pole existuje a zobrazuje se, ale needá se editovat jinak než přímo v databázi.

---

### Co je hotové — silné stránky

- **Propojení zákazník → komunikace → úkoly → zakázky → faktury** na jedné obrazovce v Customers funguje a je to jedna z nejlepších částí appky.
- **Rychlé zadání přes volný text** funguje doopravdy chytře na dvou místech: "Rychlá poptávka" (Obchodní případy) a "Rychlé zadání" (Kalendář) — pravidlový parser rozezná datum, telefon, hodnotu zakázky, typ práce i zákazníka z jedné věty bez nutnosti vyplňovat formulář.
- **FVE kalkulačka** je nejpropracovanější modul appky — balíčky na jeden klik, editovatelný ceník, automatický výpočet dotace/marže, generování nabídky přímo do Wordu.
- **Docházka (check-in/check-out)** je rychlá — jeden dotek, zbytek (zakázka, popis, fotky) lze doplnit později.
- **Fakturace** (upomínky, sledování plateb, sliby úhrad, export) je nadprůměrně propracovaná v porovnání se zbytkem appky.
- **Dashboard majitele** má funkční KPI dlaždice, grafy a automatické počítání pohledávek/závazků po splatnosti podle data, ne podle ručního zaškrtnutí.
- **Mobilní zobrazení, jednotné grafické téma a čitelnost** jsou po posledních úpravách v dobrém stavu (viz předchozí opravy v této session).

---

### Modul po modulu — co chybí pro rychlost a přehlednost

**CRM a prodej**

| Modul | Chybí |
|---|---|
| Dashboard / Dashboard zaměstnance | Řazení úkolů podle termínu, odkaz na Kalendář z dashboardu zaměstnance |
| Zákazníci | Řazení tabulky, filtr podle štítku/typu, export, souhrny v detailu (celkem fakturováno, počet otevřených poptávek) |
| Obchodní případy (Deals) | Hledání/filtr podle zákazníka v kanbanu, součty/KPI nad kanbanem, search-select místo obyčejného výběru zákazníka |
| Komunikace | Hledání/filtr napříč záznamy (dnes jen posledních 100 bez filtru), řazení vláken podle aktivity |
| Úkoly | Řazení podle termínu, zvýraznění úkolů po termínu, rychlé zadání jako u Kalendáře (dnes jen dlouhý formulář s 9+ poli), hromadné akce |
| Kalendář / Rychlé zadání | Potvrzovací náhled před uložením rozpoznaného záznamu, hledání události podle zákazníka |
| Reporty | Skutečná funkčnost přepínače roku, export do PDF/Excelu, vlastní rozsah období |
| AI asistent | Chybí zprovoznění (viz výše) nebo jasné označení jako nedostupné |

**Terén a zaměstnanci**

| Modul | Chybí |
|---|---|
| Docházka | Ošetření výpadku signálu, výchozí "poslední zakázka", viditelné info že hodiny jsou po odečtu pauzy |
| Kniha jízd | Výchozí "poslední vozidlo", celoroční souhrn km bez přepínání měsíc po měsíci |
| HR | Editace dovolené z UI, celoroční přehled absencí |
| Profil zaměstnance | Prakticky prázdný — chybí dovolená, km, otevřené úkoly |
| Sklad | Upozornění při neshodě názvu produktu (dnes se pohyb tiše nepropíše do stavu), přehled materiálu na konkrétním autě |
| Nahrát fotky | Komprese fotek před uploadem, sjednocení s fotkami z Docházky, offline fronta |
| OneDrive | Hlášení částečného selhání zálohy, plánovaná automatická záloha |
| Podpisy | Ošetření výpadku signálu při odesílání podpisu |

**Zakázky, nacenění a finance**

| Modul | Chybí |
|---|---|
| Zakázky | Rychlejší hromadné zadávání nákladů/položek, ceník opakovaného materiálu, řazení a stránkování seznamu, záložka "Faktury" na kartě zakázky |
| Zakázkový list | Datepicker místo volného textu, napojení sekcí Fakturace/Ekonomika na živá data |
| Nacenění | Ceník položek mimo FVE, duplikace nabídky, KPI a filtr stavu v seznamu |
| Finanční tok | Hledání, filtr podle typu/protistrany, řazení |
| Fakturace | Sloupec "Zakázka" v seznamu faktur, respektování schválených/vyfakturovaných položek ze Zakázek |

---

### Doporučené pořadí prací

**Nejdřív opravit (rizika/bugy):**
1. Vystavení faktury respektuje schválené/vyfakturované položky ze Zakázek (riziko dvojí fakturace)
2. Sjednotit tři evidence nákladů, nebo aspoň opravit hlavní KPI zisku na Analytice
3. Sjednotit fotky zakázky do jednoho úložiště
4. Ověřit výpočet marže u zakázek s dodacími listy
5. AI asistent — zprovoznit, nebo skrýt/označit jako nedostupný
6. Napojit Zakázkový list (Fakturace/Ekonomika) na živá data místo ručních kopií

**Pak zvýšit spolehlivost v terénu:**
7. Základní offline odolnost (fronta + retry) pro check-in, km, fotky, podpisy
8. Chybové hlášky při selhání síťového volání (dnes ticho)
9. OneDrive záloha musí hlásit částečné selhání
10. Komprese fotek před uploadem

**Pak zrychlit každodenní práci:**
11. Řazení úkolů podle termínu na všech 3 místech + zvýraznění po termínu
12. Rychlé zadání úkolu (textem, jako u Kalendáře/Poptávek)
13. Hledání/filtr v Deals, Komunikaci, Zakázkách, Nacenění
14. Ceník opakovaného materiálu/prací pro Zakázky a Nacenění (mimo FVE)
15. Výchozí hodnoty (poslední vozidlo, poslední zakázka) v Knize jízd a Docházce

**Menší dodělávky:**
16. Editace dovolené z UI (HR)
17. Obohatit Profil zaměstnance
18. Skutečná funkčnost přepínače roku v Reportech
19. Export zákazníků, export reportů
