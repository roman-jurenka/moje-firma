-- Průběh zakázek: fotky z obhlídky a technické údaje odběrného místa.
-- Ve fázi Obhlídka ještě neexistuje zakázka (contracts) — fotky se proto
-- navážou na řádek průběhu a jakmile zakázka vznikne, přesunou se k ní samy.

-- Technické údaje: { ean, jistic_a, faze } (EAN odběrného místa, hodnota
-- hlavního jističe v A, počet fází 1/3). Použijí se do smlouvy a žádosti u distributora.
alter table public.zakazky_prubeh add column if not exists udaje jsonb not null default '{}'::jsonb;

alter table public.contract_photos add column if not exists prubeh_id bigint
  references public.zakazky_prubeh(id) on delete set null;
create index if not exists contract_photos_prubeh_idx on public.contract_photos(prubeh_id);

-- Jakmile průběh dostane zakázku, fotky z obhlídky (zatím bez zakázky) se k ní přiřadí.
create or replace function public.prubeh_prirad_fotky()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.contract_id is not null and new.contract_id is distinct from old.contract_id then
    update contract_photos set contract_id = new.contract_id
    where prubeh_id = new.id and contract_id is null;
  end if;
  return new;
end;
$$;
revoke execute on function public.prubeh_prirad_fotky() from anon, public;

drop trigger if exists zakazky_prubeh_prirad_fotky on public.zakazky_prubeh;
create trigger zakazky_prubeh_prirad_fotky after update of contract_id on public.zakazky_prubeh
  for each row execute function public.prubeh_prirad_fotky();
