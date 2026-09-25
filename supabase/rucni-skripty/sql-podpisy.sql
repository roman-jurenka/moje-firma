-- Obecný systém pro podepisování dokumentů v appce (výkaz práce jako první
-- použití, do budoucna smlouvy, předávací protokoly apod.).
-- Spustit ručně v Supabase SQL editoru.

create table if not exists signed_documents (
  id bigint generated always as identity primary key,
  doc_type text not null default 'vykaz_prace',   -- do budoucna: 'smlouva', 'predavaci_protokol'...
  title text not null,                             -- čitelný název, např. "Výkaz práce – Jan Novák – Srpen 2026"
  employee_id bigint references employees(id),
  contract_id bigint references contracts(id),
  data jsonb not null default '{}',                -- snapshot dat pro znovu-vykreslení dokumentu
  status text not null default 'čeká na podpis zaměstnance',
  employee_signature text,                         -- base64 PNG podpisu
  employee_signed_at timestamptz,
  employee_signed_name text,
  employer_signature text,
  employer_signed_at timestamptz,
  employer_signed_name text,
  created_by text,
  created_at timestamptz not null default now()
);

alter table signed_documents enable row level security;

create policy "signed_documents_all" on signed_documents
  for all to authenticated using (true) with check (true);

create index if not exists signed_documents_employee_idx on signed_documents(employee_id);
create index if not exists signed_documents_status_idx on signed_documents(status);
create index if not exists signed_documents_doc_type_idx on signed_documents(doc_type);
