-- Add 'simple' to reply_temperature enum and migrate 'warm' → 'hot'
ALTER TYPE reply_temperature ADD VALUE IF NOT EXISTS 'simple';

-- Merge existing 'warm' replies into 'hot'
UPDATE inbound_replies SET temperature = 'hot' WHERE temperature = 'warm';
