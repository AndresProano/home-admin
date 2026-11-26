-- ============================================================
-- Migración: presupuestos + gastos por clasificar + saldos en BD
-- Correr UNA vez en Supabase → SQL Editor (después de las migraciones anteriores).
-- Es idempotente: se puede volver a correr sin romper nada.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Zona horaria: "hoy" en Ecuador (Supabase corre en UTC)
-- ------------------------------------------------------------
create or replace function hoy_ec()
returns date as $$
  select (now() at time zone 'America/Guayaquil')::date;
$$ language sql stable;

-- ------------------------------------------------------------
-- 1. Seguridad de parejas
--    Antes, cualquier usuario con sesión podía listar TODAS las invitaciones
--    (y sus códigos). Ahora solo ves las tuyas y unirse va por una función.
-- ------------------------------------------------------------
drop policy if exists "Anyone can find partnership by invite code" on finance_partners;
alter table finance_partners alter column user_b drop not null;

create or replace function join_partner(p_code text)
returns finance_partners as $$
declare
  v_row finance_partners;
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  select * into v_row
  from finance_partners
  where invite_code = lower(trim(p_code)) and status = 'pending'
  for update;

  if v_row.id is null then
    raise exception 'Código no encontrado o ya usado';
  end if;
  if v_row.user_a = auth.uid() then
    raise exception 'No puedes unirte a tu propia invitación';
  end if;

  update finance_partners
  set user_b = auth.uid(), status = 'active'
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function join_partner(text) to authenticated;

-- ------------------------------------------------------------
-- 2. Gastos "por clasificar" (los que llegan del atajo sin categoría)
-- ------------------------------------------------------------
alter table expenses add column if not exists needs_review boolean not null default false;
alter table expenses alter column date set default hoy_ec();

-- Categorías a español (las viejas estaban en inglés)
update expenses set category = case category
  when 'Food' then 'Comida'
  when 'Transport' then 'Transporte'
  when 'Utilities' then 'Servicios'
  when 'Rent' then 'Arriendo'
  when 'Entertainment' then 'Entretenimiento'
  when 'Health' then 'Salud'
  when 'Shopping' then 'Compras'
  when 'Education' then 'Educación'
  when 'Other' then 'Otros'
  else category end
where category in ('Food','Transport','Utilities','Rent','Entertainment','Health','Shopping','Education','Other');

alter table expenses alter column category set default 'Otros';

-- ------------------------------------------------------------
-- 3. Saldos calculados por la base de datos
--    Un trigger ajusta bank_accounts.balance al crear, editar o borrar
--    un movimiento. Así la app y el atajo nunca se pisan.
-- ------------------------------------------------------------
create or replace function aplicar_movimiento_a_saldo()
returns trigger as $$
begin
  -- deshacer el efecto anterior
  if tg_op in ('UPDATE', 'DELETE') and old.account_id is not null then
    update bank_accounts
    set balance = balance - (case when old.type = 'income' then old.amount else -old.amount end)
    where id = old.account_id and owner_id = old.owner_id;
  end if;

  -- aplicar el efecto nuevo
  if tg_op in ('INSERT', 'UPDATE') and new.account_id is not null then
    update bank_accounts
    set balance = balance + (case when new.type = 'income' then new.amount else -new.amount end)
    where id = new.account_id and owner_id = new.owner_id;
  end if;

  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_movimiento_saldo on expenses;
create trigger trg_movimiento_saldo
  after insert or delete or update of amount, type, account_id on expenses
  for each row execute function aplicar_movimiento_a_saldo();

-- ------------------------------------------------------------
-- 4. Presupuestos (mensual o anual, por categoría o 'Total')
-- ------------------------------------------------------------
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  is_shared boolean not null default false,
  category text not null,               -- una categoría o 'Total' (todo el gasto)
  period text not null check (period in ('mensual', 'anual')),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz default now(),
  unique (owner_id, is_shared, category, period)
);

alter table budgets enable row level security;

drop policy if exists "Ver presupuestos propios y compartidos" on budgets;
create policy "Ver presupuestos propios y compartidos"
  on budgets for select using (can_see_finance(owner_id, is_shared));
drop policy if exists "Crear presupuestos propios" on budgets;
create policy "Crear presupuestos propios"
  on budgets for insert with check (owner_id = auth.uid());
drop policy if exists "Editar presupuestos propios" on budgets;
create policy "Editar presupuestos propios"
  on budgets for update using (owner_id = auth.uid());
drop policy if exists "Borrar presupuestos propios" on budgets;
create policy "Borrar presupuestos propios"
  on budgets for delete using (owner_id = auth.uid());

-- Cuánto se ha gastado contra un presupuesto en el periodo que contiene p_fecha
create or replace function gastado_en_presupuesto(p_budget budgets, p_fecha date)
returns numeric as $$
  select coalesce(sum(e.amount), 0)
  from expenses e
  where e.type = 'expense'
    and e.needs_review = false
    and (p_budget.category = 'Total' or e.category = p_budget.category)
    and e.date >= date_trunc(case when p_budget.period = 'anual' then 'year' else 'month' end, p_fecha)::date
    and e.date <  (date_trunc(case when p_budget.period = 'anual' then 'year' else 'month' end, p_fecha)
                   + case when p_budget.period = 'anual' then interval '1 year' else interval '1 month' end)::date
    and (
      (not p_budget.is_shared and e.owner_id = p_budget.owner_id and e.is_shared = false)
      or (p_budget.is_shared and e.is_shared = true and e.owner_id in (
            p_budget.owner_id,
            (select case when fp.user_a = p_budget.owner_id then fp.user_b else fp.user_a end
             from finance_partners fp
             where (fp.user_a = p_budget.owner_id or fp.user_b = p_budget.owner_id) and fp.status = 'active'
             limit 1)))
    );
