-- Add review tracking columns to inbound_replies
ALTER TABLE public.inbound_replies
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS review_iterations INTEGER DEFAULT 0;

-- Index for filtering by review_status
CREATE INDEX IF NOT EXISTS idx_inbound_replies_review_status ON public.inbound_replies (review_status);
