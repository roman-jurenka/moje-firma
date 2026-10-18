-- Datum předání díla zákazníkovi — od něj se počítá záruka (Servis pozná
-- „v záruce / po záruce“ a předvyplní, kdo platí). Vyplní se samo, když
-- zakázka v Průběhu odejde z kroku Předání; jde i doplnit ručně v Servisu.
alter table public.contracts add column if not exists datum_predani date;
comment on column public.contracts.datum_predani is 'Datum předání díla zákazníkovi (začátek záruky).';

-- Zakázky, které už Předáním prošly: odhad = začátek kroku, ve kterém teď jsou.
update public.contracts c
set datum_predani = (z.faze_od at time zone 'Europe/Prague')::date
from public.zakazky_prubeh z
where z.contract_id = c.id
  and c.datum_predani is null
  and z.faze_od is not null
  and z.faze in ('pripojeni', 'odeslani', 'vyuctovani', 'archiv');
