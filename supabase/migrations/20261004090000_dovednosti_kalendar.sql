-- Profil zaměstnance: pole, která appka už ukládá, ale v tabulce chyběla
-- (ukládání profilu proto potichu selhávalo), a dovednosti „kdo co umí“.
alter table public.employees add column if not exists bio text;
alter table public.employees add column if not exists specialization text;
alter table public.employees add column if not exists notes_warning text;
alter table public.employees add column if not exists photo_url text;
alter table public.employees add column if not exists dovednosti text[] not null default '{}';

-- Kalendář: co má zaměstnanec u akce na starosti (střecha, elektro, uzemnění…)
-- a vazba na zakázku v Průběhu (i když ještě nemá zakázku/contract).
alter table public.calendar_events add column if not exists na_starosti text;
alter table public.calendar_events add column if not exists prubeh_id bigint references public.zakazky_prubeh(id) on delete set null;
create index if not exists calendar_events_prubeh_idx on public.calendar_events (prubeh_id);

-- tabulka employees má práva po sloupcích (platy jsou skryté) — nové sloupce zpřístupnit ke čtení
grant select (bio, specialization, notes_warning, photo_url, dovednosti) on public.employees to authenticated;
