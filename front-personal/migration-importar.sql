-- ============================================================
-- Migración: importar movimientos desde Excel
--  - importar_movimientos(filas, afectar_saldos): inserta todo de una vez (todo o nada).
--  - Si afectar_saldos = false (historial viejo), el trigger de saldos no los toca.
-- Correr DESPUÉS de las migraciones anteriores. Idempotente.
-- ============================================================

-- El trigger de saldos respeta una marca de sesión para importaciones de historial
create or replace function aplicar_movimiento_a_saldo()
returns trigger as $$
begin
  if coalesce(current_setting('app.sin_saldo', true), '') = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op in ('UPDATE', 'DELETE') and old.account_id is not null then
    update bank_accounts
    set balance = balance - (case when old.type = 'income' then old.amount else -old.amount end)
    where id = old.account_id and owner_id = old.owner_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.account_id is not null then
    update bank_accounts
    set balance = balance + (case when new.type = 'income' then new.amount else -new.amount end)
    where id = new.account_id and owner_id = new.owner_id;
  end if;

  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;

/*
  p_filas: [{ "date": "2026-11-01", "description": "Supermaxi", "amount": 45.2, "type": "expense",
             "category": "Supermercado", "account_id": "<uuid>|null", "is_shared": false }, ...]
  Corre con los permisos de quien llama (RLS): solo puede insertar a su nombre y en sus cuentas.
*/
create or replace function importar_movimientos(p_filas jsonb, p_afectar_saldos boolean default false)
returns integer as $$
declare
  v_n integer;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  if jsonb_typeof(p_filas) <> 'array' then raise exception 'Formato inválido'; end if;
  if jsonb_array_length(p_filas) > 5000 then raise exception 'Máximo 5000 movimientos por archivo'; end if;

  if not coalesce(p_afectar_saldos, false) then
    perform set_config('app.sin_saldo', 'on', true);   -- solo dura esta transacción
  end if;

  insert into expenses (owner_id, date, description, amount, type, category, account_id, is_shared, payment_method, needs_review)
  select
    auth.uid(),
    (f->>'date')::date,
    left(coalesce(nullif(trim(f->>'description'), ''), 'Importado'), 200),
    abs((f->>'amount')::numeric),
    case when f->>'type' = 'income' then 'income' else 'expense' end,
    left(coalesce(nullif(trim(f->>'category'), ''), 'Otros'), 60),
    -- solo cuentas propias; cualquier otra se ignora
    (select a.id from bank_accounts a where a.id = nullif(f->>'account_id', '')::uuid and a.owner_id = auth.uid()),
    coalesce((f->>'is_shared')::boolean, false),
    'other',
    false
  from jsonb_array_elements(p_filas) f
  where (f->>'amount') is not null and abs((f->>'amount')::numeric) > 0 and (f->>'date') is not null;

  get diagnostics v_n = row_count;
  perform set_config('app.sin_saldo', 'off', true);
  return v_n;
end;
$$ language plpgsql security invoker set search_path = public;

grant execute on function importar_movimientos(jsonb, boolean) to authenticated;
