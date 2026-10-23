-- Faktury a účtenky vyfocené v terénu (Účtenky → Vyfotit doklad):
-- fotka jde do bucketu faktury-fronta (foto/<uid>/…) a doklad do Fronty
-- k přiřazení (invoice_queue, source = 'foto'). Hlavičku a řádky z fotky
-- vyčte naplánovaný agent (edge funkce faktury-radky), přiřazení potvrzuje
-- kancelář: zakázka / sklad / fungování firmy / auto (nafta, oprava).

alter table public.invoice_queue drop constraint if exists invoice_queue_source_check;
alter table public.invoice_queue add constraint invoice_queue_source_check check (source = any (array['email', 'app', 'ucetni', 'foto']));
alter table public.invoice_queue drop constraint if exists invoice_queue_doc_type_check;
alter table public.invoice_queue add constraint invoice_queue_doc_type_check check (doc_type = any (array['faktura', 'zaloha', 'uctenka']));

alter table public.invoice_queue
  add column if not exists fotky jsonb,                       -- cesty ke stránkám dokladu v bucketu
  add column if not exists nahral text,                       -- jméno toho, kdo doklad vyfotil
  add column if not exists nahral_uid uuid default auth.uid(),
  add column if not exists uhradil_zamestnanec boolean not null default false, -- platil ze svého → proplatit
  add column if not exists navrh_cil text,                    -- návrh z terénu: 'z:<zakázka>' | 'rezie' | 'auto:<vozidlo>' | 'sklad'
  add column if not exists navrh_typ text;                    -- u auta: nafta | oprava | jine

alter table public.invoice_queue_items
  add column if not exists assigned_vehicle_id bigint references public.vehicles(id) on delete set null,
  add column if not exists costs_id bigint references public.costs(id) on delete set null;

alter table public.costs
  add column if not exists vehicle_id bigint references public.vehicles(id) on delete set null;

-- Terén: kdokoli přihlášený smí vložit vlastní vyfocený doklad a vidět svoje.
drop policy if exists foto_vlozit on public.invoice_queue;
create policy foto_vlozit on public.invoice_queue for insert to authenticated
  with check (source = 'foto' and status = 'nova' and nahral_uid = auth.uid());
drop policy if exists foto_moje on public.invoice_queue;
create policy foto_moje on public.invoice_queue for select to authenticated
  using (nahral_uid = auth.uid());

drop policy if exists faktury_fronta_foto_nahrat on storage.objects;
create policy faktury_fronta_foto_nahrat on storage.objects for insert to authenticated
  with check (bucket_id = 'faktury-fronta' and name like 'foto/' || auth.uid()::text || '/%');
drop policy if exists faktury_fronta_foto_cist on storage.objects;
create policy faktury_fronta_foto_cist on storage.objects for select to authenticated
  using (bucket_id = 'faktury-fronta' and name like 'foto/' || auth.uid()::text || '/%');
