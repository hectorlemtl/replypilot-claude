# Analytics Dashboard Build — Implementation Prompt

## Context

We operate a cold email outreach system for Zeffy (100% free nonprofit fundraising platform), targeting PayPal and Eventbrite nonprofit users. The system spans **two Supabase projects** and multiple services:

### Data Sources

**Instantly-sync Supabase** (`jboztldsqfyvjdanaeor`) — The authoritative dataset
- `campaign_emails_sent` — 182K+ outbound emails (full history since Nov 2025)
- `campaign_replies` — 4,557 replies with basic classification (41.6% are "unknown")
- `campaign_orgs_summary` — 42K+ organizations with aggregated stats
- `contact_enrichment` — 305K+ enriched contacts

**ReplyPilot Supabase** (`wuepkorqdnabfxtynytf`) — AI-powered reply processing (since Mar 8, 2026)
- `inbound_replies` — 1,204 replies with rich Claude AI classification (temperature, reasoning, sentiment)
- `draft_versions` — AI-generated draft responses
- `audit_logs` — Full event trail (draft_generated, approved, sent, etc.)
- `campaigns`, `kb_articles`, `prompt_templates`

### Current Problems
1. **Instantly-sync classification is weak** — 41.6% of replies are "unknown". The `classifyReply()` function uses simple keyword matching + Instantly's native `i_status`/`ai_interest_value` fields.
2. **Data is split** — Full funnel lives in Instantly-sync, rich AI classification lives in ReplyPilot. No single source of truth.
3. **No real analytics** — Current ReplyPilot analytics page has 8 basic KPI cards and 2 charts from only 1,204 recent replies.
4. **899 overlapping replies** exist in both projects (matched by `instantly_email_id`). 222 SmartLead-only replies exist only in ReplyPilot.

---

## Phase 1: Improve Classification in Instantly-sync

### 1A. Upgrade `classifyReply()` function (ongoing)

**Current implementation** (instantly-sync.ts, lines 59-75):
```typescript
function classifyReply(iStatus, aiInterest, body): string {
  // Simple keyword matching → "hot"/"warm"/"negative"/"auto_reply"/"unsubscribe"/"unknown"
}
```

**Upgrade to a 2-stage classifier** (same pattern as ReplyPilot):

**Stage 1 — Deterministic patterns** (fast, zero cost):
```
out_of_office  → /out of office|ooo|vacation|away from|auto.?reply|automatic reply|currently unavailable|on leave|return on/i
unsubscribe    → /unsubscribe|remove me|stop email|opt.?out|do not contact/i
bounce         → /undeliverable|mailbox full|address rejected|no such user|delivery failed/i
auto_reply     → /auto.?generated|do not reply|this is an automated/i
```

**Stage 2 — Claude AI classification** (for everything else):
- Use Claude Sonnet (claude-sonnet-4-20250514) with tool use
- Temperature categories: `hot`, `warm`, `simple`, `cold`, `for_later`, `out_of_office`
- Output: `{ temperature: string, reasoning: string, confidence: number }`
- Store reasoning in a new `classification_reasoning` column on `campaign_replies`

**Schema change for `campaign_replies`:**
```sql
ALTER TABLE campaign_replies ADD COLUMN IF NOT EXISTS ai_temperature TEXT;
ALTER TABLE campaign_replies ADD COLUMN IF NOT EXISTS ai_reasoning TEXT;
ALTER TABLE campaign_replies ADD COLUMN IF NOT EXISTS ai_classified_at TIMESTAMPTZ;
ALTER TABLE campaign_replies ADD COLUMN IF NOT EXISTS classification_version TEXT DEFAULT 'v1';
```

**Classification prompt** — Use the same system prompt from ReplyPilot's `prompt_templates` table (template_type = 'classification'). Key rules:
- Analyze the reply text in context of cold email outreach for a free nonprofit platform
- Hot = wants to switch, requests demo/call, asks how to sign up
- Warm = asks questions, forwards to decision-maker, requests more info
- Simple = short affirmative ("yes", "sounds good", "tell me more")
- Cold = not interested, objection, wrong fit
- For_later = explicit deferral ("ask me in Q3", "not right now but maybe later")
- Out_of_office = away, vacation, leave

