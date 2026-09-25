# ProudOS

Firemní CRM/ERP aplikace Jurenka Elektro s.r.o. — zákazníci, obchodní případy,
nacenění a nabídky (FVE), zakázky, docházka, kniha jízd, sklad, fakturace,
finanční tok, podpisy a hlášení.

- **Web:** https://moje-firma.vercel.app
- **Mobil:** stejná aplikace zabalená přes Capacitor (Android, iOS)

## Technologie

| Část | Použito |
|---|---|
| Frontend | React 19 + Vite |
| Databáze, přihlášení, soubory | Supabase (projekt `rbnqulgmywtvuryabzjc`) |
| Serverové funkce | Supabase Edge Functions (`supabase/functions/`) + `api/` na Vercelu |
| Hosting | Vercel — každý push na `main` se automaticky nasadí |
| Mobilní build | Capacitor, iOS přes Codemagic (`codemagic.yaml`) |
| OneDrive, Outlook | Microsoft Graph (`src/onedrive.js`, `src/outlookCalendar.js`) |

## Spuštění na počítači

```bash
npm ci
npm run dev
```

Aplikace poběží na http://localhost:5173 a pracuje s ostrou databází.

Další příkazy:

- `npm run build` — produkční sestavení do `dist/`
- `npm run lint` — kontrola kódu
- `npm run cap:android` / `npm run cap:ios` — sestavení a otevření mobilní appky

## Nasazení

Změny se nahrávají přes git (`git push` na `main`), **ne nahráváním souborů
přes web GitHubu** — tím se snadno přepíše novější verze starší.
Vercel po pushi aplikaci sám sestaví a nasadí.

## Struktura projektu

```
src/                      aplikace
  App.jsx                 hlavní část (přihlášení, menu, většina modulů)
  Contracts.jsx           zakázky
  ZakazkaSheet.jsx        zakázkový list
  Pricing.jsx, FveCalculator.jsx, NabidkaNahled.jsx   nacenění a nabídky
  Prubeh.jsx              průběh zakázek
  Invoicing.jsx, invoicingUtils.js, Finance.jsx       fakturace a finance
  Podpisy.jsx             podepisování dokumentů
  Hlaseni.jsx             nastavení hlášení a notifikací
  supabase.js             připojení k databázi + hlídač odmítnutých zápisů
  storageUrl.jsx          zobrazení souborů ze soukromého úložiště
  offlineQueue.js         fronta zápisů při výpadku signálu
public/                   statické soubory, service worker (sw.js), šablony nabídek
api/calendar-feed.js      odběr kalendáře pro iPhone/Outlook (Vercel funkce)
supabase/
  migrations/             změny databáze (od září 2026), spouštět v pořadí
  rucni-skripty/          starší SQL skripty spuštěné ručně v SQL editoru
  functions/              zdrojové kódy Edge Functions (viz níže)
android/, ios/            nativní projekty Capacitoru
resources/splash-ios/     úvodní obrázky pro iOS
docs/                     audity a dokumentace
```

## Databáze a oprávnění

Veřejný klíč Supabase je součástí aplikace, proto veškerá ochrana dat stojí na
pravidlech v databázi (RLS), ne na skrývání záložek v menu:

- **Nepřihlášený** nemá přístup k ničemu kromě přihlašovacího adresáře
  (`login_directory`) a kalendářového feedu.
- **Oprávnění se řídí záložkami** nastavenými v modulu Oprávnění (jinak výchozí
  podle role). V databázi to vyhodnocují funkce `app_moje_nav()`, `app_ma(záložky)`,
  `app_je_admin()` (role admin nebo záložka Oprávnění) a `app_je_vedeni()`.
- **Finance** (faktury, náklady, finanční tok) vidí jen ten, kdo má některou
  z finančních záložek; zaměstnanec vidí jen své účtenky.
- **Platy a sazby** nejdou číst přímo z tabulky `employees`, jen přes funkci
  `get_employees_full()` — HR a vedení vidí všechny, ostatní jen sebe.
  Nový sloupec v `employees` je potřeba přidat do `grant select (...)`.
- **Soubory** (fotky a dokumenty zakázek) jsou v soukromém úložišti; aplikace
  je zobrazuje přes dočasné podepsané odkazy (`src/storageUrl.jsx`).
- Novou tabulku zakládej s pravidly jen pro roli `authenticated`
  (např. `using ((select public.app_ma(array['contracts'])))`), nikdy pro `anon`.

Změny databáze patří do nového souboru v `supabase/migrations/`.

## Serverové funkce (Supabase Edge Functions)

| Funkce | K čemu | Ochrana |
|---|---|---|
| `hlaseni-odeslat` | Hlášení (Pushover, push notifikace), docházka na pozadí, ranní úkoly; volá ji pg_cron každých 5 min | tajemství z Vaultu / přihlášený admin |
| `invite-employee` | pozvánka nového zaměstnance e-mailem (HR) | přihlášený admin |
| `faktury-prijem` | příjem faktur z e-mailu do fronty ke schválení | vlastní token `FAKTURY_PRIJEM_TOKEN` |
| `check-urgence-notify` | starší předchůdce hlášení, nepoužívá se | **žádná — doporučeno smazat** |
| `swift-handler` | stará kopie `invite-employee` (zdroj není v repozitáři) | přihlášený admin — doporučeno smazat |

Kód v `supabase/functions/` odpovídá verzím nasazeným v září 2026.
Po úpravě je potřeba funkci znovu nasadit (Supabase dashboard → Edge Functions,
nebo `supabase functions deploy <název>`).
