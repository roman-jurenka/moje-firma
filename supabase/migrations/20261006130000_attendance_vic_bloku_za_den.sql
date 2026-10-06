-- Den muze mit vic bloku (Prepnout zakazku) - zrusit pravidlo "jeden zaznam na zamestnance a den".
alter table public.attendance drop constraint if exists attendance_employee_id_date_key;
create index if not exists attendance_zamestnanec_den on public.attendance (employee_id, date);
