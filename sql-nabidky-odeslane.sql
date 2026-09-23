-- Evidence odeslaných nabídek: přesná kopie toho, co dostal zákazník
-- (HTML nabídky), kdy a kdo ji odeslal. Plní tlačítko
-- "📨 Označit jako odeslanou" v náhledu nabídky. Aplikováno v Supabase 23. 9. 2026.
create table if not exists public.nabidky_odeslane (
  id bigint generated always as identity primary key,
  quote_id bigint not null references public.quotes(id) on delete cascade,
  cislo text,
  cena numeric,
  html text not null,
  odeslal text,
  created_at timestamptz not null default now()
);
create index if not exists nabidky_odeslane_quote_idx on public.nabidky_odeslane (quote_id);
alter table public.nabidky_odeslane enable row level security;
drop policy if exists authenticated_full_access on public.nabidky_odeslane;
create policy authenticated_full_access on public.nabidky_odeslane for all to authenticated using (true) with check (true);

-- Telefon zaměstnance (do nabídek jako kontakt obchodníka).
alter table public.employees add column if not exists phone text;
