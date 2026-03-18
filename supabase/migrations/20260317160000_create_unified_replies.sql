-- ============================================================
-- unified_replies: Single source of truth for all cold email replies
-- Merges data from instantly-sync + ReplyPilot, deduped by dedup_key
-- ============================================================

CREATE TABLE IF NOT EXISTS public.unified_replies (
  -- Identity & dedup
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key             TEXT UNIQUE NOT NULL,
  source_system         TEXT NOT NULL DEFAULT 'instantly_sync',

  -- Source IDs
  instantly_email_id    TEXT,
  smartlead_message_id  TEXT,
  replypilot_reply_id   UUID,
  instantly_sync_id     TEXT,

  -- Lead info
  lead_email            TEXT NOT NULL,
  lead_name             TEXT,
  sender_email          TEXT,
  sender_name           TEXT,

  -- Email content
  reply_subject         TEXT,
  reply_text            TEXT,
  reply_html            TEXT,

  -- Campaign context
  campaign_id           TEXT,
  campaign_name         TEXT,
  sequence_step         INTEGER,
  thread_id             TEXT,

  -- Organization context
  company_name          TEXT,
  company_domain        TEXT,
  ein                   TEXT,
  org_state             TEXT,
  org_city              TEXT,
  org_total_emails_sent INTEGER,
  org_total_replies     INTEGER,
  org_total_positive    INTEGER,

  -- Classification (best available)
  temperature           TEXT,
  reasoning             TEXT,
  confidence            NUMERIC(3,2),
  classification_source TEXT,

  -- ReplyPilot processing status
  rp_status             TEXT,
  rp_draft_count        INTEGER,
  rp_sent_at            TIMESTAMPTZ,

  -- Signals
  is_first_reply        BOOLEAN DEFAULT false,
  wants_pdf             BOOLEAN DEFAULT false,
  simple_affirmative    BOOLEAN DEFAULT false,

  -- Original instantly-sync classification
  original_reply_category    TEXT,
  original_interest_status   TEXT,
  original_ai_interest_value TEXT,

  -- Theme tagging
  themes                TEXT[],
  primary_theme         TEXT,
  theme_confidence      NUMERIC(3,2),
  themes_generated_at   TIMESTAMPTZ,

  -- Full-text search
  search_vector         TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(reply_subject, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(reply_text, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(company_name, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(lead_name, '')), 'D')
  ) STORED,

  -- Timestamps
  received_at           TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  synced_at             TIMESTAMPTZ DEFAULT now()
);

-- Dashboard query indexes
CREATE INDEX IF NOT EXISTS idx_unified_temperature ON public.unified_replies(temperature);
CREATE INDEX IF NOT EXISTS idx_unified_received_at ON public.unified_replies(received_at);
CREATE INDEX IF NOT EXISTS idx_unified_campaign_name ON public.unified_replies(campaign_name);
CREATE INDEX IF NOT EXISTS idx_unified_company_name ON public.unified_replies(company_name);
CREATE INDEX IF NOT EXISTS idx_unified_lead_email ON public.unified_replies(lead_email);
CREATE INDEX IF NOT EXISTS idx_unified_source_system ON public.unified_replies(source_system);
CREATE INDEX IF NOT EXISTS idx_unified_primary_theme ON public.unified_replies(primary_theme);

-- GIN indexes for array/FTS
CREATE INDEX IF NOT EXISTS idx_unified_themes ON public.unified_replies USING GIN(themes);
CREATE INDEX IF NOT EXISTS idx_unified_search ON public.unified_replies USING GIN(search_vector);

