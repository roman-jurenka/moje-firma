-- Jízdy služebních aut z GPS Dozoru (o1.gpsguard.eu) pro kontrolu milníků docházky.
-- Plní je večerní úloha přes funkci gps-prijem; číst je smí jen vedení.
create table if not exists public.gps_vozidla (
  kod text primary key,                       -- kód vozidla v GPS Dozoru (z adresy /v/<kod>/trip-log)
  nazev text,
  spz text,
  ridic_employee_id bigint references public.employees(id) on delete set null,
  vehicle_id bigint references public.vehicles(id) on delete set null,
  aktivni boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.gps_jizdy (
  id bigint generated always as identity primary key,
  vozidlo_kod text not null references public.gps_vozidla(kod) on delete cascade,
  datum date not null,
  zacatek time not null,
  konec time,
  z_adresa text,
  do_adresa text,
  km numeric,
  doba_min integer,
  stani_min integer,
  created_at timestamptz not null default now(),
  unique (vozidlo_kod, datum, zacatek)
);
create index if not exists gps_jizdy_den on public.gps_jizdy (datum);

alter table public.gps_vozidla enable row level security;
alter table public.gps_jizdy enable row level security;
drop policy if exists gps_vozidla_vedeni on public.gps_vozidla;
create policy gps_vozidla_vedeni on public.gps_vozidla for all to authenticated
  using ((select public.app_je_vedeni())) with check ((select public.app_je_vedeni()));
drop policy if exists gps_jizdy_vedeni on public.gps_jizdy;
create policy gps_jizdy_vedeni on public.gps_jizdy for select to authenticated
  using ((select public.app_je_vedeni()));

-- Výchozí řidič nových aut z GPS (Roman Jurenka)
insert into public.app_settings (key, value, updated_at)
select 'gps_vychozi_ridic', jsonb_build_object('employee_id', e.id), now()
from public.employees e where e.name = 'Roman Jurenka'
on conflict (key) do nothing;

-- Čím se řídit při schvalování docházky: zápisem zaměstnance, nebo GPS
insert into public.app_settings (key, value, updated_at)
values ('dochazka_ridit_se', '{"rezim": "zapis"}'::jsonb, now())
on conflict (key) do nothing;
