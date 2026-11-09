-- Pošta: kontrola schránky na pozadí každé 2 minuty (i když appku nikdo nemá otevřenou)
-- a upozornění na nový e-mail (oznámení v appce → push na telefon přes trigger notifikace_push).
-- Komu upozornění chodí: app_settings „posta“ → upozornit = seznam jmen (profiles.name).
-- Ověření stejným tajemstvím jako ostatní crony (Vault: hlaseni_cron_secret).

insert into public.app_settings (key, value)
values ('posta', '{"upozornit": ["Roman Jurenka"]}'::jsonb)
on conflict (key) do update set value = public.app_settings.value || excluded.value;

select cron.unschedule(jobid) from cron.job where jobname = 'posta-sync';

select cron.schedule(
  'posta-sync',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://rbnqulgmywtvuryabzjc.supabase.co/functions/v1/posta',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'hlaseni_cron_secret' limit 1)
    ),
    body := '{"akce":"cron"}'::jsonb,
    timeout_milliseconds := 140000
  );
  $$
);
