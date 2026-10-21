-- Úřední milníky a platební kalendář zakázky (Průběh, src/milnikyZakazky.js).
-- milniky: { "zadost_pripojeni": "2026-10-21", "sop_vyprsi": "2027-04-30", … }
-- platebni_plan: [{ id, nazev, procent, kdy, datum, doplatek, invoice_id, invoice_cislo }]
alter table public.zakazky_prubeh
  add column if not exists milniky jsonb not null default '{}'::jsonb,
  add column if not exists platebni_plan jsonb not null default '[]'::jsonb;
