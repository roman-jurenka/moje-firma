-- Výchozí podmínky nabídek nové FVE (vlastní sada vedle "nabidky_vychozi"
-- pro servis, rozšíření, hromosvody a elektroinstalace). Hodnoty převzaté
-- z původní Word šablony nabidka_fve_sablona.docx; měnit jdou v appce
-- (náhled nabídky → ⚙️ Výchozí hodnoty). Vloženo v Supabase 23. 9. 2026.
insert into app_settings (key, value, updated_at) values ('nabidky_vychozi_FVE',
  '{"platnost":"14","zalohaPct":"50","zalohaKdy":"po podpisu smlouvy","termin":"16 týdnů","zarukaMaterial":"2 roky","zarukaPrace":"3 roky"}'::jsonb, now())
on conflict (key) do nothing;
