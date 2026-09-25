# Audit: Nabídka → Obchodní případ → Zakázka → Fakturace

Datum: srpen 2026. Kontrola provedena čtením zdrojového kódu appky ProudOS (Pricing.jsx, App.jsx, Contracts.jsx, ZakazkaSheet.jsx). Nic nebylo v appce upraveno — jde o seznam nálezů k odsouhlasení priorit.

## Shrnutí

Tok Nabídka → Obchodní případ → Zakázka funguje a náklady se ze skladu, docházky a knihy jízd zapisují na zakázku automaticky. Slabiny appky jsou hlavně ve třech oblastech: (1) poslední krok Zakázka → Faktura je úplně přerušený, (2) ukládací tlačítka téměř nikde neblokují dvojklik, takže hrozí duplicitní záznamy, a (3) chyby ze serveru se ve většině formulářů nezobrazují — když se uložení nepovede, appka o tom mlčí.

## 1. Nejzávažnější nálezy

**Fakturace nemá vazbu na zakázku.** Modul Faktury nedostává data o zakázkách vůbec (chybí i jako parametr komponenty), nemá sloupec navázaný na zakázku, takže se každá faktura píše ručně od nuly — včetně částky, kterou appka už jednou spočítala v Nacenění i na zakázkovém listu.

**Číslování faktur se může srazit.** Číslo nové faktury se počítá jako „počet dosavadních faktur + 1" v prohlížeči, ne v databázi. Když dva lidé vytvoří fakturu ve stejnou chvíli, můžou dostat stejné číslo — u účetních dokladů je to problém.

**Smazání zakázky nesmaže navázaná data v databázi.** Tlačítko tvrdí „smaže náklady, úkoly a fotky", ale reálně jen schová záznamy v appce — v databázi zůstávají osiřelé položky navázané na neexistující zakázku. Totéž u mazání dodacího listu.

**Dvojklik na Uložit hrozí duplicitou skoro všude.** Kromě formuláře Nacenění nemá žádné ukládací tlačítko v appce (nová zakázka, nová poptávka, nová faktura, nákladová položka, zakázkový list...) ochranu proti dvojkliku — může vzniknout duplicitní záznam.

**Chyby ze serveru appka většinou mlčí.** Když se uložení nepovede (výpadek sítě, oprávnění), ve většině formulářů se nic nezobrazí — appka tváří, že je hotovo, i když není.

## 2. Nálezy podle sekcí

### Nacenění (Pricing)
- Lze uložit nabídku bez položek nebo se záporným číslem (dny, km, ceny).
- Chyba z uložení se nekontroluje — tichý fail.
- Tlačítko „Převést na obchodní případ" nemá ochranu proti dvojkliku.
- Sloupce „Cena/den náklad" a „Cena/den klient" jsou vizuálně skoro identické, snadná záměna.
- Smazání nabídky je nevratné (bez archivace, jako mají zákazníci/zaměstnanci).
- Přepnutí na jinou nabídku zahodí neuložené změny bez varování.

### Obchodní případy (Deals)
- Smazání obchodního případu **nemá potvrzovací dialog** — jeden klik a je pryč, nevratně.
- Když zákazník není vybraný, do databáze jde neplatná hodnota místo chyby.
- Přesun karty mezi fázemi (drag&drop) nekontroluje, jestli se zápis do databáze povedl — appka a databáze se můžou rozejít.
- Tři různé barevné škály pro „stav" napříč appkou (obchodní případy / zakázky / faktury) — nejednotné.

### Zakázky (Contracts)
- Formulář nové nákladové položky prakticky vždy projde validací i s prázdným popisem a nulovou cenou (chyba v podmínce).
- Nekonzistentní mazání: některá tlačítka se ptají na potvrzení, jiná (nákladová položka, položka dodacího listu) mažou rovnou bez dotazu.
- Zakázka má 10 záložek plus samostatný „Zakázkový list" se svými vlastními čísly — musí se ručně tlačítkem synchronizovat, jinak se rozejdou.
- Název zakázky složený jen z mezer projde validací.

### Zakázkový list (ZakazkaSheet)
- Tlačítko „Uložit" neblokuje dvojklik — při úplně první uložení hrozí, že vzniknou dva záznamy pro tutéž zakázku.
- Odchod ze zakázkového listu zpět na seznam zahodí neuložené změny ve všech 13 sekcích bez varování.
- Sekce „Zákazník" je čistý volný text, nenapojený na modul Zákazníci — jméno/telefon se snadno rozejde mezi dvěma místy.
- Čtyři různě pojmenovaná pole na čtyřech místech appky reprezentují v podstatě „prodejní cenu zakázky" — není jasné, které je to platné.
- Jedno tlačítko u generovaných dokumentů (smlouva, plná moc...) nemá vůbec žádnou funkci — vypadá klikatelně, ale nic nedělá.
- Peněžní částky v tabulce „Ekonomická bilance" se nezobrazují ve formátu Kč jako všude jinde v appce — čísla bez oddělovačů tisíců.

### Fakturace (Invoices)
- Lze uložit fakturu s částkou 0.
- Nekontroluje se, že datum splatnosti je až po datu vystavení.
- Faktura „Po splatnosti" se nedopočítává automaticky podle data — zůstává žlutá „Čeká", dokud si toho někdo ručně nevšimne.
- V tabulce není u částky vyznačeno, jestli jde o částku bez DPH nebo s DPH (ve formuláři ano, v tabulce ne).
- Neexistuje možnost fakturu smazat, jen přepnout stav — ale stav „Storno" chybí v nabídce voleb.

## 3. Doporučené pořadí oprav

1. Propojit Fakturaci se zakázkou (`contract_id`, tlačítko „Vytvořit fakturu ze zakázky" s předvyplněnými položkami) — vyřeší duplicitní ruční přepisování cen.
2. Číslo faktury generovat bezpečně (databázová sekvence, ne délka pole v prohlížeči).
3. Přidat `disabled` na ukládací tlačítka během ukládání — plošně, jednoduchá oprava s velkým dopadem.
4. Doplnit potvrzení u mazání obchodního případu; sjednotit mazání v Contracts.jsx.
5. Opravit skutečné mazání navázaných záznamů v databázi při smazání zakázky/dodacího listu (nebo aspoň ověřit, že na tom v Supabase je nastavené `ON DELETE CASCADE`).
6. Zobrazovat chybu uživateli, když se uložení nepovede (aspoň `alert`, ideálně toast).
