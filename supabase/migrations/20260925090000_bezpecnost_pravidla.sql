-- Bezpečnost — krok A: jen pravidla přístupu, žádná data se nemažou.
-- Body 1, 2, 3 a 5 z auditu (září 2026). Spustit v Supabase → SQL Editor.
--  1) Zavřít přístup bez přihlášení (role anon / public s podmínkou true).
--  2) Zaměstnanec si nesmí sám změnit roli; funkce pro správu přístupů jen pro HR/admina.
--  3) Finanční data jen pro toho, kdo má zapnutou některou z finančních záložek;
--     oprávnění (user_permissions) mění jen admin, přihlašovací adresář HR/admin.
--  5) Uložené podpisy vidí jen vlastník; podepsané dokumenty a žádosti o úpravu
--     docházky jen daný zaměstnanec a vedení.
-- "Admin" = role admin NEBO zapnutá záložka Oprávnění (tak to funguje i v appce),
-- takže Šárlota (role employee, ale se všemi záložkami) o nic nepřijde.

-- ─── Pomocné funkce ──────────────────────────────────────────────────────────
-- Záložky přihlášeného uživatele: vlastní nastavení z Oprávnění, jinak výchozí
-- podle role (stejné jako ROLES v src/App.jsx).
create or replace function public.app_moje_nav()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(up.nav_override, case p.role
    when 'admin'   then array['dashboard','customers','pricing','deals','prubeh','contracts','tasks','invoices','warehouse','hr','projects','costs','finance','reports','ai','attendance','calendar','knjiga','onedrive','permissions','hlaseni','podpisy','profile']
    when 'manager' then array['dashboard','customers','pricing','deals','prubeh','contracts','tasks','invoices','projects','costs','finance','reports','ai','attendance','calendar','knjiga','podpisy','profile']
    when 'hr'      then array['dashboard','hr','costs','attendance','calendar','knjiga','uctenky','podpisy','profile']
    else                array['dashboard','fotoupload','attendance','calendar','knjiga','uctenky','podpisy','profile']
  end)
  from profiles p left join user_permissions up on up.profile_id = p.id
  where p.id = auth.uid();
$$;

create or replace function public.app_je_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
      or 'permissions' = any(coalesce(public.app_moje_nav(), '{}'));
$$;

-- Má uživatel aspoň jednu z uvedených záložek (admin má vše)?
create or replace function public.app_ma(p_tabs text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_je_admin() or coalesce(public.app_moje_nav(), '{}') && p_tabs;
$$;

-- Vedení = admin, role manager/hr nebo záložka HR (schvaluje docházku, podepisuje za firmu).
create or replace function public.app_je_vedeni()
returns boolean language sql stable security definer set search_path = public as $$
  select public.app_ma(array['hr'])
      or exists (select 1 from profiles where id = auth.uid() and role in ('manager','hr'));
$$;

create or replace function public.app_moje_employee_id()
returns bigint language sql stable security definer set search_path = public as $$
  select employee_id from profiles where id = auth.uid();
$$;

-- ─── 1) Zavřít přístup bez přihlášení ───────────────────────────────────────
drop policy if exists "Allow all" on public.attendance;
drop policy if exists "allow_all_attendance" on public.attendance;
drop policy if exists "Allow all" on public.attendance_materials;
drop policy if exists "allow_all_attendance_materials" on public.attendance_materials;
drop policy if exists "Allow all" on public.communication;
drop policy if exists "allow_all_communication" on public.communication;
drop policy if exists "allow_all_contract_billing_summaries" on public.contract_billing_summaries;
drop policy if exists "allow_all_contract_budget_history" on public.contract_budget_history;
drop policy if exists "allow_all_contract_cost_entries" on public.contract_cost_entries;
drop policy if exists "Allow all" on public.contract_documents;
drop policy if exists "allow_all_contract_messages" on public.contract_messages;
drop policy if exists "allow_all_contract_photos" on public.contract_photos;
drop policy if exists "Allow all" on public.contract_prep_tasks;
drop policy if exists "allow_all_contract_tasks" on public.contract_tasks;
drop policy if exists "allow_all_contracts" on public.contracts;
drop policy if exists "Allow all" on public.costs;
drop policy if exists "allow_all_costs" on public.costs;
drop policy if exists "Allow all" on public.customers;
drop policy if exists "allow_all_customers" on public.customers;
drop policy if exists "allow_all_deal_history" on public.deal_history;
drop policy if exists "allow_all_deal_messages" on public.deal_messages;
drop policy if exists "Allow all" on public.deals;
drop policy if exists "allow_all_deals" on public.deals;
drop policy if exists "Allow all" on public.delivery_items;
drop policy if exists "dni delete all" on public.delivery_note_items;
drop policy if exists "dni insert all" on public.delivery_note_items;
drop policy if exists "dni read all" on public.delivery_note_items;
drop policy if exists "dni update all" on public.delivery_note_items;
drop policy if exists "dn delete all" on public.delivery_notes;
drop policy if exists "dn insert all" on public.delivery_notes;
drop policy if exists "dn read all" on public.delivery_notes;
drop policy if exists "dn update all" on public.delivery_notes;
drop policy if exists "Allow all" on public.employees;
drop policy if exists "allow_all_employees" on public.employees;
drop policy if exists "Allow all" on public.invoices;
drop policy if exists "allow_all_invoices" on public.invoices;
drop policy if exists "allow_all_notifications" on public.notifications;
drop policy if exists "Allow all" on public.products;
drop policy if exists "allow_all_products" on public.products;
drop policy if exists "Allow all" on public.project_sheets;
drop policy if exists "Allow all" on public.project_steps;
drop policy if exists "allow_all_project_steps" on public.project_steps;
drop policy if exists "Allow all" on public.projects;
drop policy if exists "allow_all_projects" on public.projects;
drop policy if exists "Allow all" on public.tasks;
drop policy if exists "allow_all_tasks" on public.tasks;
drop policy if exists "Allow all" on public.vehicle_log;
drop policy if exists "Allow all" on public.vehicles;
drop policy if exists "allow_all_warehouse_movements" on public.warehouse_movements;
drop policy if exists "Allow all" on public.users;

