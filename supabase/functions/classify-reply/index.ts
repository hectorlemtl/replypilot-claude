import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OOO_PATTERNS = [
  /out of (the )?office/i, /auto.?reply/i, /automatic reply/i, /on vacation/i,
  /on leave/i, /currently away/i, /will (be )?return/i, /away from (my )?email/i,
];
const UNSUBSCRIBE_PATTERNS = [/unsubscribe/i, /remove me/i, /stop emailing/i, /opt out/i];
const COLD_PATTERNS = [
  /not interested/i, /no thanks/i, /no thank you/i, /please remove/i,
  /don't contact/i, /do not contact/i, /wrong person/i,
];

// Replies that are conversational noise — no response needed
// These are short acknowledgments, corrections, or filler that don't ask or request anything
const NO_REPLY_PATTERNS = [
  /^thanks!?\.?$/i, /^thank you!?\.?$/i, /^thx!?\.?$/i, /^ty!?\.?$/i,
  /^ok!?\.?$/i, /^okay!?\.?$/i, /^k\.?$/i,
  /^got it!?\.?$/i, /^noted!?\.?$/i, /^understood!?\.?$/i,
  /^no worries!?\.?$/i, /^no problem!?\.?$/i, /^np!?\.?$/i,
  /^(ha)+!?\.?$/i, /^lol!?\.?$/i, /^lmao!?\.?$/i, /^heh!?\.?$/i,
  /^great!?\.?$/i, /^nice!?\.?$/i, /^cool!?\.?$/i, /^awesome!?\.?$/i,
  /^perfect!?\.?$/i, /^wonderful!?\.?$/i,
  /^will do!?\.?$/i, /^roger!?\.?$/i, /^copy!?\.?$/i,
  /^👍?$/, /^🙏?$/, /^😊?$/, /^😁?$/, /^🤣?$/, /^❤️?$/,
];

