import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropic } from "../_shared/anthropic.ts";
import { buildThreadContext } from "../_shared/thread-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_REVIEW_ITERATIONS = 4;

const REVIEW_SYSTEM_PROMPT = `You are a senior email quality reviewer for Zeffy's outbound campaign replies.

You review AI-generated drafts written as Julia (Head of Brand and Community at Zeffy) for the PayPal migration campaign. Your job is to catch issues before a human reviewer sees them. Be strict but fair.

You know these facts about Zeffy:
- Zeffy is 100% free for nonprofits. $0 platform fees, $0 transaction fees.
- Zeffy serves 100,000+ nonprofits.
- PayPal charges 1.99% + $0.49 per transaction.
- Zeffy is funded by optional donor contributions at checkout. About two-thirds of donors choose to contribute.
- Julia does NOT do 1-on-1 calls. Demo page: https://www.zeffy.com/home/demo
- Case studies: https://www.zeffy.com/home/case-studies
- Register: https://www.zeffy.com/register
- Migration guide: https://support.zeffy.com/migrating-to-zeffy-a-step-by-step-guide

NEVER use em-dashes or "--" or "-" in middle of sentence between words.`;

const REVIEW_USER_PROMPT = `Review this email draft against 6 criteria, then classify its complexity.

## Lead's original message
{{reply_text}}

## Lead temperature
{{temperature}}

## Thread history (previous exchanges)
{{thread_history}}

## Current draft to review
{{draft_text}}

## Relevant KB articles (for fact-checking)
{{kb_articles}}

## Draft metadata
- Mode: {{mode}} (first-reply or follow-up)
- Deck already shared: {{deck_already_shared}}
- Thread length: {{thread_length}} messages
- Comparison deck URL: {{deck_link}}

---

## REVIEW CRITERIA

### 1. LENGTH
The draft must roughly match the lead's reply length and tone. Rules:
- 1-2 sentence lead message → 3-5 sentence reply MAX
- Detailed paragraph with questions → 5-7 sentence reply
- If the draft is more than 2x the appropriate length, it FAILS.
- Simple "yes/sure/send it/I'll forward this" replies should get SHORT responses (2-4 sentences).

### 2. TONE
Must sound like Julia: warm, conversational, not salesy. Check for:
- Fake hype about the lead's mission or organization ("I love that you...", "It's wonderful that...", "That's fantastic that...") → FAIL
- Corporate jargon or robotic language → FAIL
- Overly enthusiastic or transactional tone → FAIL
- Em-dashes (—) or double dashes (--) in middle of sentences → FAIL
- Listing too many Zeffy features unprompted → FAIL

### 3. ACCURACY
All facts must match Zeffy's verified information and KB articles:
- Zeffy serves 100,000+ nonprofits (never any other number)
- PayPal charges 1.99% + $0.49
- No invented savings figures, case studies, or phone numbers
- No invented features or capabilities
- Links must be real Zeffy URLs from the KB articles or verified list
- If the draft mentions something not in the KB articles or verified facts, it FAILS.
- If the draft contains placeholder text like "[deck link]", "[deck_link]", "{deck_link}", "{{deck_link}}", or any bracketed variable instead of an actual URL → FAIL immediately. All links must be real, complete URLs.

### 4. RELEVANCE
- The draft MUST answer questions the lead actually asked
- The draft must NOT proactively explain things the lead didn't ask about
- If the lead said "yes, send it" or "I'll forward this" and the draft explains the business model or lists features → FAIL
- If the lead asked about migration and the draft doesn't address it → FAIL
- Answering unasked questions is a FAIL
- Simple acknowledgment replies (forwarding, thanking, saying they'll share with someone) only need: thanks + deck (if sharing override applies) + "let me know if you have questions." Nothing more.

### 5. THREAD COHERENCE (for follow-ups)
- Must NOT repeat information Julia already shared in the thread
- Must NOT re-share the deck if already sent (unless sharing override)
- Must NOT use "$100 raised = $100 kept" on follow-ups (first replies only)
- Must NOT contradict anything from thread history
- If this is a first reply, this criterion auto-passes

### 6. DECK PRESENCE & LANGUAGE (CRITICAL)
This is the most important criterion. The comparison deck is the core deliverable of this campaign.

**For FIRST REPLIES (mode=first-reply):**
- The draft MUST contain the actual comparison deck URL ({{deck_link}}) — not a promise to send it later, not a placeholder, not "I'd be happy to send..."
- The deck URL must be a real, complete URL (starts with https://). If it contains "[deck link]", "[link]", "{deck}", or any bracketed placeholder → FAIL
- If the draft says "I'll send over", "I'd be happy to share", "I can send", "Let me send" instead of actually including the URL right now → FAIL. The deck must be IN the email, not promised for later.
- The only exceptions where deck is NOT required: (a) lead explicitly asked NOT to receive materials, (b) lead asked about a non-PayPal platform AND the draft includes the correct comparison page URL instead
- Use present tense: "Here is your comparison deck:" or "Here's a breakdown:" — NOT past tense "I've shared" or "as I sent"

**For FOLLOW-UPS (mode=follow-up):**
- If deck_already_shared=true, do NOT re-share unless the lead is forwarding to someone new (sharing override)
- If deck_already_shared=false AND the lead is requesting comparison info, include the deck URL

**If deck URL is missing on a first reply, this is an automatic FAIL.** Your feedback MUST say: "MISSING DECK: Include the comparison deck URL in the email: {{deck_link}}"

---

## COMPLEXITY CLASSIFICATION

After reviewing, classify the reply into one of THREE tiers:

**AUTO_SENDABLE** — The reply is so straightforward it can be sent without any human review. ALL of these must be true:
- The lead's message is a simple acknowledgment with NO questions (e.g., "yes", "sure", "send it over", "I'll forward this", "thanks", "I'll pass this along to our treasurer")
- The draft is a brief acknowledgment (2-4 sentences) + deck link (if first reply) + "let me know if you have questions"
- No specific questions to answer, no objections, no ambiguity
- The draft contains no claims that need fact-checking (no specific numbers, no feature descriptions beyond "100% free")
- The lead is not asking for a call, demo, or specific information
- Examples: "Sure, send it" → deck + thanks. "I'll forward to our treasurer" → thanks + deck for sharing. "Thanks for the info" → brief acknowledgment.

**SIMPLE** — Quick human glance needed but no deep thinking required. Examples:
- Lead asked a basic question that the draft answers correctly (e.g., "how is it free?")
- Lead is forwarding AND asking a simple question
- The draft includes a KB link or specific feature mention that needs a quick accuracy check
- Lead expressed mild skepticism ("sounds too good to be true") but the draft handles it well

**COMPLEX** — Needs careful human review. Examples:
- Lead asked specific technical questions about features, migration, or integrations
- Lead raised objections or concerns that require nuanced handling
- Lead's situation involves multiple decision-makers with different needs
- Lead asked about a non-PayPal platform comparison
- Lead mentioned specific use cases (events, raffles, memberships) that need accurate answers
- Any ambiguity about what the lead is asking
- The draft makes claims that could be wrong

---

Evaluate each criterion carefully. If ALL pass, verdict is "pass". If ANY fails, verdict is "fail" with specific, actionable feedback for the draft writer to fix it in one round.

Your feedback should be concise and direct: "Too long, cut to 3 sentences. Lead just forwarded the email, only needs thanks + deck for the new person. Drop the business model explanation."`;

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

    // Mark as reviewing
    await supabase.from("inbound_replies").update({
      review_status: "reviewing",
      review_iterations: 0,
    }).eq("id", reply_id);

    // Determine mode
    const isFirstReply = reply.is_first_reply === true;
    const mode = isFirstReply ? "first-reply" : "follow-up";

    // Build thread context
    let threadContext = { entries: [], formatted: "", deckAlreadyShared: false, threadLength: 0 } as Awaited<ReturnType<typeof buildThreadContext>>;
    if (!isFirstReply) {
      try {
        threadContext = await buildThreadContext(supabase, reply.lead_email, reply_id);
      } catch (err) {
        console.warn("Thread context build failed (non-fatal):", err);
      }
    }

    // Get deck link (campaign-specific or default)
    const { data: settings } = await supabase.from("app_settings").select("*").single();
    let campaignDeck = settings?.default_deck_link || "";
    let campaignCalendar = settings?.default_calendar_link || "";
    if (reply.campaign_id) {
      const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", reply.campaign_id).single();
      if (campaign?.deck_link) campaignDeck = campaign.deck_link;
      if (campaign?.calendar_link) campaignCalendar = campaign.calendar_link;
    }

    // KB search for fact-checking context
    let kbContext = "";
    try {
      kbContext = await searchKbLocal(supabase, reply.reply_text || "");
    } catch (err) {
      console.warn("KB search failed (non-fatal):", err);
    }

    let iterations = 0;
    let finalVerdict = "fail";
    let lastReviewResult: any = null;

    for (let i = 0; i < MAX_REVIEW_ITERATIONS; i++) {
      // Fetch latest draft
      const { data: latestDraft } = await supabase
        .from("draft_versions")
        .select("*")
        .eq("reply_id", reply_id)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      if (!latestDraft) throw new Error("No draft found to review");

      // Build review prompt
      const userPrompt = REVIEW_USER_PROMPT
        .replace(/\{\{reply_text\}\}/g, reply.reply_text || "")
        .replace(/\{\{temperature\}\}/g, reply.temperature || "")
        .replace(/\{\{thread_history\}\}/g, threadContext.formatted || "No previous thread history.")
        .replace(/\{\{draft_text\}\}/g, latestDraft.draft_text)
        .replace(/\{\{kb_articles\}\}/g, kbContext || "No KB articles found.")
        .replace(/\{\{mode\}\}/g, mode)
        .replace(/\{\{deck_already_shared\}\}/g, String(threadContext.deckAlreadyShared))
        .replace(/\{\{thread_length\}\}/g, String(threadContext.threadLength))
        .replace(/\{\{deck_link\}\}/g, campaignDeck);

      // Call Claude to review
      const reviewResult = await callAnthropic({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: REVIEW_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
        tools: [{
          name: "review_draft",
          description: "Review an email draft against quality criteria",
          input_schema: {
            type: "object",
            properties: {
              verdict: { type: "string", enum: ["pass", "fail"], description: "Overall review verdict" },
              complexity: { type: "string", enum: ["auto_sendable", "simple", "complex"], description: "Reply complexity: auto_sendable (can be sent without review), simple (quick glance), or complex (needs careful review)" },
              length_score: { type: "string", enum: ["pass", "fail"], description: "Length criterion result" },
              tone_score: { type: "string", enum: ["pass", "fail"], description: "Tone criterion result" },
              accuracy_score: { type: "string", enum: ["pass", "fail"], description: "Accuracy criterion result" },
              relevance_score: { type: "string", enum: ["pass", "fail"], description: "Relevance criterion result" },
              coherence_score: { type: "string", enum: ["pass", "fail"], description: "Thread coherence criterion result" },
              deck_language_score: { type: "string", enum: ["pass", "fail"], description: "Deck sharing language/tense criterion result" },
              issues: { type: "string", description: "Specific issues found. Empty string if pass." },
              feedback: { type: "string", description: "Actionable feedback for regeneration. Empty string if pass." },
            },
            required: ["verdict", "complexity", "length_score", "tone_score", "accuracy_score", "relevance_score", "coherence_score", "deck_language_score", "issues", "feedback"],
          },
        }],
        tool_choice: { type: "tool", name: "review_draft" },
      });

      iterations++;
      lastReviewResult = reviewResult;

      // Log review iteration
      await supabase.from("audit_logs").insert({
        reply_id,
        event_type: "draft_reviewed",
        event_payload: {
          iteration: iterations,
          verdict: reviewResult.verdict,
          complexity: reviewResult.complexity,
          scores: {
            length: reviewResult.length_score,
            tone: reviewResult.tone_score,
            accuracy: reviewResult.accuracy_score,
            relevance: reviewResult.relevance_score,
            coherence: reviewResult.coherence_score,
            deck_language: reviewResult.deck_language_score,
          },
          issues: reviewResult.issues,
          feedback: reviewResult.feedback,
          draft_version: latestDraft.version_number,
        },
      });

      // Update iteration count in real-time
      await supabase.from("inbound_replies").update({
        review_iterations: iterations,
      }).eq("id", reply_id);

      if (reviewResult.verdict === "pass") {
        finalVerdict = "pass";
        break;
      }

      // If not the last iteration, trigger regeneration with the feedback
      if (i < MAX_REVIEW_ITERATIONS - 1) {
        const feedback = String(reviewResult.feedback || reviewResult.issues || "Improve the draft quality");

        // Call regenerate-draft directly (inline, not via HTTP) to avoid version cap issues
        const nextVersion = latestDraft.version_number + 1;

        // Build mode guidance
        let modeGuidance = "";
        if (mode === "first-reply") {
          modeGuidance = `This is a FIRST REPLY. You MUST include the comparison deck URL in the email body. The URL is: ${campaignDeck}
Use present tense: "Here is your PayPal vs Zeffy comparison deck:" followed by the URL.
Do NOT promise to send it later. Do NOT use placeholders. The URL must appear in your output.
Match reply length to lead's message.`;
        } else {
          modeGuidance = `This is a FOLLOW-UP. Deck already shared: ${threadContext.deckAlreadyShared}. Do NOT repeat info already shared.\n\nThread history:\n${threadContext.formatted}`;
        }

        // Get regeneration template
        const { data: template } = await supabase
          .from("prompt_templates")
          .select("*")
          .eq("template_type", "regeneration")
          .eq("active", true)
          .single();

        const regenSystemPrompt = template?.system_prompt || `You are Julia from Zeffy. Revise the email draft based on feedback.

MAKE SURE NEVER TO USE "\u2014" or any "--" or any "-" in middle of sentence between words like an AI is doing.

**HARD FACTS (use these exact figures):**
- Zeffy serves 100,000+ nonprofits.
- Zeffy is 100% free for nonprofits. $0 platform fees, $0 transaction fees.
- PayPal charges 1.99% + $0.49 per transaction.
- Zeffy is funded by optional donor contributions at checkout.

**CRITICAL RULES:**
- DO NOT offer 1-on-1 calls. Redirect to demo page (https://www.zeffy.com/home/demo) when requested.
- DO NOT invent phone numbers. NEVER include any phone number.
- DO NOT invent savings figures or fictional nonprofits.
- DO NOT end with "Would a quick call be helpful?" or similar.
- Sign as "Julia" only.`;

        const regenUserPromptTemplate = template?.user_prompt || `Mode: {{mode}}

{{mode_guidance}}

Original email from lead: {{reply_text}}

Previous draft: {{previous_draft}}

Feedback to incorporate: {{feedback}}

COMPARISON DECK URL (use this exact URL when including the deck): {{deck_link}}
Calendar link: {{calendar_link}}

CRITICAL: When the draft should include the comparison deck, you MUST use the exact URL above ({{deck_link}}). NEVER write "[deck link]", "[deck_link]", "{deck_link}", or any placeholder. Always use the full URL directly in the email text.

Revise the draft to address the feedback while keeping Julia's warm, concise voice. Match reply length to the lead's message. 4-7 sentences max.`;

        const regenUserPrompt = regenUserPromptTemplate
          .replace(/\{\{reply_text\}\}/g, reply.reply_text || "")
          .replace(/\{\{previous_draft\}\}/g, latestDraft.draft_text)
          .replace(/\{\{feedback\}\}/g, feedback)
          .replace(/\{\{calendar_link\}\}/g, campaignCalendar)
          .replace(/\{\{deck_link\}\}/g, campaignDeck)
          .replace(/\{\{mode\}\}/g, mode)
          .replace(/\{\{mode_guidance\}\}/g, modeGuidance)
          .replace(/\{\{thread_context\}\}/g, threadContext.formatted || "")
          .replace(/\{\{deck_already_shared\}\}/g, String(threadContext.deckAlreadyShared));

        const regenResult = await callAnthropic({
          model: template?.model_name || "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: regenSystemPrompt,
          messages: [{ role: "user", content: regenUserPrompt }],
          tools: [{
            name: "regenerate_draft",
            description: "Regenerate an email draft with feedback",
            input_schema: {
              type: "object",
              properties: {
                revised_body_email_response: { type: "string", description: "The revised email reply text" },
              },
              required: ["revised_body_email_response"],
            },
          }],
          tool_choice: { type: "tool", name: "regenerate_draft" },
        });

        const draftText = (regenResult.revised_body_email_response as string) || "";
        const draftHtml = `<p>${draftText.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;

        await supabase.from("draft_versions").insert({
          reply_id,
          version_number: nextVersion,
          draft_text: draftText,
          draft_html: draftHtml,
          created_by: `ai:review-${mode}`,
          feedback_used: feedback,
        });

        await supabase.from("audit_logs").insert({
          reply_id,
          event_type: "draft_regenerated_by_reviewer",
          event_payload: {
            version: nextVersion,
            iteration: iterations,
            feedback,
            mode,
          },
        });
      }
    }

    // Final status update
    const complexity = lastReviewResult?.complexity || "complex";
    const reviewStatus = finalVerdict === "pass"
      ? (complexity === "auto_sendable" ? "auto_sendable" : "reviewed")
      : "needs_human";

    const updatePayload: Record<string, any> = {
      review_status: reviewStatus,
      review_iterations: iterations,
      status: "awaiting_review",
    };

    // Reclassify temperature based on complexity
    if (finalVerdict === "pass" && (complexity === "simple" || complexity === "auto_sendable")) {
      updatePayload.temperature = "simple";
    }

    await supabase.from("inbound_replies").update(updatePayload).eq("id", reply_id);

    return new Response(JSON.stringify({
      success: true,
      verdict: finalVerdict,
      iterations,
      review_status: reviewStatus,
      last_review: lastReviewResult,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Review draft error:", err);

    // Try to reset review_status on error
    try {
      const { reply_id } = await req.clone().json();
      if (reply_id) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await supabase.from("inbound_replies").update({
          review_status: null,
        }).eq("id", reply_id);
      }
    } catch (_) { /* ignore cleanup errors */ }

    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Local tsquery-based KB search for fact-checking
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
      return "\n\n**RELEVANT KNOWLEDGE BASE ARTICLES:**\n\n" +
        kbResults.map((a: any, i: number) =>
          `${i + 1}. **${a.title}** (${a.category})\n   URL: ${a.url}\n   Summary: ${a.content_snippet?.slice(0, 200)}...`
        ).join("\n\n");
    }
  } catch (kbErr) {
    console.warn("KB search failed (non-fatal):", kbErr);
  }
  return "";
}