### 1B. One-time backfill script

Reclassify all 1,894 "unknown" replies + all replies where `ai_temperature IS NULL`.

**Implementation:**
- Trigger.dev task: `backfill-classification`
- Batch size: 50 replies per Claude API call (use batch mode if available)
- Rate limit: respect Anthropic API limits
- Idempotent: skip if `ai_classified_at IS NOT NULL` and `classification_version = 'v2'`
- Log: write results to `campaign_replies` columns listed above
- Progress tracking: log every 100 replies processed

**Validation after backfill:**
- Query: `SELECT ai_temperature, COUNT(*) FROM campaign_replies GROUP BY ai_temperature`
- Expect: <5% null/unknown after backfill
- Spot-check: randomly sample 20 replies per category, verify classification makes sense

---

## Phase 2: Merged Replies Table in ReplyPilot

### 2A. Schema design

Create in ReplyPilot Supabase (`wuepkorqdnabfxtynytf`):

```sql
CREATE TABLE unified_replies (
  -- Identity & dedup
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedup_key             TEXT UNIQUE NOT NULL,  -- "instantly:{instantly_email_id}" or "smartlead:{smartlead_message_id}"
  source_system         TEXT NOT NULL,         -- 'instantly_sync' | 'replypilot' | 'both'

  -- Source IDs (for traceability)
  instantly_email_id    TEXT,
  smartlead_message_id  TEXT,
  replypilot_reply_id   UUID,                  -- FK to inbound_replies.id if exists
  instantly_sync_id     TEXT,                   -- ID from campaign_replies if exists

  -- Lead info
  lead_email            TEXT NOT NULL,
  lead_name             TEXT,
  sender_email          TEXT,
  sender_name           TEXT,

  -- Email content
  reply_subject         TEXT,
  reply_text            TEXT,
  reply_html            TEXT,

  -- Campaign context (from instantly-sync)
  campaign_id           TEXT,
  campaign_name         TEXT,
  sequence_step         INTEGER,
  thread_id             TEXT,

  -- Organization context (from campaign_orgs_summary)
  company_name          TEXT,
  company_domain        TEXT,
  ein                   TEXT,
  org_state             TEXT,
  org_city              TEXT,
  org_total_emails_sent INTEGER,
  org_total_replies     INTEGER,
  org_total_positive    INTEGER,

  -- Classification (BEST AVAILABLE — prefer ReplyPilot > AI-upgraded instantly-sync > original)
  temperature           TEXT,          -- hot/warm/simple/cold/for_later/out_of_office
  reasoning             TEXT,          -- AI reasoning
  confidence            NUMERIC(3,2), -- 0.00-1.00
  classification_source TEXT,          -- 'replypilot_claude' | 'instantly_sync_claude' | 'instantly_sync_keyword' | 'unclassified'

  -- ReplyPilot processing status (null if never processed by ReplyPilot)
  rp_status             TEXT,          -- awaiting_review/sent/skipped/failed/manual_review/etc.
  rp_draft_count        INTEGER,
  rp_sent_at            TIMESTAMPTZ,

  -- Signals
  is_first_reply        BOOLEAN DEFAULT false,
  wants_pdf             BOOLEAN DEFAULT false,
  simple_affirmative    BOOLEAN DEFAULT false,

  -- Instantly-sync original classification (preserve for comparison)
  original_reply_category    TEXT,     -- hot/warm/negative/unknown/etc.
  original_interest_status   TEXT,
  original_ai_interest_value TEXT,

  -- Theme tagging (AI-generated, for exploration & analysis)
  themes                TEXT[],        -- e.g. ['pricing_question', 'board_approval_needed', 'already_switching']
  primary_theme         TEXT,          -- the dominant theme for this reply
  theme_confidence      NUMERIC(3,2), -- 0.00-1.00
  themes_generated_at   TIMESTAMPTZ,  -- when themes were last computed

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
  synced_at             TIMESTAMPTZ DEFAULT now()  -- last sync timestamp
);

-- Indexes for dashboard queries
CREATE INDEX idx_unified_replies_temperature ON unified_replies(temperature);
CREATE INDEX idx_unified_replies_received_at ON unified_replies(received_at);
CREATE INDEX idx_unified_replies_campaign_name ON unified_replies(campaign_name);
CREATE INDEX idx_unified_replies_company_name ON unified_replies(company_name);
CREATE INDEX idx_unified_replies_lead_email ON unified_replies(lead_email);
CREATE INDEX idx_unified_replies_dedup_key ON unified_replies(dedup_key);
CREATE INDEX idx_unified_replies_source_system ON unified_replies(source_system);

-- Theme & search indexes
CREATE INDEX idx_unified_replies_themes ON unified_replies USING GIN(themes);
CREATE INDEX idx_unified_replies_primary_theme ON unified_replies(primary_theme);
CREATE INDEX idx_unified_replies_search ON unified_replies USING GIN(search_vector);
```

