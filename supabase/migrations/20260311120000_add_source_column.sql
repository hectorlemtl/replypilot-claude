-- Add source column to distinguish Instantly vs SmartLead replies
ALTER TABLE inbound_replies ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'instantly';

-- Add SmartLead-specific ID columns
ALTER TABLE inbound_replies ADD COLUMN IF NOT EXISTS smartlead_message_id TEXT;
ALTER TABLE inbound_replies ADD COLUMN IF NOT EXISTS smartlead_lead_id TEXT;
ALTER TABLE inbound_replies ADD COLUMN IF NOT EXISTS smartlead_campaign_id TEXT;
-- Fields needed to call SmartLead reply API (from message-history response)
ALTER TABLE inbound_replies ADD COLUMN IF NOT EXISTS smartlead_stats_id TEXT;
ALTER TABLE inbound_replies ADD COLUMN IF NOT EXISTS smartlead_reply_message_id TEXT;
ALTER TABLE inbound_replies ADD COLUMN IF NOT EXISTS smartlead_reply_time TEXT;

-- Make instantly_email_id nullable (SmartLead replies won't have one)
ALTER TABLE inbound_replies ALTER COLUMN instantly_email_id DROP NOT NULL;

-- Drop the old unique constraint on instantly_email_id and recreate as partial (only for non-null)
ALTER TABLE inbound_replies DROP CONSTRAINT IF EXISTS inbound_replies_instantly_email_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_replies_instantly_email_id_unique
  ON inbound_replies (instantly_email_id) WHERE instantly_email_id IS NOT NULL;

-- Unique constraint for SmartLead dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_replies_smartlead_message_id_unique
  ON inbound_replies (smartlead_message_id) WHERE smartlead_message_id IS NOT NULL;

-- Index for filtering by source
CREATE INDEX IF NOT EXISTS idx_inbound_replies_source ON inbound_replies (source);

-- Add source to send_attempts for routing
ALTER TABLE send_attempts ALTER COLUMN provider SET DEFAULT 'instantly';
-- (provider column already exists, we'll use 'smartlead' for SmartLead sends)
