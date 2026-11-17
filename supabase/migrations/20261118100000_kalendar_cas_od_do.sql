-- Akce v kalendáři: celý den (cas_od null) nebo čas od–do; akce dne se řadí podle času.
alter table public.calendar_events add column if not exists cas_od time, add column if not exists cas_do time;
alter table public.calendar_events drop constraint if exists calendar_events_cas_check;
alter table public.calendar_events add constraint calendar_events_cas_check
  check (cas_od is null and cas_do is null or cas_od is not null and (cas_do is null or cas_do > cas_od));
