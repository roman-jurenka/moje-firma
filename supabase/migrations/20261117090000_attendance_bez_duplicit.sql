-- Pojistka proti zdvojenému příchodu (dvojí klepnutí / opakované odeslání offline fronty):
-- stejný zaměstnanec, den a čas příchodu se nezapíše podruhé. Zámek serializuje
-- souběžné zápisy (dva inserty 0,09 s po sobě by jinak navzájem neviděly).
create or replace function public.attendance_bez_duplicit()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.checkin is null or new.employee_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('attendance|' || new.employee_id || '|' || new.date));
  if exists (select 1 from attendance a
              where a.employee_id = new.employee_id and a.date = new.date
                and date_trunc('minute', a.checkin) = date_trunc('minute', new.checkin)
                and a.id is distinct from new.id) then
    raise exception 'Příchod %, % je už zapsaný.', to_char(new.date, 'DD.MM.YYYY'), to_char(new.checkin, 'HH24:MI')
      using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists attendance_bez_duplicit on public.attendance;
create trigger attendance_bez_duplicit before insert on public.attendance
  for each row execute function public.attendance_bez_duplicit();