### 2B. Dedup strategy

**The `dedup_key` is the single source of truth for uniqueness:**

| Source | dedup_key format | Logic |
|--------|-----------------|-------|
| Instantly reply (both projects) | `instantly:{instantly_email_id}` | Match on instantly_email_id across both tables |
| SmartLead reply (ReplyPilot only) | `smartlead:{smartlead_message_id}` | Unique, no overlap possible |

**Merge priority for overlapping records** (899 replies with same `instantly_email_id`):
1. **Classification** → Prefer ReplyPilot's Claude classification (richer: temperature + reasoning + sentiment)
2. **Campaign metadata** → Take from Instantly-sync (campaign_name, sequence_step, company_name, org stats)
3. **Processing status** → Take from ReplyPilot (rp_status, rp_draft_count, rp_sent_at)
4. **Content** → Take from whichever has non-null reply_text (prefer ReplyPilot if both have it)
5. **Set `source_system = 'both'`** when record exists in both projects

### 2C. Sync job — runs twice daily

**Implementation:** Supabase Edge Function `sync-unified-replies` triggered by cron (pg_cron or external scheduler).

**Schedule:** 08:00 and 18:00 ET (before morning review + after afternoon review)

**Sync logic (incremental):**

```
1. READ last successful sync timestamp from app_settings or a sync_metadata table

2. PULL from Instantly-sync Supabase (cross-project API call):
   - campaign_replies WHERE reply_at > last_sync OR updated_at > last_sync
   - JOIN campaign_orgs_summary ON company_name for org context

3. PULL from ReplyPilot Supabase (local query):
   - inbound_replies WHERE updated_at > last_sync
   - JOIN draft_versions to get draft count per reply

4. For each reply from instantly-sync:
   a. Build dedup_key = "instantly:{instantly_email_id}"
   b. Check if dedup_key exists in unified_replies
   c. If NOT exists → INSERT with instantly-sync data
   d. If EXISTS:
      - Update campaign metadata (campaign_name, org stats) from instantly-sync
      - Do NOT overwrite classification if classification_source = 'replypilot_claude'
      - Set source_system = 'both' if also in ReplyPilot

5. For each reply from ReplyPilot:
   a. Build dedup_key:
      - If source = 'instantly' → "instantly:{instantly_email_id}"
      - If source = 'smartlead' → "smartlead:{smartlead_message_id}"
   b. UPSERT with ReplyPilot classification (always preferred)
   c. Set classification_source = 'replypilot_claude'
   d. Set rp_status, rp_draft_count, rp_sent_at

6. UPDATE sync_metadata with current timestamp

7. LOG sync results: {new_records, updated_records, errors, duration}
```

**Data quality checks (run after every sync):**
```sql
-- Check 1: No duplicate dedup_keys (enforced by UNIQUE constraint, but verify)
SELECT dedup_key, COUNT(*) FROM unified_replies GROUP BY dedup_key HAVING COUNT(*) > 1;

-- Check 2: No null temperatures (should be <5%)
SELECT COUNT(*) FILTER (WHERE temperature IS NULL) * 100.0 / COUNT(*) AS pct_unclassified FROM unified_replies;

-- Check 3: Source system distribution
SELECT source_system, COUNT(*) FROM unified_replies GROUP BY source_system;

-- Check 4: Total should be ~4,779 (4,557 instantly + 222 smartlead)
SELECT COUNT(*) FROM unified_replies;
```

