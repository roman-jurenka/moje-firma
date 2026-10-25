-- Evidence výrobních čísel (SN) instalovaných zařízení: u zakázky, s fakturou
-- dodavatele, na které se kupovala (fronta faktur), a s dokumenty (záruční list, datasheet…).
create table if not exists public.vyrobni_cisla (
  id bigint generated always as identity primary key,
  sn text not null,
  nazev text,                                  -- produkt / model
  druh text,                                   -- stridac, baterie, panel, wallbox, optimizer, elektromer, jine
  contract_id bigint references public.contracts(id) on delete set null,
  prubeh_id bigint references public.zakazky_prubeh(id) on delete set null,
  invoice_queue_id bigint references public.invoice_queue(id) on delete set null,
  invoice_queue_item_id bigint references public.invoice_queue_items(id) on delete set null,
  dodavatel text,
  faktura_cislo text,
  datum_nakupu date,
  zaruka_do date,
  dokumenty jsonb not null default '[]'::jsonb, -- [{ cesta, nazev }] v bucketu vyrobni-cisla
  poznamka text,
  zapsal text,
  created_at timestamptz not null default now()
);
create index if not exists vyrobni_cisla_sn on public.vyrobni_cisla (lower(sn));
create index if not exists vyrobni_cisla_contract on public.vyrobni_cisla (contract_id);
create index if not exists vyrobni_cisla_prubeh on public.vyrobni_cisla (prubeh_id);
alter table public.vyrobni_cisla enable row level security;
drop policy if exists vyrobni_cisla_prihlaseni on public.vyrobni_cisla;
create policy vyrobni_cisla_prihlaseni on public.vyrobni_cisla for all to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public) values ('vyrobni-cisla', 'vyrobni-cisla', false)
on conflict (id) do nothing;
drop policy if exists vyrobni_cisla_soubory on storage.objects;
create policy vyrobni_cisla_soubory on storage.objects for all to authenticated
  using (bucket_id = 'vyrobni-cisla') with check (bucket_id = 'vyrobni-cisla');
