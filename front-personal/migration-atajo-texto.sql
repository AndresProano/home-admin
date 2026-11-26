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

-- Limpieza: se descartó reconocer la cuenta por la tarjeta (la eliges tú en cada pago)
drop function if exists cuenta_de_tarjeta(uuid, text);
alter table bank_accounts drop column if exists tarjeta;

-- Tipo de cuenta: débito (banco, efectivo: el gasto baja el saldo)
-- o crédito (tarjeta de crédito: el gasto sube la deuda; su saldo negativo = lo que debes)
alter table bank_accounts add column if not exists tipo text not null default 'debito';
do $$ begin
  alter table bank_accounts add constraint bank_accounts_tipo_check check (tipo in ('debito', 'credito'));
exception when duplicate_object then null; end $$;

-- Etiqueta que ve el atajo: "Pichincha · Débito"
create or replace function etiqueta_cuenta(p_nombre text, p_tipo text)
returns text as $$
  select p_nombre || ' · ' || case when p_tipo = 'credito' then 'Crédito' else 'Débito' end;
$$ language sql immutable;

-- Lista de cuentas para el menú "¿De qué cuenta salió?" del atajo
create or replace function cuentas_atajo(p_api_key text)
returns json as $$
declare
  v_user uuid;
begin
  select user_id into v_user from user_api_keys where api_key = p_api_key;
  if v_user is null then
    return json_build_array('Clave inválida: revisa el atajo');
  end if;
  return (
    select coalesce(json_agg(e order by o), '[]'::json)
    from (
      select etiqueta_cuenta(name, tipo) as e, 0 as o from bank_accounts where owner_id = v_user
      union all select 'Efectivo / ninguna', 1
      union all select 'Elegir después', 2
    ) x
  );
end;
$$ language plpgsql stable security definer set search_path = public;
grant execute on function cuentas_atajo(text) to anon, authenticated;

drop function if exists registrar_gasto_atajo(text, text, text, text, boolean);

/*
  p_texto: lo que manda la automatización: "Importe | Comercio" (o texto libre "12,50 almuerzo").
  p_category: categoría elegida (o "Después").
  p_account_name: la cuenta elegida en el atajo ("Pichincha · Débito"), "Efectivo / ninguna" o "Elegir después".
  Si eliges "después" la cuenta o la categoría, el gasto queda por clasificar y la app te lo pregunta.
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
  v_eleccion text := nullif(trim(coalesce(p_account_name, '')), '');
  v_cuenta text;
  v_despues boolean;
  v_user uuid;
  v_res jsonb;
  v_id uuid;
begin
  if array_length(v_partes, 1) >= 2 then
    v_monto := monto_de_texto(v_partes[1]);
    v_comercio := nullif(trim(v_partes[2]), '');
  else
    v_monto := monto_de_texto(p_texto);
    v_comercio := comercio_de_texto(p_texto);
  end if;

  if v_monto is null or v_monto <= 0 then
    return json_build_object('error', 'Monto no encontrado',
      'mensaje', format('No encontré el monto en "%s". Ábrelo en la app y regístralo con +.', left(coalesce(p_texto, ''), 60)));
  end if;

  -- "Pichincha · Débito" → "Pichincha"
  v_despues := v_eleccion is null or v_eleccion ilike 'elegir después%';
  if not v_despues and v_eleccion not ilike 'efectivo%' then
    v_cuenta := regexp_replace(v_eleccion, '\s*·\s*(Débito|Crédito)$', '');
  end if;

  v_res := add_expense_via_api_key(
    p_api_key, v_monto, coalesce(v_comercio, 'Apple Pay'), v_cuenta,
    nullif(nullif(trim(p_category), ''), 'Después'), null, null, coalesce(p_compartido, false))::jsonb;

  if v_res ? 'error' then return v_res::json; end if;

  -- cuenta "para después" → también queda por clasificar
  if v_despues and not coalesce((v_res->>'por_clasificar')::boolean, false) then
    v_id := (v_res->>'id')::uuid;
    update expenses set needs_review = true where id = v_id;
    v_res := v_res || jsonb_build_object('por_clasificar', true,
      'mensaje', (v_res->>'mensaje') || ' Elige la cuenta en la app.');
  end if;

  if v_cuenta is not null then
    v_res := v_res || jsonb_build_object('mensaje', (v_res->>'mensaje') || ' · ' || v_eleccion);
  end if;
  return (v_res || jsonb_build_object('cuenta', v_cuenta))::json;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function registrar_gasto_atajo(text, text, text, text, boolean) to anon, authenticated;
