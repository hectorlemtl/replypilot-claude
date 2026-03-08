import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Get draft template
    const { data: template } = await supabase
      .from("prompt_templates")
      .select("*")
      .eq("template_type", "draft_generation")
      .eq("active", true)
      .single();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = template?.system_prompt || "You are Julia from Zeffy.";
    const userPrompt = (template?.user_prompt || "Write a reply.\n{{reply_text}}")
      .replace("{{reply_text}}", reply.reply_text || "")
      .replace("{{lead_email}}", reply.lead_email)
      .replace("{{temperature}}", reply.temperature || "")
      .replace("{{wants_pdf}}", String(reply.wants_pdf))
      .replace("{{calendar_link}}", campaignCalendar)
      .replace("{{deck_link}}", campaignDeck);

    const model = template?.model_name || "google/gemini-3-flash-preview";

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_draft",
            description: "Generate an email draft reply",
            parameters: {
              type: "object",
              properties: {
                body_email_response: { type: "string", description: "The email reply text" },
              },
              required: ["body_email_response"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_draft" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI draft error:", aiResponse.status, errText);
      await supabase.from("inbound_replies").update({
        processing_error: `Draft generation failed: ${aiResponse.status}`,
      }).eq("id", reply_id);
      throw new Error(`AI draft generation failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    const result = JSON.parse(toolCall?.function?.arguments || "{}");
    const draftText = result.body_email_response || "";

    // Convert text to simple HTML
    const draftHtml = `<p>${draftText.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;

    // Save draft
    await supabase.from("draft_versions").insert({
      reply_id,
      version_number: 1,
      draft_text: draftText,
      draft_html: draftHtml,
      created_by: "ai",
    });

    // Check for auto-send
    const shouldAutoSend =
      reply.is_first_reply &&
      reply.simple_affirmative &&
      settings?.auto_send_simple_affirmative;

    if (shouldAutoSend) {
      await supabase.from("inbound_replies").update({ status: "drafted" }).eq("id", reply_id);

      // Get the draft we just inserted
      const { data: draft } = await supabase
        .from("draft_versions")
        .select("id")
        .eq("reply_id", reply_id)
        .eq("version_number", 1)
        .single();

      // Trigger auto-send
      const sendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-reply`;
      fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ reply_id, draft_version_id: draft?.id, auto_send: true }),
      }).catch(console.error);
    } else {
      await supabase.from("inbound_replies").update({ status: "awaiting_review" }).eq("id", reply_id);
    }

    await supabase.from("audit_logs").insert({
      reply_id,
      event_type: "draft_generated",
      event_payload: { version: 1, auto_send: shouldAutoSend },
    });

    return new Response(JSON.stringify({ success: true, auto_send: shouldAutoSend }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Generate draft error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
