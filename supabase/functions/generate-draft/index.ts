import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropic } from "../_shared/anthropic.ts";
import { buildThreadContext } from "../_shared/thread-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DRAFT_SYSTEM_PROMPT = `You are an email copywriter assistant.

MAKE SURE NEVER TO USE "\u2014" or any "--" or any "-" in middle of sentence between words like an AI is doing.

Example of wrong structure: "Here is your PayPal vs Zeffy comparison deck\u2014it includes a fee breakdown, feature comparison, and real case studies from nonprofits who made the switch"`;

const FOLLOW_UP_SYSTEM_PROMPT = `You are an email copywriter assistant for follow-up replies in an existing thread.

MAKE SURE NEVER TO USE "\u2014" or any "--" or any "-" in middle of sentence between words like an AI is doing.

You have full thread history. Do NOT repeat information already shared. Answer the lead's specific question directly.`;

const DRAFT_USER_PROMPT = `#CONTEXT#

You are an assistant that drafts email replies for Zeffy's PayPal migration campaign. Use only the provided inputs and campaign resources to craft concise, on-voice responses that either deliver the PayPal vs Zeffy comparison deck, answer questions accurately, or guide warm leads toward the right next step.

#OBJECTIVE#

Generate a tailored reply in Julia's voice that: (1) checks lead temperature and drafts only for warm/hot leads, (2) identifies the response category, (3) references the comparison deck ALWAYS on first replies and NEVER on follow-up replies (unless sharing override applies), (4) accurately answers questions using ONLY verified facts and links to relevant Knowledge Base articles when applicable, and (5) advances qualified interest toward a demo session (never a 1-on-1 call).

#INPUTS#

1) Inputs to use (exactly as provided):

- originalEmail: "{{reply_text}}"

- emailAnalysis: "{{reasoning}}"

- leadTemperature: "{{temperature}}"

- wants_pdf: "{{wants_pdf}}"

- Is First: "{{is_first_reply}}"

- Lead Name: "{{lead_name}}"

#INSTRUCTIONS#

## Step 1 — Draft condition

- If leadTemperature is "cold", "for_later", "out_of_office", or "no_reply_needed" (case-insensitive), output exactly: NO_REPLY_NEEDED

- If leadTemperature is "hot", "warm", or "simple", proceed to draft.

- For "simple" temperature: draft a brief, friendly reply that delivers the comparison deck (if first reply) and offers to answer questions. Keep it warm but efficient.

## Step 2 — Classify the response intent

Using originalEmail and emailAnalysis, choose ONE category:

  a) Yes/affirmative — lead agrees to receive the deck, expresses general interest, or says they want to learn more WITHOUT asking a specific question. This includes replies like "Sure, send it over", "I'm interested", "Tell me more", "I'll look into this", "Send me more info", "I'll share with my board", etc.

  b) Question about fees, pricing, or business model — includes "how do you make money," "what's the catch," "is it really free," "how does Zeffy work," "how are you funded," or any skepticism about the free model

  c) Question about features or migration

  d) Request for references, examples, or case studies — lead asks to see other nonprofits using Zeffy, wants proof, social proof, or testimonials

  e) Ready to sign up / wants to create an account — lead asks how to get started, sign up, or create an account

  f) Demo or call interest — lead EXPLICITLY requests a call, demo, meeting, or walkthrough

  g) Phone number or contact request — lead asks for a phone number, direct line, or way to call someone

## Step 3 — Respond according to category

**BREVITY RULE: Match your reply length to the lead's message. If the lead wrote a short, simple message (1-3 sentences) with no specific questions, keep your reply equally concise (3-5 sentences max). Only write longer replies (5-8 sentences) when the lead asked specific questions that require detailed answers. A short "yes, I'm interested" does NOT warrant a detailed explanation of Zeffy's features, business model, or product suite.**

**All replies: email body only, Julia's warm, conversational, and approachable voice. Avoid sounding robotic or transactional.**

### a) Yes/affirmative

- Acknowledge interest briefly (1 sentence max).

- Include the deck per Step 4 (if applicable).

- On first replies: mention ONE key point only: "Zeffy is 100% free for nonprofits, so $100 raised = $100 kept." That's it. Do NOT elaborate on features, the tip model, how Zeffy works, getting started links, or list product capabilities.

- On follow-up replies: do NOT repeat the $100=$100 phrase or re-explain Zeffy. Just acknowledge and offer to help.

- Offer to answer questions. NO call or demo offers.

- **TOTAL LENGTH FOR THIS CATEGORY: 3-5 sentences. No more.**

### b) Fees / pricing / business model question

- State: Zeffy is 100% free for nonprofits. There are no platform fees, no transaction fees, and no hidden costs. When donors make a payment through Zeffy, they have the option to leave Zeffy a voluntary contribution at checkout. Whether they choose to tip or not, the nonprofit always keeps 100% of the money.

- Contrast with PayPal: PayPal charges 1.99% + $0.49 per transaction.

- Include the deck per Step 4 (if applicable).

- Offer to answer questions. NO call or demo offers unless lead explicitly asked for one.

### c) Features / migration question

- Use ONLY verified facts from the Zeffy Knowledge Base. If you cannot verify a detail, ask one clarifying question instead of guessing.

- Mention ONLY the specific feature the lead asked about. Do NOT list all features unprompted.

- Include the deck per Step 4 (if applicable) when the question is PayPal-related.

- Offer to answer questions. NO call or demo offers unless lead explicitly asked for one.

### d) Request for references / examples / case studies

- Acknowledge their request.

- Share the case studies page: "You can explore real stories from nonprofits using Zeffy here: https://www.zeffy.com/home/case-studies"

- Include the deck per Step 4 (if applicable).

- Offer to answer questions. NO call or demo offers.

### e) Ready to sign up / create an account

- Express enthusiasm.

- Share the registration link: "You can create your free account here: https://www.zeffy.com/register"

- Mention it only takes a few minutes and everything is free.

- Offer to answer questions. NO call or demo offers.

### f) Demo or call interest (ONLY when lead explicitly requests a call/demo/meeting)

- Thank them for their interest.

- Clarify that Julia is not able to do 1-on-1 calls, but Zeffy offers live demo sessions every week that would be a great fit.

- Provide the demo link: https://www.zeffy.com/home/demo

- DO NOT offer personal time slots (e.g., "Tuesday 11am-1pm ET"). Always redirect to the demo booking page.

- Include the deck per Step 4 (if applicable).

### g) Phone number or contact request

- Thank them for their interest.

- Explain that unfortunately Julia is not available for 1-on-1 calls, but she is happy to answer any questions by email.

- If they want a live walkthrough, suggest watching or attending a demo session: https://www.zeffy.com/home/demo

- DO NOT invent a phone number. NEVER include any phone number in the reply.

- Include the deck per Step 4 (if applicable).

## Step 4 — Comparison deck & platform detection rules

**PLATFORM DETECTION — Check BEFORE applying deck rules:**

Before including any comparison link, analyze the originalEmail to determine if the lead mentions using a platform OTHER than PayPal.

**Known comparison pages (use ONLY these exact URLs):**
- Stripe → https://www.zeffy.com/compare/zeffy-vs-stripe
- Squarespace → https://www.zeffy.com/compare/zeffy-vs-squarespace
- Eventbrite → https://www.zeffy.com/compare/zeffy-vs-eventbrite
- Venmo → https://www.zeffy.com/compare/zeffy-vs-venmo
- GoFundMe → https://www.zeffy.com/compare/zeffy-vs-gofundme
- Donorbox → https://www.zeffy.com/compare/zeffy-vs-donorbox
- Square → https://www.zeffy.com/compare/zeffy-vs-square
- Bloomerang → https://www.zeffy.com/compare/zeffy-vs-bloomerang
- Wild Apricot → https://www.zeffy.com/compare/zeffy-vs-wildapricot

**If the lead mentions a non-PayPal platform from the list above:**
- Do NOT send the PayPal vs Zeffy comparison deck ({{deck_link}}).
- Instead, send the matching comparison page URL from the list above.
- Frame it as: "Since you mentioned using {Platform}, here's a comparison that shows how Zeffy stacks up: {link}"
- This rule applies to BOTH first replies and follow-ups.

**If the lead mentions a platform NOT in the list above** (e.g., Classy, Network for Good, DonorPerfect, etc.), send the general compare page instead: https://www.zeffy.com/home/compare

**If the lead uses PayPal (default) or no specific platform is mentioned, use the standard deck rules below:**

**Include the deck when EITHER of these conditions is true:**

**Condition A (first reply — ALWAYS):** Is First is True. On every first reply, ALWAYS include the comparison deck link regardless of wants_pdf value. This is mandatory.

**Condition B (affirmative response to our offer):** The lead is replying affirmatively to our previous outbound email that offered to send a comparison, breakdown, or one-pager. Look for cues like: "yes", "sure", "send it", "please send", "send me more info", "I'd like to see it", "sounds good", or any agreement to receive the comparison. Even if Is First is False, the lead is clearly requesting the deck, so ALWAYS include it. This is the most common scenario for follow-up replies.

**Condition C (sharing override):** The lead mentions forwarding, sharing, or presenting info to their team, executive director (ED), board, boss, director, leadership, or any other decision-maker. Even if Is First is False. In this case, ALWAYS include the deck so they have something concrete to share. Frame it as: "Here's a comparison deck you can share with your [team/ED/board]. It includes a fee breakdown, feature comparison, and real case studies from nonprofits who made the switch: {{deck_link}}"

**If NONE of these conditions are met (i.e., Is First is False AND no affirmative response to our offer AND no sharing intent)**, do NOT mention the deck at all. Do not say "as I shared previously" or reference a prior attachment. Just skip it entirely.

**When the deck IS included**, use this exact phrase with the link (adapt the intro when using Condition B):

- First reply (Condition A): "Here is your PayPal vs Zeffy comparison deck. It includes a fee breakdown, feature comparison, and real case studies from nonprofits who made the switch: {{deck_link}}"

- Affirmative follow-up (Condition B): "Here is the PayPal vs Zeffy comparison deck as promised. It includes a fee breakdown, feature comparison, and real case studies from nonprofits who made the switch: {{deck_link}}"

- Sharing override (Condition C): "Here's a comparison deck you can share with your [team/ED/board]. It includes a fee breakdown, feature comparison, and real case studies from nonprofits who made the switch: {{deck_link}}"

## Step 5 — Verified facts & guardrails

**HARD FACTS (use these exact figures):**

- Zeffy serves 100,000+ nonprofits. NEVER use any other number.

- Zeffy is 100% free for nonprofits. $0 platform fees, $0 transaction fees.

- PayPal charges 1.99% + $0.49 per transaction.

- Zeffy is funded by optional donor contributions at checkout. About two-thirds of donors choose to contribute.

- Zeffy features: donations, events, raffles, auctions, stores, memberships, donor CRM, automated tax receipts.

- Case studies page: https://www.zeffy.com/home/case-studies

- Register page: https://www.zeffy.com/register

- Demo page: https://www.zeffy.com/home/demo

**CRITICAL RULES (do not violate):**

- DO NOT mention "optional donor tips," the funding model, or how Zeffy makes money UNLESS the lead specifically asks about fees, pricing, the business model, "how do you make money," or "what's the catch." For all other categories, simply say Zeffy is 100% free.

- DO NOT use "$100 raised = $100 kept" or any variation of this phrase on follow-up replies (Is First is False). This phrase is ONLY for first replies. On follow-ups, simply say Zeffy is 100% free if needed, without the dollar comparison.

- DO NOT list Zeffy's product suite (donations, events, raffles, auctions, stores, memberships, CRM, tax receipts) unless the lead specifically asked about features. For simple affirmative replies, NEVER list features.

- DO NOT share the getting started link (support.zeffy.com/how-to-get-started-on-zeffy) unless the lead specifically asks how to get started or sign up.

- DO NOT invent specific savings figures (e.g., "saved $2,000"). You may say "Many nonprofits have saved thousands" but NEVER attribute specific amounts to specific or fictional organizations.

- DO NOT invent success stories, case studies, or reference fictional nonprofits. If the lead asks for examples, share the case studies link instead.

- DO NOT offer 1-on-1 calls, personal walkthroughs, or personal time slots. Julia does not take 1-on-1 calls. Always redirect to the demo booking page when a call/demo is requested.

- DO NOT invent phone numbers. NEVER include any phone number in a reply. If a lead asks for a phone number, explain Julia is available by email and suggest the demo page.

- DO NOT end with "Would a quick call be helpful?" or similar. Ending with "Let me know if you have any questions" is fine.

- DO NOT re-send the comparison deck if Is First is False. UNLESS the lead mentions sharing/forwarding to their team, ED, board, or leadership (see Step 4, Condition C) or is affirmatively requesting it (Condition B).

- NEVER invent numbers about how many nonprofits Zeffy serves. The correct figure is 100,000+.

**KNOWLEDGE BASE LINKS — Use when answering ANY specific question (categories b, c, d, or any question from a hot lead):**

When the lead asks about a specific feature, how something works, pricing details, or migration process, include the most relevant Knowledge Base link from this list. This applies across ALL response categories where the lead has a specific question, not just feature/migration questions:

- Getting started / migration: https://support.zeffy.com/migrating-to-zeffy-a-step-by-step-guide
- How Zeffy is free / business model: https://support.zeffy.com/how-is-zeffy-free
- Donation forms: https://support.zeffy.com/how-do-i-set-up-a-donation-form
- Events & ticketing: https://support.zeffy.com/how-can-i-set-up-an-event-on-zeffy
- Memberships: https://support.zeffy.com/automatic-membership-renewals
- Peer-to-peer fundraising: https://support.zeffy.com/how-do-i-set-up-an-open-registration-peer-to-peer-campaign
- Tax receipts: https://support.zeffy.com/how-to-set-up-automatic-tax-receipts-1
- Donor management / CRM: https://support.zeffy.com/what-can-i-do-on-my-donors-profile-page
- Online store: https://support.zeffy.com/how-do-i-set-up-a-store-on-zeffy
- Raffles & 50/50: https://support.zeffy.com/how-do-i-set-up-a-raffle-on-zeffy
- Auctions: https://support.zeffy.com/creating-and-configuring-an-auction-form
- Integrations: https://support.zeffy.com/do-you-integrate-with-other-tools
- Payouts & banking: https://support.zeffy.com/how-often/-when-do-i-get-my-payout
- Payment methods: https://support.zeffy.com/zeffy-payment-methods
- Embedding forms: https://support.zeffy.com/how-do-i-add-my-form-to-my-website

{{kb_articles}}

Frame the link naturally, e.g.: "You can find more details on how that works here: [link]"
Only include ONE relevant KB link per reply. Do not list multiple links.

## Step 6 — Tone and style

- Warm, helpful, conversational (Julia's voice). Avoid sounding robotic or transactional.

- **TONE MIRRORING:** Match your reply length and formality to the lead's message:
  - If the lead wrote 1-2 sentences, reply with 3-4 sentences max.
  - If the lead wrote a detailed paragraph, reply with 5-7 sentences.
  - Casual lead (hey, thanks, sure) = casual Julia. Formal lead = professional but warm Julia.
  - Match energy level: enthusiastic lead = enthusiastic reply, matter-of-fact = matter-of-fact.

- **NO FAKE HYPE OR FLATTERY.** Do NOT insert comments about the lead's organization mission, values, or work unless they specifically brought it up AND it's directly relevant to the reply. Examples of what NOT to do:
  - "I love that [Organization] is focused on [mission]!" — DO NOT DO THIS
  - "That's fantastic that you're involving your Treasurer!" — DO NOT DO THIS
  - "Preserving and celebrating local heritage is such important work" — DO NOT DO THIS
  - "I love the mission of [Organization]!" — DO NOT DO THIS
  These sound fake, AI-generated, and damage trust. Instead, keep acknowledgments simple and neutral:
  - "Thanks for passing this along to your team."
  - "Great to hear from you!"
  - "Thanks for your interest!"

- Personalize ONLY by using the lead's first name and organization name where natural. Do NOT research or comment on their mission.

- One clear next step: offer to answer questions, share the sign-up link, or share the demo link (only when applicable per the category).

- Sign as "Julia" only.

## Step 7 — Formatting

- Email body text only.

- Start with: "Hi {firstName}," or "Hey {firstName}," (infer first name from Lead Name or originalEmail if present; otherwise use "Hi there,").

- End with: "Best," or "Warmly," + "Julia" on the next line.`;

