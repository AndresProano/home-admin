-- ============================================================
-- Migración: compras del exterior / servicios digitales
--  - profiles.iva_digital: % de IVA que el banco cobra aparte por servicios digitales
--    del exterior (Netflix, Spotify, Apple…). En Ecuador: 15%. Configurable.
--  - expenses.exterior: el gasto fue en el exterior (cuenta para el límite exento del ISD,
--    $5.188,26 al año en consumos con tarjeta).
--  - Atajo: si eliges "Suscripciones", se marca como del exterior y se agrega el IVA aparte.
-- Correr DESPUÉS de las migraciones anteriores. Idempotente.
-- ============================================================
alter table profiles add column if not exists iva_digital numeric(5,2) not null default 15;
do $$ begin
  alter table profiles add constraint profiles_iva_digital_check check (iva_digital >= 0 and iva_digital <= 50);
exception when duplicate_object then null; end $$;

alter table expenses add column if not exists exterior boolean not null default false;

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
  v_iva_pct numeric;
  v_iva numeric;
begin
  -- copia de lo que llegó (para entender el formato que manda el iPhone)
  insert into atajo_log (user_id, texto, categoria, cuenta)
  select user_id, left(p_texto, 500), left(p_category, 80), left(p_account_name, 120)
  from user_api_keys where api_key = p_api_key;

  if array_length(v_partes, 1) >= 2 then
    v_monto := coalesce(monto_de_texto(v_partes[1]), monto_de_texto(p_texto));
    v_comercio := coalesce(nullif(trim(v_partes[2]), ''), comercio_de_texto(v_partes[1]));
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
  if not v_despues and v_eleccion <> 'Efectivo / ninguna' then
    v_cuenta := regexp_replace(v_eleccion, '\s*·\s*[^·]+$', '');  -- "Pichincha · Ahorros" → "Pichincha"
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

  -- Suscripciones = servicio digital del exterior: el banco cobra aparte el IVA (15% por defecto)
  if (v_res->>'categoria') = 'Suscripciones' then
    v_id := (v_res->>'id')::uuid;
    select coalesce(p.iva_digital, 15) into v_iva_pct
    from user_api_keys k left join profiles p on p.id = k.user_id
    where k.api_key = p_api_key;
    v_iva := round(v_monto * coalesce(v_iva_pct, 15) / 100, 2);
    update expenses set exterior = true where id = v_id;
    if v_iva > 0 then
      insert into expenses (owner_id, description, amount, category, date, is_shared, payment_method, type, account_id, needs_review, exterior)
      select owner_id, left('IVA ' || description, 200), v_iva, category, date, is_shared, payment_method, 'expense', account_id, needs_review, false
      from expenses where id = v_id;
      -- mensaje con el total real (suscripción + IVA) y lo que queda del presupuesto
      v_res := v_res || jsonb_build_object('iva', v_iva, 'mensaje',
        format('$%s + IVA $%s en Suscripciones.', to_char(v_monto, 'FM999999990.00'), to_char(v_iva, 'FM999999990.00'))
        || case when jsonb_typeof(v_res->'presupuesto') = 'object' then
             case when (v_res->'presupuesto'->>'restante')::numeric - v_iva >= 0 then
               format(' %s $%s de $%s %s.',
                 case when coalesce(p_compartido, false) then 'Les quedan' else 'Te quedan' end,
                 to_char((v_res->'presupuesto'->>'restante')::numeric - v_iva, 'FM999999990.00'),
                 to_char((v_res->'presupuesto'->>'presupuesto')::numeric, 'FM999999990.00'),
                 case when v_res->'presupuesto'->>'periodo' = 'anual' then 'este año' else 'este mes' end)
             else
               format(' ¡%s $%s del presupuesto!',
                 case when coalesce(p_compartido, false) then 'Se pasaron' else 'Te pasaste' end,
                 to_char(v_iva - (v_res->'presupuesto'->>'restante')::numeric, 'FM999999990.00'))
             end
           else '' end);
    end if;
  end if;

  if v_cuenta is not null then
    v_res := v_res || jsonb_build_object('mensaje', (v_res->>'mensaje') || ' · ' || v_eleccion);
  end if;
  return (v_res || jsonb_build_object('cuenta', v_cuenta))::json;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function registrar_gasto_atajo(text, text, text, text, boolean) to anon, authenticated;
