-- Přímé propojení s Instagramem (Instagram API s přihlášením přes Instagram):
-- edge funkce `instagram` drží přístupový token, zveřejňuje příspěvky z plánu
-- (instagram_prispevky) a stahuje k nim statistiky.

-- Připojený firemní účet — jediný řádek, jen pro server (bez politik → appka
-- token nikdy nevidí, stav připojení vrací edge funkce).
create table if not exists public.instagram_ucet (
  id int primary key default 1 check (id = 1),
  ig_user_id text not null,
  username text,
  access_token text not null,
  token_expires_at timestamptz,
  pripojil text,
  updated_at timestamptz not null default now()
);
alter table public.instagram_ucet enable row level security;

-- Příspěvek připravený k přímému zveřejnění: fotky oříznuté pro Instagram
-- (JPEG 4:5 / 1:1) v bucketu `instagram`, autopilot a výsledek.
alter table public.instagram_prispevky
  add column if not exists soubory text[] not null default '{}',   -- cesty v bucketu instagram, v pořadí
  add column if not exists automaticky boolean not null default false, -- zveřejnit samo v datum + cas
  add column if not exists ig_media_id text,
  add column if not exists ig_permalink text,
  add column if not exists chyba text,
  add column if not exists lajky int,
  add column if not exists komentare int,
  add column if not exists dosah int,
  add column if not exists statistiky_at timestamptz;

insert into storage.buckets (id, name, public) values ('instagram', 'instagram', false)
on conflict (id) do nothing;
drop policy if exists instagram_soubory on storage.objects;
create policy instagram_soubory on storage.objects for all to authenticated
  using (bucket_id = 'instagram') with check (bucket_id = 'instagram');

-- Autopilot: každých 10 minut zveřejní příspěvky, kterým nastal termín,
-- obnoví token a statistiky. Ověření stejným tajemstvím jako hlaseni-tick.
select cron.unschedule(jobid) from cron.job where jobname = 'instagram-tick';
select cron.schedule(
  'instagram-tick',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://rbnqulgmywtvuryabzjc.supabase.co/functions/v1/instagram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'hlaseni_cron_secret' limit 1)
    ),
    body := '{"akce":"tick"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
