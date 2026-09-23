-- Průběh zakázek: místo realizace a kontakt na místě (dřív jen v obchodních případech).
alter table public.zakazky_prubeh
  add column if not exists misto_adresa text,
  add column if not exists misto_kontakt text,
  add column if not exists misto_telefon text;
update public.zakazky_prubeh p set
  misto_adresa = coalesce(p.misto_adresa, d.site_address),
  misto_kontakt = coalesce(p.misto_kontakt, d.site_contact_name),
  misto_telefon = coalesce(p.misto_telefon, d.site_contact_phone)
from public.deals d where d.id = p.deal_id;
update public.zakazky_prubeh p set misto_adresa = c.address
from public.contracts c where c.id = p.contract_id and p.misto_adresa is null and c.address is not null;
