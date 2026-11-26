-- ============================================================
-- Migración: seguridad (26-nov-2026)
--  1. Perfiles (nombre para mostrar): cada uno ve el suyo y el de su pareja, nadie más.
--  2. Hogares (cocina): solo los miembros los ven; unirse exige el código de invitación.
--  3. Cambiar la clave del atajo (la vieja deja de funcionar).
-- Correr en Supabase → SQL Editor. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PERFILES
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz default now()
);
alter table profiles enable row level security;

drop policy if exists "Profiles are viewable by authenticated users" on profiles;
drop policy if exists "Ver mi perfil y el de mi pareja" on profiles;
create policy "Ver mi perfil y el de mi pareja"
  on profiles for select using (id = auth.uid() or id = get_partner_id());

drop policy if exists "Users can update own profile" on profiles;
drop policy if exists "Editar mi perfil" on profiles;
create policy "Editar mi perfil" on profiles for update using (id = auth.uid());

drop policy if exists "Users can insert own profile" on profiles;
drop policy if exists "Crear mi perfil" on profiles;
create policy "Crear mi perfil" on profiles for insert with check (id = auth.uid());

-- Perfil automático al registrarse
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Perfiles de los usuarios que ya existen
insert into profiles (id, display_name, email, avatar_url)
select id,
       coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email),
       email,
       raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2. HOGARES (módulo de cocina)
-- ------------------------------------------------------------
drop policy if exists "Anyone can find household by invite code" on households;
drop policy if exists "Ver mis hogares" on households;
create policy "Ver mis hogares"
  on households for select using (created_by = auth.uid() or is_household_member(id));

-- Solo te puedes agregar tú mismo a un hogar que tú creaste; a los demás, con el código
drop policy if exists "Users can join households" on household_members;
drop policy if exists "Unirme a mi propio hogar" on household_members;
create policy "Unirme a mi propio hogar"
  on household_members for insert with check (
    user_id = auth.uid()
    and exists (select 1 from households h where h.id = household_id and h.created_by = auth.uid())
  );

create or replace function join_household(p_code text)
returns households as $$
declare
  v_h households;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  select * into v_h from households where invite_code = lower(trim(p_code));
  if v_h.id is null then raise exception 'Código de hogar no encontrado'; end if;
  insert into household_members (household_id, user_id, role)
  values (v_h.id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;
  return v_h;
end;
$$ language plpgsql security definer set search_path = public;
grant execute on function join_household(text) to authenticated;

-- ------------------------------------------------------------
-- 3. CAMBIAR LA CLAVE DEL ATAJO
-- ------------------------------------------------------------
create or replace function cambiar_mi_clave()
returns text as $$
declare
  v_clave text := encode(gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión'; end if;
  insert into user_api_keys (user_id, api_key) values (auth.uid(), v_clave)
  on conflict (user_id) do update set api_key = excluded.api_key, created_at = now();
  return v_clave;
end;
$$ language plpgsql security definer set search_path = public, extensions;
grant execute on function cambiar_mi_clave() to authenticated;
