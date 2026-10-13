-- Přenesená daňová povinnost (reverse charge, § 92a ZDPH): DPH se na faktuře nepočítá, odvede ho zákazník.
alter table public.invoices add column if not exists prenesena_dph boolean not null default false;