-- deal_history měla jen veřejné pravidlo — náhrada jen pro přihlášené.
create policy "authenticated_full_access" on public.deal_history
  for all to authenticated using (true) with check (true);

-- Tabulky: nepřihlášený nesmí nic, kromě čtení přihlašovacího adresáře.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.login_directory to anon;
-- Nové tabulky a funkce už anon automaticky nedostane.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

-- Funkce: nepřihlášený smí jen kalendářový feed (api/calendar-feed.js).
revoke execute on all functions in schema public from anon, public;
grant execute on function public.get_ics_feed(uuid) to anon, authenticated;
grant execute on function public.get_attendance_full() to authenticated;
grant execute on function public.get_employees_full() to authenticated;
grant execute on function public.next_contract_code_number(text, integer, integer) to authenticated;
grant execute on function public.set_attendance_billing_rate(integer, numeric) to authenticated;
grant execute on function public.set_employee_rates(integer, numeric, numeric) to authenticated;
grant execute on function public.link_employee_profile(bigint, text, text, text) to authenticated;
grant execute on function public.unlink_employee_profile(bigint) to authenticated;
grant execute on function public.hlaseni_je_admin() to authenticated;
grant execute on function public.app_moje_nav() to authenticated;
grant execute on function public.app_je_admin() to authenticated;
grant execute on function public.app_ma(text[]) to authenticated;
grant execute on function public.app_je_vedeni() to authenticated;
grant execute on function public.app_moje_employee_id() to authenticated;
grant execute on all functions in schema public to service_role;
revoke execute on function public.rls_auto_enable() from authenticated;
revoke execute on function public.dochazka_push_trigger() from authenticated;

-- Pohledy urgentni_* / denni_souhrn_prikazy obcházejí RLS (SECURITY DEFINER);
-- appka je nepoužívá, čte je jen Hlášení na serveru — z API je zavřít.
revoke all on public.urgentni_zakazky, public.urgentni_faktury, public.urgentni_sklad,
  public.urgentni_dochazka, public.denni_souhrn_prikazy from anon, authenticated;

-- Doplnit search_path (Security Advisor) a kontrolu oprávnění do funkcí.
create or replace function public.get_attendance_full()
returns table(id integer, employee_id integer, date text, checkin text, checkout text, contract_id integer, activity text, billing_rate numeric)
language sql security definer set search_path = public as $$
  select id, employee_id, date::text, checkin, checkout, contract_id, activity, billing_rate
  from attendance order by date desc;
$$;