$$ language sql stable security definer set search_path = public;

-- ------------------------------------------------------------
-- 5. Atajo de iPhone (Apple Pay)
--    Reemplaza las versiones anteriores. Ahora acepta categoría, descripción
--    y fecha opcionales, y devuelve un 'mensaje' listo para la notificación.
-- ------------------------------------------------------------
drop function if exists add_expense_via_api_key(text, numeric, text);
drop function if exists add_expense_via_api_key(text, numeric, text, text);

create or replace function add_expense_via_api_key(
  p_api_key text,
  p_amount numeric,
  p_merchant text,
  p_account_name text default null,
  p_category text default null,
  p_description text default null,
  p_date date default null
)
returns json as $$
declare
  v_user_id uuid;
  v_account_id uuid;
  v_category text;
  v_needs_review boolean;
  v_date date := coalesce(p_date, hoy_ec());
  v_expense expenses;
  v_budget budgets;
  v_gastado numeric;
  v_mensaje text;
  v_presupuesto json := null;
  v_categorias text[] := array['Comida','Supermercado','Transporte','Servicios','Arriendo',
    'Entretenimiento','Salidas','Salud','Compras','Educación','Suscripciones','Otros'];
begin
  select user_id into v_user_id from user_api_keys where api_key = p_api_key;
  if v_user_id is null then
    return json_build_object('error', 'API key inválida', 'mensaje', 'No se pudo registrar: API key inválida');
  end if;

  if p_amount is null or p_amount <= 0 then
    return json_build_object('error', 'Monto inválido', 'mensaje', 'No se pudo registrar: monto inválido');
  end if;

  if nullif(trim(p_account_name), '') is not null then
    select id into v_account_id from bank_accounts
    where owner_id = v_user_id and lower(name) = lower(trim(p_account_name))
    limit 1;
  end if;

  -- categoría: se acepta sin importar mayúsculas; si no viene o no existe → por clasificar
  select c into v_category from unnest(v_categorias) c
  where lower(c) = lower(trim(coalesce(p_category, ''))) limit 1;
  v_needs_review := v_category is null;

  insert into expenses (owner_id, description, amount, category, date, is_shared,
                        payment_method, type, account_id, needs_review)
  values (v_user_id,
          coalesce(nullif(trim(p_description), ''), nullif(trim(p_merchant), ''), 'Apple Pay'),
          p_amount,
          coalesce(v_category, 'Sin clasificar'),
          v_date, false, 'apple_pay', 'expense', v_account_id, v_needs_review)
  returning * into v_expense;

  if v_needs_review then
    v_mensaje := format('Registrado $%s en %s. Ábrelo en la app para clasificarlo.',
                        to_char(p_amount, 'FM999999990.00'), v_expense.description);
  else
    -- presupuesto de la categoría (mensual primero, luego anual)
    select * into v_budget from budgets
    where owner_id = v_user_id and is_shared = false and category = v_category
    order by (period = 'mensual') desc limit 1;

    if v_budget.id is not null then
      v_gastado := gastado_en_presupuesto(v_budget, v_date);
      v_presupuesto := json_build_object(
        'categoria', v_category, 'periodo', v_budget.period,
        'presupuesto', v_budget.amount, 'gastado', v_gastado,
        'restante', v_budget.amount - v_gastado);
      v_mensaje := case
        when v_budget.amount - v_gastado >= 0 then
          format('$%s en %s. Te quedan $%s de $%s %s.',
                 to_char(p_amount, 'FM999999990.00'), v_category,
                 to_char(v_budget.amount - v_gastado, 'FM999999990.00'),
                 to_char(v_budget.amount, 'FM999999990.00'),
                 case when v_budget.period = 'anual' then 'este año' else 'este mes' end)
        else
          format('$%s en %s. ¡Te pasaste $%s del presupuesto %s!',
                 to_char(p_amount, 'FM999999990.00'), v_category,
                 to_char(v_gastado - v_budget.amount, 'FM999999990.00'),
                 case when v_budget.period = 'anual' then 'anual' else 'del mes' end)
      end;
    else
      v_mensaje := format('Registrado $%s en %s.', to_char(p_amount, 'FM999999990.00'), v_category);
    end if;
  end if;

  return json_build_object(
    'id', v_expense.id,
    'monto', v_expense.amount,
    'descripcion', v_expense.description,
    'categoria', v_expense.category,
    'por_clasificar', v_needs_review,
    'presupuesto', v_presupuesto,
    'mensaje', v_mensaje);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function add_expense_via_api_key(text, numeric, text, text, text, text, date) to anon, authenticated;

-- La función de cálculo es interna: nadie la llama directo desde la API
revoke execute on function gastado_en_presupuesto(budgets, date) from public, anon, authenticated;
