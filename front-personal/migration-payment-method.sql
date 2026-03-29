-- Run this in your Supabase SQL Editor to add payment method and transaction type support
-- These columns support Apple Pay detection and income/expense tracking

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'other';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'expense' CHECK (type IN ('income', 'expense'));
