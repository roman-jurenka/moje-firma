-- Průběh zakázek: Obchod → Back office → Realizace → uzavření (Prubeh.jsx).
-- Jeden řádek = jedna zakázka od poptávky po archiv; fáze a úkoly fází jsou
-- v appce (src/prubehFaze.js), tady se ukládá jen, kde zakázka je, co je
-- hotové, další krok, proč stojí a kdo za co odpovídá. Poznámky zvlášť.
create table if not exists public.zakazky_prubeh (
  id bigint generated always as identity primary key,
  nazev text not null,
  customer_id bigint references public.customers(id) on delete set null,
  typ text,
  hodnota numeric,                 -- cena bez DPH
  deal_id bigint references public.deals(id) on delete set null,
  contract_id bigint references public.contracts(id) on delete set null,
  quote_id bigint references public.quotes(id) on delete set null,
  faze text not null default 'poptavka',
  faze_od timestamptz not null default now(),
  stav text not null default 'otevrena' check (stav in ('otevrena', 'uzavrena', 'prohrana')),
  hotove_ukoly jsonb not null default '{}'::jsonb,   -- {"zaloha.zaplacena": true}
  preskocene jsonb not null default '[]'::jsonb,     -- ["dotace"]
  potrebne jsonb not null default '[]'::jsonb,       -- volitelné fáze, které zakázka potřebuje
  dalsi_krok text,
  dalsi_krok_termin date,
  dalsi_krok_kdo text,
  vlastnik_obchod text,
  vlastnik_bo text,
  vlastnik_re text,
  duvod_cekani text,
  prohra_duvod text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists zakazky_prubeh_contract_key on public.zakazky_prubeh (contract_id) where contract_id is not null;
create unique index if not exists zakazky_prubeh_deal_key on public.zakazky_prubeh (deal_id) where deal_id is not null;
create index if not exists zakazky_prubeh_stav_idx on public.zakazky_prubeh (stav);

create table if not exists public.zakazky_poznamky (
  id bigint generated always as identity primary key,
  prubeh_id bigint not null references public.zakazky_prubeh(id) on delete cascade,
  kdo text,
  duvod text,
  text text not null,
  system boolean not null default false,   -- automatický záznam (posun fáze apod.)
  created_at timestamptz not null default now()
);
create index if not exists zakazky_poznamky_prubeh_idx on public.zakazky_poznamky (prubeh_id, created_at desc);

alter table public.zakazky_prubeh enable row level security;
alter table public.zakazky_poznamky enable row level security;
drop policy if exists authenticated_full_access on public.zakazky_prubeh;
create policy authenticated_full_access on public.zakazky_prubeh for all to authenticated using (true) with check (true);
drop policy if exists authenticated_full_access on public.zakazky_poznamky;
create policy authenticated_full_access on public.zakazky_poznamky for all to authenticated using (true) with check (true);