### 2D. Supplementary views for the dashboard

Create these views in ReplyPilot Supabase for efficient dashboard queries:

```sql
-- Campaign-level funnel metrics (join with campaign_emails_sent counts)
CREATE OR REPLACE VIEW v_campaign_funnel AS
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
FROM unified_replies
GROUP BY campaign_name;

-- Daily reply volume + temperature breakdown (time series)
CREATE OR REPLACE VIEW v_daily_replies AS
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
FROM unified_replies
GROUP BY DATE(received_at), campaign_name
ORDER BY reply_date;

-- Top organizations by engagement
CREATE OR REPLACE VIEW v_org_engagement AS
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
FROM unified_replies
WHERE company_name IS NOT NULL
GROUP BY company_name, company_domain, ein, org_state, org_city, org_total_emails_sent
ORDER BY positive_reply_count DESC;

-- Weekly cohort analysis (replies by week of first contact)
CREATE OR REPLACE VIEW v_weekly_cohort AS
SELECT
  DATE_TRUNC('week', received_at) AS reply_week,
  COUNT(*) AS total_replies,
  COUNT(*) FILTER (WHERE temperature IN ('hot','warm','simple')) AS positive_replies,
  ROUND(COUNT(*) FILTER (WHERE temperature IN ('hot','warm','simple'))::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS positive_rate_pct,
  COUNT(DISTINCT lead_email) AS unique_leads,
  COUNT(DISTINCT company_name) AS unique_orgs
FROM unified_replies
GROUP BY DATE_TRUNC('week', received_at)
ORDER BY reply_week;

-- Classification quality tracking
CREATE OR REPLACE VIEW v_classification_quality AS
SELECT
  classification_source,
  temperature,
  COUNT(*) AS count,
  ROUND(AVG(confidence)::numeric, 2) AS avg_confidence
FROM unified_replies
GROUP BY classification_source, temperature
ORDER BY classification_source, count DESC;
```

---

## Phase 2.5: Theme Tagging System

### Why themes?

Temperature tells you *how interested* someone is. Themes tell you *what they care about*. This unlocks:
- "What are the top objections?" → refine messaging
- "How many people need board approval?" → create a board-ready deck
- "Which orgs are comparing us to competitors?" → build comparison pages

### Theme taxonomy

Define a controlled vocabulary of themes. Claude assigns 1-3 themes per reply from this list. New themes can be added but the taxonomy should stay tight (<30 themes).

**Interest themes:**
- `ready_to_switch` — Actively wants to move to Zeffy
- `requesting_demo` — Wants a call, meeting, or walkthrough
- `requesting_info` — Wants more details, pricing comparison, or PDF
- `forwarding_to_decision_maker` — Passing to board, ED, treasurer, etc.
- `already_signed_up` — Created a Zeffy account unprompted
- `comparing_alternatives` — Evaluating Zeffy vs PayPal/Stripe/Eventbrite/etc.

**Objection themes:**
- `happy_with_current` — Satisfied with PayPal/current tool
- `fees_not_a_concern` — Doesn't see fees as a problem
- `too_small_to_matter` — Org feels too small for the savings to matter
- `board_approval_needed` — Interested but needs organizational buy-in
- `timing_not_right` — Not now, maybe later (seasonal, fiscal year, etc.)
- `already_free_alternative` — Claims to already use a free tool
- `trust_concern` — Skeptical about "100% free", asks about business model
- `technical_concern` — Worried about migration, integrations, features

**Operational themes:**
- `wrong_person` — Not the right contact, may or may not redirect
- `org_dissolved` — Organization no longer active
- `already_using_zeffy` — Already a Zeffy user
- `unsubscribe_request` — Wants off the list
- `auto_reply` — Out of office / automated response
- `spam_complaint` — Hostile / marks as spam

