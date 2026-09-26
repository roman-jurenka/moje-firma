-- Servisní tickety navázané na zakázky.
-- Zakládá kancelář i technik v terénu; stavy Nový → Naplánovaný → V řešení →
-- Čeká na díl → Vyřešený → Vyfakturovaný (+ Zrušený). Fotky a náklady (práce,
-- materiál, doprava) se ukládají ke stejné zakázce jako dosud, jen s odkazem
-- na ticket — v nákladech zakázky se tak započítají samy.

create sequence if not exists public.service_tickets_cislo_seq;

create table if not exists public.service_tickets (
  id bigint generated always as identity primary key,
  cislo text unique,                                     -- T26-0001 (doplní se samo)
  contract_id bigint not null references public.contracts(id) on delete cascade,
  customer_id bigint references public.customers(id) on delete set null,
  nazev text not null,                                   -- co nefunguje (krátce)
  popis text,
  priorita text not null default 'Střední' check (priorita in ('Nízká', 'Střední', 'Vysoká')),
  placeny boolean not null default false,                -- false = záruční oprava
  stav text not null default 'Nový'
    check (stav in ('Nový', 'Naplánovaný', 'V řešení', 'Čeká na díl', 'Vyřešený', 'Vyfakturovaný', 'Zrušený')),
  technik_id bigint references public.employees(id) on delete set null,
  termin date,
  adresa text,
  kontakt text,
  telefon text,
  reseni text,
  calendar_event_id bigint references public.calendar_events(id) on delete set null,
  zalozil text,
  vyreseno_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_tickets_contract_idx on public.service_tickets(contract_id);
create index if not exists service_tickets_stav_idx on public.service_tickets(stav);
create index if not exists service_tickets_technik_idx on public.service_tickets(technik_id);

alter table public.service_tickets enable row level security;
create policy "service_tickets_prihlaseni" on public.service_tickets
  for all to authenticated using (true) with check (true);
revoke all on public.service_tickets from anon;
grant select, insert, update, delete on public.service_tickets to authenticated;
grant usage on sequence public.service_tickets_cislo_seq to authenticated;

-- Číslo ticketu T + rok + pořadí (T26-0001), bez srážek i při souběžném zakládání.
create or replace function public.service_ticket_cislo()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.cislo is null then
    new.cislo := 'T' || to_char(now(), 'YY') || '-' || lpad(nextval('public.service_tickets_cislo_seq')::text, 4, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists service_tickets_cislo on public.service_tickets;
create trigger service_tickets_cislo before insert or update on public.service_tickets
  for each row execute function public.service_ticket_cislo();

-- Fotky a náklady s odkazem na ticket.
alter table public.contract_photos add column if not exists ticket_id bigint
  references public.service_tickets(id) on delete set null;
alter table public.contract_cost_entries add column if not exists ticket_id bigint
  references public.service_tickets(id) on delete set null;
create index if not exists contract_photos_ticket_idx on public.contract_photos(ticket_id);
create index if not exists contract_cost_entries_ticket_idx on public.contract_cost_entries(ticket_id);

-- Upozornění technikovi: při přiřazení (nebo změně) technika pošle Edge Function
-- hlaseni-odeslat push notifikaci na jeho zařízení. Stejný mechanismus jako
-- docházka (dochazka_push_trigger) — ticket se kvůli notifikaci nikdy nezablokuje.
create or replace function public.service_ticket_push()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.technik_id is null or (tg_op = 'UPDATE' and old.technik_id is not distinct from new.technik_id) then
    return null;
  end if;
  begin
    perform net.http_post(
      url := 'https://rbnqulgmywtvuryabzjc.supabase.co/functions/v1/hlaseni-odeslat',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.hlaseni_cron_tajemstvi()),
      body := jsonb_build_object('akce', 'ticket', 'id', new.id),
      timeout_milliseconds := 30000
    );
  exception when others then
    null;
  end;
  return null;
end;
$$;
revoke execute on function public.service_ticket_push() from anon, public, authenticated;
drop trigger if exists service_tickets_push on public.service_tickets;
create trigger service_tickets_push after insert or update of technik_id on public.service_tickets
  for each row execute function public.service_ticket_push();