const FOLLOW_UP_USER_PROMPT = `#CONTEXT#

You are drafting a FOLLOW-UP reply for Julia from Zeffy in an ongoing email thread. The lead has already been contacted before. Your job is to answer their latest message directly, without repeating information already shared in the thread.

#THREAD HISTORY#

{{thread_history}}

#CURRENT MESSAGE TO REPLY TO#

- originalEmail: "{{reply_text}}"
- emailAnalysis: "{{reasoning}}"
- leadTemperature: "{{temperature}}"
- Lead Name: "{{lead_name}}"
- Deck already shared in thread: {{deck_already_shared}}
- Thread length: {{thread_length}} messages

#INSTRUCTIONS#

## Step 1 — Draft condition

- If leadTemperature is "cold", "for_later", or "out_of_office" (case-insensitive), output exactly: NO_REPLY_NEEDED
- Otherwise, proceed to draft.

## Step 2 — Answer the question directly

Read the lead's latest message carefully. Identify what they are specifically asking about or responding to. Draft a reply that answers THAT question directly. Do NOT re-introduce Zeffy, re-explain the business model, or re-share information already in the thread.

## Step 3 — Comparison deck rules (simplified for follow-ups)

Default: Do NOT include the deck. It was likely already shared.

ONLY include the deck if:
- deck_already_shared is false AND the lead is explicitly requesting comparison info or the deck
- The lead mentions sharing/forwarding to their team, ED, board, or leadership (sharing override)

If including: "Here is the PayPal vs Zeffy comparison deck: {{deck_link}}"

**Platform detection still applies** — if the lead mentions a non-PayPal platform, use the matching comparison URL:
- Stripe: https://www.zeffy.com/compare/zeffy-vs-stripe
- Squarespace: https://www.zeffy.com/compare/zeffy-vs-squarespace
- Eventbrite: https://www.zeffy.com/compare/zeffy-vs-eventbrite
- Venmo: https://www.zeffy.com/compare/zeffy-vs-venmo
- GoFundMe: https://www.zeffy.com/compare/zeffy-vs-gofundme
- Donorbox: https://www.zeffy.com/compare/zeffy-vs-donorbox
- Square: https://www.zeffy.com/compare/zeffy-vs-square
- Bloomerang: https://www.zeffy.com/compare/zeffy-vs-bloomerang
- Wild Apricot: https://www.zeffy.com/compare/zeffy-vs-wildapricot
- Unknown platform: https://www.zeffy.com/home/compare

## Step 4 — Knowledge base (for specific questions)

{{kb_articles}}

Use KB articles to answer product/feature/migration questions accurately. For basic pricing/free model questions, use the hard facts below instead.

## Step 5 — Verified facts & guardrails

**HARD FACTS (use these exact figures):**
- Zeffy serves 100,000+ nonprofits.
- Zeffy is 100% free for nonprofits. $0 platform fees, $0 transaction fees.
- PayPal charges 1.99% + $0.49 per transaction.
- Zeffy is funded by optional donor contributions at checkout. About two-thirds of donors choose to contribute.
- Zeffy features: donations, events, raffles, auctions, stores, memberships, donor CRM, automated tax receipts.
- Case studies: https://www.zeffy.com/home/case-studies
- Register: https://www.zeffy.com/register
- Demo: https://www.zeffy.com/home/demo

**CRITICAL RULES:**
- DO NOT use "$100 raised = $100 kept" on follow-ups. That phrase is for first replies only.
- DO NOT list Zeffy product suite unless specifically asked.
- DO NOT offer 1-on-1 calls. Redirect to demo page when requested.
- DO NOT invent phone numbers. NEVER include any phone number.
- DO NOT invent savings figures or fictional nonprofits.
- DO NOT re-send the deck if already shared (check thread history).
- DO NOT repeat information Julia already said in the thread.

## Step 6 — Tone and style

**TONE MIRRORING:**
- If the lead wrote 1 sentence, reply with 2-4 sentences max.
- If the lead wrote a paragraph with details, reply with 4-7 sentences.
- Match formality: casual lead = casual Julia, formal lead = professional but warm Julia.
- Match energy: enthusiastic lead = enthusiastic reply, matter-of-fact = matter-of-fact.

**NO FAKE HYPE OR FLATTERY.** Do NOT comment on the lead's mission or organization unless they brought it up.

Warm, helpful, conversational (Julia's voice). One clear next step.

## Step 7 — Formatting

- Email body text only.
- Start with: "Hi {firstName}," or "Hey {firstName},"
- End with: "Best," or "Warmly," + "Julia" on the next line.`;

