-- ============================================================
-- Migración: el atajo de iPhone manda TEXTO libre ("$12,50 Starbucks")
-- y la base saca el monto y el comercio. Así el atajo instalable no
-- necesita armar nada: solo reenvía lo que le da la automatización.
-- Correr en Supabase → SQL Editor DESPUÉS de las migraciones anteriores.
-- Idempotente.
-- ============================================================

-- Monto dentro de un texto: acepta "12.50", "12,50", "$1.234,56", "USD 1,234.56", "12"
create or replace function monto_de_texto(p_texto text)
returns numeric as $$
declare
  v_tok text;
  v_ult int;
  v_dec text;
  v_ent text;
begin
  v_tok := substring(coalesce(p_texto, '') from '[0-9][0-9.,]*');
  if v_tok is null then return null; end if;
  v_tok := regexp_replace(v_tok, '[.,]+$', '');            -- "12." → "12"
  -- el último separador es decimal si le siguen 1 o 2 dígitos
  if v_tok ~ '[.,][0-9]{1,2}$' then
    v_ult := length(v_tok) - length(substring(v_tok from '[.,][0-9]{1,2}$')) + 1;
    v_ent := regexp_replace(substr(v_tok, 1, v_ult - 1), '[.,]', '', 'g');
    v_dec := substr(v_tok, v_ult + 1);
    return (coalesce(nullif(v_ent, ''), '0') || '.' || v_dec)::numeric;
  end if;
  return regexp_replace(v_tok, '[.,]', '', 'g')::numeric;
end;
$$ language plpgsql immutable;

-- Comercio: el texto sin el monto ni símbolos de moneda
create or replace function comercio_de_texto(p_texto text)
returns text as $$
  select nullif(trim(regexp_replace(
           regexp_replace(coalesce(p_texto, ''), '(US\$|USD|\$|€)?\s*[0-9][0-9.,]*', '', 'i'),
           '\s+', ' ', 'g')), '');
$$ language sql immutable;

create or replace function registrar_gasto_atajo(
  p_api_key text,
  p_texto text,
  p_category text default null,
  p_account_name text default null,
  p_compartido boolean default false
)
returns json as $$
declare
  v_monto numeric := monto_de_texto(p_texto);
begin
  if v_monto is null or v_monto <= 0 then
    return json_build_object('error', 'Monto no encontrado',
      'mensaje', format('No encontré el monto en "%s". Ábrelo en la app y regístralo con +.', left(coalesce(p_texto, ''), 60)));
  end if;
  return add_expense_via_api_key(
    p_api_key,
    v_monto,
    coalesce(comercio_de_texto(p_texto), 'Apple Pay'),
    nullif(trim(p_account_name), ''),
    nullif(nullif(trim(p_category), ''), 'Después'),
    null,
    null,
    coalesce(p_compartido, false));
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function registrar_gasto_atajo(text, text, text, text, boolean) to anon, authenticated;
