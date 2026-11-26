-- ============================================================
-- Migración: cuentas de bancos más completas + transferencias
--  - Cada cuenta: entidad (banco), subtipo (corriente, ahorros, meta, inversión, efectivo, crédito),
--    tasa anual de rendimiento, meta (monto y fecha), vencimiento (pólizas) y nota.
--  - Movimientos tipo 'transfer' entre tus cuentas (no cuentan como gasto ni ingreso):
--    poner plata en tu cuenta meta, pagar la tarjeta de crédito, etc.
-- Correr DESPUÉS de las migraciones anteriores. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cuentas
-- ------------------------------------------------------------
alter table bank_accounts add column if not exists entidad text;
alter table bank_accounts add column if not exists subtipo text;
alter table bank_accounts add column if not exists tasa_anual numeric(6,3);
alter table bank_accounts add column if not exists meta_monto numeric(12,2);
alter table bank_accounts add column if not exists meta_fecha date;
alter table bank_accounts add column if not exists vencimiento date;
alter table bank_accounts add column if not exists nota text;

update bank_accounts set subtipo = case
  when tipo = 'credito' then 'credito'
  when lower(name) like '%efectivo%' then 'efectivo'
  else 'ahorros' end
where subtipo is null;

alter table bank_accounts alter column subtipo set default 'ahorros';
alter table bank_accounts alter column subtipo set not null;
do $$ begin
  alter table bank_accounts add constraint bank_accounts_subtipo_check
    check (subtipo in ('corriente', 'ahorros', 'meta', 'inversion', 'efectivo', 'credito'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table bank_accounts add constraint bank_accounts_tasa_check check (tasa_anual is null or (tasa_anual >= 0 and tasa_anual <= 100));
exception when duplicate_object then null; end $$;

-- "tipo" (débito/crédito) se mantiene sincronizado con el subtipo
create or replace function sincronizar_tipo_cuenta()
returns trigger as $$
begin
  if new.subtipo is null then
    new.subtipo := case when new.tipo = 'credito' then 'credito' else 'ahorros' end;
  end if;
  new.tipo := case when new.subtipo = 'credito' then 'credito' else 'debito' end;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sincronizar_tipo_cuenta on bank_accounts;
create trigger trg_sincronizar_tipo_cuenta
  before insert or update of subtipo, tipo on bank_accounts
  for each row execute function sincronizar_tipo_cuenta();

-- ------------------------------------------------------------
-- 2. Transferencias
-- ------------------------------------------------------------
alter table expenses add column if not exists to_account_id uuid references bank_accounts(id) on delete set null;
alter table expenses drop constraint if exists expenses_type_check;
alter table expenses add constraint expenses_type_check check (type in ('income', 'expense', 'transfer'));
do $$ begin
  alter table expenses add constraint expenses_transfer_distinta check (to_account_id is null or account_id is null or to_account_id <> account_id);
exception when duplicate_object then null; end $$;

-- Saldos: gasto resta, ingreso suma, transferencia resta del origen y suma al destino.
create or replace function aplicar_movimiento_a_saldo()
returns trigger as $$
begin
  if coalesce(current_setting('app.sin_saldo', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  -- deshacer el efecto anterior
  if tg_op in ('UPDATE', 'DELETE') then
    if old.account_id is not null then
      update bank_accounts
      set balance = balance - (case when old.type = 'income' then old.amount else -old.amount end)
      where id = old.account_id and owner_id = old.owner_id;
    end if;
    if old.type = 'transfer' and old.to_account_id is not null then
      update bank_accounts set balance = balance - old.amount
      where id = old.to_account_id and owner_id = old.owner_id;
    end if;
  end if;

  -- aplicar el efecto nuevo
  if tg_op in ('INSERT', 'UPDATE') then
    if new.account_id is not null then
      update bank_accounts
      set balance = balance + (case when new.type = 'income' then new.amount else -new.amount end)
      where id = new.account_id and owner_id = new.owner_id;
    end if;
    if new.type = 'transfer' and new.to_account_id is not null then
      update bank_accounts set balance = balance + new.amount
      where id = new.to_account_id and owner_id = new.owner_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_movimiento_saldo on expenses;
create trigger trg_movimiento_saldo
  after insert or delete or update of amount, type, account_id, to_account_id on expenses
  for each row execute function aplicar_movimiento_a_saldo();

-- ------------------------------------------------------------
-- 3. Atajo: etiquetas con el tipo de cuenta ("Pichincha · Ahorros", "Visa · Crédito")
-- ------------------------------------------------------------
create or replace function etiqueta_subtipo(p_subtipo text)
returns text as $$
  select case p_subtipo
    when 'corriente' then 'Corriente' when 'ahorros' then 'Ahorros' when 'meta' then 'Meta'
    when 'inversion' then 'Inversión' when 'efectivo' then 'Efectivo' when 'credito' then 'Crédito'
    else 'Débito' end;
$$ language sql immutable;

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
    select coalesce(json_agg(e order by o, e), '[]'::json)
    from (
      select name || ' · ' || etiqueta_subtipo(subtipo) as e,
             case subtipo when 'credito' then 2 when 'efectivo' then 3 when 'meta' then 4 else 1 end as o
      from bank_accounts where owner_id = v_user and subtipo <> 'inversion'
      union all select 'Efectivo / ninguna', 8
      union all select 'Elegir después', 9
    ) x
  );
end;
$$ language plpgsql stable security definer set search_path = public;
grant execute on function cuentas_atajo(text) to anon, authenticated;

-- Quitar la etiqueta de tipo, sea cual sea
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

  if v_cuenta is not null then
    v_res := v_res || jsonb_build_object('mensaje', (v_res->>'mensaje') || ' · ' || v_eleccion);
  end if;
  return (v_res || jsonb_build_object('cuenta', v_cuenta))::json;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function registrar_gasto_atajo(text, text, text, text, boolean) to anon, authenticated;
