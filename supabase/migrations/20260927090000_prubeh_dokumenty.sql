-- Průběh zakázek: evidence vygenerovaných dokumentů (návrh smlouvy,
-- předávací protokol, dodatky). Kontroly ve fázích podle ní poznají, jestli
-- dokument existuje; dodatky mají pořadové číslo.
-- { smlouva: {at, kdo}, protokol: {at, kdo}, dodatky: [{cislo, at, kdo, popis, cena_puvodni, cena_nova, termin}] }
alter table public.zakazky_prubeh add column if not exists dokumenty jsonb not null default '{}'::jsonb;
