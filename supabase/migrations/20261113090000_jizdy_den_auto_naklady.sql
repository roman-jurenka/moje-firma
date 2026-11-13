-- Automatické km k zakázkám: zaměstnanec si v Knize jízd vybere auto, kterým ten den
-- jel (z aut, která podle GPS Dozoru ten den jela). Zakázka se vezme z jeho kalendáře
-- a km auta za den (GPS, s ručními úpravami, bez soukromých jízd) se zapíšou jako
-- náklad „doprava“ na zakázku. Přepočet běží v databázi sám — i když se zakázka do
-- kalendáře doplní zpětně, jízda se upraví, nebo GPS stáhne jízdy až později.
--
-- Ochrana:
--  • jedno auto za den = jeden řidič (unikátní datum + auto; druhý dostane hlášku, kdo ho má)
--  • zaměstnanec vybírá jen sám za sebe, ne do budoucna a nejvýš 14 dní zpět (vedení bez omezení)
--  • vybrat jde jen auto, které ten den podle GPS opravdu jelo
--  • vyfakturovaný nebo schválený náklad se nikdy nepřepíše ani nesmaže — při rozdílu přijde
--    adminům upozornění; zrušit výběr auta s vyfakturovaným nákladem nejde
--  • náklad je navázaný klíčem jizda_klic (gps|auto|datum) → žádné duplicity
--  • když má zaměstnanec na stejnou zakázku a den ruční záznam v knize jízd (km), auto náklad
--    se nevytvoří (ochrana proti dvojímu započtení)
--  • ruční přiřazení jízdy k zakázce v GPS jízdách (vedení) má přednost před kalendářem;
--    soukromé jízdy se nepočítají

create table if not exists public.jizdy_den (
  id bigint generated always as identity primary key,
  datum date not null,
  vozidlo_kod text not null references public.gps_vozidla(kod) on delete cascade,
  employee_id bigint not null references public.employees(id) on delete cascade,
  vybral text,
  created_at timestamptz not null default now(),
  unique (datum, vozidlo_kod)
);
create index if not exists jizdy_den_zamestnanec on public.jizdy_den (employee_id, datum desc);
alter table public.jizdy_den enable row level security;
drop policy if exists jizdy_den_cist on public.jizdy_den;
create policy jizdy_den_cist on public.jizdy_den for select to authenticated
  using (employee_id = (select public.app_moje_employee_id()) or (select public.app_je_vedeni()) or (select public.app_je_admin()));
-- zápis jen přes funkce níže (kontroly)

alter table public.contract_cost_entries add column if not exists jizda_klic text;
comment on column public.contract_cost_entries.jizda_klic is 'Automatický náklad z knihy jízd: gps|<auto>|<datum> — spravuje jizdy_prepocitat()';
create unique index if not exists contract_cost_entries_jizda on public.contract_cost_entries (jizda_klic, contract_id) where jizda_klic is not null;

