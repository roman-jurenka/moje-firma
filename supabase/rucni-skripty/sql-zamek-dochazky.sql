-- Uzamčení docházky po měsíčním podpisu zaměstnance + žádosti o zápis/úpravu
-- po uzamčení. Měsíční podpis se ukládá do už existující tabulky
-- signed_documents (doc_type = 'dochazka_mesic') — žádná nová tabulka pro to
-- není potřeba. Tady je jen nová tabulka pro žádosti.
-- Spustit ručně v Supabase SQL editoru.

create table if not exists attendance_change_requests (
  id bigint generated always as identity primary key,
  employee_id bigint references employees(id),
  target_attendance_id bigint references attendance(id) on delete set null, -- vyplněno = úprava existujícího záznamu, prázdné = nový záznam
  date date not null,
  checkin text,
  checkout text,
  contract_id bigint references contracts(id),
  activity text,
  reason text,
  status text not null default 'čeká na schválení',   -- 'čeká na schválení' | 'schváleno' | 'zamítnuto'
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

alter table attendance_change_requests enable row level security;

create policy "attendance_change_requests_all" on attendance_change_requests
  for all to authenticated using (true) with check (true);

create index if not exists attendance_change_requests_employee_idx on attendance_change_requests(employee_id);
create index if not exists attendance_change_requests_status_idx on attendance_change_requests(status);
