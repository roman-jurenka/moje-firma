-- Poznámky k zakázce (Obchod / Back office / Realizace): datum zápisu volí
-- zapisovatel (může zapsat i zpětně), zobrazuje se „25.11. RJ – text“.
alter table public.zakazky_poznamky add column if not exists datum date;
update public.zakazky_poznamky set datum = (created_at at time zone 'Europe/Prague')::date where datum is null;
alter table public.zakazky_poznamky alter column datum set default ((now() at time zone 'Europe/Prague')::date);
alter table public.zakazky_poznamky alter column datum set not null;
