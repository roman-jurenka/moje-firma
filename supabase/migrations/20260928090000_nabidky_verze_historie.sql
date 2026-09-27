-- Verze nabídky: klient chce víc variant → kopie nabídky propojené s první
-- (verze_od = id první nabídky, verze = 2, 3, …). První nabídka má obě null.
alter table public.quotes add column if not exists verze_od bigint references public.quotes(id) on delete set null;
alter table public.quotes add column if not exists verze integer;
create index if not exists quotes_verze_od_idx on public.quotes (verze_od);

-- Historie nabídky: automatické záznamy (stav, cena, sleva, verze, odeslání)
-- i ručně zapsané informace. Záznamy se jen přidávají — upravit ani smazat
-- je nejde (smažou se jen se svou nabídkou).
create table if not exists public.nabidky_historie (
  id bigint generated always as identity primary key,
  quote_id bigint not null references public.quotes(id) on delete cascade,
  kdo text,
  typ text not null default 'zmena',   -- zmena | poznamka | stav | cena | sleva | verze | odeslano
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists nabidky_historie_quote_idx on public.nabidky_historie (quote_id, created_at);

alter table public.nabidky_historie enable row level security;
drop policy if exists nabidky_historie_cteni on public.nabidky_historie;
create policy nabidky_historie_cteni on public.nabidky_historie for select to authenticated using (true);
drop policy if exists nabidky_historie_zapis on public.nabidky_historie;
create policy nabidky_historie_zapis on public.nabidky_historie for insert to authenticated with check (true);