create or replace function public.next_contract_code_number(p_type text, p_year integer, p_month integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_counter int;
begin
  insert into contract_code_counters (type, year, month, counter)
  values (p_type, p_year, p_month, 1)
  on conflict (type, year, month) do update set counter = contract_code_counters.counter + 1
  returning counter into v_counter;
  return v_counter;
end;
$$;

-- Sazby všech zaměstnanců vidí jen ten, kdo je potřebuje k práci (HR, zakázky,
-- náklady, finance, reporty, faktury); ostatní jen svůj vlastní řádek.
-- (Appka tuhle funkci zatím nevolá — připraveno pro krok B.)
create or replace function public.get_employees_full()
returns table(id integer, name text, "position" text, department text, email text, salary numeric, status text, start_date text, hourly_rate_cost numeric, hourly_rate_client numeric)
language sql security definer set search_path = public as $$
  select e.id, e.name, e.position, e.department, e.email, e.salary, e.status, e.start_date::text,
         coalesce(e.hourly_rate_cost, 0), coalesce(e.hourly_rate_client, 0)
  from employees e
  where public.app_ma(array['hr','contracts','costs','finance','reports','invoices'])
     or e.id = public.app_moje_employee_id()
  order by e.id;
$$;

create or replace function public.set_employee_rates(emp_id integer, rate_cost numeric, rate_client numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.app_ma(array['hr']) then raise exception 'Sazby může měnit jen HR nebo administrátor.'; end if;
  update employees set hourly_rate_cost = rate_cost, hourly_rate_client = rate_client where id = emp_id;
end;
$$;

create or replace function public.set_attendance_billing_rate(att_id integer, rate numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.app_ma(array['contracts','hr']) then raise exception 'Fakturační sazbu může měnit jen vedení.'; end if;
  update attendance set billing_rate = rate where id = att_id;
end;
$$;

-- ─── 2) Role a přístupy ─────────────────────────────────────────────────────
create or replace function public.link_employee_profile(p_employee_id bigint, p_email text, p_role text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not public.app_ma(array['hr']) then
    raise exception 'Přístupy do aplikace může spravovat jen HR nebo administrátor.';
  end if;
  if p_role = 'admin' and not public.app_je_admin() then
    raise exception 'Roli administrátora může přidělit jen administrátor.';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(p_email);
  if v_uid is null then
    raise exception 'Účet s emailem % v Supabase Authentication ještě neexistuje. Nejdřív ho tam založ (Authentication → Add user), pak zkus znovu.', p_email;
  end if;
  insert into profiles (id, employee_id, name, role, email)
  values (v_uid, p_employee_id, p_name, p_role, p_email)
  on conflict (id) do update set employee_id = excluded.employee_id, name = excluded.name, role = excluded.role, email = excluded.email;
end;
$$;

create or replace function public.unlink_employee_profile(p_employee_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.app_ma(array['hr']) then
    raise exception 'Přístupy do aplikace může spravovat jen HR nebo administrátor.';
  end if;
  delete from profiles where employee_id = p_employee_id;
end;
$$;

-- Roli / vazbu na zaměstnance smí měnit jen admin (i ve vlastním profilu).
-- auth.uid() je prázdné u serveru a SQL editoru — tam se nekontroluje.
create or replace function public.app_chran_profil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.role is distinct from old.role or new.employee_id is distinct from old.employee_id or new.id is distinct from old.id)
     and not public.app_je_admin() then
    raise exception 'Roli může změnit jen administrátor.';
  end if;
  return new;
end;
$$;
revoke execute on function public.app_chran_profil() from anon, public, authenticated;
drop trigger if exists profiles_chran_roli on public.profiles;
create trigger profiles_chran_roli before update on public.profiles
  for each row execute function public.app_chran_profil();

-- HR upravuje dovolenou ostatním, admin mění role (dřív to u cizích profilů tiše neprošlo).
create policy "vedeni_update_profiles" on public.profiles
  for update to authenticated using ((select public.app_ma(array['hr']))) with check ((select public.app_ma(array['hr'])));

-- Oprávnění: každý čte své, mění jen admin.
drop policy if exists "authenticated_full_access" on public.user_permissions;
create policy "user_permissions_read" on public.user_permissions
  for select to authenticated using (profile_id = auth.uid() or (select public.app_je_admin()));
create policy "user_permissions_admin_write" on public.user_permissions
  for all to authenticated using ((select public.app_je_admin())) with check ((select public.app_je_admin()));

-- Přihlašovací adresář: číst smí kdokoli (přihlašovací obrazovka), měnit jen HR/admin.
drop policy if exists "authenticated_write" on public.login_directory;
create policy "login_directory_hr_write" on public.login_directory
  for all to authenticated using ((select public.app_ma(array['hr']))) with check ((select public.app_ma(array['hr'])));

-- Zaměstnance zakládá a upravuje jen HR/admin; číst smí všichni přihlášení.
drop policy if exists "authenticated_full_access" on public.employees;
create policy "employees_read" on public.employees for select to authenticated using (true);
create policy "employees_hr_write" on public.employees
  for all to authenticated using ((select public.app_ma(array['hr']))) with check ((select public.app_ma(array['hr'])));

-- ─── 3) Finanční data ───────────────────────────────────────────────────────
-- Záložky, které s financemi pracují: faktury, finanční tok, náklady, reporty,
-- zakázky (záložka Faktury u zakázky) a zákazníci (fakturace v detailu).
do $$
declare t text;
begin
  foreach t in array array['invoices','invoice_events','invoice_queue','invoice_queue_items','costs','cashflow_settings'] loop
    execute format('drop policy if exists "authenticated_full_access" on public.%I', t);
    execute format('drop policy if exists "cashflow_settings_all" on public.%I', t);
    execute format($p$create policy "finance_access" on public.%I for all to authenticated
      using ((select public.app_ma(array['invoices','finance','costs','reports','contracts','customers'])))
      with check ((select public.app_ma(array['invoices','finance','costs','reports','contracts','customers'])))$p$, t);
  end loop;
end $$;

-- Finanční tok: účetní vidí vše, zaměstnanec jen své účtenky (modul Účtenky).
-- Zápis bez zaměstnance (účtenka placená firemní kartou) zůstává povolený jako dosud.
drop policy if exists "cashflow_entries_all" on public.cashflow_entries;
create policy "cashflow_finance" on public.cashflow_entries for all to authenticated
  using ((select public.app_ma(array['invoices','finance','costs','reports','contracts','customers'])))
  with check ((select public.app_ma(array['invoices','finance','costs','reports','contracts','customers'])));
create policy "cashflow_own_read" on public.cashflow_entries for select to authenticated
  using (employee_id = (select public.app_moje_employee_id()));
create policy "cashflow_own_insert" on public.cashflow_entries for insert to authenticated
  with check (employee_id is null or employee_id = (select public.app_moje_employee_id()));
create policy "cashflow_own_update" on public.cashflow_entries for update to authenticated
  using (employee_id = (select public.app_moje_employee_id()))
  with check (employee_id = (select public.app_moje_employee_id()));
create policy "cashflow_own_delete" on public.cashflow_entries for delete to authenticated
  using (employee_id = (select public.app_moje_employee_id()));

-- ─── 5) Podpisy, podepsané dokumenty, žádosti o úpravu docházky ─────────────
drop policy if exists "saved_signatures_all" on public.saved_signatures;
create policy "saved_signatures_own" on public.saved_signatures for all to authenticated
  using (owner_auth_id = auth.uid()) with check (owner_auth_id = auth.uid());

drop policy if exists "signed_documents_all" on public.signed_documents;
create policy "signed_documents_read" on public.signed_documents for select to authenticated
  using ((select public.app_je_vedeni()) or employee_id = (select public.app_moje_employee_id()));
create policy "signed_documents_insert" on public.signed_documents for insert to authenticated
  with check ((select public.app_je_vedeni()) or employee_id = (select public.app_moje_employee_id()));
create policy "signed_documents_update" on public.signed_documents for update to authenticated
  using ((select public.app_je_vedeni()) or employee_id = (select public.app_moje_employee_id()))
  with check ((select public.app_je_vedeni()) or employee_id = (select public.app_moje_employee_id()));
create policy "signed_documents_delete" on public.signed_documents for delete to authenticated
  using ((select public.app_je_vedeni()));

drop policy if exists "attendance_change_requests_all" on public.attendance_change_requests;
create policy "acr_read" on public.attendance_change_requests for select to authenticated
  using ((select public.app_je_vedeni()) or employee_id = (select public.app_moje_employee_id()));
create policy "acr_insert" on public.attendance_change_requests for insert to authenticated
  with check ((select public.app_je_vedeni()) or employee_id = (select public.app_moje_employee_id()));
create policy "acr_vedeni_update" on public.attendance_change_requests for update to authenticated
  using ((select public.app_je_vedeni())) with check ((select public.app_je_vedeni()));
create policy "acr_vedeni_delete" on public.attendance_change_requests for delete to authenticated
  using ((select public.app_je_vedeni()));