// Check if text is very short AND is a correction, typo fix, or pure acknowledgment
function isNoReplyNeeded(text: string): boolean {
  // Strip whitespace and check against patterns
  const cleaned = text.replace(/\s+/g, " ").trim();

  // Direct pattern match
  if (NO_REPLY_PATTERNS.some((p) => p.test(cleaned))) return true;

  // Emoji-only messages (one or more emoji, no real text)
  if (/^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Emoji_Component}\s]+$/u.test(cleaned)) return true;

  // Very short messages (under 30 chars) that are corrections/typo fixes
  // e.g., "I mean zeffy. 😁", "I meant zeffy", "Oops, zeffy", "*zeffy"
  if (cleaned.length <= 40) {
    if (/^i mean(t)?\b/i.test(cleaned)) return true;
    if (/^oops\b/i.test(cleaned)) return true;
    if (/^\*\w+/i.test(cleaned)) return true; // *correction style
    if (/^(sorry|my bad),?\s/i.test(cleaned) && cleaned.length <= 30) return true;

    // "thanks for the info/update/details" — gratitude with no question
    if (/^thanks?\s+(for\s+)?(the\s+)?(info|update|details|information|sharing|letting)/i.test(cleaned)) return true;
  }

  return false;
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

    const { data: reply, error } = await supabase
      .from("inbound_replies")
      .select("*")
      .eq("id", reply_id)
      .single();

    if (error || !reply) throw new Error("Reply not found");

    const text = (reply.reply_text || "").trim();

    // Deterministic checks first
    if (!text) {
      await updateReply(supabase, reply_id, "skipped", "cold", "Empty reply text", false, false, "neutral");
      return respond({ classified: "cold", reason: "empty" });
    }

    if (OOO_PATTERNS.some((p) => p.test(text))) {
      await updateReply(supabase, reply_id, "skipped", "out_of_office", "Auto-detected out of office pattern", false, false, "auto_reply");
      return respond({ classified: "out_of_office", reason: "pattern_match" });
    }

    if (UNSUBSCRIBE_PATTERNS.some((p) => p.test(text))) {
      await updateReply(supabase, reply_id, "skipped", "cold", "Unsubscribe request detected", false, false, "negative");
      return respond({ classified: "cold", reason: "unsubscribe" });
    }

    if (COLD_PATTERNS.some((p) => p.test(text))) {
      await updateReply(supabase, reply_id, "skipped", "cold", "Negative/no-interest language detected", false, false, "negative");
      return respond({ classified: "cold", reason: "negative_pattern" });
    }

    if (isNoReplyNeeded(text)) {
      await updateReply(supabase, reply_id, "skipped", "no_reply_needed", "Conversational noise — no response needed", false, false, "neutral");
      return respond({ classified: "no_reply_needed", reason: "pattern_match" });
    }

    // AI classification via Anthropic Claude
    const { data: template } = await supabase
      .from("prompt_templates")
      .select("*")
      .eq("template_type", "classification")
      .eq("active", true)
      .single();

    const systemPrompt = template?.system_prompt || "Classify this email reply.";
    const userPrompt = (template?.user_prompt || "{{reply_text}}").replace("{{reply_text}}", text);

    const classification = await callAnthropic({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [{
        name: "classify_reply",
        description: "Classify an email reply",
        input_schema: {
          type: "object",
          properties: {
            category: { type: "string", enum: ["hot", "simple", "no_reply_needed", "for_later", "cold", "out_of_office"], description: "Lead temperature classification. 'hot' = interested lead needing a thoughtful reply. 'simple' = reply that NEEDS a response but is easy to answer (e.g., 'yes send it', 'tell me more', 'interested', 'sounds good, send me the info'). 'no_reply_needed' = conversational noise that does NOT need any response — acknowledgments ('thanks', 'got it', 'ok'), corrections ('I mean zeffy', '*zeffy'), emoji-only messages, filler ('no worries', 'lol'), or gratitude with no question ('thanks for the info'). Use 'no_reply_needed' when the message does not ask a question, request information, or express interest that warrants a follow-up." },
            reasoning: { type: "string", description: "Brief explanation of the classification" },
            wants_pdf: { type: "string", enum: ["true", "false"], description: "Whether the lead wants a PDF/deck" },
            simple_affirmative: { type: "string", enum: ["true", "false"], description: "Whether this is a simple yes/affirmative reply" },
            sentiment: { type: "string", enum: ["positive", "neutral", "negative", "auto_reply"], description: "Overall sentiment" },
          },
          required: ["category", "reasoning", "wants_pdf", "simple_affirmative", "sentiment"],
        },
      }],
      tool_choice: { type: "tool", name: "classify_reply" },
    });

    const category = classification.category as string;
    const reasoning = classification.reasoning as string;
    const wants_pdf = classification.wants_pdf === "true" || classification.wants_pdf === true;
    const simple_affirmative = classification.simple_affirmative === "true" || classification.simple_affirmative === true;
    const sentiment = classification.sentiment as string;

    const shouldSkip = ["cold", "for_later", "out_of_office", "no_reply_needed"].includes(category);
    const newStatus = shouldSkip ? "skipped" : "classified";

    await updateReply(supabase, reply_id, newStatus, category, reasoning, wants_pdf, simple_affirmative, sentiment);

    // Sync classification back to SmartLead if applicable
    if (reply.source === "smartlead" && reply.smartlead_lead_id) {
      syncSmartLeadCategory(reply.smartlead_lead_id, category).catch(console.error);
    }

    // If hot or simple, trigger draft generation
    if (!shouldSkip) {
      const draftUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-draft`;
      fetch(draftUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ reply_id }),
      }).catch(console.error);
    }

    return respond({ classified: category, reasoning });
  } catch (err) {
    console.error("Classify error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function updateReply(
  supabase: any, id: string, status: string, temperature: string,
  reasoning: string, wants_pdf: boolean, simple_affirmative: boolean, sentiment: string,
) {
  await supabase.from("inbound_replies").update({
    status, temperature, reasoning, wants_pdf, simple_affirmative, sentiment,
  }).eq("id", id);

  await supabase.from("audit_logs").insert({
    reply_id: id,
    event_type: "reply_classified",
    event_payload: { status, temperature, reasoning, wants_pdf, simple_affirmative, sentiment },
  });
}

// Map our temperature categories to SmartLead lead categories
const SMARTLEAD_CATEGORY_MAP: Record<string, string> = {
  hot: "Interested",
  simple: "Interested",
  no_reply_needed: "Not Interested",
  cold: "Not Interested",
  for_later: "Not Interested",
  out_of_office: "Out of Office",
};

async function syncSmartLeadCategory(leadId: string, temperature: string) {
  const apiKey = Deno.env.get("SMARTLEAD_API_KEY");
  if (!apiKey) return;

  const slCategory = SMARTLEAD_CATEGORY_MAP[temperature];
  if (!slCategory) return;

  try {
    await fetch(`https://server.smartlead.ai/api/v1/master-inbox/update-lead-category?api_key=${apiKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: leadId, category: slCategory }),
    });
  } catch (err) {
    console.error("SmartLead category sync failed:", err);
  }
}

function respond(data: any) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
  });
}
