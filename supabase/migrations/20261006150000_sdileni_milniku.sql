-- Sdílení milníků dne s kolegy: stejné části dne (časy, zakázky, popis) se
-- zkopírují dalším zaměstnancům. Materiál se NEkopíruje — eviduje se jen
-- jednou, u toho, kdo ho zapsal.
alter table public.attendance add column if not exists sdileno_od text;
alter table public.attendance add column if not exists sdileno_z_id bigint;

create or replace function public.sdilet_den(p_zdroj bigint, p_date date, p_komu bigint[], p_prepsat boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  jmeno_zdroje text; emp record; stare bigint[]; prvni bigint;
  sdileno text[] := '{}'; preskoceno jsonb := '[]'::jsonb;
begin
  if not (public.app_je_vedeni() or p_zdroj = public.app_moje_employee_id()) then
    raise exception 'Sdílet můžeš jen svůj vlastní den.';
  end if;
  if not exists (select 1 from attendance where employee_id = p_zdroj and date = p_date) then
    raise exception 'Ten den nemáš žádný zápis.';
  end if;
  select name into jmeno_zdroje from employees where id = p_zdroj;

  for emp in select id, name from employees where id = any(p_komu) and id <> p_zdroj loop
    if exists (select 1 from attendance where employee_id = emp.id and date = p_date and schvaleno) then
      preskoceno := preskoceno || jsonb_build_object('jmeno', emp.name, 'duvod', 'den je už schválený');
      continue;
    end if;
    select array_agg(id) into stare from attendance where employee_id = emp.id and date = p_date;
    if stare is not null and not p_prepsat then
      preskoceno := preskoceno || jsonb_build_object('jmeno', emp.name, 'duvod', 'má vlastní zápis (zaškrtni přepsat)');
      continue;
    end if;
    prvni := null;
    insert into attendance (employee_id, date, checkin, checkout, contract_id, popis_prace, sdileno_od, sdileno_z_id)
    select emp.id, p_date, a.checkin, a.checkout, a.contract_id, a.popis_prace, jmeno_zdroje, a.id
    from attendance a where a.employee_id = p_zdroj and a.date = p_date
    order by a.checkin;
    select id into prvni from attendance where employee_id = emp.id and date = p_date and sdileno_z_id is not null
      and not (id = any(coalesce(stare, '{}'))) order by checkin limit 1;
    if stare is not null then
      -- vlastní materiál kolegy zůstane (přejde na první novou část), staré části pryč
      update attendance_materials set attendance_id = prvni where attendance_id = any(stare) and not schvaleno;
      delete from attendance where id = any(stare);
    end if;
    sdileno := sdileno || emp.name;
  end loop;
  return jsonb_build_object('sdileno', to_jsonb(sdileno), 'preskoceno', preskoceno);
end; $$;
revoke execute on function public.sdilet_den(bigint, date, bigint[], boolean) from anon, public;
grant execute on function public.sdilet_den(bigint, date, bigint[], boolean) to authenticated;

-- Načtení docházky: i informace o sdílení
drop function if exists public.get_attendance_full();
create function public.get_attendance_full()
returns table(id integer, employee_id integer, date text, checkin text, checkout text, contract_id integer, activity text,
              billing_rate numeric, popis_prace text, schvaleno boolean, schvaleno_at timestamptz, schvalil text, sdileno_od text)
language sql security definer set search_path = public as $$
  select a.id, a.employee_id, a.date::text, a.checkin::text, a.checkout::text, a.contract_id, a.activity,
         a.billing_rate, a.popis_prace, a.schvaleno, a.schvaleno_at, a.schvalil, a.sdileno_od
  from attendance a
  where public.app_je_vedeni() or public.app_ma(array['contracts','costs','reports','finance'])
     or a.employee_id = public.app_moje_employee_id()
  order by a.date desc;
$$;
revoke execute on function public.get_attendance_full() from anon, public;
grant execute on function public.get_attendance_full() to authenticated;