**Question themes:**
- `how_zeffy_works` — General "how does it work?" questions
- `migration_question` — How to move data/donors from current tool
- `feature_question` — Specific feature inquiry (recurring, events, receipts, etc.)
- `pricing_question` — How Zeffy makes money, hidden fees, etc.

### Theme classification prompt

Run as part of the sync job (Phase 2C) for new replies, and as a one-time backfill for existing replies.

```
You are a cold email reply analyst for Zeffy, a 100% free fundraising platform for nonprofits.

Given a reply to our cold outreach email, assign 1-3 themes from the taxonomy below.
Choose the PRIMARY theme (most dominant signal) and any secondary themes.

TAXONOMY:
[full list above]

RULES:
- Assign 1-3 themes. Most replies have 1-2.
- The primary_theme should be the strongest signal in the reply.
- If the reply is ambiguous, prefer the theme that best explains the lead's INTENT.
- Short replies ("yes", "tell me more") → primary_theme = "requesting_info"
- Out-of-office → primary_theme = "auto_reply", no secondary themes
- If the lead asks about fees AND wants a demo → themes: ["requesting_demo", "pricing_question"]

OUTPUT (JSON):
{
  "primary_theme": "string",
  "themes": ["string", ...],
  "confidence": 0.0-1.0
}
```

**Implementation:**
- Run alongside classification in the sync job (same Claude call if possible — combine classification + theme tagging in one tool-use prompt to save cost)
- Backfill: batch process all existing unified_replies where `themes IS NULL`
- Store results in `themes`, `primary_theme`, `theme_confidence`, `themes_generated_at`

### Theme views

```sql
-- Theme distribution (for dashboard)
CREATE OR REPLACE VIEW v_theme_distribution AS
SELECT
  unnest(themes) AS theme,
  COUNT(*) AS reply_count,
  COUNT(*) FILTER (WHERE temperature IN ('hot','warm','simple')) AS positive_count,
  ROUND(COUNT(*) FILTER (WHERE temperature IN ('hot','warm','simple'))::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS positive_rate_pct
FROM unified_replies
WHERE themes IS NOT NULL
GROUP BY unnest(themes)
ORDER BY reply_count DESC;

-- Primary theme breakdown (cleaner, no double-counting)
CREATE OR REPLACE VIEW v_primary_theme_breakdown AS
SELECT
  primary_theme,
  temperature,
  COUNT(*) AS count
FROM unified_replies
WHERE primary_theme IS NOT NULL
GROUP BY primary_theme, temperature
ORDER BY primary_theme, count DESC;

-- Theme co-occurrence (which themes appear together)
CREATE OR REPLACE VIEW v_theme_cooccurrence AS
SELECT
  a.theme AS theme_a,
  b.theme AS theme_b,
  COUNT(*) AS co_count
FROM
  (SELECT id, unnest(themes) AS theme FROM unified_replies) a
  JOIN (SELECT id, unnest(themes) AS theme FROM unified_replies) b
    ON a.id = b.id AND a.theme < b.theme
GROUP BY a.theme, b.theme
HAVING COUNT(*) >= 3
ORDER BY co_count DESC;
```

---

## Phase 3: Dashboard in ReplyPilot

### 3A. Dashboard sections

Build as a new enhanced `AnalyticsPage.tsx` (replace existing minimal page).

**Section 1 — Executive KPIs (top row cards)**

| KPI | Formula | Target |
|-----|---------|--------|
| Total Emails Sent | SUM from campaign_emails_sent (synced or passed as config) | 200K (PayPal) + 30K (Eventbrite) |
| Total Replies | COUNT from unified_replies | — |
| Reply Rate | Total Replies / Total Emails Sent × 100 | >2.4% |
| Positive Replies | COUNT WHERE temperature IN (hot, warm, simple) | 4,000+ |
| Positive Reply Rate | Positive Replies / Total Emails Sent × 100 | **2.0%** (X2 target) |
| Hot Replies | COUNT WHERE temperature = 'hot' | — |
| Responses Sent | COUNT WHERE rp_status = 'sent' | — |
| Avg Response Time | AVG(rp_sent_at - received_at) WHERE rp_status = 'sent' | <24h |

