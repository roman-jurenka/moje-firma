-- ════════════════════════════════════════════════════════════════════════════
-- Denní zápis práce v terénu: bloky dne (řádky docházky), popis práce,
-- materiál spárovaný se skladem, místa skladu (hlavní sklad / auta),
-- zásoby po místech a schvalování dne vedením.
-- Do skladu a nákladů zakázek se zapisuje AŽ při schválení dne
-- (funkce schvalit_den), stejně jako u fronty faktur.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Místa skladu ─────────────────────────────────────────────────────────────
create table if not exists public.sklad_mista (
  id bigint generated always as identity primary key,
  nazev text not null,
  typ text not null default 'sklad' check (typ in ('sklad', 'auto')),
  vehicle_id bigint unique references public.vehicles(id) on delete set null,
  hlavni boolean not null default false,
  aktivni boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists sklad_mista_jeden_hlavni on public.sklad_mista (hlavni) where hlavni;

insert into public.sklad_mista (nazev, typ, hlavni)
select 'Hlavní sklad', 'sklad', true
where not exists (select 1 from public.sklad_mista where hlavni);

insert into public.sklad_mista (nazev, typ, vehicle_id)
select v.name || coalesce(' (' || nullif(v.spz, '') || ')', ''), 'auto', v.id
from public.vehicles v
where not exists (select 1 from public.sklad_mista m where m.vehicle_id = v.id);

-- ── Zásoby po místech ────────────────────────────────────────────────────────
create table if not exists public.sklad_zasoby (
  product_id bigint not null references public.products(id) on delete cascade,
  misto_id bigint not null references public.sklad_mista(id) on delete cascade,
  mnozstvi numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_id, misto_id)
);

-- Současné stavy celé do Hlavního skladu
insert into public.sklad_zasoby (product_id, misto_id, mnozstvi)
select p.id, (select id from public.sklad_mista where hlavni), coalesce(p.stock, 0)
from public.products p
on conflict (product_id, misto_id) do nothing;

-- products.stock = součet zásob přes všechna místa (zaokrouhleno, stávající obrazovky).
-- Starý kód, který mění products.stock přímo (ruční +/−, příjmy, výdeje), se
-- promítne do Hlavního skladu. Příznak app.zasoby_sync brání zacyklení.
create or replace function public.sklad_zasoby_do_produktu()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid bigint := coalesce(new.product_id, old.product_id);
begin
  perform set_config('app.zasoby_sync', '1', true);
  update products set stock = greatest(0, round(coalesce((select sum(mnozstvi) from sklad_zasoby where product_id = pid), 0)))
  where id = pid;
  perform set_config('app.zasoby_sync', '', true);
  return null;
end; $$;

drop trigger if exists sklad_zasoby_sync on public.sklad_zasoby;
create trigger sklad_zasoby_sync after insert or update or delete on public.sklad_zasoby
  for each row execute function public.sklad_zasoby_do_produktu();

create or replace function public.produkt_stock_do_zasob()
returns trigger language plpgsql security definer set search_path = public as $$
declare hl bigint; delta numeric;
begin
  if coalesce(current_setting('app.zasoby_sync', true), '') = '1' then return null; end if;
  select id into hl from sklad_mista where hlavni;
  if hl is null then return null; end if;
  delta := coalesce(new.stock, 0) - (case when tg_op = 'INSERT' then 0 else coalesce(old.stock, 0) end);
  if delta = 0 then return null; end if;
  perform set_config('app.zasoby_sync', '1', true);
  insert into sklad_zasoby (product_id, misto_id, mnozstvi) values (new.id, hl, delta)
  on conflict (product_id, misto_id) do update set mnozstvi = sklad_zasoby.mnozstvi + excluded.mnozstvi, updated_at = now();
  perform set_config('app.zasoby_sync', '', true);
  return null;
end; $$;

drop trigger if exists produkt_stock_sync on public.products;
create trigger produkt_stock_sync after insert or update of stock on public.products
  for each row execute function public.produkt_stock_do_zasob();

