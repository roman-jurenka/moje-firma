-- Udaje firmy z ARES (registr ekonomickych subjektu): ICO, DIC, sidlo a kdy se naposledy overily.
alter table public.customers add column if not exists ico text;
alter table public.customers add column if not exists dic text;
alter table public.customers add column if not exists sidlo text;
alter table public.customers add column if not exists ares_at timestamptz;
