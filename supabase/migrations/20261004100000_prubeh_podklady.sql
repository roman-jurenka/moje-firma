-- Podklady pro realizaci (předávací list od obchodníka): odkaz na složku,
-- technická specifikace, odběrné místo a pokyny pro plánovače / sklad /
-- střechaře / elektrikáře. Ukazují se zaměstnanci v detailu akce v kalendáři.
alter table public.zakazky_prubeh add column if not exists podklady jsonb not null default '{}'::jsonb;
