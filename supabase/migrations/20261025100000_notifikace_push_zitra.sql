-- Večerní „Zítra jedeš na…“ jednou za den každému, kdo má zítra akci v kalendáři
create table if not exists public.zitra_push (
  employee_id bigint not null,
  den date not null,
  odeslano_at timestamptz not null default now(),
  primary key (employee_id, den)
);
alter table public.zitra_push enable row level security;

alter table public.hlaseni_nastaveni add column if not exists zitra_zapnuto boolean not null default true;
alter table public.hlaseni_nastaveni add column if not exists notifikace_push boolean not null default true;

-- Každé nové oznámení v aplikaci (úkol, plán, zakázka je u tebe…) přijde i jako push na telefon
create or replace function public.notifikace_push_trigger()
returns trigger language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  if new.user_name is null or new.user_name = '' then return null; end if;
  begin
    perform net.http_post(
      url := 'https://rbnqulgmywtvuryabzjc.supabase.co/functions/v1/hlaseni-odeslat',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.hlaseni_cron_tajemstvi()),
      body := jsonb_build_object('akce', 'notifikace', 'id', new.id),
      timeout_milliseconds := 30000
    );
  exception when others then
    null; -- oznámení se nikdy nesmí zablokovat kvůli pushi
  end;
  return null;
end;
$$;
drop trigger if exists notifikace_push on public.notifications;
create trigger notifikace_push after insert on public.notifications for each row execute function public.notifikace_push_trigger();
