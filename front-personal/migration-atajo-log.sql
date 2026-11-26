-- ============================================================
-- Migración: copia del texto que manda el atajo (para ajustar el formato)
-- Cada uno ve solo lo suyo.
-- Correr DESPUÉS de migration-atajo-texto.sql. Idempotente.
-- ============================================================
create table if not exists atajo_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  texto text,
  categoria text,
  cuenta text,
  creado timestamptz default now()
);
alter table atajo_log enable row level security;
drop policy if exists "Ver mis envios del atajo" on atajo_log;
create policy "Ver mis envios del atajo" on atajo_log for select using (user_id = auth.uid());

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
