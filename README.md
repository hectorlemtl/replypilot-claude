# ReplyPilot

AI-powered cold email reply management for Zeffy's PayPal migration campaign. Ingests replies from Instantly.ai, classifies them with Claude AI, generates draft responses in Julia's voice, and lets reviewers approve, edit, and send — all from a single cockpit UI.

## How it works

```
Instantly.ai reply → Webhook → Classify (Claude) → Generate Draft (Claude) → Review Cockpit → Approve & Send
```

1. **Ingest**: Instantly.ai webhook delivers inbound replies to a Supabase Edge Function
2. **Classify**: Claude AI classifies each reply by temperature (hot, warm, simple, cold, out_of_office, for_later) and sentiment
3. **Draft**: Claude generates a tailored response in Julia's voice, using the Knowledge Base (229 articles from support.zeffy.com) for accurate answers
4. **Review**: The cockpit UI shows a queue of replies with drafts for human review
5. **Send**: Reviewers can approve, edit, regenerate with feedback, or mark for manual handling — approved replies are sent via Instantly.ai API

## Features

- **Smart classification** — 6 temperature tiers with auto-skip for cold/OOO replies
- **Knowledge Base integration** — Full-text search across 229 support articles, injected into draft prompts for accurate answers with real KB links
- **Three-panel cockpit** — Queue sidebar, original reply, and draft panel with diff view
- **Feedback loop** — Regenerate drafts with quick feedback chips or free-text instructions
- **Draft editing** — Inline edit drafts before sending, with version history and diff
- **CC/To management** — Auto-extracts CC requests from reply text, plus manual To/CC fields
- **Comparison deck logic** — Smart rules for when to include/exclude the PayPal vs Zeffy deck
- **Archive system** — Soft-delete archive with restore capability
- **First reply tracking** — Visual indicator for first-time replies from a lead
- **Workload bar** — Tab-based filtering with live counts (Review, Simple, Sent, Manual, Waiting, Archived)
- **Keyboard shortcuts** — J/K navigation, A to approve, R to regenerate, M for manual, / to search

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Supabase (Postgres + Edge Functions in Deno) |
| AI | Claude Sonnet (classification + draft generation) |
| Email | Instantly.ai API v2 (ingest + send) |
| Knowledge Base | Postgres full-text search (tsvector) over support.zeffy.com articles |

## Project structure

```
src/
  components/cockpit/     # CockpitLayout, ReplyQueue, ReplyContent, DraftPanel, WorkloadBar
  hooks/useCockpitData.ts # Main data hook (queries, mutations, filters, sorting)

supabase/functions/
  webhook-instantly-reply/ # Webhook ingestion from Instantly.ai
  classify-reply/          # AI classification with Claude
  generate-draft/          # AI draft generation with KB search
  regenerate-draft/        # Feedback-based draft regeneration
  send-reply/              # Send approved replies via Instantly.ai API

scripts/
  scrape-kb.ts             # Scrape support.zeffy.com articles into kb_articles table
  update-prompts.py        # Update prompt_templates in Supabase DB
```

## Setup

```sh
# Install dependencies
npm install

# Start dev server
npm run dev

# Deploy edge functions
supabase functions deploy generate-draft
supabase functions deploy classify-reply
supabase functions deploy send-reply

# Populate Knowledge Base (run periodically to refresh)
npx tsx scripts/scrape-kb.ts

# Update DB prompt templates
python3 scripts/update-prompts.py
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key |
| `ANTHROPIC_API_KEY` | Claude API key (set in Supabase Edge Function secrets) |
| `INSTANTLY_API_KEY` | Instantly.ai API key (set in Supabase Edge Function secrets) |