**Section 2 — Reply Volume Over Time (line/area chart)**
- X axis: date (daily)
- Y axis: reply count
- Stacked by temperature (hot=red, warm=orange, simple=blue, cold=gray, for_later=yellow, ooo=purple)
- Toggle: cumulative vs daily
- Filter: by campaign

**Section 3 — Temperature Breakdown (donut chart + table)**
- Donut chart: % split by temperature
- Table: temperature | count | % | vs last week trend

**Section 4 — Campaign Performance (comparison table)**
- Rows: each campaign (Wave1, Wave2, Eventbrite, SmartLead)
- Columns: emails sent | replies | reply rate | positive | positive rate | hot | responses sent
- Highlight: which campaign performs best

**Section 5 — Funnel Visualization (horizontal funnel)**
```
Emails Sent (182K) → Replies (4.5K, 2.5%) → Positive (1.4K, 0.8%) → Responded (X) → Converted (TBD)
```

**Section 6 — Geographic Heatmap (US map or state table)**
- From `org_state` field
- Show: reply count + positive rate by state
- Highlight: top 10 states

**Section 7 — Top Engaged Organizations (table)**
- From `v_org_engagement` view
- Columns: org name | domain | state | emails sent | replies | positive replies | last reply
- Sortable, searchable
- Click to see all replies from that org

**Section 8 — Operational Metrics (for reply processing efficiency)**
- Queue health: awaiting_review count, avg age of oldest unreviewed
- Regeneration rate: % of drafts regenerated vs approved on first try
- Send success rate: sent vs failed
- Source split: Instantly vs SmartLead reply volumes

**Section 9 — Weekly Trend (bar chart)**
- From `v_weekly_cohort` view
- Side-by-side bars: total replies vs positive replies per week
- Line overlay: positive rate %
- Shows trajectory toward 2% target

**Section 10 — Theme Analysis (interactive)**
- Horizontal bar chart: top 15 themes by reply count
- Each bar split by temperature (stacked: hot | warm | cold)
- Click a theme bar → navigates to `/explore?themes={theme}` for deep-dive
- Table below chart: theme | count | positive rate | top 3 example snippets
- "Objection radar": pie chart of objection themes only — shows what's blocking conversions

**Section 11 — Classification Quality (admin section, collapsible)**
- From `v_classification_quality` view
- Shows: % classified by each source (replypilot_claude, instantly_sync_claude, keyword, unclassified)
- Confidence distribution histogram
- Flags: any unclassified replies remaining

### 3B. Reply Explorer (new page: `/explore`)

A dedicated interface for browsing, searching, and analyzing replies by theme. This is the "qualitative analysis" complement to the quantitative dashboard.

**Route:** `/explore` (add to App.tsx)

**Layout: Two-panel — filters/themes on left, reply list + detail on right**

#### Left Panel — Filters & Theme Navigator

**Search bar (top, always visible):**
- Full-text search across reply_text, reply_subject, company_name, lead_name
- Uses PostgreSQL `search_vector` with `ts_rank` for relevance ordering
- Debounced (300ms), minimum 2 characters
- Shows result count as you type: "47 replies match 'board approval'"
- Keyboard shortcut: `/` to focus

**Active filters bar:**
- Pill chips showing active filters with × to remove
- "Clear all" button when any filters active

**Theme tree (main navigation):**
```
Interest (4 themes)                    [count badge]
  ├── ready_to_switch                  [142]
  ├── requesting_demo                  [ 89]
  ├── requesting_info                  [234]
  ├── forwarding_to_decision_maker     [ 67]
  ├── already_signed_up                [ 13]
  └── comparing_alternatives           [ 45]

Objections (8 themes)                  [count badge]
  ├── happy_with_current               [312]
  ├── fees_not_a_concern               [ 28]
  ├── ...

Questions (4 themes)                   [count badge]
  ├── how_zeffy_works                  [ 56]
  ├── ...

Operational (5 themes)                 [count badge]
  ├── wrong_person                     [190]
  └── ...
```
- Click a theme → filters reply list to that theme
- Multi-select: click multiple themes to see replies matching ANY selected theme
- Counts update dynamically with other active filters (search, temperature, date, campaign)

