-- Fronta dokumentů k zatřídění: fotky, předávací protokoly a další dokumenty,
-- které přišly e-mailem (kontrola pošty) a čekají, až je někdo přiřadí
-- k zakázce. Soubor leží v soukromém úložišti faktury-fronta pod
-- dokumenty/<id>/…; po přiřazení se zkopíruje k zakázce (contract_photos /
-- contract_documents) a řádek se označí jako přiřazený.
create table if not exists public.dokumenty_fronta (
  id bigint generated always as identity primary key,
  druh text not null default 'dokument' check (druh in ('foto', 'protokol', 'dokument')),
  status text not null default 'nova' check (status in ('nova', 'prirazeno', 'zamitnuto')),
  source text not null default 'email',
  email_uid text,
  email_message_id text,
  odesilatel text,
  predmet text,
  nazev_souboru text,
  content_type text,
  storage_path text,
  popis text,
  note text,
  email_datum date,
  suggested_contract_id bigint references public.contracts(id) on delete set null,
  contract_id bigint references public.contracts(id) on delete set null,
  vysledek_tabulka text,          -- contract_photos | contract_documents
  vysledek_id bigint,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now()
);
create index if not exists dokumenty_fronta_status_idx on public.dokumenty_fronta (status);
create unique index if not exists dokumenty_fronta_email_soubor_uq on public.dokumenty_fronta (email_uid, nazev_souboru) where email_uid is not null;

alter table public.dokumenty_fronta enable row level security;
drop policy if exists "dokumenty_fronta_access" on public.dokumenty_fronta;
create policy "dokumenty_fronta_access" on public.dokumenty_fronta for all to authenticated
  using ((select public.app_ma(array['invoices','finance','costs','reports','contracts','customers'])))
  with check ((select public.app_ma(array['invoices','finance','costs','reports','contracts','customers'])));
