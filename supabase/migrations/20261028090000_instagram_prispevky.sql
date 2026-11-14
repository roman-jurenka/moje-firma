-- Plán příspěvků na firemní Instagram (modul Instagram): každý řádek je jeden
-- příspěvek — kdy vyjde, jaký formát a téma, fotky z realizace (contract_photos)
-- a text. Zveřejňuje se ručně přes Sdílet v mobilu, stav se tu jen eviduje.
create table if not exists public.instagram_prispevky (
  id bigint generated always as identity primary key,
  datum date not null,
  cas text not null default '18:30',
  format text not null default 'realizace',      -- realizace, pred_po, zakulisi, tip
  tema text,
  contract_id bigint references public.contracts(id) on delete set null,
  prubeh_id bigint references public.zakazky_prubeh(id) on delete set null,
  foto_ids bigint[] not null default '{}',       -- contract_photos.id v pořadí příspěvku
  popisek text,
  hashtagy text,
  stav text not null default 'planovano',        -- planovano, zverejneno
  zverejneno_at timestamptz,
  vytvoril text,
  created_at timestamptz not null default now()
);
create index if not exists instagram_prispevky_datum on public.instagram_prispevky (datum);
alter table public.instagram_prispevky enable row level security;
drop policy if exists instagram_prispevky_prihlaseni on public.instagram_prispevky;
create policy instagram_prispevky_prihlaseni on public.instagram_prispevky for all to authenticated using (true) with check (true);
