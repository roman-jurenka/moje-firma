-- Kniha jízd → Jízdy z GPS: přiřazení jízdy k zakázce a schválení vedením.
-- Samostatná tabulka (klíč auto + den + začátek), protože gps-sync jízdy dne
-- přepisuje — přiřazení a schválení tak zůstanou zachované.
create table if not exists public.gps_jizdy_stav (
  vozidlo_kod text not null,
  datum date not null,
  zacatek time not null,
  contract_id bigint references public.contracts(id) on delete set null,
  schvaleno boolean not null default false,
  schvalil text,
  schvaleno_at timestamptz,
  poznamka text,
  updated_at timestamptz not null default now(),
  primary key (vozidlo_kod, datum, zacatek)
);
alter table public.gps_jizdy_stav enable row level security;
drop policy if exists gps_jizdy_stav_vedeni on public.gps_jizdy_stav;
create policy gps_jizdy_stav_vedeni on public.gps_jizdy_stav for all to authenticated
  using ((select public.app_je_vedeni())) with check ((select public.app_je_vedeni()));
