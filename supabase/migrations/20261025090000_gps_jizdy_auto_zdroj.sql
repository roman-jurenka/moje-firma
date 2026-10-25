alter table public.gps_jizdy_stav add column if not exists auto_zdroj text;
comment on column public.gps_jizdy_stav.auto_zdroj is 'Odkud se zakázka přiřadila automaticky (kalendar); ruční změna zakázky ji vynuluje';
