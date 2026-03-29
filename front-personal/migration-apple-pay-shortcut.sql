-- Run this in your Supabase SQL Editor
-- Adds API key support for iOS Shortcuts Apple Pay integration

-- 1. API Keys table
CREATE TABLE IF NOT EXISTS user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  api_key text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own API key"
  ON user_api_keys FOR ALL USING (user_id = auth.uid());

-- 2. RPC function to add expense via API key (called from iOS Shortcut)
-- Uses SECURITY DEFINER to bypass RLS since the shortcut can't log in
CREATE OR REPLACE FUNCTION add_expense_via_api_key(
  p_api_key text,
  p_amount numeric,
  p_merchant text
)
RETURNS json AS $$
DECLARE
  v_user_id uuid;
  v_result json;
BEGIN
  -- Look up user by API key
  SELECT user_id INTO v_user_id
  FROM user_api_keys
  WHERE api_key = p_api_key;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Invalid API key');
  END IF;

  -- Insert expense as Apple Pay transaction
  INSERT INTO expenses (owner_id, description, amount, category, date, is_shared, payment_method, type)
  VALUES (v_user_id, p_merchant, p_amount, 'Other', current_date, false, 'apple_pay', 'expense')
  RETURNING json_build_object('id', id, 'description', description, 'amount', amount) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
