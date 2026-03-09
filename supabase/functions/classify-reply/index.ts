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
            category: { type: "string", enum: ["hot", "warm", "for_later", "cold", "out_of_office"], description: "Lead temperature classification" },
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

    const shouldSkip = ["cold", "for_later", "out_of_office"].includes(category);
    const newStatus = shouldSkip ? "skipped" : "classified";

    await updateReply(supabase, reply_id, newStatus, category, reasoning, wants_pdf, simple_affirmative, sentiment);

    // If hot or warm, trigger draft generation
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

function respond(data: any) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
  });
}
