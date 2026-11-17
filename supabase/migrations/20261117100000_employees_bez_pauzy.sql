-- Zaměstnanec bez odečtu 1 h pauzy (den nad 6 h). Nastavit smí jen administrátor.
alter table public.employees add column if not exists bez_pauzy boolean not null default false;

create or replace function public.employees_bez_pauzy_jen_admin()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.bez_pauzy is distinct from old.bez_pauzy and auth.uid() is not null and not public.app_je_admin() then
    raise exception 'Odečet pauzy může nastavit jen administrátor.';
  end if;
  return new;
end $$;
drop trigger if exists employees_bez_pauzy_jen_admin on public.employees;
create trigger employees_bez_pauzy_jen_admin before update of bez_pauzy on public.employees
  for each row execute function public.employees_bez_pauzy_jen_admin();

create or replace function public.nastav_bez_pauzy(p_employee_id bigint, p_bez_pauzy boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.app_je_admin() then raise exception 'Odečet pauzy může nastavit jen administrátor.'; end if;
  update employees set bez_pauzy = coalesce(p_bez_pauzy, false) where id = p_employee_id;
end $$;
revoke all on function public.nastav_bez_pauzy(bigint, boolean) from public, anon;
grant execute on function public.nastav_bez_pauzy(bigint, boolean) to authenticated;

-- schválení dne: pauza se neodečte zaměstnanci s bez_pauzy
do $$ declare d text; begin
  d := pg_get_functiondef('public.schvalit_den'::regproc);
  if position('pauza := case when celkem > 6 then 1 else 0 end;' in d) = 0 then raise exception 'schvalit_den: nenalezen výpočet pauzy'; end if;
  d := replace(d, 'pauza := case when celkem > 6 then 1 else 0 end;', 'pauza := case when celkem > 6 and not coalesce(emp.bez_pauzy, false) then 1 else 0 end;');
  execute d;
end $$;
