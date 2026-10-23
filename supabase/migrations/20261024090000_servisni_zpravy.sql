-- Servisní zpráva: technik ji vyplní u zákazníka (Servis → ticket → 📝 Servisní
-- zpráva), zákazník a technik podepíšou na displeji, vznikne PDF a edge funkce
-- servis-zprava-odeslat ho pošle zákazníkovi e-mailem z firemní schránky.
create table if not exists public.servisni_zpravy (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.service_tickets(id) on delete cascade,
  cislo text,
  obsah jsonb not null default '{}'::jsonb,   -- snímek vyplněných údajů (závada, práce, materiál, časy, doporučení)
  pdf_path text,                              -- PDF v bucketu servisni-zpravy
  email_komu text,
  podepsal text,                              -- jméno zákazníka, který podepsal
  podepsano_at timestamptz,
  odeslano_at timestamptz,
  chyba text,
  vytvoril text,
  created_at timestamptz not null default now()
);
create index if not exists servisni_zpravy_ticket on public.servisni_zpravy(ticket_id);
alter table public.servisni_zpravy enable row level security;
drop policy if exists servisni_zpravy_prihlaseni on public.servisni_zpravy;
create policy servisni_zpravy_prihlaseni on public.servisni_zpravy for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public) values ('servisni-zpravy', 'servisni-zpravy', false)
on conflict (id) do nothing;
drop policy if exists servisni_zpravy_soubory on storage.objects;
create policy servisni_zpravy_soubory on storage.objects for all to authenticated
  using (bucket_id = 'servisni-zpravy') with check (bucket_id = 'servisni-zpravy');
