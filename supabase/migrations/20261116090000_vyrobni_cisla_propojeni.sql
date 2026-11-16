-- SN se vždy propojí se zakázkou i s Průběhem (ať se zobrazí všude: Ekonomika, Průběh, Dokumenty, Formuláře, Hledání)
create or replace function public.vyrobni_cisla_doplnit_vazby()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contract_id is null and new.prubeh_id is not null then
    select contract_id into new.contract_id from zakazky_prubeh where id = new.prubeh_id;
  end if;
  if new.prubeh_id is null and new.contract_id is not null then
    select id into new.prubeh_id from zakazky_prubeh where contract_id = new.contract_id order by created_at limit 1;
  end if;
  new.sn := trim(new.sn);
  return new;
end $$;
drop trigger if exists vyrobni_cisla_vazby on public.vyrobni_cisla;
create trigger vyrobni_cisla_vazby before insert or update on public.vyrobni_cisla
  for each row execute function public.vyrobni_cisla_doplnit_vazby();

-- Když Průběh dostane zakázku později, SN zapsaná v Průběhu se k ní připojí
create or replace function public.vyrobni_cisla_prubeh_zakazka()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update vyrobni_cisla set contract_id = new.contract_id
   where prubeh_id = new.id and contract_id is distinct from new.contract_id and new.contract_id is not null;
  return new;
end $$;
drop trigger if exists vyrobni_cisla_prubeh_zakazka on public.zakazky_prubeh;
create trigger vyrobni_cisla_prubeh_zakazka after update of contract_id on public.zakazky_prubeh
  for each row when (new.contract_id is distinct from old.contract_id) execute function public.vyrobni_cisla_prubeh_zakazka();

create index if not exists vyrobni_cisla_sn_idx on public.vyrobni_cisla (sn);
