-- Add actual sender fields (from Instantly API, may differ from lead)
ALTER TABLE inbound_replies ADD COLUMN IF NOT EXISTS sender_email text;
ALTER TABLE inbound_replies ADD COLUMN IF NOT EXISTS sender_name text;
