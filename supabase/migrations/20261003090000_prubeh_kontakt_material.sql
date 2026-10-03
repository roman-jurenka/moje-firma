-- Kontaktní osoba na místě: vztah k zákazníkovi (manželka, syn, soused, stavbyvedoucí…)
alter table public.zakazky_prubeh add column if not exists misto_vztah text;

-- Checklist materiálu (fáze Materiál a termín): komponenty z nabídky a jejich stav
-- [{ id, nazev, ks, jednotka, stav: "sklad" | "objednat" | "objednano", skladem, poznamka }]
alter table public.zakazky_prubeh add column if not exists material jsonb not null default '[]'::jsonb;
