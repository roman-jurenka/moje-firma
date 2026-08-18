-- Nacenění → Projekt/Zakázka: rozvrh po dnech + propojení projektu se zakázkou.
-- Spustit ručně v Supabase SQL editoru.

-- 1) Propojení projektu se zakázkou + plánovaný počet MD (z interního nacenění).
alter table projects add column if not exists contract_id bigint references contracts(id);
alter table projects add column if not exists planned_md numeric;

-- 2) Rozvrh po dnech — kolik lidí je naplánováno na daný den u dané zakázky.
create table if not exists project_day_plan (
  id bigint generated always as identity primary key,
  contract_id bigint references contracts(id) on delete cascade,
  project_id bigint references projects(id) on delete cascade,
  date date not null,
  planned_people integer not null default 1,
  note text,
  created_at timestamptz not null default now()
);

alter table project_day_plan enable row level security;

create policy "project_day_plan_all" on project_day_plan
  for all to authenticated using (true) with check (true);

create index if not exists project_day_plan_contract_idx on project_day_plan(contract_id);
create index if not exists project_day_plan_project_idx on project_day_plan(project_id);
