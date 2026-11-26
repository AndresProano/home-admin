-- ============================================================
-- Migración: presupuesto COMPARTIDO con aporte de cada uno
-- Correr en Supabase → SQL Editor DESPUÉS de migration-presupuestos.sql.
-- Idempotente.
-- ============================================================

-- 1. Aporte de cada persona: {"<user_id>": 100, "<user_id_pareja>": 100}
--    amount sigue siendo el TOTAL (la suma), así todo lo demás funciona igual.
alter table budgets add column if not exists aportes jsonb not null default '{}'::jsonb;

-- 2. En un presupuesto compartido, tu pareja también puede editarlo o borrarlo
drop policy if exists "Editar presupuestos propios" on budgets;
drop policy if exists "Editar presupuestos propios o compartidos" on budgets;
create policy "Editar presupuestos propios o compartidos"
  on budgets for update using (owner_id = auth.uid() or (is_shared and owner_id = get_partner_id()));
drop policy if exists "Borrar presupuestos propios" on budgets;
drop policy if exists "Borrar presupuestos propios o compartidos" on budgets;
create policy "Borrar presupuestos propios o compartidos"
  on budgets for delete using (owner_id = auth.uid() or (is_shared and owner_id = get_partner_id()));

-- 2b. Un solo presupuesto compartido por categoría y periodo para la pareja
create or replace function evitar_presupuesto_compartido_duplicado()
returns trigger as $$
declare
  v_pareja uuid;
begin
  if not new.is_shared then return new; end if;
  select case when user_a = new.owner_id then user_b else user_a end into v_pareja
  from finance_partners
  where (user_a = new.owner_id or user_b = new.owner_id) and status = 'active' limit 1;
  if v_pareja is not null and exists (
    select 1 from budgets
    where is_shared and owner_id = v_pareja and category = new.category and period = new.period and id <> new.id
  ) then
    raise exception 'Tu pareja ya creó el presupuesto compartido de % (%)', new.category, new.period;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_presupuesto_compartido_unico on budgets;
create trigger trg_presupuesto_compartido_unico
  before insert or update of category, period, is_shared on budgets
  for each row execute function evitar_presupuesto_compartido_duplicado();

-- 3. Atajo: categoría 'Salidas' y parámetro opcional p_compartido
drop function if exists add_expense_via_api_key(text, numeric, text);
drop function if exists add_expense_via_api_key(text, numeric, text, text);
drop function if exists add_expense_via_api_key(text, numeric, text, text, text, text, date);

create or replace function add_expense_via_api_key(
  p_api_key text,
  p_amount numeric,
  p_merchant text,
  p_account_name text default null,
  p_category text default null,
  p_description text default null,
  p_date date default null,
  p_compartido boolean default false
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
          v_date, coalesce(p_compartido, false), 'apple_pay', 'expense', v_account_id, v_needs_review)
  returning * into v_expense;

  if v_needs_review then
    v_mensaje := format('Registrado $%s en %s. Ábrelo en la app para clasificarlo.',
                        to_char(p_amount, 'FM999999990.00'), v_expense.description);
  else
    -- presupuesto de la categoría (mensual primero, luego anual)
    if coalesce(p_compartido, false) then
      select * into v_budget from budgets
      where is_shared = true and category = v_category
        and owner_id in (v_user_id, (select case when fp.user_a = v_user_id then fp.user_b else fp.user_a end
                                     from finance_partners fp
                                     where (fp.user_a = v_user_id or fp.user_b = v_user_id) and fp.status = 'active' limit 1))
      order by (period = 'mensual') desc limit 1;
    else
      select * into v_budget from budgets
      where owner_id = v_user_id and is_shared = false and category = v_category
      order by (period = 'mensual') desc limit 1;
    end if;

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

  if coalesce(p_compartido, false) and not v_needs_review then
    v_mensaje := replace(replace(v_mensaje, 'Te quedan', 'Les quedan'), '¡Te pasaste', '¡Se pasaron') || ' (compartido)';
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

grant execute on function add_expense_via_api_key(text, numeric, text, text, text, text, date, boolean) to anon, authenticated;