-- ── Pohyby: odkaz na položku a místa ─────────────────────────────────────────
alter table public.warehouse_movements add column if not exists product_id bigint references public.products(id) on delete set null;
alter table public.warehouse_movements add column if not exists z_misto_id bigint references public.sklad_mista(id) on delete set null;
alter table public.warehouse_movements add column if not exists do_misto_id bigint references public.sklad_mista(id) on delete set null;
alter table public.warehouse_movements add column if not exists attendance_material_id bigint;

-- ── Docházka: bloky dne, popis práce, schválení ─────────────────────────────
alter table public.attendance add column if not exists popis_prace text;
alter table public.attendance add column if not exists schvaleno boolean not null default false;
alter table public.attendance add column if not exists schvaleno_at timestamptz;
alter table public.attendance add column if not exists schvalil text;
create index if not exists attendance_ke_schvaleni on public.attendance (employee_id, date) where not schvaleno;

-- Stávající uzavřené záznamy z minulých dnů = schválené (jejich náklady už v
-- zakázkách jsou). Dnešní a neuzavřené zůstanou ke schválení — zaměstnanec si
-- u nich musí moct zapsat odchod.
update public.attendance set schvaleno = true, schvaleno_at = now(), schvalil = 'převod starých záznamů'
where not schvaleno and date < current_date and checkout is not null;

-- ── Materiál k docházce: spárování se skladem a schválení ───────────────────
alter table public.attendance_materials add column if not exists product_id bigint references public.products(id) on delete set null;
alter table public.attendance_materials add column if not exists zdroj_misto_id bigint references public.sklad_mista(id) on delete set null;
alter table public.attendance_materials add column if not exists schvaleno boolean not null default false;
alter table public.attendance_materials add column if not exists movement_id bigint references public.warehouse_movements(id) on delete set null;
alter table public.attendance_materials add column if not exists cost_entry_id bigint references public.contract_cost_entries(id) on delete set null;
alter table public.attendance_materials add column if not exists date date;
update public.attendance_materials m set date = a.date from public.attendance a where a.id = m.attendance_id and m.date is null;

-- ── Oprávnění (RLS) ──────────────────────────────────────────────────────────
-- Zaměstnanec: své neschválené záznamy; vedení (admin / manager / HR): vše.
alter table public.sklad_mista enable row level security;
alter table public.sklad_zasoby enable row level security;
drop policy if exists sklad_mista_read on public.sklad_mista;
create policy sklad_mista_read on public.sklad_mista for select to authenticated using (true);
drop policy if exists sklad_mista_write on public.sklad_mista;
create policy sklad_mista_write on public.sklad_mista for all to authenticated
  using ((select public.app_ma(array['warehouse','hr']))) with check ((select public.app_ma(array['warehouse','hr'])));
drop policy if exists sklad_zasoby_read on public.sklad_zasoby;
create policy sklad_zasoby_read on public.sklad_zasoby for select to authenticated using (true);
drop policy if exists sklad_zasoby_write on public.sklad_zasoby;
create policy sklad_zasoby_write on public.sklad_zasoby for all to authenticated
  using ((select public.app_ma(array['warehouse']))) with check ((select public.app_ma(array['warehouse'])));

drop policy if exists authenticated_full_access on public.attendance;
drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated
  using ((select public.app_je_vedeni()) or (select public.app_ma(array['contracts','costs','reports','finance']))
         or employee_id = (select public.app_moje_employee_id()));
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated
  with check ((select public.app_je_vedeni()) or (employee_id = (select public.app_moje_employee_id()) and not schvaleno));
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated
  using ((select public.app_je_vedeni()) or (employee_id = (select public.app_moje_employee_id()) and not schvaleno))
  with check ((select public.app_je_vedeni()) or (employee_id = (select public.app_moje_employee_id()) and not schvaleno));
drop policy if exists attendance_delete on public.attendance;
create policy attendance_delete on public.attendance for delete to authenticated
  using ((select public.app_je_vedeni()) or (employee_id = (select public.app_moje_employee_id()) and not schvaleno));

drop policy if exists authenticated_full_access on public.attendance_materials;
drop policy if exists att_mat_read on public.attendance_materials;
create policy att_mat_read on public.attendance_materials for select to authenticated
  using ((select public.app_je_vedeni()) or (select public.app_ma(array['contracts','costs','reports','finance','warehouse']))
         or employee_id = (select public.app_moje_employee_id()));
