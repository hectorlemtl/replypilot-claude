import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rule-based pre-filters (skip AI call when pattern matches)
const AUTO_REPLY_PATTERNS = [
  /out of (the )?office/i, /auto.?reply/i, /automatic reply/i,
  /on vacation/i, /on leave/i, /currently away/i, /will (be )?return/i,
  /away from (my )?email/i, /delivery (status )?notification/i,
  /undeliverable/i, /mail delivery failed/i,
];
const AUTO_REPLY_SENDERS = [
  /noreply@/i, /no-reply@/i, /no_reply@/i,
  /mailer-daemon@/i, /postmaster@/i, /bounce@/i,
];

const NEWSLETTER_PATTERNS = [
  /\bunsubscribe\b/i, /\bview in browser\b/i, /\bemail preferences\b/i,
  /\bmanage subscription\b/i, /\bopt out\b/i, /\bmailing list\b/i,
];

const SPAM_PATTERNS = [
  /\bviagra\b/i, /\bcrypto opportunity\b/i, /\blottery\b/i,
  /\bwinning notification\b/i, /\bclaim your prize\b/i,
  /\bact now\b.*\blimited time\b/i, /\bcongratulations.*won\b/i,
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { untracked_id } = await req.json();
    if (!untracked_id) {
      return new Response(JSON.stringify({ error: "Missing untracked_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: email, error } = await supabase
      .from("untracked_emails")
      .select("*")
      .eq("id", untracked_id)
      .single();

    if (error || !email) throw new Error("Untracked email not found");

    const text = (email.body_text || email.content_preview || "").trim();
    const subject = (email.subject || "").trim();
    const sender = (email.sender_email || "").trim();
    const combined = `${subject} ${text}`;

    // --- Rule-based pre-filter ---

    // Instantly already flagged as auto-reply
    if (email.is_auto_reply) {
      await updateTriage(supabase, untracked_id, {
        triage_category: "auto_reply",
        triage_reasoning: "Instantly flagged as auto-reply",
        triage_confidence: 1.0,
        is_lead_signal: false,
        suggested_action: "ignore",
        review_status: "ignored",
        archived_at: new Date().toISOString(),
      });
      return respond({ classified: "auto_reply", method: "instantly_flag" });
    }

    // Auto-reply sender patterns
    if (AUTO_REPLY_SENDERS.some((p) => p.test(sender))) {
      await updateTriage(supabase, untracked_id, {
        triage_category: "auto_reply",
        triage_reasoning: `Auto-reply sender detected: ${sender}`,
        triage_confidence: 1.0,
        is_lead_signal: false,
        suggested_action: "ignore",
        review_status: "ignored",
        archived_at: new Date().toISOString(),
      });
      return respond({ classified: "auto_reply", method: "sender_pattern" });
    }

    // Auto-reply content patterns
    if (AUTO_REPLY_PATTERNS.some((p) => p.test(combined))) {
      await updateTriage(supabase, untracked_id, {
        triage_category: "auto_reply",
        triage_reasoning: "Auto-reply content pattern detected",
        triage_confidence: 1.0,
        is_lead_signal: false,
        suggested_action: "ignore",
        review_status: "ignored",
        archived_at: new Date().toISOString(),
      });
      return respond({ classified: "auto_reply", method: "content_pattern" });
    }

    // Spam patterns
    if (SPAM_PATTERNS.some((p) => p.test(combined))) {
      await updateTriage(supabase, untracked_id, {
        triage_category: "spam",
        triage_reasoning: "Spam content pattern detected",
        triage_confidence: 1.0,
        is_lead_signal: false,
        suggested_action: "ignore",
        review_status: "spam",
        archived_at: new Date().toISOString(),
      });
      return respond({ classified: "spam", method: "content_pattern" });
    }

    // Newsletter patterns
    if (NEWSLETTER_PATTERNS.some((p) => p.test(combined))) {
      await updateTriage(supabase, untracked_id, {
        triage_category: "newsletter",
        triage_reasoning: "Newsletter pattern detected (unsubscribe/view in browser)",
        triage_confidence: 0.95,
        is_lead_signal: false,
        suggested_action: "ignore",
        review_status: "ignored",
        archived_at: new Date().toISOString(),
      });
      return respond({ classified: "newsletter", method: "content_pattern" });
    }

    // Empty body
    if (!text && !subject) {
      await updateTriage(supabase, untracked_id, {
        triage_category: "noise",
        triage_reasoning: "Empty email — no subject or body",
        triage_confidence: 1.0,
        is_lead_signal: false,
        suggested_action: "ignore",
        review_status: "ignored",
        archived_at: new Date().toISOString(),
      });
      return respond({ classified: "noise", method: "empty" });
    }

    // --- AI classification ---

    // Get prompt template from DB
    const { data: template } = await supabase
      .from("prompt_templates")
      .select("*")
      .eq("template_type", "untracked_triage")
      .eq("active", true)
      .single();

    const systemPrompt = template?.system_prompt ||
      "You are an email triage assistant for Zeffy, a 100% free fundraising platform for nonprofits. Classify inbound emails that are NOT replies to outreach campaigns.";

    const rawUserPrompt = template?.user_prompt ||
      "Analyze this email:\n\nFrom: {{sender_email}}\nSubject: {{subject}}\nBody: {{body_text}}";

    const userPrompt = rawUserPrompt
      .replace(/\{\{sender_email\}\}/g, sender)
      .replace(/\{\{subject\}\}/g, subject)
      .replace(/\{\{body_text\}\}/g, text.slice(0, 3000)); // Cap body to control token usage

    const classification = await callAnthropic({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{
        name: "triage_untracked_email",
        description: "Classify an untracked inbound email",
        input_schema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: ["spam", "newsletter", "auto_reply", "noise",
                     "support_request", "nonprofit_interest",
                     "partnership", "media_request", "other"],
              description: "Email category",
            },
            reasoning: {
              type: "string",
              description: "Brief explanation of classification",
            },
            confidence: {
              type: "number",
              description: "Confidence score from 0.0 to 1.0",
            },
            is_lead_signal: {
              type: "boolean",
              description: "True if this represents potential interest in Zeffy",
            },
            suggested_action: {
              type: "string",
              enum: ["ignore", "review", "reply", "forward_to_sales", "forward_to_support"],
              description: "Recommended next action",
            },
          },
          required: ["category", "reasoning", "confidence", "is_lead_signal", "suggested_action"],
        },
      }],
      tool_choice: { type: "tool", name: "triage_untracked_email" },
    });

    const category = classification.category as string;
    const reasoning = classification.reasoning as string;
    const confidence = Number(classification.confidence) || 0.5;
    const isLeadSignal = classification.is_lead_signal === true;
    const suggestedAction = classification.suggested_action as string;

    // Auto-archive high-confidence spam/noise/newsletter
    const autoArchiveCategories = ["spam", "newsletter", "auto_reply", "noise"];
    const shouldAutoArchive = autoArchiveCategories.includes(category) && confidence >= 0.9;

    const triageData: Record<string, unknown> = {
      triage_category: category,
      triage_reasoning: reasoning,
      triage_confidence: confidence,
      is_lead_signal: isLeadSignal,
      suggested_action: suggestedAction,
    };

    if (shouldAutoArchive) {
      triageData.review_status = category === "spam" ? "spam" : "ignored";
      triageData.archived_at = new Date().toISOString();
    }

    await updateTriage(supabase, untracked_id, triageData);

    // Audit log
    await supabase.from("audit_logs").insert({
      event_type: "untracked_classified",
      event_payload: {
        untracked_id,
        category,
        confidence,
        is_lead_signal: isLeadSignal,
        suggested_action: suggestedAction,
        auto_archived: shouldAutoArchive,
        method: "ai",
      },
    });

    return respond({ classified: category, confidence, is_lead_signal: isLeadSignal });
  } catch (err) {
    console.error("Classify untracked error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function updateTriage(
  supabase: any,
  id: string,
  data: Record<string, unknown>,
) {
  await supabase.from("untracked_emails").update(data).eq("id", id);
}

function respond(data: any) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
  });
}
