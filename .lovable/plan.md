
# ReplyPilot — Implementation Plan

## Overview
An internal reply management tool for Zeffy's outbound email campaigns. Receives replies from Instantly via webhook, classifies them with AI, generates draft replies, supports human review, and sends approved replies back through Instantly. Includes a Slack digest system for operational visibility.

---

## Phase 1: Foundation

### Connect Supabase & Create Database Schema
- Connect your external Supabase project
- Create all 8 tables: `campaigns`, `inbound_replies`, `draft_versions`, `approval_actions`, `send_attempts`, `app_settings`, `prompt_templates`, `audit_logs`
- Add indexes on status, temperature, received_at, lead_email, reply_id
- RLS disabled for v1

### Seed Data
- PayPal Migration campaign
- Default app_settings row
- 4 prompt templates (classification, simple affirmative, drafting, regeneration)
- 6 mock inbound replies across different temperatures for demo/testing

### Zeffy Brand Theme
- Apply Zeffy color palette to Tailwind config (Periwinkle primary, Midnight Blue headings, Sea Foam success, Zesty Orange warning, Sizzling Red error, Frozen Blue hover)
- Light mode default, white space-heavy, soft rounded corners, card-based layouts
- Reusable badge components for status and temperature states

---

## Phase 2: Inbound Pipeline

### Edge Function: `webhook-instantly-reply`
- Receives Instantly webhook payload, validates fields, deduplicates by email_id
- Stores raw payload, inserts into `inbound_replies`, creates audit log
- Triggers classification

### Edge Function: `classify-reply`
- Deterministic checks first (out-of-office patterns, empty text, unsubscribe language)
- AI classification via Lovable AI for remaining replies → temperature, reasoning, wants_pdf, simple_affirmative, sentiment
- Updates reply record, creates audit log
- Routes hot/warm to draft generation, others marked as skipped

### Edge Function: `generate-draft`
- Generates version 1 draft for hot/warm replies using AI with stored prompt templates
- Applies Zeffy writing rules (no em dashes, warm tone, "Best, Julia" signoff)
- If simple affirmative + first reply + auto-send enabled → triggers send automatically
- Otherwise sets status to `awaiting_review`

---

## Phase 3: App UI — Inbox & Detail

### Inbox Page
- Table view with columns: lead email, subject, preview, temperature, wants_pdf, simple_affirmative, status, received_at, campaign
- Filterable by temperature, status, campaign, first reply
- Searchable by email, subject, reply text
- Badge counts per state, visual priority for hot/awaiting_review items
- Skeleton loaders, empty states

### Reply Detail Page
- Split layout: left side shows original reply + metadata, right side shows AI analysis + draft editor
- Draft area with editable text, version selector, plain text/preview tabs
- Action buttons: Approve & Send, Reject with Feedback, Regenerate, Mark Manual Review, Retry Send
- Version history, approval history, send attempts, audit log summary
- Links to Instantly unibox

---

## Phase 4: Review & Send Flow

### Edge Function: `regenerate-draft`
- Takes reply_id + reviewer feedback, generates next draft version
- Max 2 AI-generated rounds; after that → `manual_review` status
- Saves to `draft_versions`, updates status, writes audit log

### Edge Function: `send-reply`
- Sends approved draft via Instantly API (server-side only)
- Logs full request/response in `send_attempts`
- Updates status to `sent` or `failed`
- Writes audit log

### Approval UI Flow
- Approve → triggers send-reply edge function
- Reject → captures feedback, triggers regenerate-draft
- All actions logged in `approval_actions` and `audit_logs`

---

## Phase 5: Settings

### Settings Page with 5 sections:
1. **Workspace** — name, default deck/calendar links, auto-send toggle
2. **Integrations** — Instantly API base URL, API key (stored as Supabase secret), AI provider config
3. **Slack Digests** — enable/disable, bot token, channel ID, timezone, digest times, zero-activity toggle, test button
4. **Prompt Templates** — editable classification/drafting/regeneration prompts, model selector, active/inactive toggle
5. **Campaigns** — CRUD for campaigns with deck link, calendar link, active toggle

---

## Phase 6: Slack Digests

### Edge Function: `send-slack-digest`
- Scheduled via pg_cron at configured times (default 10:00, 14:00, 17:00 America/Montreal)
- Summarizes: new replies since last digest, awaiting review, manual review, failed sends, hot/warm breakdowns
- Includes link back to app inbox
- Configurable zero-activity behavior
- Logs each digest send

---

## Phase 7: Analytics Dashboard

### Analytics Page
- KPI cards: total replies, hot rate, warm rate, skipped rate, approval rate, auto-send rate, failed rate, manual review rate
- Time-based charts: reply volume over time, avg time to first review, avg time to send
- Breakdowns by campaign and temperature
- Uses Zeffy brand colors in charts (Recharts)

---

## Design Principles Throughout
- Desktop-first but mobile responsive
- Skeleton loaders, empty states, error states on every page
- Toast notifications for actions
- Confirmation dialogs for destructive actions
- Keyboard-friendly where possible
- Optimistic UI for approve/reject actions
- All provider secrets remain server-side in edge functions
