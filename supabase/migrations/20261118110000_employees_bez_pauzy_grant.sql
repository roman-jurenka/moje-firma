-- employees má práva po sloupcích (mzdy jsou skryté) — nové sloupce musí mít SELECT,
-- jinak selže celé načtení zaměstnanců v appce.
grant select (bez_pauzy, bez_pauzy_od) on public.employees to authenticated;