-- ── Přepočet nákladů za jedno auto a den ─────────────────────────────────────
create or replace function public.jizdy_prepocitat(p_datum date, p_kod text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_klic text := 'gps|' || p_kod || '|' || p_datum;
  v_emp bigint; v_jmeno text; v_auto text;
  v_sazba numeric := 6.5;
  v_pool numeric := 0; v_n int := 0;
  r record; v_cil jsonb := '{}'::jsonb; v_km numeric; v_pozn text; v_zamceno boolean;
begin
  select coalesce((value->>'sazba')::numeric, 6.5) into v_sazba from app_settings where key = 'km_sazba';
  v_sazba := coalesce(v_sazba, 6.5);
  select d.employee_id, e.name into v_emp, v_jmeno
    from jizdy_den d left join employees e on e.id = d.employee_id
   where d.datum = p_datum and d.vozidlo_kod = p_kod;
  select trim(regexp_replace(coalesce(nazev, kod), '^\d+-', '') || coalesce(' ' || spz, '')) into v_auto from gps_vozidla where kod = p_kod;

  if v_emp is not null then
    -- jízdy dne: ručně přiřazené (bez auto_zdroj) jdou na svou zakázku, ostatní do „poolu“ pro kalendář
    for r in
      select coalesce(s.km_upraveno, g.km, 0) as km, s.contract_id, s.auto_zdroj, coalesce(s.soukroma, false) as soukroma
        from gps_jizdy g
        left join gps_jizdy_stav s on s.vozidlo_kod = g.vozidlo_kod and s.datum = g.datum and s.zacatek = left(g.zacatek::text, 5)::time
       where g.vozidlo_kod = p_kod and g.datum = p_datum
    loop
      if r.soukroma then continue; end if;
      if r.contract_id is not null and r.auto_zdroj is null then
        v_cil := jsonb_set(v_cil, array[r.contract_id::text], to_jsonb(coalesce((v_cil->>r.contract_id::text)::numeric, 0) + r.km));
      else
        v_pool := v_pool + r.km;
      end if;
    end loop;

    -- zakázky z kalendáře řidiče (u novějších akcí přes Průběh)
    select count(*) into v_n from (
      select distinct coalesce(e.contract_id, p.contract_id) c
        from calendar_events e left join zakazky_prubeh p on p.id = e.prubeh_id
       where e.date = p_datum and e.employee_id = v_emp and coalesce(e.contract_id, p.contract_id) is not null) x;
    if v_n > 0 and v_pool > 0 then
      for r in
        select distinct coalesce(e.contract_id, p.contract_id) c
          from calendar_events e left join zakazky_prubeh p on p.id = e.prubeh_id
         where e.date = p_datum and e.employee_id = v_emp and coalesce(e.contract_id, p.contract_id) is not null
      loop
        v_cil := jsonb_set(v_cil, array[r.c::text], to_jsonb(coalesce((v_cil->>r.c::text)::numeric, 0) + v_pool / v_n));
      end loop;
    end if;

    -- ochrana proti dvojímu započtení s ruční knihou jízd
    for r in select distinct contract_id from vehicle_log
              where employee_id = v_emp and date = p_datum and contract_id is not null and coalesce(km_total, 0) > 0
    loop
      v_cil := v_cil - r.contract_id::text;
    end loop;
  end if;

  -- Zámek dne: když by přepočet změnil schválený / vyfakturovaný náklad, nemění se u dne
  -- nic (jinak by se km mohly započítat dvakrát) — adminům jen přijde upozornění.
  v_zamceno := false;
  for r in select * from contract_cost_entries where jizda_klic = v_klic and (billed or approved) loop
    v_km := round(coalesce((v_cil->>r.contract_id::text)::numeric, 0), 1);
    if v_km <> round(coalesce(r.quantity, 0), 1) then
      v_zamceno := true;
      v_pozn := format('Kniha jízd %s %s: podle kalendáře/GPS by doprava na zakázku měla být %s km, ale náklad (%s km) je už %s. Den je zamčený, nic se nepřepočítalo — zkontrolujte ručně.',
        to_char(p_datum, 'DD.MM.'), coalesce(v_auto, p_kod), v_km, r.quantity, case when r.billed then 'vyfakturovaný' else 'schválený' end);
      insert into notifications (user_name, title, message, link_type, link_id)
      select e.name, '🚗 Doprava u zakázky nesedí', v_pozn, 'contract', r.contract_id
        from profiles pr join employees e on e.id = pr.employee_id
       where pr.role = 'admin'
         and not exists (select 1 from notifications n where n.user_name = e.name and n.message = v_pozn);
    end if;
  end loop;
  if v_zamceno then return; end if;

  -- existující automatické náklady: upravit / smazat
  for r in select * from contract_cost_entries where jizda_klic = v_klic loop
    v_km := round(coalesce((v_cil->>r.contract_id::text)::numeric, 0), 1);
    if v_km = round(coalesce(r.quantity, 0), 1) or r.billed or r.approved then
      v_cil := v_cil - r.contract_id::text;
      continue;
    end if;
    if v_km <= 0 then
      delete from contract_cost_entries where id = r.id;
    else
      update contract_cost_entries set quantity = v_km, employee_id = v_emp,
        description = format('Doprava – %s (%s) · GPS', coalesce(v_auto, p_kod), coalesce(v_jmeno, '?'))
       where id = r.id;
    end if;
    v_cil := v_cil - r.contract_id::text;
  end loop;

  -- nové
  for r in select key::bigint as c, round(value::text::numeric, 1) as km from jsonb_each(v_cil) loop
    if r.km <= 0 or not exists (select 1 from contracts where id = r.c) then continue; end if;
    insert into contract_cost_entries (contract_id, cost_type, is_extra, date, description, quantity, unit, unit_price_cost, unit_price_client, employee_id, jizda_klic)
    values (r.c, 'doprava', false, p_datum, format('Doprava – %s (%s) · GPS', coalesce(v_auto, p_kod), coalesce(v_jmeno, '?')),
            r.km, 'km', v_sazba, v_sazba, v_emp, v_klic)
    on conflict (jizda_klic, contract_id) where jizda_klic is not null do nothing;
  end loop;
end $$;
revoke all on function public.jizdy_prepocitat(date, text) from public, anon, authenticated;

-- ── Spouštěče: kalendář (i zpětně), výběr auta, nové GPS jízdy, úpravy jízd ───
create or replace function public.jizdy_trg_kalendar() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select d.datum, d.vozidlo_kod from jizdy_den d
     where (tg_op <> 'INSERT' and d.datum = old.date and d.employee_id = old.employee_id)
        or (tg_op <> 'DELETE' and d.datum = new.date and d.employee_id = new.employee_id)
  loop
    perform jizdy_prepocitat(r.datum, r.vozidlo_kod);
  end loop;
  return null;
end $$;
drop trigger if exists jizdy_kalendar on public.calendar_events;
create trigger jizdy_kalendar after insert or update of date, employee_id, contract_id, prubeh_id or delete on public.calendar_events
  for each row execute function public.jizdy_trg_kalendar();

create or replace function public.jizdy_trg_den() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then perform jizdy_prepocitat(old.datum, old.vozidlo_kod); end if;
  if tg_op <> 'DELETE' then perform jizdy_prepocitat(new.datum, new.vozidlo_kod); end if;
  return null;
end $$;
drop trigger if exists jizdy_den_zmena on public.jizdy_den;
create trigger jizdy_den_zmena after insert or update or delete on public.jizdy_den
  for each row execute function public.jizdy_trg_den();

-- GPS jízdy a jejich úpravy: přepočet jen u dnů, kde má auto vybraného řidiče
create or replace function public.jizdy_trg_gps() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_datum date; v_kod text;
begin
  if tg_op = 'DELETE' then v_datum := old.datum; v_kod := old.vozidlo_kod;
  else v_datum := new.datum; v_kod := new.vozidlo_kod; end if;
  if exists (select 1 from jizdy_den where datum = v_datum and vozidlo_kod = v_kod) then
    perform jizdy_prepocitat(v_datum, v_kod);
  end if;
  return null;
end $$;
drop trigger if exists jizdy_gps_zmena on public.gps_jizdy;
create trigger jizdy_gps_zmena after insert or update of km or delete on public.gps_jizdy
  for each row execute function public.jizdy_trg_gps();
drop trigger if exists jizdy_gps_stav_zmena on public.gps_jizdy_stav;
create trigger jizdy_gps_stav_zmena after insert or update or delete on public.gps_jizdy_stav
  for each row execute function public.jizdy_trg_gps();

-- ── Pro appku: auta, která ten den jela, a výběr / zrušení ────────────────────
create or replace function public.jizdy_auta_dne(p_datum date)
returns table (kod text, nazev text, spz text, jizd int, km numeric, prvni time, posledni time, ridic_id bigint, ridic text, vyber_id bigint, zakazky text, naklad_km numeric)
language sql stable security definer set search_path = public as $$
  select v.kod, trim(regexp_replace(coalesce(v.nazev, v.kod), '^\d+-', '')), v.spz,
         count(g.id)::int, round(coalesce(sum(g.km), 0), 1), min(g.zacatek), max(g.konec),
         d.employee_id, e.name, d.id,
         (select string_agg(distinct c.name, ', ') from contract_cost_entries ce join contracts c on c.id = ce.contract_id
           where ce.jizda_klic = 'gps|' || v.kod || '|' || p_datum),
         (select round(sum(ce.quantity), 1) from contract_cost_entries ce where ce.jizda_klic = 'gps|' || v.kod || '|' || p_datum)
    from gps_vozidla v
    join gps_jizdy g on g.vozidlo_kod = v.kod and g.datum = p_datum
    left join jizdy_den d on d.vozidlo_kod = v.kod and d.datum = p_datum
    left join employees e on e.id = d.employee_id
   where coalesce(v.aktivni, true) and auth.uid() is not null
   group by v.kod, v.nazev, v.spz, d.employee_id, e.name, d.id
   order by 2;
$$;
grant execute on function public.jizdy_auta_dne(date) to authenticated;

create or replace function public.jizdy_vybrat_auto(p_datum date, p_kod text, p_employee_id bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_ja bigint := app_moje_employee_id();
  v_vedeni boolean := app_je_vedeni() or app_je_admin();
  v_emp bigint := coalesce(p_employee_id, v_ja);
  v_kdo text; v_id bigint;
begin
  if auth.uid() is null then raise exception 'Nepřihlášený uživatel.'; end if;
  if v_emp is null then raise exception 'Váš účet není propojený se zaměstnancem.'; end if;
  if v_emp is distinct from v_ja and not v_vedeni then raise exception 'Auto si můžete vybrat jen sami za sebe.'; end if;
  if p_datum > current_date then raise exception 'Auto nejde vybrat na budoucí den.'; end if;
  if not v_vedeni and p_datum < current_date - 14 then raise exception 'Starší než 14 dní může upravit jen vedení.'; end if;
  if not exists (select 1 from gps_jizdy where vozidlo_kod = p_kod and datum = p_datum) then
    raise exception 'Toto auto ten den podle GPS nejelo.';
  end if;
  select e.name into v_kdo from jizdy_den d join employees e on e.id = d.employee_id
   where d.datum = p_datum and d.vozidlo_kod = p_kod and d.employee_id <> v_emp;
  if v_kdo is not null then
    raise exception 'Toto auto má na tento den už vybrané %. Když je to chyba, ať výběr zruší nebo kontaktujte vedení.', v_kdo;
  end if;
  insert into jizdy_den (datum, vozidlo_kod, employee_id, vybral)
  values (p_datum, p_kod, v_emp, (select name from employees where id = v_ja))
  on conflict (datum, vozidlo_kod) do update set vybral = excluded.vybral
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.jizdy_vybrat_auto(date, text, bigint) to authenticated;

create or replace function public.jizdy_zrusit_vyber(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare d record; v_vedeni boolean := app_je_vedeni() or app_je_admin();
begin
  select * into d from jizdy_den where id = p_id;
  if not found then return; end if;
  if d.employee_id is distinct from app_moje_employee_id() and not v_vedeni then raise exception 'Zrušit můžete jen svůj výběr.'; end if;
  if not v_vedeni and d.datum < current_date - 14 then raise exception 'Starší než 14 dní může upravit jen vedení.'; end if;
  if exists (select 1 from contract_cost_entries where jizda_klic = 'gps|' || d.vozidlo_kod || '|' || d.datum and (billed or approved)) then
    raise exception 'Doprava z tohoto dne je už schválená nebo vyfakturovaná — výběr auta nejde zrušit.';
  end if;
  delete from jizdy_den where id = p_id;
end $$;
grant execute on function public.jizdy_zrusit_vyber(bigint) to authenticated;
