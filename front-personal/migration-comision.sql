-- ============================================================
-- Migración: comisión por transferencias interbancarias (configurable)
--  - profiles.comision_interbancaria: cuánto te cobra tu banco por transferir a otro banco
--    (en Ecuador suele ser $0,40). Cada uno edita la suya.
--  - La comisión se registra como un gasto aparte (categoría "Comisiones").
-- Correr DESPUÉS de las migraciones anteriores. Idempotente.
-- ============================================================
alter table profiles add column if not exists comision_interbancaria numeric(6,2) not null default 0.40;
do $$ begin
  alter table profiles add constraint profiles_comision_check check (comision_interbancaria >= 0 and comision_interbancaria <= 50);
exception when duplicate_object then null; end $$;
