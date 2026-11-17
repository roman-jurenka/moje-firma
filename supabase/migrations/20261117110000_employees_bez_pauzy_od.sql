-- Bez odečtu pauzy OD DATA (i zpětně). null = od začátku.
alter table public.employees add column if not exists bez_pauzy_od date;

create or replace function public.employees_bez_pauzy_jen_admin()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.bez_pauzy is distinct from old.bez_pauzy or new.bez_pauzy_od is distinct from old.bez_pauzy_od)
     and auth.uid() is not null and not public.app_je_admin() then
    raise exception 'Odečet pauzy může nastavit jen administrátor.';
  end if;
  return new;
end $$;
drop trigger if exists employees_bez_pauzy_jen_admin on public.employees;
create trigger employees_bez_pauzy_jen_admin before update of bez_pauzy, bez_pauzy_od on public.employees
  for each row execute function public.employees_bez_pauzy_jen_admin();

-- schvalit_den: pravidlo s datem
do $$ declare d text; begin
  d := pg_get_functiondef('public.schvalit_den'::regproc);
  if position('and not coalesce(emp.bez_pauzy, false) then 1' in d) = 0 then raise exception 'schvalit_den: nenalezeno'; end if;
  d := replace(d, 'and not coalesce(emp.bez_pauzy, false) then 1',
    'and not (coalesce(emp.bez_pauzy, false) and (emp.bez_pauzy_od is null or p_date >= emp.bez_pauzy_od)) then 1');
  execute d;
end $$;

-- Nastavení + přepočet nákladů práce u dnů od dotčeného data (i zpětně).
-- Vyfakturované náklady se nemění, jen se spočítají.
drop function if exists public.nastav_bez_pauzy(bigint, boolean);
create or replace function public.nastav_bez_pauzy(p_employee_id bigint, p_bez_pauzy boolean, p_od date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  stare employees%rowtype; emp employees%rowtype;
  v_od date; den record; r record; celkem numeric; pauza numeric; koef numeric; h numeric;
  dnu int := 0; upraveno int := 0; vyfakt int := 0;
begin
  if not public.app_je_admin() then raise exception 'Odečet pauzy může nastavit jen administrátor.'; end if;
  select * into stare from employees where id = p_employee_id;
  if not found then raise exception 'Zaměstnanec nenalezen.'; end if;
  update employees set bez_pauzy = coalesce(p_bez_pauzy, false), bez_pauzy_od = case when p_bez_pauzy then p_od end
   where id = p_employee_id returning * into emp;

  v_od := least(case when stare.bez_pauzy then coalesce(stare.bez_pauzy_od, '1900-01-01') end,
                case when emp.bez_pauzy then coalesce(emp.bez_pauzy_od, '1900-01-01') end);
  if v_od is null then return jsonb_build_object('dnu', 0, 'upraveno', 0, 'vyfakturovano', 0); end if;

  for den in select distinct date from attendance
              where employee_id = p_employee_id and date >= v_od and checkout is not null loop
    select coalesce(sum(dochazka_hodiny(checkin, checkout)), 0) into celkem
      from attendance where employee_id = p_employee_id and date = den.date and checkout is not null;
    pauza := case when celkem > 6 and not (emp.bez_pauzy and (emp.bez_pauzy_od is null or den.date >= emp.bez_pauzy_od)) then 1 else 0 end;
    koef := case when celkem > 0 then (celkem - pauza) / celkem else 0 end;
    dnu := dnu + 1;
    for r in select a.id, a.checkin, a.checkout, c.id as cid, c.quantity, c.billed
               from attendance a join contract_cost_entries c on c.attendance_id = a.id and c.cost_type = 'práce'
              where a.employee_id = p_employee_id and a.date = den.date and a.checkout is not null loop
      h := round(dochazka_hodiny(r.checkin, r.checkout) * koef, 2);
      if h is distinct from r.quantity then
        if coalesce(r.billed, false) then vyfakt := vyfakt + 1;
        else update contract_cost_entries set quantity = h where id = r.cid; upraveno := upraveno + 1; end if;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('dnu', dnu, 'upraveno', upraveno, 'vyfakturovano', vyfakt);
end $$;
revoke all on function public.nastav_bez_pauzy(bigint, boolean, date) from public, anon;
grant execute on function public.nastav_bez_pauzy(bigint, boolean, date) to authenticated;
