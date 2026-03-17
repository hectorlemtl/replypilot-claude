import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropic } from "../_shared/anthropic.ts";
import { buildThreadContext } from "../_shared/thread-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { reply_id, feedback } = await req.json();
    if (!reply_id || !feedback) {
      return new Response(JSON.stringify({ error: "Missing reply_id or feedback" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: reply } = await supabase.from("inbound_replies").select("*").eq("id", reply_id).single();
    if (!reply) throw new Error("Reply not found");

    // Get latest draft
    const { data: latestDraft } = await supabase
      .from("draft_versions")
      .select("*")
      .eq("reply_id", reply_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    if (!latestDraft) throw new Error("No existing draft to regenerate from");

    const nextVersion = latestDraft.version_number + 1;

    // Max 2 AI rounds
    if (nextVersion > 2) {
      await supabase.from("inbound_replies").update({ status: "manual_review" }).eq("id", reply_id);
      await supabase.from("audit_logs").insert({
        reply_id,
        event_type: "max_regenerations_reached",
        event_payload: { version: nextVersion },
      });
      return new Response(JSON.stringify({ message: "Max AI rounds reached, moved to manual review" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect mode from created_by field
    const createdBy = latestDraft.created_by || "";
    const mode = createdBy.includes("follow-up") ? "follow-up" : "first-reply";

    // Get settings for links
    const { data: settings } = await supabase.from("app_settings").select("*").single();
    let campaignCalendar = settings?.default_calendar_link || "";
    let campaignDeck = settings?.default_deck_link || "";
    if (reply.campaign_id) {
      const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", reply.campaign_id).single();
      if (campaign?.calendar_link) campaignCalendar = campaign.calendar_link;
      if (campaign?.deck_link) campaignDeck = campaign.deck_link;
    }

    // Build thread context for follow-ups
    let threadContextStr = "";
    let deckAlreadyShared = false;
    if (mode === "follow-up") {
      try {
        const threadContext = await buildThreadContext(supabase, reply.lead_email, reply_id);
        threadContextStr = threadContext.formatted || "No previous thread history.";
        deckAlreadyShared = threadContext.deckAlreadyShared;
      } catch (err) {
        console.warn("Thread context build failed (non-fatal):", err);
      }
    }

    // Build mode-specific guidance
    let modeGuidance = "";
    if (mode === "first-reply") {
      modeGuidance = `This is a FIRST REPLY to a new lead. Guidelines:
- Include the comparison deck if appropriate per the deck rules.
- You may use "$100 raised = $100 kept" if relevant.
- Match reply length to the lead's message length (tone mirroring).
- Include one relevant KB link if answering a specific question.`;
    } else {
      modeGuidance = `This is a FOLLOW-UP reply in an ongoing thread. Guidelines:
- Deck already shared: ${deckAlreadyShared}. Do NOT re-share unless explicitly re-requested or sharing with new person.
- Do NOT repeat information Julia already said in the thread.
- Do NOT use "$100 raised = $100 kept" — that's for first replies only.
- Answer the lead's specific question directly.
- Match reply length to the lead's message length (tone mirroring).

Thread history:
${threadContextStr}`;
    }

    // Get regeneration template
    const { data: template } = await supabase
      .from("prompt_templates")
      .select("*")
      .eq("template_type", "regeneration")
      .eq("active", true)
      .single();

    const systemPrompt = template?.system_prompt || `You are Julia from Zeffy. Revise the email draft based on feedback.

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

    const userPromptTemplate = template?.user_prompt || `Mode: {{mode}}

{{mode_guidance}}

Original email from lead: {{reply_text}}

Previous draft: {{previous_draft}}

Feedback to incorporate: {{feedback}}

Deck link (include only if appropriate): {{deck_link}}
Calendar link: {{calendar_link}}

Revise the draft to address the feedback while keeping Julia's warm, concise voice. Match reply length to the lead's message. 4-7 sentences max.`;

    const userPrompt = userPromptTemplate
      .replace(/\{\{reply_text\}\}/g, reply.reply_text || "")
      .replace(/\{\{previous_draft\}\}/g, latestDraft.draft_text)
      .replace(/\{\{feedback\}\}/g, feedback)
      .replace(/\{\{calendar_link\}\}/g, campaignCalendar)
      .replace(/\{\{deck_link\}\}/g, campaignDeck)
      .replace(/\{\{mode\}\}/g, mode)
      .replace(/\{\{mode_guidance\}\}/g, modeGuidance)
      .replace(/\{\{thread_context\}\}/g, threadContextStr)
      .replace(/\{\{deck_already_shared\}\}/g, String(deckAlreadyShared));

    const result = await callAnthropic({
      model: template?.model_name || "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
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

    const draftText = (result.revised_body_email_response as string) || "";
    const draftHtml = `<p>${draftText.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;

    // Preserve mode in created_by for the regenerated draft
    await supabase.from("draft_versions").insert({
      reply_id,
      version_number: nextVersion,
      draft_text: draftText,
      draft_html: draftHtml,
      created_by: `ai:${mode}`,
      feedback_used: feedback,
    });

    await supabase.from("inbound_replies").update({ status: "awaiting_review" }).eq("id", reply_id);

    await supabase.from("audit_logs").insert({
      reply_id,
      event_type: "draft_regenerated",
      event_payload: {
        version: nextVersion,
        mode,
        feedback,
        deck_already_shared: deckAlreadyShared,
        model: template?.model_name || "claude-sonnet-4-20250514",
      },
    });

    return new Response(JSON.stringify({ success: true, version: nextVersion, mode }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Regenerate error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