drop policy if exists att_mat_write on public.attendance_materials;
create policy att_mat_write on public.attendance_materials for all to authenticated
  using ((select public.app_je_vedeni()) or (employee_id = (select public.app_moje_employee_id()) and not schvaleno))
  with check ((select public.app_je_vedeni()) or (employee_id = (select public.app_moje_employee_id()) and not schvaleno));

-- Načtení docházky do appky: vedení / finance vše, zaměstnanec jen své.
drop function if exists public.get_attendance_full();
create function public.get_attendance_full()
returns table(id integer, employee_id integer, date text, checkin text, checkout text, contract_id integer, activity text,
              billing_rate numeric, popis_prace text, schvaleno boolean, schvaleno_at timestamptz, schvalil text)
language sql security definer set search_path = public as $$
  select a.id, a.employee_id, a.date::text, a.checkin::text, a.checkout::text, a.contract_id, a.activity,
         a.billing_rate, a.popis_prace, a.schvaleno, a.schvaleno_at, a.schvalil
  from attendance a
  where public.app_je_vedeni() or public.app_ma(array['contracts','costs','reports','finance'])
     or a.employee_id = public.app_moje_employee_id()
  order by a.date desc;
$$;
revoke execute on function public.get_attendance_full() from anon, public;
grant execute on function public.get_attendance_full() to authenticated;

-- ── Výpočet hodin dne: pauza 60 min jednou za den, když den trvá > 6 h ─────
create or replace function public.dochazka_hodiny(p_checkin time, p_checkout time)
returns numeric language sql immutable as $$
  select greatest(0, extract(epoch from (p_checkout - p_checkin)) / 3600.0)
$$;

-- ── Prodejní cena materiálu (přirážka položky → prodejní cena → výchozí přirážka) ──
create or replace function public.prodejni_cena_materialu(p_product_id bigint, p_nakup numeric)
returns numeric language sql stable security definer set search_path = public as $$
  select round(case
    when p.prirazka_pct is not null then coalesce(p_nakup, p.price, 0) * (1 + p.prirazka_pct / 100)
    when coalesce(p.price_sell, 0) > 0 then p.price_sell
    else coalesce(p_nakup, p.price, 0) * (1 + coalesce((select (value->>'pct')::numeric from app_settings where key = 'material_prirazka'), 30) / 100)
  end, 2)
  from products p where p.id = p_product_id
$$;

