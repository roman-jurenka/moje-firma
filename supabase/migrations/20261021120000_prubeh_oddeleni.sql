-- Souběžná oddělení zakázky (Průběh, src/oddeleniZakazky.js): po obchodu běží
-- kancelář a realizace každá ve své fázi s vlastním termínem a člověkem.
-- oddeleni: { "bo": { faze, od, termin, kdo }, "re": { faze, od, termin, kdo } }
alter table public.zakazky_prubeh
  add column if not exists oddeleni jsonb not null default '{}'::jsonb;
