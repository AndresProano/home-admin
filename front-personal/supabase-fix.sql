-- ============================================
-- RUN THIS TO FIX YOUR EXISTING DATABASE
-- Drops old tables, adds functions + RLS policies
-- ============================================

-- Drop old unused tables
drop table if exists cocina cascade;
drop table if exists finanzas cascade;

-- Enable RLS on all tables
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
create or replace function can_see_finance(record_owner_id uuid, record_is_shared boolean)
returns boolean as $$
  select
    record_owner_id = auth.uid()
    or (record_is_shared and record_owner_id = get_partner_id());
$$ language sql security definer;

-- ============================================
-- HOUSEHOLD policies (for kitchen sharing)
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

-- KITCHEN ITEMS policies
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