-- ── Schválení dne ────────────────────────────────────────────────────────────
-- Zapíše náklady práce (podle bloků se zakázkou, pauza jednou za den) a výdej
-- materiálu z místa (sklad / auto) na zakázku + náklad materiálu.
create or replace function public.schvalit_den(p_employee_id bigint, p_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  kdo text;
  emp employees%rowtype;
  celkem numeric; pauza numeric; koef numeric;
  r record; m record;
  h numeric; cena numeric; misto record; zak record; hl bigint; pohyb_id bigint; naklad_id bigint;
  bloku int := 0; materialu int := 0; hodin numeric := 0;
begin
  if not public.app_je_vedeni() then raise exception 'Schvalovat docházku může jen vedení.'; end if;
  select name into kdo from profiles where id = auth.uid();
  kdo := coalesce(nullif(kdo, ''), 'vedení');
  select * into emp from employees where id = p_employee_id;
  if not found then raise exception 'Zaměstnanec nenalezen.'; end if;
  if exists (select 1 from attendance where employee_id = p_employee_id and date = p_date and checkout is null) then
    raise exception 'Den ještě běží (chybí odchod) — nejdřív doplň čas odchodu.';
  end if;
  if exists (select 1 from attendance_materials am join attendance a on a.id = am.attendance_id
             where a.employee_id = p_employee_id and a.date = p_date and not am.schvaleno and am.product_id is null) then
    raise exception 'Některý materiál není spárovaný se skladovou položkou.';
  end if;
  if exists (select 1 from attendance_materials am join attendance a on a.id = am.attendance_id
             where a.employee_id = p_employee_id and a.date = p_date and not am.schvaleno and coalesce(am.contract_id, a.contract_id) is null) then
    raise exception 'Některý materiál nemá zakázku — přiřaď blok nebo materiál k zakázce.';
  end if;

  select coalesce(sum(dochazka_hodiny(checkin, checkout)), 0) into celkem
  from attendance where employee_id = p_employee_id and date = p_date and checkout is not null;
  pauza := case when celkem > 6 then 1 else 0 end;
  koef := case when celkem > 0 then (celkem - pauza) / celkem else 0 end;

  -- náklady práce (přepočítají se všechny bloky dne, ať pauza sedí)
  for r in select * from attendance where employee_id = p_employee_id and date = p_date and checkout is not null loop
    bloku := bloku + 1;
    delete from contract_cost_entries where attendance_id = r.id and cost_type = 'práce';
    h := round(dochazka_hodiny(r.checkin, r.checkout) * koef, 2);
    hodin := hodin + h;
    if r.contract_id is not null and h > 0 and (coalesce(emp.hourly_rate_cost, 0) > 0 or coalesce(emp.hourly_rate_client, 0) > 0) then
      insert into contract_cost_entries (contract_id, cost_type, is_extra, date, description, quantity, unit,
        unit_price_cost, unit_price_client, employee_id, attendance_id)
      values (r.contract_id, 'práce', false, p_date,
        emp.name || ' - docházka' || coalesce(': ' || nullif(left(r.popis_prace, 120), ''), ''),
        h, 'h', coalesce(emp.hourly_rate_cost, 0), coalesce(emp.hourly_rate_client, 0), emp.id, r.id);
    end if;
    update attendance set schvaleno = true, schvaleno_at = now(), schvalil = kdo where id = r.id;
  end loop;

  -- materiál: výdej z místa na zakázku + náklad
  select id into hl from sklad_mista where hlavni;
  for m in select am.*, a.contract_id as blok_zakazka from attendance_materials am join attendance a on a.id = am.attendance_id
           where a.employee_id = p_employee_id and a.date = p_date and not am.schvaleno loop
    materialu := materialu + 1;
    select * into misto from sklad_mista where id = coalesce(m.zdroj_misto_id, hl);
    select id, name into zak from contracts where id = coalesce(m.contract_id, m.blok_zakazka);
    select price into cena from products where id = m.product_id;
    insert into warehouse_movements (product_name, product_id, quantity, unit, movement_type, from_location, to_location,
      z_misto_id, contract_id, vehicle, created_by, note, attendance_material_id)
    select p.name, p.id, m.quantity, coalesce(m.unit, p.unit, 'ks'), 'out_contract', misto.nazev, zak.name,
      misto.id, zak.id, case when misto.typ = 'auto' then misto.nazev else '' end, kdo,
      'Docházka ' || to_char(p_date, 'DD.MM.YYYY') || ' — ' || emp.name, m.id
    from products p where p.id = m.product_id
    returning id into pohyb_id;
    insert into sklad_zasoby (product_id, misto_id, mnozstvi) values (m.product_id, misto.id, -m.quantity)
    on conflict (product_id, misto_id) do update set mnozstvi = sklad_zasoby.mnozstvi - m.quantity, updated_at = now();
    insert into contract_cost_entries (contract_id, cost_type, is_extra, date, description, quantity, unit,
      unit_price_cost, unit_price_client, employee_id, attendance_id)
    select zak.id, 'materiál', false, p_date, 'Materiál – ' || p.name || ' (' || emp.name || ')', m.quantity,
      coalesce(m.unit, p.unit, 'ks'), coalesce(cena, 0), coalesce(public.prodejni_cena_materialu(p.id, cena), 0), emp.id, m.attendance_id
    from products p where p.id = m.product_id
    returning id into naklad_id;
    update attendance_materials set schvaleno = true, movement_id = pohyb_id, cost_entry_id = naklad_id,
      contract_id = zak.id, zdroj_misto_id = misto.id where id = m.id;
  end loop;

  return jsonb_build_object('bloku', bloku, 'materialu', materialu, 'hodin', hodin, 'pauza', pauza);
end; $$;
revoke execute on function public.schvalit_den(bigint, date) from anon, public;
grant execute on function public.schvalit_den(bigint, date) to authenticated;

-- ── Zrušení schválení dne (oprava) ───────────────────────────────────────────
-- Vrátí materiál na místo, smaže náklady dne a záznamy znovu otevře.
create or replace function public.zrusit_schvaleni_dne(p_employee_id bigint, p_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m record; vraceno int := 0;
begin
  if not public.app_je_vedeni() then raise exception 'Schválení může zrušit jen vedení.'; end if;
  if exists (select 1 from contract_cost_entries c join attendance a on a.id = c.attendance_id
             where a.employee_id = p_employee_id and a.date = p_date and c.billed) then
    raise exception 'Náklady tohoto dne už jsou vyfakturované — schválení nejde zrušit.';
  end if;
  for m in select am.* from attendance_materials am join attendance a on a.id = am.attendance_id
           where a.employee_id = p_employee_id and a.date = p_date and am.schvaleno loop
    if m.zdroj_misto_id is not null and m.product_id is not null then
      insert into sklad_zasoby (product_id, misto_id, mnozstvi) values (m.product_id, m.zdroj_misto_id, m.quantity)
      on conflict (product_id, misto_id) do update set mnozstvi = sklad_zasoby.mnozstvi + m.quantity, updated_at = now();
    end if;
    update attendance_materials set schvaleno = false, movement_id = null, cost_entry_id = null where id = m.id;
    if m.movement_id is not null then delete from warehouse_movements where id = m.movement_id; end if;
    if m.cost_entry_id is not null then delete from contract_cost_entries where id = m.cost_entry_id; end if;
    vraceno := vraceno + 1;
  end loop;
  delete from contract_cost_entries where cost_type = 'práce'
    and attendance_id in (select id from attendance where employee_id = p_employee_id and date = p_date);
  update attendance set schvaleno = false, schvaleno_at = null, schvalil = null
  where employee_id = p_employee_id and date = p_date;
  return jsonb_build_object('materialu_vraceno', vraceno);
end; $$;
revoke execute on function public.zrusit_schvaleni_dne(bigint, date) from anon, public;
grant execute on function public.zrusit_schvaleni_dne(bigint, date) to authenticated;

-- ── Přesun zásob mezi místy (sklad → auto, auto → sklad) ────────────────────
create or replace function public.presun_zasob(p_product_id bigint, p_z bigint, p_do bigint, p_mnozstvi numeric, p_poznamka text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare z record; d record; p record; kdo text; mid bigint;
begin
  if not (public.app_je_vedeni() or public.app_ma(array['warehouse'])) then raise exception 'Přesouvat zásoby může jen sklad nebo vedení.'; end if;
  if p_mnozstvi is null or p_mnozstvi <= 0 then raise exception 'Množství musí být kladné.'; end if;
  select * into z from sklad_mista where id = p_z;
  select * into d from sklad_mista where id = p_do;
  select * into p from products where id = p_product_id;
  if z.id is null or d.id is null or p.id is null then raise exception 'Neplatné místo nebo položka.'; end if;
  select name into kdo from profiles where id = auth.uid();
  kdo := coalesce(nullif(kdo, ''), '?');
  insert into sklad_zasoby (product_id, misto_id, mnozstvi) values (p.id, z.id, -p_mnozstvi)
  on conflict (product_id, misto_id) do update set mnozstvi = sklad_zasoby.mnozstvi - p_mnozstvi, updated_at = now();
  insert into sklad_zasoby (product_id, misto_id, mnozstvi) values (p.id, d.id, p_mnozstvi)
  on conflict (product_id, misto_id) do update set mnozstvi = sklad_zasoby.mnozstvi + p_mnozstvi, updated_at = now();
  insert into warehouse_movements (product_name, product_id, quantity, unit, movement_type, from_location, to_location,
    z_misto_id, do_misto_id, vehicle, created_by, note)
  values (p.name, p.id, p_mnozstvi, coalesce(p.unit, 'ks'), case when d.typ = 'auto' then 'transfer_vh' else 'transfer' end,
    z.nazev, d.nazev, z.id, d.id, case when d.typ = 'auto' then d.nazev when z.typ = 'auto' then z.nazev else '' end, kdo, coalesce(p_poznamka, ''))
  returning id into mid;
  return mid;
end; $$;
revoke execute on function public.presun_zasob(bigint, bigint, bigint, numeric, text) from anon, public;
grant execute on function public.presun_zasob(bigint, bigint, bigint, numeric, text) to authenticated;
