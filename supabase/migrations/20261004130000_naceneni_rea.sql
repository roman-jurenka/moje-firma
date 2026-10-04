-- Naceneni realizace na objednavku (REA): kalkulace z Excelu nebo cenik podle skutecnosti -> faktura
alter table public.zakazky_prubeh add column if not exists naceneni_rea jsonb;
