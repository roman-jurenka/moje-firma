-- Nahradni cislo faktury z programu ucetni (kdyz fakturu vystavi ucetni ve svem programu)
alter table public.invoices add column if not exists cislo_ucetni text;
