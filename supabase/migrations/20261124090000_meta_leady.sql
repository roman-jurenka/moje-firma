-- Leady z facebookových reklam (Meta Lead Ads) → poptávka v Průběhu.
-- Edge funkce `meta-leady` drží tokeny stránky, přijímá webhook „leadgen“
-- a každých 15 minut dotahuje leady, které by webhook nedoručil.

-- Připojení (jediný řádek, jen pro server — bez politik, appka token nevidí).
create table if not exists public.meta_ucet (
  id int primary key default 1 check (id = 1),
  user_token text,
  verify_token text not null,          -- ověření webhooku (GET hub.verify_token)
  pripojil text,
  updated_at timestamptz not null default now()
);
alter table public.meta_ucet enable row level security;

-- Facebookové stránky, ze kterých chodí leady (token stránky jen pro server).
create table if not exists public.meta_stranky (
  page_id text primary key,
  nazev text,
  page_token text not null,
  odebira boolean not null default false,  -- stránka má zapnuté posílání leadů aplikaci
  posledni_sync timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.meta_stranky enable row level security;

-- Přijaté leady — co zákazník vyplnil a kam se v appce zapsal.
create table if not exists public.meta_leady (
  id bigserial primary key,
  leadgen_id text not null unique,
  page_id text,
  form_id text,
  formular text,
  reklama text,
  kampan text,
  vyplneno timestamptz,
  jmeno text,
  email text,
  telefon text,
  mesto text,
  spotreba text,
  objekt text,
  pole jsonb not null default '[]',
  customer_id bigint,
  prubeh_id bigint,
  chyba text,
  created_at timestamptz not null default now()
);
alter table public.meta_leady enable row level security;
drop policy if exists meta_leady_cteni on public.meta_leady;
create policy meta_leady_cteni on public.meta_leady for select to authenticated
  using (public.app_ma(array['customers']));

-- Kdo leady dostává a jaký typ zakázky z nich vzniká.
insert into public.app_settings (key, value, updated_at)
values ('meta_leady', '{"obchodnik": "Roman Jurenka", "typ": "FVE"}'::jsonb, now())
on conflict (key) do nothing;

-- Pojistka k webhooku: každých 15 minut dotáhne leady za poslední hodiny.
select cron.unschedule(jobid) from cron.job where jobname = 'meta-leady-tick';
select cron.schedule(
  'meta-leady-tick',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://rbnqulgmywtvuryabzjc.supabase.co/functions/v1/meta-leady',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'hlaseni_cron_secret' limit 1)
    ),
    body := '{"akce":"tick"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