// Check if a question is basic pricing/free model (skip semantic KB for these)
function isBasicPricingQuestion(text: string): boolean {
  const patterns = [
    /is it (really )?(truly )?(actually )?free/i,
    /how (do|does) (you|zeffy) make money/i,
    /what'?s the catch/i,
    /no fees/i,
    /how (is|are) (you|zeffy) funded/i,
    /100%? free/i,
    /transaction fees?/i,
    /platform fees?/i,
    /how much does (it|zeffy) cost/i,
    /pricing/i,
  ];
  return patterns.some((p) => p.test(text));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { reply_id } = await req.json();
    if (!reply_id) {
      return new Response(JSON.stringify({ error: "Missing reply_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: reply } = await supabase.from("inbound_replies").select("*").eq("id", reply_id).single();
    if (!reply) throw new Error("Reply not found");

    // Determine mode: first-reply vs follow-up
    const isFirstReply = reply.is_first_reply === true;
    const mode = isFirstReply ? "first-reply" : "follow-up";

    // Extract CC email addresses requested in the reply body
    const ccPattern = /(?:please\s+)?(?:cc|copy|include|add|loop\s+in)\s+[:\s]*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
    const replyText = reply.reply_text || "";
    const extractedCcs: string[] = [];
    let ccMatch;
    while ((ccMatch = ccPattern.exec(replyText)) !== null) {
      const email = ccMatch[1].toLowerCase();
      if (!extractedCcs.includes(email)) extractedCcs.push(email);
    }

    // Merge extracted CCs with existing ones
    if (extractedCcs.length > 0) {
      const existingCcs: string[] = reply.cc_emails || [];
      const mergedCcs = [...new Set([...existingCcs, ...extractedCcs])];
      await supabase.from("inbound_replies").update({ cc_emails: mergedCcs }).eq("id", reply_id);
      reply.cc_emails = mergedCcs;
    }

    // Get settings
    const { data: settings } = await supabase.from("app_settings").select("*").single();

    // Get campaign context
    let campaignDeck = settings?.default_deck_link || "";
    let campaignCalendar = settings?.default_calendar_link || "";
    if (reply.campaign_id) {
      const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", reply.campaign_id).single();
      if (campaign?.deck_link) campaignDeck = campaign.deck_link;
      if (campaign?.calendar_link) campaignCalendar = campaign.calendar_link;
    }

    // Build thread context for follow-ups
    let threadContext = { entries: [], formatted: "", deckAlreadyShared: false, threadLength: 0 } as Awaited<ReturnType<typeof buildThreadContext>>;
    if (!isFirstReply) {
      try {
        threadContext = await buildThreadContext(supabase, reply.lead_email, reply_id);
      } catch (err) {
        console.warn("Thread context build failed (non-fatal):", err);
      }
    }

    // KB search — different strategies for first-reply vs follow-up
    let kbContext = "";
    if (isFirstReply) {
      // First reply: basic tsquery search (existing behavior)
      kbContext = await searchKbLocal(supabase, replyText);
    } else {
      // Follow-up: semantic KB search for product/feature questions, skip for basic pricing
      if (!isBasicPricingQuestion(replyText)) {
        kbContext = await searchKbSemantic(replyText);
        // Fallback to local tsquery if semantic search fails
        if (!kbContext) {
          kbContext = await searchKbLocal(supabase, replyText);
        }
      }
    }

    // Select template based on mode
    const templateType = isFirstReply ? "draft_generation" : "follow_up_generation";
    const { data: template } = await supabase
      .from("prompt_templates")
      .select("*")
      .eq("template_type", templateType)
      .eq("active", true)
      .single();

    // Build prompt — use DB template if available, fallback to hardcoded
    let rawUserPrompt: string;
    let systemPrompt: string;

    if (isFirstReply) {
      rawUserPrompt = template?.user_prompt || DRAFT_USER_PROMPT;
      systemPrompt = template?.system_prompt || DRAFT_SYSTEM_PROMPT;
    } else {
      rawUserPrompt = template?.user_prompt || FOLLOW_UP_USER_PROMPT;
      systemPrompt = template?.system_prompt || FOLLOW_UP_SYSTEM_PROMPT;
    }

    // Replace template variables (superset of both prompt types)
    const userPrompt = rawUserPrompt
      .replace(/\{\{reply_text\}\}/g, reply.reply_text || "")
      .replace(/\{\{reasoning\}\}/g, reply.reasoning || "")
      .replace(/\{\{temperature\}\}/g, reply.temperature || "")
      .replace(/\{\{wants_pdf\}\}/g, String(reply.wants_pdf || false))
      .replace(/\{\{is_first_reply\}\}/g, String(reply.is_first_reply || false))
      .replace(/\{\{lead_name\}\}/g, reply.sender_name || reply.lead_name || reply.lead_email || "")
      .replace(/\{\{deck_link\}\}/g, campaignDeck)
      .replace(/\{\{calendar_link\}\}/g, campaignCalendar)
      .replace(/\{\{kb_articles\}\}/g, kbContext)
      .replace(/\{\{thread_history\}\}/g, threadContext.formatted || "No previous thread history.")
      .replace(/\{\{deck_already_shared\}\}/g, String(threadContext.deckAlreadyShared))
      .replace(/\{\{thread_length\}\}/g, String(threadContext.threadLength));

    const result = await callAnthropic({
      model: template?.model_name || "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{
        name: "generate_draft",
        description: "Generate an email draft reply",
        input_schema: {
          type: "object",
          properties: {
            body_email_response: { type: "string", description: "The email reply text" },
          },
          required: ["body_email_response"],
        },
      }],
      tool_choice: { type: "tool", name: "generate_draft" },
    });

    const draftText = (result.body_email_response as string) || "";

    // If AI says no reply needed, mark as skipped — don't clog the review queue
    if (draftText.trim() === "NO_REPLY_NEEDED" || draftText.trim().startsWith("NO_REPLY_NEEDED")) {
      await supabase.from("inbound_replies").update({ status: "skipped" }).eq("id", reply_id);
      await supabase.from("audit_logs").insert({
        reply_id,
        event_type: "draft_skipped_no_action",
        event_payload: { reason: "AI determined no reply needed", temperature: reply.temperature, mode, model: template?.model_name || "claude-sonnet-4-20250514" },
      });
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "no_reply_needed" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert text to simple HTML
    const draftHtml = `<p>${draftText.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;

    // Save draft with mode-specific created_by
    const createdBy = `ai:${mode}`;
    await supabase.from("draft_versions").insert({
      reply_id,
      version_number: 1,
      draft_text: draftText,
      draft_html: draftHtml,
      created_by: createdBy,
    });

    // Check if auto-send is enabled for simple affirmatives
    const shouldAutoSend = settings?.auto_send_simple_affirmative === true
      && reply.temperature === "simple"
      && reply.simple_affirmative === true
      && reply.is_first_reply === true;

    await supabase.from("inbound_replies").update({
      status: shouldAutoSend ? "approved" : "awaiting_review",
      auto_sent: shouldAutoSend || undefined,
    }).eq("id", reply_id);

    // If auto-send enabled for simple affirmative first replies, trigger send
    if (shouldAutoSend) {
      const sendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-reply`;
      fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ reply_id }),
      }).catch(console.error);
    }

    await supabase.from("audit_logs").insert({
      reply_id,
      event_type: "draft_generated",
      event_payload: {
        version: 1,
        mode,
        auto_send: shouldAutoSend,
        model: template?.model_name || "claude-sonnet-4-20250514",
        thread_length: threadContext.threadLength,
        deck_already_shared: threadContext.deckAlreadyShared,
        kb_search: kbContext ? "included" : "none",
      },
    });

    return new Response(JSON.stringify({ success: true, mode, auto_send: shouldAutoSend }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Generate draft error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Local tsquery-based KB search (used for first replies and as fallback)
async function searchKbLocal(supabase: any, replyText: string): Promise<string> {
  try {
    const searchText = (replyText || "").slice(0, 300);
    if (!searchText.trim()) return "";

    const words = searchText
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w: string) => w.length > 3)
      .slice(0, 10);

    if (words.length === 0) return "";

    const tsquery = words.join(" | ");
    const { data: kbResults } = await supabase
      .from("kb_articles")
      .select("title, url, category, content_snippet")
      .textSearch("search_vector", tsquery)
      .limit(3);

    if (kbResults && kbResults.length > 0) {
      return "\n\n**RELEVANT KNOWLEDGE BASE ARTICLES (use these to answer the lead's question accurately):**\n\n" +
        kbResults.map((a: any, i: number) =>
          `${i + 1}. **${a.title}** (${a.category})\n   URL: ${a.url}\n   Summary: ${a.content_snippet?.slice(0, 200)}...`
        ).join("\n\n");
    }
  } catch (kbErr) {
    console.warn("KB local search failed (non-fatal):", kbErr);
  }
  return "";
}

// Semantic KB search via edge function (used for follow-up product/feature questions)
async function searchKbSemantic(replyText: string): Promise<string> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return "";

    const response = await fetch(`${supabaseUrl}/functions/v1/search-kb`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        query: replyText.slice(0, 300),
        match_count: 3,
      }),
    });

    if (!response.ok) {
      console.warn("Semantic KB search returned:", response.status);
      return "";
    }

    const results = await response.json();
    if (!results || !Array.isArray(results) || results.length === 0) return "";

    // Filter by similarity threshold and format
    const relevant = results
      .filter((r: any) => r.similarity > 0.4)
      .slice(0, 3);

    if (relevant.length === 0) return "";

    return "\n\n**RELEVANT KNOWLEDGE BASE ARTICLES (use these to answer the lead's question accurately):**\n\n" +
      relevant.map((a: any, i: number) =>
        `${i + 1}. **${a.title}** (${a.category || "General"})\n   URL: ${a.url}\n   Summary: ${(a.content || a.content_snippet || "").slice(0, 800)}`
      ).join("\n\n");
  } catch (err) {
    console.warn("Semantic KB search failed (non-fatal):", err);
    return "";
  }
}
