-- Odkud poptávka přišla (Obchod: sloupec Kampaň) + podrobnost (název kampaně, kdo doporučil…).
alter table public.zakazky_prubeh add column if not exists zdroj text;
alter table public.zakazky_prubeh add column if not exists kampan text;
alter table public.zakazky_prubeh drop constraint if exists zakazky_prubeh_zdroj_check;
alter table public.zakazky_prubeh add constraint zakazky_prubeh_zdroj_check check (zdroj is null or zdroj in ('facebook','instagram','web','doporuceni','jine'));
update public.zakazky_prubeh p set zdroj = 'facebook', kampan = coalesce(m.kampan, m.formular)
  from public.meta_leady m where m.prubeh_id = p.id and p.zdroj is null;
