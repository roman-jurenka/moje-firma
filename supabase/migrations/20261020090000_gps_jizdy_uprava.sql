-- Ruční úprava jízdy z GPS (Kniha jízd): opravené km, jiný řidič než
-- výchozí řidič auta, soukromá jízda. Ukládá se do gps_jizdy_stav, takže
-- se úpravy nepřepíšou dalším stažením z GPS Dozoru (gps_jizdy se přepisuje).
-- Účel / poznámka jízdy je už ve sloupci poznamka.
alter table public.gps_jizdy_stav
  add column if not exists km_upraveno numeric,
  add column if not exists ridic_employee_id bigint references public.employees(id) on delete set null,
  add column if not exists soukroma boolean not null default false,
  add column if not exists upravil text;
comment on column public.gps_jizdy_stav.km_upraveno is 'Ručně opravené km (null = km z GPS).';
comment on column public.gps_jizdy_stav.ridic_employee_id is 'Řidič této jízdy, když řídil někdo jiný než výchozí řidič auta.';
comment on column public.gps_jizdy_stav.soukroma is 'Soukromá jízda — nepočítá se do služebních km ani k zakázce.';
