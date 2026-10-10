-- Vyrovnání záporné zásoby na místě (auto / sklad): materiál byl vydán na
-- zakázku z místa, kam se předtím nepřevedl. Buď se doplní převodem
-- (presun_zasob), nebo se rozdíl označí jako staré neevidované zásoby —
-- tahle funkce: zásoba místa se srovná na 0 a zapíše se pohyb „korekce“.
-- Náklad na zakázce se nemění (vznikl už při schválení dne).
create or replace function public.vyrovnat_zasoby(p_product_id bigint, p_misto bigint, p_poznamka text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare z record; m record; p record; kdo text; rozdil numeric;
begin
  if not (public.app_je_vedeni() or public.app_ma(array['warehouse'])) then raise exception 'Vyrovnat zásoby může jen sklad nebo vedení.'; end if;
  select * into z from sklad_zasoby where product_id = p_product_id and misto_id = p_misto for update;
  if z.product_id is null or z.mnozstvi >= 0 then raise exception 'Na tomto místě není záporná zásoba.'; end if;
  select * into m from sklad_mista where id = p_misto;
  select * into p from products where id = p_product_id;
  select name into kdo from profiles where id = auth.uid();
  rozdil := -z.mnozstvi;
  update sklad_zasoby set mnozstvi = 0, updated_at = now() where product_id = p_product_id and misto_id = p_misto;
  insert into warehouse_movements (product_name, product_id, quantity, unit, movement_type, from_location, to_location,
    do_misto_id, vehicle, created_by, note)
  values (p.name, p.id, rozdil, coalesce(p.unit, 'ks'), 'korekce', 'Staré zásoby', m.nazev, m.id,
    case when m.typ = 'auto' then m.nazev else '' end, coalesce(nullif(kdo, ''), '?'),
    coalesce(nullif(p_poznamka, ''), 'Staré neevidované zásoby — vyrovnání záporného stavu'));
  return rozdil;
end; $$;
revoke execute on function public.vyrovnat_zasoby(bigint, bigint, text) from anon, public;
grant execute on function public.vyrovnat_zasoby(bigint, bigint, text) to authenticated;
