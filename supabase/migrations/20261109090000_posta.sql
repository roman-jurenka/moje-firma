-- Pošta: firemní e-mailová schránka u WEDOSu přímo v appce (na principu Outlooku).
-- Edge funkce `posta` stahuje zprávy přes IMAP (wes1-imap.wedos.net:993) do
-- tabulky posta_zpravy, odesílá přes SMTP (465) a odeslané ukládá i do složky
-- Odeslané na serveru — takže je vidět i ve webmailu / Outlooku.
-- Vidí ji kancelář: kdo má záložku Pošta nebo Faktury (admin vše).

create table if not exists public.posta_zpravy (
  id bigint generated always as identity primary key,
  schranka text not null,                 -- přihlašovací jméno IMAP (adresa schránky)
  slozka text not null,                   -- 'prijate' | 'odeslane'
  imap_slozka text not null,              -- skutečná cesta složky na serveru (INBOX, Sent…)
  uid bigint not null,
  uid_validity bigint not null,
  message_id text,
  in_reply_to text,
  reference text,
  od_email text,
  od_jmeno text,
  komu jsonb not null default '[]'::jsonb,     -- [{email, jmeno}]
  kopie jsonb not null default '[]'::jsonb,
  predmet text,
  datum timestamptz,
  text text,
  html text,
  nahled text,                                  -- prvních ~200 znaků textu do seznamu
  prilohy jsonb not null default '[]'::jsonb,   -- [{nazev, typ, velikost, cesta, cid}]
  precteno boolean not null default false,
  oznaceno boolean not null default false,
  smazano boolean not null default false,
  customer_id bigint references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (schranka, imap_slozka, uid_validity, uid)
);
create index if not exists posta_zpravy_seznam on public.posta_zpravy (schranka, slozka, datum desc);
create index if not exists posta_zpravy_od on public.posta_zpravy (lower(od_email));

-- Kam až je složka stažená (poslední UID) — vede edge funkce.
create table if not exists public.posta_stav (
  schranka text not null,
  imap_slozka text not null,
  uid_validity bigint,
  posledni_uid bigint not null default 0,
  synchronizovano_at timestamptz,
  chyba text,
  primary key (schranka, imap_slozka)
);

alter table public.posta_zpravy enable row level security;
alter table public.posta_stav enable row level security;

drop policy if exists posta_zpravy_cist on public.posta_zpravy;
create policy posta_zpravy_cist on public.posta_zpravy for select to authenticated
  using (public.app_ma(array['posta','invoices']));
-- Z appky jde měnit jen přečteno / označeno / zákazník; zápis zpráv dělá edge funkce (service role).
drop policy if exists posta_zpravy_upravit on public.posta_zpravy;
create policy posta_zpravy_upravit on public.posta_zpravy for update to authenticated
  using (public.app_ma(array['posta','invoices'])) with check (public.app_ma(array['posta','invoices']));

drop policy if exists posta_stav_cist on public.posta_stav;
create policy posta_stav_cist on public.posta_stav for select to authenticated
  using (public.app_ma(array['posta','invoices']));

-- Přílohy (příchozí i odchozí) — soukromý bucket.
insert into storage.buckets (id, name, public) values ('posta', 'posta', false)
on conflict (id) do nothing;
drop policy if exists posta_soubory on storage.objects;
create policy posta_soubory on storage.objects for all to authenticated
  using (bucket_id = 'posta' and public.app_ma(array['posta','invoices']))
  with check (bucket_id = 'posta' and public.app_ma(array['posta','invoices']));

-- Rozepsané e-maily (koncepty) — ukládají se samy při psaní, každý vidí jen své.
create table if not exists public.posta_koncepty (
  id bigint generated always as identity primary key,
  autor uuid not null default auth.uid(),
  komu text, kopie text, predmet text,
  telo text,                       -- vlastní text (bez podpisu a citace)
  citace text,                     -- citovaná původní zpráva u odpovědi / přeposlání
  podpis_id bigint,
  prilohy jsonb not null default '[]'::jsonb,
  odpoved_na_id bigint references public.posta_zpravy(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posta_koncepty_autor on public.posta_koncepty (autor, updated_at desc);
alter table public.posta_koncepty enable row level security;
drop policy if exists posta_koncepty_vlastni on public.posta_koncepty;
create policy posta_koncepty_vlastni on public.posta_koncepty for all to authenticated
  using (autor = auth.uid() and public.app_ma(array['posta','invoices']))
  with check (autor = auth.uid() and public.app_ma(array['posta','invoices']));

-- Šablony e-mailů — sdílené pro celou kancelář. {jmeno} = jméno příjemce, {datum} = dnešek.
create table if not exists public.posta_sablony (
  id bigint generated always as identity primary key,
  nazev text not null,
  predmet text,
  text text not null default '',
  poradi int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.posta_sablony enable row level security;
drop policy if exists posta_sablony_kancelar on public.posta_sablony;
create policy posta_sablony_kancelar on public.posta_sablony for all to authenticated
  using (public.app_ma(array['posta','invoices'])) with check (public.app_ma(array['posta','invoices']));

insert into public.posta_sablony (nazev, predmet, text, poradi)
select * from (values
  ('Poděkování za poptávku', 'Vaše poptávka', E'Dobrý den,\n\nděkujeme za Vaši poptávku. Ozveme se Vám do 2 pracovních dnů a domluvíme termín prohlídky na místě.\n', 1),
  ('Zaslání cenové nabídky', 'Cenová nabídka', E'Dobrý den,\n\nv příloze Vám zasíláme cenovou nabídku. Pokud budete mít jakékoli dotazy, rádi je s Vámi probereme po telefonu.\n', 2),
  ('Domluva termínu', 'Termín realizace', E'Dobrý den,\n\nnavrhujeme termín realizace … . Vyhovuje Vám? Případně nám napište jiný termín, který by Vám vyhovoval.\n', 3),
  ('Připomínka platby', 'Připomínka platby faktury', E'Dobrý den,\n\ndovolujeme si Vás upozornit, že faktura č. … je po splatnosti. Prosíme o její úhradu. Pokud jste již platbu odeslali, považujte tento e-mail za bezpředmětný.\n', 4)
) as v(nazev, predmet, text, poradi)
where not exists (select 1 from public.posta_sablony);

-- Podpisy — každý uživatel má své, jeden může být výchozí.
create table if not exists public.posta_podpisy (
  id bigint generated always as identity primary key,
  autor uuid not null default auth.uid(),
  nazev text not null,
  text text not null default '',
  vychozi boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.posta_podpisy enable row level security;
drop policy if exists posta_podpisy_vlastni on public.posta_podpisy;
create policy posta_podpisy_vlastni on public.posta_podpisy for all to authenticated
  using (autor = auth.uid() and public.app_ma(array['posta','invoices']))
  with check (autor = auth.uid() and public.app_ma(array['posta','invoices']));
