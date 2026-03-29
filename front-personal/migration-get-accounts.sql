-- Run this in Supabase SQL Editor
-- Returns a user's bank accounts by API key (for iOS Shortcuts)

CREATE OR REPLACE FUNCTION get_accounts_via_api_key(p_api_key text)
RETURNS json AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM user_api_keys
  WHERE api_key = p_api_key;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Invalid API key');
  END IF;

  RETURN (
    SELECT json_agg(json_build_object('name', name, 'balance', balance))
    FROM bank_accounts
    WHERE owner_id = v_user_id AND is_shared = false
    ORDER BY name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