**Additional filters (collapsible sections):**
- **Temperature:** Checkboxes for hot/warm/simple/cold/for_later/ooo
- **Campaign:** Dropdown (Wave1, Wave2, SmartLead, etc.)
- **Date range:** Date picker with presets (Today, Last 7d, Last 30d, All time)
- **State:** Dropdown with US states
- **Source:** Instantly / SmartLead
- **Status:** ReplyPilot processing status (sent, awaiting_review, skipped, etc.)
- **Has response:** Yes/No (whether ReplyPilot sent a reply)

#### Right Panel — Reply List + Detail

**Reply list (scrollable, top portion):**
- Each row shows:
  - Lead name / email (bold)
  - Company name + state (muted)
  - First 100 chars of reply_text (preview)
  - Temperature badge (color-coded)
  - Theme pills (up to 3, colored by category: interest=green, objection=red, question=blue, operational=gray)
  - Received date (relative: "2d ago")
  - Source badge (Instantly / SL)
- Sort options: Relevance (when searching), Newest first, Oldest first, Temperature (hot first)
- Pagination: infinite scroll or "Load more" (50 per page)
- When search is active, **highlight matching terms** in preview text (bold or yellow background)

**Reply detail (bottom portion, appears when a reply is clicked):**
- Full reply text (with search terms highlighted)
- Lead info card: name, email, company, domain, state, EIN
- Org context: total emails sent to this org, total replies, other replies from same org
- Classification: temperature + reasoning + themes + confidence
- Thread: if other replies from same lead_email exist, show chronologically
- ReplyPilot status: if processed, show status + draft + response sent
- Actions:
  - "Open in ReplyPilot" → link to cockpit with this reply selected (if it exists in inbound_replies)
  - "Copy reply text" → clipboard
  - "View org" → link to org detail filtered view

#### Query implementation

```typescript
// Full-text search with theme filtering
const searchReplies = async ({
  searchQuery,
  themes,
  temperature,
  campaign,
  dateRange,
  state,
  source,
  sortBy,
  page
}: ExplorerFilters) => {
  let query = supabase
    .from('unified_replies')
    .select('*', { count: 'exact' });

  // Full-text search
  if (searchQuery && searchQuery.length >= 2) {
    query = query.textSearch('search_vector', searchQuery, {
      type: 'websearch',  // supports "board approval" AND queries
      config: 'english'
    });
  }

  // Theme filter (ANY of selected themes)
  if (themes && themes.length > 0) {
    query = query.overlaps('themes', themes);
  }

  // Temperature filter
  if (temperature && temperature.length > 0) {
    query = query.in('temperature', temperature);
  }

  // Campaign filter
  if (campaign) {
    query = query.eq('campaign_name', campaign);
  }

  // Date range
  if (dateRange?.start) query = query.gte('received_at', dateRange.start);
  if (dateRange?.end) query = query.lte('received_at', dateRange.end);

  // State filter
  if (state) query = query.eq('org_state', state);

  // Source filter
  if (source) query = query.eq('source_system', source);

  // Sort
  switch (sortBy) {
    case 'newest': query = query.order('received_at', { ascending: false }); break;
    case 'oldest': query = query.order('received_at', { ascending: true }); break;
    case 'hot_first': query = query.order('temperature', { ascending: true }); break;
    default: break; // relevance (default when searching, PostgreSQL handles ranking)
  }

  // Pagination
  const pageSize = 50;
  query = query.range(page * pageSize, (page + 1) * pageSize - 1);

  return query;
};

// Theme counts (for left panel badges) — respects active filters
const getThemeCounts = async (activeFilters: Omit<ExplorerFilters, 'themes'>) => {
  // Use a PostgreSQL function or RPC for efficiency:
  // SELECT unnest(themes) as theme, COUNT(*) as count
  // FROM unified_replies
  // WHERE [active filters applied]
  // GROUP BY unnest(themes)
  // ORDER BY count DESC
};
```

#### URL state

