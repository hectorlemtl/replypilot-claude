-- Add archived_at for soft archive functionality
ALTER TABLE inbound_replies ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

-- Add first_reply_received_at: set once when the first inbound reply for this lead_email is ingested
-- This is a thread-level indicator: "has this lead ever replied to us?"
ALTER TABLE inbound_replies ADD COLUMN IF NOT EXISTS first_reply_received_at TIMESTAMPTZ DEFAULT NULL;

-- Backfill first_reply_received_at for existing rows using received_at where is_first_reply = true
UPDATE inbound_replies SET first_reply_received_at = received_at WHERE is_first_reply = true AND first_reply_received_at IS NULL;

-- Index for fast filtering on archived_at (most queries filter WHERE archived_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_inbound_replies_archived_at ON inbound_replies (archived_at);

-- Index for sorting by updated_at (latest activity)
CREATE INDEX IF NOT EXISTS idx_inbound_replies_updated_at ON inbound_replies (updated_at DESC);
