-- Knihovna dokumentů podle typu zakázky (FVE, FVR, ELK…; '*' = všechny typy):
-- certifikáty, návody, prohlášení o shodě, vzory. Každá zakázka daného typu je
-- automaticky ukáže ve svých Dokumentech.
create table if not exists public.dokumenty_typu (
  id bigint generated always as identity primary key,
  typ text not null,
  nazev text not null,
  cesta text not null,          -- soubor v bucketu dokumenty-typu
  popis text,
  poradi int not null default 0,
  nahral text,
  created_at timestamptz not null default now()
);
create index if not exists dokumenty_typu_typ on public.dokumenty_typu (typ);
alter table public.dokumenty_typu enable row level security;
drop policy if exists dokumenty_typu_cteni on public.dokumenty_typu;
create policy dokumenty_typu_cteni on public.dokumenty_typu for select to authenticated using (true);
drop policy if exists dokumenty_typu_sprava on public.dokumenty_typu;
create policy dokumenty_typu_sprava on public.dokumenty_typu for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

insert into storage.buckets (id, name, public) values ('dokumenty-typu', 'dokumenty-typu', false)
on conflict (id) do nothing;
drop policy if exists dokumenty_typu_soubory_cteni on storage.objects;
create policy dokumenty_typu_soubory_cteni on storage.objects for select to authenticated using (bucket_id = 'dokumenty-typu');
drop policy if exists dokumenty_typu_soubory_sprava on storage.objects;
create policy dokumenty_typu_soubory_sprava on storage.objects for all to authenticated
  using (bucket_id = 'dokumenty-typu' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))
  with check (bucket_id = 'dokumenty-typu' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));
