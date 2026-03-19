import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rule-based pre-filters
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

const BATCH_SIZE = 10;
const DELAY_MS = 1500; // Delay between AI calls to avoid rate limits

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get unclassified emails
    const { data: emails, error } = await supabase
      .from("untracked_emails")
      .select("*")
      .is("triage_category", null)
      .is("archived_at", null)
      .order("received_at", { ascending: false })
      .limit(BATCH_SIZE);

    if (error) throw error;
    if (!emails?.length) {
      return new Response(JSON.stringify({ message: "Nothing to classify", classified: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let classified = 0;
    let ruleMatched = 0;
    let aiClassified = 0;
    let errors = 0;

    // Get prompt template
    const { data: template } = await supabase
      .from("prompt_templates")
      .select("*")
      .eq("template_type", "untracked_triage")
      .eq("active", true)
      .single();

    const systemPrompt = template?.system_prompt ||
      "You are an email triage assistant for Zeffy, a 100% free fundraising platform for nonprofits. Classify inbound emails that are NOT replies to outreach campaigns.";

    for (const email of emails) {
      try {
        const text = (email.body_text || email.content_preview || "").trim();
        const subject = (email.subject || "").trim();
        const sender = (email.sender_email || "").trim();
        const combined = `${subject} ${text}`;

        // --- Rule-based pre-filter ---
        let triageData: Record<string, unknown> | null = null;

        if (email.is_auto_reply) {
          triageData = {
            triage_category: "auto_reply",
            triage_reasoning: "Instantly flagged as auto-reply",
            triage_confidence: 1.0,
            is_lead_signal: false,
            suggested_action: "ignore",
            review_status: "ignored",
            archived_at: new Date().toISOString(),
          };
        } else if (AUTO_REPLY_SENDERS.some(p => p.test(sender))) {
          triageData = {
            triage_category: "auto_reply",
            triage_reasoning: `Auto-reply sender: ${sender}`,
            triage_confidence: 1.0,
            is_lead_signal: false,
            suggested_action: "ignore",
            review_status: "ignored",
            archived_at: new Date().toISOString(),
          };
        } else if (AUTO_REPLY_PATTERNS.some(p => p.test(combined))) {
          triageData = {
            triage_category: "auto_reply",
            triage_reasoning: "Auto-reply content pattern",
            triage_confidence: 1.0,
            is_lead_signal: false,
            suggested_action: "ignore",
            review_status: "ignored",
            archived_at: new Date().toISOString(),
          };
        } else if (SPAM_PATTERNS.some(p => p.test(combined))) {
          triageData = {
            triage_category: "spam",
            triage_reasoning: "Spam content pattern",
            triage_confidence: 1.0,
            is_lead_signal: false,
            suggested_action: "ignore",
            review_status: "spam",
            archived_at: new Date().toISOString(),
          };
        } else if (NEWSLETTER_PATTERNS.some(p => p.test(combined))) {
          triageData = {
            triage_category: "newsletter",
            triage_reasoning: "Newsletter pattern (unsubscribe/view in browser)",
            triage_confidence: 0.95,
            is_lead_signal: false,
            suggested_action: "ignore",
            review_status: "ignored",
            archived_at: new Date().toISOString(),
          };
        } else if (!text && !subject) {
          triageData = {
            triage_category: "noise",
            triage_reasoning: "Empty email",
            triage_confidence: 1.0,
            is_lead_signal: false,
            suggested_action: "ignore",
            review_status: "ignored",
            archived_at: new Date().toISOString(),
          };
        }

        if (triageData) {
          await supabase.from("untracked_emails").update(triageData).eq("id", email.id);
          ruleMatched++;
          classified++;
          continue;
        }

        // --- AI classification ---
        const rawUserPrompt = template?.user_prompt ||
          "Analyze this email:\n\nFrom: {{sender_email}}\nSubject: {{subject}}\nBody: {{body_text}}";

        const userPrompt = rawUserPrompt
          .replace(/\{\{sender_email\}\}/g, sender)
          .replace(/\{\{subject\}\}/g, subject)
          .replace(/\{\{body_text\}\}/g, text.slice(0, 3000));

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
                },
                reasoning: { type: "string" },
                confidence: { type: "number" },
                is_lead_signal: { type: "boolean" },
                suggested_action: {
                  type: "string",
                  enum: ["ignore", "review", "reply", "forward_to_sales", "forward_to_support"],
                },
              },
              required: ["category", "reasoning", "confidence", "is_lead_signal", "suggested_action"],
            },
          }],
          tool_choice: { type: "tool", name: "triage_untracked_email" },
        });

        const category = classification.category as string;
        const confidence = Number(classification.confidence) || 0.5;

        const autoArchiveCategories = ["spam", "newsletter", "auto_reply", "noise"];
        const shouldAutoArchive = autoArchiveCategories.includes(category) && confidence >= 0.9;

        const updateData: Record<string, unknown> = {
          triage_category: category,
          triage_reasoning: classification.reasoning as string,
          triage_confidence: confidence,
          is_lead_signal: classification.is_lead_signal === true,
          suggested_action: classification.suggested_action as string,
        };

        if (shouldAutoArchive) {
          updateData.review_status = category === "spam" ? "spam" : "ignored";
          updateData.archived_at = new Date().toISOString();
        }

        await supabase.from("untracked_emails").update(updateData).eq("id", email.id);
        aiClassified++;
        classified++;

        // Delay between AI calls
        if (aiClassified < emails.length) {
          await sleep(DELAY_MS);
        }
      } catch (err) {
        console.error(`Error classifying ${email.id}:`, err);
        errors++;
      }
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      event_type: "untracked_batch_classified",
      event_payload: { classified, rule_matched: ruleMatched, ai_classified: aiClassified, errors, batch_size: emails.length },
    });

    return new Response(JSON.stringify({
      success: true,
      classified,
      rule_matched: ruleMatched,
      ai_classified: aiClassified,
      errors,
      remaining: emails.length === BATCH_SIZE ? "more to classify — invoke again" : "done",
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Batch classify error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
