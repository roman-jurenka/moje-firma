-- Servisní ticket: nabídka z Nacenění (nacenění před opravou) a vystavená faktura.
alter table public.service_tickets add column if not exists quote_id bigint references public.quotes(id) on delete set null;
alter table public.service_tickets add column if not exists invoice_id bigint references public.invoices(id) on delete set null;
create index if not exists service_tickets_quote_idx on public.service_tickets(quote_id);
create index if not exists service_tickets_invoice_idx on public.service_tickets(invoice_id);
