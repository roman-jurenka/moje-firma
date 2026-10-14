-- Automatické stahování jízd z API GPS Dozoru (edge funkce gps-sync).
-- Dvakrát denně: 10:30 a 19:30 UTC (v létě 12:30 a 21:30, v zimě 11:30 a 20:30 českého času).
-- Každý běh projde posledních 31 dní, takže dopíše nové jízdy i doplní vynechané dny.
-- Ověření stejným tajemstvím jako hlaseni-tick (Vault: hlaseni_cron_secret).

select cron.unschedule(jobid) from cron.job where jobname = 'gps-sync';

select cron.schedule(
  'gps-sync',
  '30 10,19 * * *',
  $$
  select net.http_post(
    url := 'https://rbnqulgmywtvuryabzjc.supabase.co/functions/v1/gps-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'hlaseni_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
