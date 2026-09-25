-- Bezpečnost — krok B (body 3 a 6 z auditu). SPUSTIT AŽ PO NASAZENÍ KÓDU
-- z větve bezpecnost-kod — starší verze appky by bez něj nenačetla
-- zaměstnance a nezobrazila fotky.

-- ─── Platy a sazby ──────────────────────────────────────────────────────────
-- Přímo z tabulky jdou číst jen neplacové údaje; plat a hodinové sazby vrací
-- funkce get_employees_full (všechny řádky HR a vedení, ostatním jen vlastní).
-- Zápis (HR) zůstává beze změny.
revoke select on public.employees from authenticated;
grant select (id, name, position, department, email, phone, status, start_date, created_at,
              role, archived, vacation_days, vacation_used) on public.employees to authenticated;

-- ─── Soukromá úložiště ──────────────────────────────────────────────────────
-- Fotky a dokumenty zakázek jdou otevřít jen po přihlášení (appka si vyrábí
-- dočasné podepsané odkazy, viz src/storageUrl.jsx).
update storage.buckets set public = false where id in ('zakazky-fotky', 'zakazky-dokumety', 'deal-photos');

-- Kód nahrává dokumenty do "zakazky-dokumenty", v Supabase ale existovalo jen
-- "zakazky-dokumety" (překlep, prázdné) — nahrávání bez OneDrive proto padalo.
insert into storage.buckets (id, name, public) values ('zakazky-dokumenty', 'zakazky-dokumenty', false)
on conflict (id) do update set public = false;

drop policy if exists "allow all zakazky-fotky" on storage.objects;
drop policy if exists "allow_all_deal_photos" on storage.objects;
create policy "zakazky_soubory_prihlaseni" on storage.objects for all to authenticated
  using (bucket_id in ('zakazky-fotky', 'zakazky-dokumenty', 'deal-photos'))
  with check (bucket_id in ('zakazky-fotky', 'zakazky-dokumenty', 'deal-photos'));

-- Doručené faktury (PDF z e-mailu) — jen kdo má přístup k financím.
drop policy if exists "authenticated_read_faktury_fronta" on storage.objects;
drop policy if exists "authenticated_update_faktury_fronta" on storage.objects;
drop policy if exists "authenticated_write_faktury_fronta" on storage.objects;
create policy "faktury_fronta_finance" on storage.objects for all to authenticated
  using (bucket_id = 'faktury-fronta' and (select public.app_ma(array['invoices','finance','costs','reports','contracts','customers'])))
  with check (bucket_id = 'faktury-fronta' and (select public.app_ma(array['invoices','finance','costs','reports','contracts','customers'])));
