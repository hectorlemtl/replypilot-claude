import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const THEME_TAXONOMY = `TAXONOMY:
Interest themes:
- ready_to_switch: Actively wants to move to Zeffy
- requesting_demo: Wants a call, meeting, or walkthrough
- requesting_info: Wants more details, pricing comparison, or PDF
- forwarding_to_decision_maker: Passing to board, ED, treasurer, etc.
- already_signed_up: Created a Zeffy account unprompted
- comparing_alternatives: Evaluating Zeffy vs PayPal/Stripe/Eventbrite/etc.

Objection themes:
- happy_with_current: Satisfied with PayPal/current tool
- fees_not_a_concern: Doesn't see fees as a problem
- too_small_to_matter: Org feels too small for the savings to matter
- board_approval_needed: Interested but needs organizational buy-in
- timing_not_right: Not now, maybe later (seasonal, fiscal year, etc.)
- already_free_alternative: Claims to already use a free tool
- trust_concern: Skeptical about "100% free", asks about business model
- technical_concern: Worried about migration, integrations, features

Question themes:
- how_zeffy_works: General "how does it work?" questions
- migration_question: How to move data/donors from current tool
- feature_question: Specific feature inquiry (recurring, events, receipts, etc.)
- pricing_question: How Zeffy makes money, hidden fees, etc.

Operational themes:
- wrong_person: Not the right contact, may or may not redirect
- org_dissolved: Organization no longer active
- already_using_zeffy: Already a Zeffy user
- unsubscribe_request: Wants off the list
- auto_reply: Out of office / automated response
- spam_complaint: Hostile / marks as spam`;

function getClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function tagBatch(replies: any[]): Promise<any[]> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;

  const results = [];
  for (const reply of replies) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 200,
          system: `You are a cold email reply analyst for Zeffy, a 100% free fundraising platform for nonprofits. Given a reply to our cold outreach, assign 1-3 themes from the taxonomy below. Choose the PRIMARY theme (most dominant signal) and any secondary themes.

${THEME_TAXONOMY}

RULES:
- Assign 1-3 themes. Most replies have 1-2.
- The primary_theme should be the strongest signal.
- Short replies ("yes", "tell me more") → primary_theme = "requesting_info"
- Out-of-office → primary_theme = "auto_reply", no secondary themes
- If the lead asks about fees AND wants a demo → themes: ["requesting_demo", "pricing_question"]

Output JSON only: {"primary_theme": "string", "themes": ["string", ...], "confidence": 0.0-1.0}`,
          messages: [{
            role: "user",
            content: `Reply text:\n${(reply.reply_text || "").slice(0, 1500)}`,
          }],
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error(`Anthropic error ${res.status} for ${reply.id}: ${errBody}`);
        results.push({ id: reply.id, error: `API ${res.status}: ${errBody.slice(0, 200)}` });
        continue;
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const match = text.match(/\{[\s\S]*\}/);

      if (match) {
        const parsed = JSON.parse(match[0]);
        results.push({
          id: reply.id,
          themes: parsed.themes || [parsed.primary_theme],
          primary_theme: parsed.primary_theme,
          confidence: parsed.confidence || 0.5,
        });
      } else {
        results.push({ id: reply.id, error: "No JSON in response" });
      }
    } catch (err) {
      results.push({ id: reply.id, error: String(err) });
    }

    // Rate limit: ~20/min
    await new Promise(r => setTimeout(r, 3000));
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const start = Date.now();
  const supabase = getClient();

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 15; // Keep small to avoid timeout

    // Fetch replies without themes (with actual text content)
    const { data: replies, error } = await supabase
      .from("unified_replies")
      .select("id, reply_text, reply_subject, temperature")
      .is("themes_generated_at", null)
      .not("reply_text", "is", null)
      .neq("reply_text", "")
      .limit(batchSize);

    if (error) throw error;
    if (!replies || replies.length === 0) {
      // Mark empty-text replies as done so they don't remain as "remaining"
      await supabase
        .from("unified_replies")
        .update({ themes_generated_at: new Date().toISOString(), themes: [], primary_theme: null })
        .is("themes_generated_at", null)
        .or("reply_text.is.null,reply_text.eq.");

      return new Response(JSON.stringify({ message: "No replies to tag", total_remaining: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tag themes
    const results = await tagBatch(replies);

    // Write results
    let tagged = 0;
    let errors = 0;
    for (const r of results) {
      if (r.error) {
        errors++;
        continue;
      }

      const { error: upErr } = await supabase
        .from("unified_replies")
        .update({
          themes: r.themes,
          primary_theme: r.primary_theme,
          theme_confidence: r.confidence,
          themes_generated_at: new Date().toISOString(),
        })
        .eq("id", r.id);

      if (upErr) {
        errors++;
        console.error("Update error:", upErr);
      } else {
        tagged++;
      }
    }

    // Count remaining
    const { count: remaining } = await supabase
      .from("unified_replies")
      .select("*", { count: "exact", head: true })
      .is("themes_generated_at", null)
      .not("reply_text", "is", null);

    const duration = Date.now() - start;

    const errorDetails = results.filter(r => r.error).map(r => r.error);
    return new Response(JSON.stringify({
      tagged, errors, remaining, duration_ms: duration,
      batch_size: replies.length,
      error_details: errorDetails.slice(0, 3),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
