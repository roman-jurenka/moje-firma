-- Stitky faktur ve fronte (Fixni naklady, Opravy aut...) - pro trideni a filtrovani.
alter table public.invoice_queue add column if not exists stitky text[] not null default '{}';
create index if not exists invoice_queue_stitky_idx on public.invoice_queue using gin (stitky);
