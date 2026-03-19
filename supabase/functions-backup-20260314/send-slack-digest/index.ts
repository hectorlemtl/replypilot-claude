import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const isTest = body?.test === true;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase.from("app_settings").select("*").single();

    if (!settings?.slack_enabled) {
      return new Response(JSON.stringify({ message: "Slack digests disabled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const slackToken = settings.slack_bot_token || Deno.env.get("SLACK_BOT_TOKEN");
    const channelId = settings.slack_channel_id;

    if (!slackToken || !channelId) {
      return new Response(JSON.stringify({ error: "Slack bot token or channel ID not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather stats
    const { data: replies } = await supabase.from("inbound_replies").select("status, temperature, received_at");

    const awaitingReview = replies?.filter((r) => r.status === "awaiting_review").length || 0;
    const manualReview = replies?.filter((r) => r.status === "manual_review").length || 0;
    const failed = replies?.filter((r) => r.status === "failed").length || 0;
    const needsAnswer = awaitingReview + manualReview + failed;

    const hotAwaiting = replies?.filter((r) => r.status === "awaiting_review" && r.temperature === "hot").length || 0;
    const warmAwaiting = replies?.filter((r) => r.status === "awaiting_review" && r.temperature === "warm").length || 0;

    // Count new since ~last digest (rough: last 4 hours)
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const newReplies = replies?.filter((r) => r.received_at && r.received_at > fourHoursAgo).length || 0;

    // Check if we should skip empty digests
    if (!isTest && !settings.always_send_digest && newReplies === 0 && needsAnswer === 0) {
      return new Response(JSON.stringify({ message: "No activity, digest skipped" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appLink = Deno.env.get("APP_URL") || "https://replypilot.lovable.app";

    const message = [
      "📬 *ReplyPilot update*",
      "",
      `New replies since last digest: *${newReplies}*`,
      `Replies needing an answer: *${needsAnswer}*`,
      `├ Awaiting review: ${awaitingReview}`,
      `├ Manual review: ${manualReview}`,
      `└ Failed sends: ${failed}`,
      "",
      `🔥 Hot awaiting review: *${hotAwaiting}*`,
      `☀️ Warm awaiting review: *${warmAwaiting}*`,
      "",
      `<${appLink}|Open inbox>`,
    ].join("\n");

    const slackResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        text: message,
        mrkdwn: true,
      }),
    });

    const slackResult = await slackResponse.json();

    // Log digest
    await supabase.from("audit_logs").insert({
      event_type: "slack_digest_sent",
      event_payload: {
        test: isTest,
        new_replies: newReplies,
        needs_answer: needsAnswer,
        slack_ok: slackResult.ok,
      },
    });

    return new Response(JSON.stringify({ success: slackResult.ok, message: isTest ? "Test digest sent" : "Digest sent" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Slack digest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
