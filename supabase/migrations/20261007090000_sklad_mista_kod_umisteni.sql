-- Kód místa skladu + umístění položky na místě (regál / police, např. A-03-2)
alter table public.sklad_mista add column if not exists kod text;
alter table public.sklad_zasoby add column if not exists umisteni text;
alter table public.sklad_zasoby alter column mnozstvi set default 0;
