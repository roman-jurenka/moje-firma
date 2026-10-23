-- Souřadnice začátku a konce jízdy z GPS Dozoru (StartPosition / FinishPosition)
-- — mapa trasy dne a hledání „kdy a jaké auto tu bylo“ v Knize jízd.
alter table public.gps_jizdy
  add column if not exists z_lat double precision, add column if not exists z_lng double precision,
  add column if not exists do_lat double precision, add column if not exists do_lng double precision;
create index if not exists gps_jizdy_cil on public.gps_jizdy (do_lat, do_lng);
