-- Číslo nabídky (N-SRV-2026-0001 / N-FVR-2026-0001) a datum vystavení.
-- Přiděluje appka při prvním uložení servisní / rozšiřovací nabídky
-- (Pricing.jsx, dalsiCisloNabidky); UNIQUE index hlídá, aby dvě nabídky
-- nikdy nedostaly stejné číslo. Aplikováno v Supabase 22. 9. 2026.
alter table public.quotes add column if not exists cislo text;
alter table public.quotes add column if not exists vystaveno date;
create unique index if not exists quotes_cislo_key on public.quotes (cislo) where cislo is not null;