-- Sync metadata table
CREATE TABLE IF NOT EXISTS public.sync_metadata (
  id TEXT PRIMARY KEY DEFAULT 'unified_replies_sync',
  last_sync_at TIMESTAMPTZ,
  last_sync_result JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.sync_metadata (id, last_sync_at) VALUES ('unified_replies_sync', NULL)
ON CONFLICT (id) DO NOTHING;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_unified_replies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_unified_replies_updated_at
  BEFORE UPDATE ON public.unified_replies
  FOR EACH ROW EXECUTE FUNCTION update_unified_replies_updated_at();

-- ============================================================
-- Views for dashboard
-- ============================================================

-- Campaign funnel
CREATE OR REPLACE VIEW public.v_campaign_funnel AS
SELECT
  campaign_name,
  COUNT(*) AS total_replies,
  COUNT(*) FILTER (WHERE temperature = 'hot') AS hot_replies,
  COUNT(*) FILTER (WHERE temperature = 'warm') AS warm_replies,
  COUNT(*) FILTER (WHERE temperature = 'simple') AS simple_replies,
  COUNT(*) FILTER (WHERE temperature = 'cold') AS cold_replies,
  COUNT(*) FILTER (WHERE temperature = 'for_later') AS for_later_replies,
  COUNT(*) FILTER (WHERE temperature = 'out_of_office') AS ooo_replies,
  COUNT(*) FILTER (WHERE temperature IN ('hot','warm','simple')) AS positive_replies,
  COUNT(*) FILTER (WHERE rp_status = 'sent') AS responses_sent,
  MIN(received_at) AS first_reply_at,
  MAX(received_at) AS last_reply_at
FROM public.unified_replies
GROUP BY campaign_name;

-- Daily reply volume
CREATE OR REPLACE VIEW public.v_daily_replies AS
SELECT
  DATE(received_at) AS reply_date,
  campaign_name,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE temperature = 'hot') AS hot,
  COUNT(*) FILTER (WHERE temperature = 'warm') AS warm,
  COUNT(*) FILTER (WHERE temperature = 'simple') AS simple,
  COUNT(*) FILTER (WHERE temperature = 'cold') AS cold,
  COUNT(*) FILTER (WHERE temperature = 'for_later') AS for_later,
  COUNT(*) FILTER (WHERE temperature = 'out_of_office') AS ooo,
  COUNT(*) FILTER (WHERE temperature IN ('hot','warm','simple')) AS positive
FROM public.unified_replies
GROUP BY DATE(received_at), campaign_name
ORDER BY reply_date;

-- Top orgs by engagement
CREATE OR REPLACE VIEW public.v_org_engagement AS
SELECT
  company_name,
  company_domain,
  ein,
  org_state,
  org_city,
  org_total_emails_sent,
  COUNT(*) AS reply_count,
  COUNT(*) FILTER (WHERE temperature IN ('hot','warm','simple')) AS positive_reply_count,
  MAX(received_at) AS last_reply_at,
  ARRAY_AGG(DISTINCT temperature) FILTER (WHERE temperature IS NOT NULL) AS temperatures_seen
FROM public.unified_replies
WHERE company_name IS NOT NULL
GROUP BY company_name, company_domain, ein, org_state, org_city, org_total_emails_sent
ORDER BY positive_reply_count DESC;

-- Weekly cohort
CREATE OR REPLACE VIEW public.v_weekly_cohort AS
SELECT
  DATE_TRUNC('week', received_at) AS reply_week,
  COUNT(*) AS total_replies,
  COUNT(*) FILTER (WHERE temperature IN ('hot','warm','simple')) AS positive_replies,
  ROUND(COUNT(*) FILTER (WHERE temperature IN ('hot','warm','simple'))::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS positive_rate_pct,
  COUNT(DISTINCT lead_email) AS unique_leads,
  COUNT(DISTINCT company_name) AS unique_orgs
FROM public.unified_replies
GROUP BY DATE_TRUNC('week', received_at)
ORDER BY reply_week;

-- Classification quality
CREATE OR REPLACE VIEW public.v_classification_quality AS
SELECT
  classification_source,
  temperature,
  COUNT(*) AS count,
  ROUND(AVG(confidence)::numeric, 2) AS avg_confidence
FROM public.unified_replies
GROUP BY classification_source, temperature
ORDER BY classification_source, count DESC;

-- Theme distribution
CREATE OR REPLACE VIEW public.v_theme_distribution AS
SELECT
  unnest(themes) AS theme,
  COUNT(*) AS reply_count,
  COUNT(*) FILTER (WHERE temperature IN ('hot','warm','simple')) AS positive_count,
  ROUND(COUNT(*) FILTER (WHERE temperature IN ('hot','warm','simple'))::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS positive_rate_pct
FROM public.unified_replies
WHERE themes IS NOT NULL
GROUP BY unnest(themes)
ORDER BY reply_count DESC;

-- Primary theme breakdown
CREATE OR REPLACE VIEW public.v_primary_theme_breakdown AS
SELECT
  primary_theme,
  temperature,
  COUNT(*) AS count
FROM public.unified_replies
WHERE primary_theme IS NOT NULL
GROUP BY primary_theme, temperature
ORDER BY primary_theme, count DESC;

-- Enable RLS but allow anon read
ALTER TABLE public.unified_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read unified_replies" ON public.unified_replies FOR SELECT USING (true);

ALTER TABLE public.sync_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read sync_metadata" ON public.sync_metadata FOR SELECT USING (true);
