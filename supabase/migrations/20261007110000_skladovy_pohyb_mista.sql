-- Ruční skladový pohyb s místem (Sklad → Pohyby): naskladnění na místo,
-- výdej z místa (obecný / na zakázku). Mění zásoby místa (products.stock
-- dopočítá trigger), zapíše pohyb a u výdeje na zakázku náklad materiálu
-- v nákupní a prodejní ceně. Přesuny mezi místy řeší presun_zasob.
create or replace function public.skladovy_pohyb(
  p_product_id bigint, p_typ text, p_misto bigint, p_mnozstvi numeric,
  p_contract_id bigint default null, p_datum date default null, p_poznamka text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare m record; p record; kdo text; mid bigint; delta numeric;
begin
  if not (public.app_je_vedeni() or public.app_ma(array['warehouse'])) then raise exception 'Skladové pohyby může zapisovat jen sklad nebo vedení.'; end if;
  if p_typ not in ('in', 'out', 'out_contract') then raise exception 'Neznámý typ pohybu %.', p_typ; end if;
  if p_mnozstvi is null or p_mnozstvi <= 0 then raise exception 'Množství musí být kladné.'; end if;
  if p_typ = 'out_contract' and p_contract_id is null then raise exception 'Vyber zakázku.'; end if;
  select * into m from sklad_mista where id = p_misto;
  select * into p from products where id = p_product_id;
  if m.id is null or p.id is null then raise exception 'Neplatné místo nebo položka.'; end if;
  select name into kdo from profiles where id = auth.uid();
  kdo := coalesce(nullif(kdo, ''), '?');
  delta := case when p_typ = 'in' then p_mnozstvi else -p_mnozstvi end;
  insert into sklad_zasoby (product_id, misto_id, mnozstvi) values (p.id, m.id, delta)
  on conflict (product_id, misto_id) do update set mnozstvi = sklad_zasoby.mnozstvi + delta, updated_at = now();
  insert into warehouse_movements (product_name, product_id, quantity, unit, movement_type, from_location, to_location,
    z_misto_id, do_misto_id, contract_id, vehicle, created_by, note)
  values (p.name, p.id, p_mnozstvi, coalesce(p.unit, 'ks'), p_typ,
    case when p_typ = 'in' then 'Dodavatel' else m.nazev end,
    case when p_typ = 'in' then m.nazev when p_typ = 'out_contract' then 'Zakázka' else '' end,
    case when p_typ = 'in' then null else m.id end, case when p_typ = 'in' then m.id else null end,
    case when p_typ = 'out_contract' then p_contract_id end,
    case when m.typ = 'auto' then m.nazev else '' end, kdo, coalesce(p_poznamka, ''))
  returning id into mid;
  if p_typ = 'out_contract' then
    insert into contract_cost_entries (contract_id, cost_type, is_extra, date, description, quantity, unit, unit_price_cost, unit_price_client)
    values (p_contract_id, 'materiál', false, coalesce(p_datum, current_date), 'Materiál – ' || p.name, p_mnozstvi, coalesce(p.unit, 'ks'),
      coalesce(p.price, 0), public.prodejni_cena_materialu(p.id, coalesce(p.price, 0)));
  end if;
  return mid;
end; $$;
revoke execute on function public.skladovy_pohyb(bigint, text, bigint, numeric, bigint, date, text) from anon, public;
grant execute on function public.skladovy_pohyb(bigint, text, bigint, numeric, bigint, date, text) to authenticated;
