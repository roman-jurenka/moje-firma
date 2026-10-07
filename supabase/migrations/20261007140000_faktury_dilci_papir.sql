-- Dílčí faktura (bez rozpisu, počítá se, kolik zbývá dofakturovat) a faktura
-- „počítáno na papíře“ s přiloženou fotkou výpočtu (contract_photos.invoice_id).
alter table public.invoices add column if not exists dilci boolean not null default false;
alter table public.invoices add column if not exists pocitano_na_papire boolean not null default false;
alter table public.contract_photos add column if not exists invoice_id bigint references public.invoices(id) on delete set null;
create index if not exists contract_photos_invoice on public.contract_photos (invoice_id) where invoice_id is not null;
-- Rozpis z papíru, který dodatečně opíše administrativa:
-- { radky: [{ popis, mnozstvi, jednotka, cena, celkem_papir }], soucet_papir, zapsal, zapsano_at }
alter table public.invoices add column if not exists papir_rozpis jsonb;
