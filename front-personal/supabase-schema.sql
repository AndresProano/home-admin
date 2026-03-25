-- ============================================
-- HOUSE ORGANIZER - Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Drop existing tables (order matters due to foreign keys)
drop table if exists expenses cascade;
drop table if exists bank_accounts cascade;
drop table if exists finance_partners cascade;
drop table if exists kitchen_items cascade;
drop table if exists household_members cascade;
drop table if exists households cascade;
drop function if exists is_household_member cascade;
drop function if exists get_partner_id cascade;
drop function if exists can_see_finance cascade;

-- 1. HOUSEHOLDS (for kitchen sharing — roommates, family, anyone)
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null default substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8),
  created_by uuid references auth.users(id) not null,
  created_at timestamptz default now()
);

-- 2. HOUSEHOLD MEMBERS
create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz default now(),
  unique(household_id, user_id)
);

-- 3. KITCHEN ITEMS (linked to household)
create table kitchen_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade not null,
  name text not null,
  quantity int not null default 0,
  threshold int not null default 1,
  category text not null default 'Other',
  added_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4. FINANCE PARTNERS (private pairing — only you and your partner)
create table finance_partners (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references auth.users(id) on delete cascade not null,
  user_b uuid references auth.users(id) on delete cascade not null,
  invite_code text unique not null default substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8),
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz default now(),
  unique(user_a, user_b)
);

-- 5. BANK ACCOUNTS (personal or shared with partner)
create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  is_shared boolean not null default false,
  name text not null,
  balance numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

-- 6. EXPENSES (personal or shared with partner)
create table expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  account_id uuid references bank_accounts(id) on delete set null,
  is_shared boolean not null default false,
  description text not null,
  amount numeric(12,2) not null,
  category text not null default 'Other',
  date date not null default current_date,
  created_at timestamptz default now()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

alter table households enable row level security;
alter table household_members enable row level security;
alter table kitchen_items enable row level security;
alter table finance_partners enable row level security;
alter table bank_accounts enable row level security;
alter table expenses enable row level security;

-- Helper: check if user belongs to a household
create or replace function is_household_member(h_id uuid)
returns boolean as $$
  select exists (
    select 1 from household_members
    where household_id = h_id and user_id = auth.uid()
  );
$$ language sql security definer;

-- Helper: get the partner's user_id (returns null if no active partner)
create or replace function get_partner_id()
returns uuid as $$
  select case
    when user_a = auth.uid() then user_b
    when user_b = auth.uid() then user_a
  end
  from finance_partners
  where (user_a = auth.uid() or user_b = auth.uid())
    and status = 'active'
  limit 1;
$$ language sql security definer;

-- Helper: can user see this finance record?
-- User sees their own records + shared records from their partner
create or replace function can_see_finance(record_owner_id uuid, record_is_shared boolean)
returns boolean as $$
  select
    record_owner_id = auth.uid()  -- always see your own
    or (record_is_shared and record_owner_id = get_partner_id());  -- see partner's shared
$$ language sql security definer;

-- ============================================
-- HOUSEHOLD policies (unchanged — for kitchen)
-- ============================================
create policy "Anyone can find household by invite code"
  on households for select using (auth.uid() is not null);

create policy "Authenticated users can create households"
  on households for insert with check (auth.uid() = created_by);

create policy "Owners can update their households"
  on households for update using (
    exists (
      select 1 from household_members
      where household_id = id and user_id = auth.uid() and role = 'owner'
    )
  );

-- HOUSEHOLD MEMBERS policies
create policy "Members can view household members"
  on household_members for select using (is_household_member(household_id));

create policy "Users can join households"
  on household_members for insert with check (auth.uid() = user_id);

create policy "Users can leave households"
  on household_members for delete using (auth.uid() = user_id);

-- KITCHEN ITEMS policies (household-based)
create policy "Members can view kitchen items"
  on kitchen_items for select using (is_household_member(household_id));

create policy "Members can add kitchen items"
  on kitchen_items for insert with check (is_household_member(household_id));

create policy "Members can update kitchen items"
  on kitchen_items for update using (is_household_member(household_id));

create policy "Members can delete kitchen items"
  on kitchen_items for delete using (is_household_member(household_id));

-- ============================================
-- FINANCE PARTNER policies
-- ============================================
create policy "Users can see their partnerships"
  on finance_partners for select using (user_a = auth.uid() or user_b = auth.uid());

create policy "Users can create partner invites"
  on finance_partners for insert with check (user_a = auth.uid());

create policy "Users can update their partnerships"
  on finance_partners for update using (user_a = auth.uid() or user_b = auth.uid());

create policy "Users can delete their partnerships"
  on finance_partners for delete using (user_a = auth.uid() or user_b = auth.uid());

-- Anyone authenticated can look up a partnership by invite code (to join)
create policy "Anyone can find partnership by invite code"
  on finance_partners for select using (auth.uid() is not null);

-- ============================================
-- BANK ACCOUNT policies (personal + partner shared)
-- ============================================
create policy "Users can view own and partner shared accounts"
  on bank_accounts for select using (can_see_finance(owner_id, is_shared));

create policy "Users can create accounts"
  on bank_accounts for insert with check (auth.uid() = owner_id);

create policy "Users can update own accounts"
  on bank_accounts for update using (owner_id = auth.uid());

create policy "Users can delete own accounts"
  on bank_accounts for delete using (owner_id = auth.uid());

-- ============================================
-- EXPENSE policies (personal + partner shared)
-- ============================================
create policy "Users can view own and partner shared expenses"
  on expenses for select using (can_see_finance(owner_id, is_shared));

create policy "Users can create expenses"
  on expenses for insert with check (auth.uid() = owner_id);

create policy "Users can update own expenses"
  on expenses for update using (owner_id = auth.uid());

create policy "Users can delete own expenses"
  on expenses for delete using (owner_id = auth.uid());
