-- Run this in Supabase SQL Editor
-- Updates the shortcut function to deduct from a chosen bank account

CREATE OR REPLACE FUNCTION add_expense_via_api_key(
  p_api_key text,
  p_amount numeric,
  p_merchant text,
  p_account_name text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_user_id uuid;
  v_account_id uuid;
  v_result json;
BEGIN
  -- Look up user by API key
  SELECT user_id INTO v_user_id
  FROM user_api_keys
  WHERE api_key = p_api_key;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Invalid API key');
  END IF;

  -- Find account by name (case-insensitive)
  IF p_account_name IS NOT NULL AND p_account_name != '' THEN
    SELECT id INTO v_account_id
    FROM bank_accounts
    WHERE owner_id = v_user_id AND lower(name) = lower(p_account_name)
    LIMIT 1;
  END IF;

  -- Insert expense linked to account
  INSERT INTO expenses (owner_id, description, amount, category, date, is_shared, payment_method, type, account_id)
  VALUES (v_user_id, p_merchant, p_amount, 'Other', current_date, false, 'apple_pay', 'expense', v_account_id)
  RETURNING json_build_object('id', id, 'description', description, 'amount', amount) INTO v_result;

  -- Deduct from account balance if found
  IF v_account_id IS NOT NULL THEN
    UPDATE bank_accounts
    SET balance = balance - p_amount
    WHERE id = v_account_id;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