All filter state should be reflected in the URL query params for shareability:
```
/explore?q=board+approval&themes=board_approval_needed,forwarding_to_decision_maker&temp=hot,warm&campaign=Wave2&sort=newest
```

This allows you to share a specific filtered view with your team (e.g., "here are all the board approval objections from Wave2").

#### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search bar |
| `Esc` | Clear search / close detail |
| `J` / `K` | Navigate reply list (down/up) |
| `Enter` | Open reply detail |
| `T` | Toggle theme panel |
| `1-4` | Quick filter: 1=Interest, 2=Objections, 3=Questions, 4=Operational |

### 3C. Tech stack for dashboard

- **Data fetching:** React Query (@tanstack/react-query) with 5-min refetch interval (data only updates 2x/day)
- **Charts:** Recharts (already likely in project deps, lightweight, React-native)
- **Layout:** Responsive grid using existing Tailwind + shadcn/ui
- **Date range filter:** Global date picker that filters all sections
- **Campaign filter:** Global dropdown that filters all sections
- **Export:** CSV download button for key tables

### 3C. Query patterns

All dashboard queries should hit the `unified_replies` table and views. Example:

```typescript
// Executive KPIs
const { data: kpis } = useQuery({
  queryKey: ['analytics-kpis', dateRange, campaign],
  queryFn: async () => {
    const { data, count } = await supabase
      .from('unified_replies')
      .select('temperature, rp_status, received_at, rp_sent_at', { count: 'exact' })
      .gte('received_at', dateRange.start)
      .lte('received_at', dateRange.end)
      .match(campaign ? { campaign_name: campaign } : {});
    return computeKPIs(data, count);
  }
});

// Daily time series
const { data: timeSeries } = useQuery({
  queryKey: ['analytics-daily', dateRange, campaign],
  queryFn: async () => {
    const { data } = await supabase
      .from('v_daily_replies')
      .select('*')
      .gte('reply_date', dateRange.start)
      .lte('reply_date', dateRange.end)
      .order('reply_date');
    return data;
  }
});
```

---

## Phase 4: Data Quality & Monitoring

### Ongoing checks (run with each sync)

1. **Dedup integrity:** `SELECT COUNT(*) FROM unified_replies` should equal `COUNT(DISTINCT dedup_key)`
2. **Classification coverage:** `temperature IS NOT NULL` should be >95%
3. **Freshness:** Latest `received_at` should be within 24h of latest `campaign_replies.reply_at`
4. **Completeness:** `COUNT` in unified should be >= `COUNT` in campaign_replies + SmartLead-only count
5. **Source tracking:** Every record must have a non-null `classification_source`

### Alerts (log warnings if)
- Sync fails or takes >5 min
- >5% of replies are unclassified after sync
- Duplicate dedup_keys detected (should never happen)
- Gap >48h between latest reply and current time (sending may have stopped)

---

## Execution Order

1. **Phase 1A** — Add columns to `campaign_replies` in instantly-sync Supabase
2. **Phase 1A** — Upgrade `classifyReply()` in instantly-sync.ts with 2-stage classifier
3. **Phase 1B** — Build + run backfill script for 1,894 "unknown" replies
4. **Phase 2A** — Create `unified_replies` table (with themes + search_vector columns) + views in ReplyPilot Supabase
5. **Phase 2C** — Build sync edge function + schedule twice daily
6. **Phase 2C** — Run initial full sync + validate data quality
7. **Phase 2.5** — Run theme tagging backfill on all unified_replies
8. **Phase 3A** — Build dashboard UI (Sections 1-11) reading from unified_replies + views
9. **Phase 3B** — Build Reply Explorer page (`/explore`) with search + theme navigation
10. **Phase 4** — Add monitoring + alerts

---

## Key Constraints

- **ZERO duplicates** in unified_replies — enforced by UNIQUE(dedup_key)
- **Classification priority:** ReplyPilot Claude > Instantly-sync Claude > keyword-based > unclassified
- **No data loss:** Preserve original_reply_category from instantly-sync for comparison
- **Incremental sync:** Only process records changed since last sync (performance at scale)
- **Private data:** All Supabase calls use service role keys server-side only
