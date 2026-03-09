import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DRAFT_SYSTEM_PROMPT = `You are an email copywriter assistant.

MAKE SURE NEVER TO USE "\u2014" or any "--" or any "-" in middle of sentence between words like an AI is doing.

Example of wrong structure: "Here is your PayPal vs Zeffy comparison deck\u2014it includes a fee breakdown, feature comparison, and real case studies from nonprofits who made the switch"`;

const DRAFT_USER_PROMPT = `#CONTEXT#

You are an assistant that drafts email replies for Zeffy's PayPal migration campaign. Use only the provided inputs and campaign resources to craft concise, on-voice responses that either deliver the PayPal vs Zeffy comparison deck, answer questions accurately, or guide warm leads toward the right next step.

#OBJECTIVE#

Generate a tailored reply in Julia's voice that: (1) checks lead temperature and drafts only for warm/hot leads, (2) identifies the response category, (3) references the comparison deck ONLY on first replies when wants_pdf is True, (4) accurately answers questions using ONLY verified facts, and (5) advances qualified interest toward a demo session (never a 1-on-1 call).

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

- If leadTemperature is not "hot" or "warm" (case-insensitive), output exactly: NO_REPLY_NEEDED

- Otherwise proceed to draft.

## Step 2 — Classify the response intent

Using originalEmail and emailAnalysis, choose ONE category:

  a) Yes/affirmative — lead agrees to receive the deck

  b) Question about fees, pricing, or business model — includes "how do you make money," "what's the catch," "is it really free," "how does Zeffy work," "how are you funded," or any skepticism about the free model

  c) Question about features or migration

  d) Request for references, examples, or case studies — lead asks to see other nonprofits using Zeffy, wants proof, social proof, or testimonials

  e) Ready to sign up / wants to create an account — lead asks how to get started, sign up, or create an account

  f) Demo or call interest — lead EXPLICITLY requests a call, demo, meeting, or walkthrough

## Step 3 — Respond according to category

**All replies: 4-7 sentences, email body only, Julia's warm/helpful voice.**

### a) Yes/affirmative

- Acknowledge interest.

- Include the deck per Step 4 (if applicable).

- Highlight 1 key point: Zeffy is 100% free. $100 raised = $100 kept.

- Offer to answer questions. NO call or demo offers.

### b) Fees / pricing / business model question

- State: Zeffy is 100% free for nonprofits. There are no platform fees, no transaction fees, and no hidden costs. When donors make a payment through Zeffy, they have the option to leave Zeffy a voluntary contribution at checkout. Whether they choose to tip or not, the nonprofit always keeps 100% of the money.

- Contrast with PayPal: PayPal charges 1.99% + $0.49 per transaction.

- Include the deck per Step 4 (if applicable).

- Offer to answer questions. NO call or demo offers unless lead explicitly asked for one.

### c) Features / migration question

- Use ONLY verified facts from the Zeffy Knowledge Base. If you cannot verify a detail, ask one clarifying question instead of guessing.

- Mention relevant all-in-one features (donations, events, raffles, auctions, stores, memberships, donor CRM, automated tax receipts) without inventing details.

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

## Step 4 — Comparison deck rules

**Include the deck when EITHER of these conditions is true:**

**Condition A (standard):** wants_pdf is True AND Is First is True (first reply in the thread).

**Condition B (sharing override):** The lead mentions forwarding, sharing, or presenting info to their team, executive director (ED), board, boss, director, leadership, or any other decision-maker. Even if Is First is False. In this case, ALWAYS include the deck so they have something concrete to share. Frame it as: "Here's a comparison deck you can share with your [team/ED/board]..."

**If NEITHER condition is met**, do NOT mention the deck at all. Do not say "as I shared previously" or reference a prior attachment. Just skip it entirely.

**When the deck IS included**, use this exact phrase with the link (adapt the intro when using Condition B):

- Standard (Condition A): "Here is your PayPal vs Zeffy comparison deck. It includes a fee breakdown, feature comparison, and real case studies from nonprofits who made the switch: {{deck_link}}"

- Sharing override (Condition B): "Here's a comparison deck you can share with your [team/ED/board]. It includes a fee breakdown, feature comparison, and real case studies from nonprofits who made the switch: {{deck_link}}"

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

- DO NOT invent specific savings figures (e.g., "saved $2,000"). You may say "Many nonprofits have saved thousands" but NEVER attribute specific amounts to specific or fictional organizations.

- DO NOT invent success stories, case studies, or reference fictional nonprofits. If the lead asks for examples, share the case studies link instead.

- DO NOT offer 1-on-1 calls, personal walkthroughs, or personal time slots. Julia does not take 1-on-1 calls. Always redirect to the demo booking page when a call/demo is requested.

- DO NOT end with "Would a quick call be helpful?" or similar. Ending with "Let me know if you have any questions" is fine.

- DO NOT re-send the comparison deck if Is First is False. UNLESS the lead mentions sharing/forwarding to their team, ED, board, or leadership (see Step 4, Condition B).

- NEVER invent numbers about how many nonprofits Zeffy serves. The correct figure is 100,000+.

## Step 6 — Tone and style

- Warm, helpful, concise (Julia's voice). 4-7 sentences max.

- Personalize by referencing any organization name, state, or specifics found in originalEmail when available.

- One clear next step: offer to answer questions, share the sign-up link, or share the demo link (only when applicable per the category).

- Sign as "Julia" only.

## Step 7 — Formatting

- Email body text only.

- Start with: "Hi {firstName}," or "Hey {firstName}," (infer first name from Lead Name or originalEmail if present; otherwise use "Hi there,").

- End with: "Best," or "Warmly," + "Julia" on the next line.`;

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

    // Check if there's a custom template override in the DB
    const { data: template } = await supabase
      .from("prompt_templates")
      .select("*")
      .eq("template_type", "draft_generation")
      .eq("active", true)
      .single();

    // Build the prompt with all available data
    const userPrompt = DRAFT_USER_PROMPT
      .replace("{{reply_text}}", reply.reply_text || "")
      .replace("{{reasoning}}", reply.reasoning || "")
      .replace("{{temperature}}", reply.temperature || "")
      .replace("{{wants_pdf}}", String(reply.wants_pdf || false))
      .replace("{{is_first_reply}}", String(reply.is_first_reply || false))
      .replace("{{lead_name}}", reply.lead_name || reply.lead_email || "")
      .replace(/\{\{deck_link\}\}/g, campaignDeck)
      .replace("{{calendar_link}}", campaignCalendar);

    const systemPrompt = template?.system_prompt || DRAFT_SYSTEM_PROMPT;

    const result = await callAnthropic({
      model: "claude-sonnet-4-20250514",
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
      event_payload: { version: 1, auto_send: shouldAutoSend, model: "claude-sonnet-4-20250514" },
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
