-- 3D návrhy FVE a hromosvodu (modul „3D návrh FVE“).
-- Dřív se ukládaly jen v zařízení (localStorage); teď jsou v databázi, aby je
-- viděli všichni, kdo s modulem pracují, na všech zařízeních. Celý návrh je
-- v jsonb `data`; fotky stěn jsou v úložišti zakazky-fotky (navrhy3d/<id>/…)
-- a v `data` je u nich jen cesta. Návrh jde přiřadit k zakázce.

create table if not exists public.navrhy_3d (
  id text primary key,                                   -- id návrhu z aplikace
  nazev text not null default '',
  zakaznik text,
  contract_id bigint references public.contracts(id) on delete set null,
  data jsonb not null,
  vytvoril text,
  upravil text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists navrhy_3d_contract_idx on public.navrhy_3d(contract_id);
create index if not exists navrhy_3d_updated_idx on public.navrhy_3d(updated_at desc);

alter table public.navrhy_3d enable row level security;
-- Stejně jako záložka v menu: kdo naceňuje nebo pracuje se zakázkami.
create policy "navrhy_3d_naceneni" on public.navrhy_3d for all to authenticated
  using ((select public.app_ma(array['pricing', 'navrh3d', 'contracts', 'prubeh'])))
  with check ((select public.app_ma(array['pricing', 'navrh3d', 'contracts', 'prubeh'])));
revoke all on public.navrhy_3d from anon;
grant select, insert, update, delete on public.navrhy_3d to authenticated;

create or replace function public.navrhy_3d_upraveno()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists navrhy_3d_upraveno on public.navrhy_3d;
create trigger navrhy_3d_upraveno before update on public.navrhy_3d
  for each row execute function public.navrhy_3d_upraveno();
