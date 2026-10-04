-- Prirazka na urovni polozky (v %): prodejni cena = nakupni cena + prirazka.
-- Prazdna = vychozi prirazka firmy (app_settings.material_prirazka).
alter table public.products add column if not exists prirazka_pct numeric;
