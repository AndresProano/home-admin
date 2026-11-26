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

-- Cada cuenta puede tener el nombre de su tarjeta en Wallet (ej: "Visa Pichincha")
alter table bank_accounts add column if not exists tarjeta text;

-- Cuenta del usuario que corresponde a una tarjeta de Wallet:
-- 1) su "tarjeta" aparece en el nombre de la tarjeta, o 2) el nombre de la cuenta aparece en él.
create or replace function cuenta_de_tarjeta(p_user uuid, p_tarjeta text)
returns uuid as $$
  select id from bank_accounts
  where owner_id = p_user and nullif(trim(p_tarjeta), '') is not null
    and (
      (nullif(trim(tarjeta), '') is not null and position(lower(trim(tarjeta)) in lower(p_tarjeta)) > 0)
      or position(lower(trim(name)) in lower(p_tarjeta)) > 0
    )
  order by (nullif(trim(tarjeta), '') is not null) desc, length(coalesce(tarjeta, name)) desc
  limit 1;
$$ language sql stable security definer set search_path = public;
revoke execute on function cuenta_de_tarjeta(uuid, text) from public, anon, authenticated;

drop function if exists registrar_gasto_atajo(text, text, text, text, boolean);

/*
  p_texto: lo que manda la automatización. Formatos:
    "Importe | Comercio | Tarjeta"  (recomendado: la cuenta sale de la tarjeta)
    "$12,50 Starbucks"              (texto libre, ej. cuando lo ejecutas a mano)
  p_account_name: opcional, fuerza una cuenta por nombre.
*/
create or replace function registrar_gasto_atajo(
  p_api_key text,
  p_texto text,
  p_category text default null,
  p_account_name text default null,
  p_compartido boolean default false
)
returns json as $$
declare
  v_partes text[] := string_to_array(coalesce(p_texto, ''), '|');
  v_monto numeric;
  v_comercio text;
  v_tarjeta text;
  v_user uuid;
  v_cuenta text := nullif(trim(p_account_name), '');
  v_res jsonb;
begin
  if array_length(v_partes, 1) >= 2 then
    v_monto := monto_de_texto(v_partes[1]);
    v_comercio := nullif(trim(v_partes[2]), '');
    v_tarjeta := nullif(trim(v_partes[3]), '');
  else
    v_monto := monto_de_texto(p_texto);
    v_comercio := comercio_de_texto(p_texto);
  end if;

  if v_monto is null or v_monto <= 0 then
    return json_build_object('error', 'Monto no encontrado',
      'mensaje', format('No encontré el monto en "%s". Ábrelo en la app y regístralo con +.', left(coalesce(p_texto, ''), 60)));
  end if;

  -- cuenta a partir de la tarjeta con la que pagaste
  if v_cuenta is null and v_tarjeta is not null then
    select user_id into v_user from user_api_keys where api_key = p_api_key;
    if v_user is not null then
      select name into v_cuenta from bank_accounts where id = cuenta_de_tarjeta(v_user, v_tarjeta);
    end if;
  end if;

  v_res := add_expense_via_api_key(
    p_api_key, v_monto, coalesce(v_comercio, 'Apple Pay'), v_cuenta,
    nullif(nullif(trim(p_category), ''), 'Después'), null, null, coalesce(p_compartido, false))::jsonb;

  if v_res ? 'error' then return v_res::json; end if;

  v_res := v_res || jsonb_build_object('cuenta', v_cuenta, 'tarjeta', v_tarjeta);
  if v_cuenta is null and v_tarjeta is not null then
    v_res := v_res || jsonb_build_object('mensaje',
      (v_res->>'mensaje') || format(' No sé de qué cuenta es "%s": elígela en la app.', v_tarjeta));
  end if;
  return v_res::json;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function registrar_gasto_atajo(text, text, text, text, boolean) to anon, authenticated;
