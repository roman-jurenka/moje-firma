-- Bezpečnost — bod 4: pozůstatky starého přihlašování. NEVRATNÉ MAZÁNÍ.
-- Přihlašuje se přes Supabase Authentication; tyhle sloupce/tabulky appka nepoužívá.
--  - employees.password: vyplněný u 1 zaměstnance (byl čitelný i bez přihlášení).
--    Tomu člověku doporučuji změnit heslo, pokud ho používá i jinde.
--  - users: prázdná tabulka (0 řádků) se sloupcem password.
-- Spustit až po 20260925090000_bezpecnost_pravidla.sql.

alter table public.employees drop column if exists password;
drop table if exists public.users;
