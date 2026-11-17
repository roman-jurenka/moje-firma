-- Akce v kalendáři: vazba zakázka <-> Průběh se doplní sama (akci jde naplánovat
-- hned od založení zakázky v Průběhu, ještě než vznikne zakázka v Ekonomice).
create or replace function public.kalendar_doplnit_vazby()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contract_id is null and new.prubeh_id is not null then
    select contract_id into new.contract_id from zakazky_prubeh where id = new.prubeh_id;
  end if;
  if new.prubeh_id is null and new.contract_id is not null then
    select id into new.prubeh_id from zakazky_prubeh where contract_id = new.contract_id order by created_at limit 1;
  end if;
  return new;
end $$;
drop trigger if exists kalendar_doplnit_vazby on public.calendar_events;
create trigger kalendar_doplnit_vazby before insert or update of contract_id, prubeh_id on public.calendar_events
  for each row execute function public.kalendar_doplnit_vazby();

-- Když Průběh dostane zakázku, jeho akce v kalendáři se k ní připojí
-- (spustí i přepočet km z Knihy jízd přes trigger jizdy_kalendar).
create or replace function public.kalendar_prubeh_zakazka()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update calendar_events set contract_id = new.contract_id
   where prubeh_id = new.id and contract_id is null;
  return new;
end $$;
drop trigger if exists kalendar_prubeh_zakazka on public.zakazky_prubeh;
create trigger kalendar_prubeh_zakazka after update of contract_id on public.zakazky_prubeh
  for each row when (new.contract_id is not null and new.contract_id is distinct from old.contract_id)
  execute function public.kalendar_prubeh_zakazka();
