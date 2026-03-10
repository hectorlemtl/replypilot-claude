-- Add cc_emails field to inbound_replies to track CC'd recipients
ALTER TABLE public.inbound_replies ADD COLUMN IF NOT EXISTS cc_emails TEXT[];
