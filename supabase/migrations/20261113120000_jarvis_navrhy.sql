-- Jarvis (osobni asistent) - navrhy zapisu z dennich poznamek.
-- Jarvis z poznamek pripravi navrhy (poznamka k zakazce, udalost v kalendari,
-- ukol); do aplikace se nic nezapise, dokud navrh nekdo neschvali.
-- Schvaleni/zamitnuti jde pres funkci jarvis_navrh_rozhodnout (prava toho, kdo schvaluje).

create table if not exists public.jarvis_navrhy (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  den date not null default (now() at time zone 'Europe/Prague')::date,
  -- cas = kdy se to stalo / kdy to bylo receno (harmonogram dne v Jarvisovi)
  cas time not null default date_trunc('minute', (now() at time zone 'Europe/Prague')::time),
  druh text not null check (druh in ('myslenka', 'poznamka_zakazky', 'udalost_kalendare', 'ukol', 'jine')),
  prubeh_id bigint references public.zakazky_prubeh(id) on delete set null,
  contract_id bigint references public.contracts(id) on delete set null,
  nazev text not null,
  data jsonb not null default '{}'::jsonb,
  zdroj text,
  stav text not null default 'navrh' check (stav in ('navrh', 'zapsano', 'zamitnuto', 'chyba')),
  vysledek_id bigint,
  chyba text,
  vytvoril uuid default auth.uid(),
  rozhodl uuid,
  rozhodl_jmeno text,
  rozhodnuto_at timestamptz
);

comment on table public.jarvis_navrhy is 'Navrhy zapisu od asistenta Jarvis (z dennich poznamek); zapisou se az po schvaleni.';

create index if not exists jarvis_navrhy_stav_den_idx on public.jarvis_navrhy (stav, den desc);
create index if not exists jarvis_navrhy_den_cas_idx on public.jarvis_navrhy (den desc, cas);
create index if not exists jarvis_navrhy_prubeh_idx on public.jarvis_navrhy (prubeh_id);
create index if not exists jarvis_navrhy_contract_idx on public.jarvis_navrhy (contract_id);

alter table public.jarvis_navrhy enable row level security;

drop policy if exists jarvis_navrhy_cist on public.jarvis_navrhy;
create policy jarvis_navrhy_cist on public.jarvis_navrhy for select to authenticated
  using ((select public.app_ma(array['contracts', 'prubeh'])));

drop policy if exists jarvis_navrhy_vlozit on public.jarvis_navrhy;
create policy jarvis_navrhy_vlozit on public.jarvis_navrhy for insert to authenticated
  -- Myslenky jsou jen v Jarvisovi (do aplikace se nic nezapisuje), proto se ulozi rovnou.
  with check ((select public.app_ma(array['contracts', 'prubeh']))
              and (stav = 'navrh' or (druh = 'myslenka' and stav = 'zapsano')));

drop policy if exists jarvis_navrhy_upravit on public.jarvis_navrhy;
create policy jarvis_navrhy_upravit on public.jarvis_navrhy for update to authenticated
  using ((select public.app_ma(array['contracts', 'prubeh'])))
  with check ((select public.app_ma(array['contracts', 'prubeh'])));

-- Schvalit (zapsat do aplikace) nebo zamitnout navrh. p_data muze prepsat data navrhu (uprava pred schvalenim).
create or replace function public.jarvis_navrh_rozhodnout(p_id bigint, p_schvalit boolean, p_data jsonb default null)
returns public.jarvis_navrhy
language plpgsql
security invoker
set search_path = public
as $$
declare
  n public.jarvis_navrhy;
  d jsonb;
  jmeno text;
  novy_id bigint;
begin
  select * into n from public.jarvis_navrhy where id = p_id for update;
  if not found then raise exception 'Navrh % neexistuje', p_id; end if;
  if n.stav <> 'navrh' then raise exception 'Navrh % uz byl vyrizen (%)', p_id, n.stav; end if;

  select coalesce(name, email, '?') into jmeno from public.profiles where id = auth.uid();
  d := coalesce(n.data, '{}'::jsonb) || coalesce(p_data, '{}'::jsonb);

  if not p_schvalit then
    update public.jarvis_navrhy
       set stav = 'zamitnuto', data = d, rozhodl = auth.uid(), rozhodl_jmeno = jmeno, rozhodnuto_at = now()
     where id = p_id returning * into n;
    return n;
  end if;

  if n.druh = 'poznamka_zakazky' then
    if coalesce((d->>'prubeh_id')::bigint, n.prubeh_id) is null then
      raise exception 'Poznamka nema prirazenou zakazku';
    end if;
    insert into public.zakazky_poznamky (prubeh_id, kdo, duvod, text, system)
    values (coalesce((d->>'prubeh_id')::bigint, n.prubeh_id), 'Jarvis (' || jmeno || ')', 'Denní zápis', d->>'text', false)
    returning id into novy_id;

  elsif n.druh = 'udalost_kalendare' then
    insert into public.calendar_events (date, title, work_type, work_description, address, customer_name,
                                        employee_name, na_starosti, contract_id, prubeh_id)
    values ((d->>'date')::date, d->>'title', d->>'work_type', d->>'work_description', d->>'address',
            d->>'customer_name', d->>'employee_name', d->>'na_starosti',
            coalesce((d->>'contract_id')::bigint, n.contract_id), coalesce((d->>'prubeh_id')::bigint, n.prubeh_id))
    returning id into novy_id;

  elsif n.druh = 'ukol' then
    insert into public.tasks (title, description, due, priority, contract_id, assigned_to, created_by, done)
    values (d->>'title', d->>'description', d->>'due', coalesce(d->>'priority', 'Střední'),
            coalesce((d->>'contract_id')::bigint, n.contract_id), d->>'assigned_to', 'Jarvis (' || jmeno || ')', false)
    returning id into novy_id;
  end if;

  update public.jarvis_navrhy
     set stav = 'zapsano', data = d, vysledek_id = novy_id, chyba = null,
         rozhodl = auth.uid(), rozhodl_jmeno = jmeno, rozhodnuto_at = now()
   where id = p_id returning * into n;
  return n;
end;
$$;

revoke all on function public.jarvis_navrh_rozhodnout(bigint, boolean, jsonb) from public, anon;
grant execute on function public.jarvis_navrh_rozhodnout(bigint, boolean, jsonb) to authenticated;
