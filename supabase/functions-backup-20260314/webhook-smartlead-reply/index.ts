import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SMARTLEAD_API_KEY = () => Deno.env.get("SMARTLEAD_API_KEY") || "";
const SMARTLEAD_BASE_URL = "https://server.smartlead.ai/api/v1";

// Fetch message history to get stats_id, message_id (needed for reply API), and sender details
async function fetchMessageHistory(campaignId: string, leadId: string): Promise<{
  senderEmail: string | null;
  senderName: string | null;
  ccEmails: string[];
  statsId: string | null;
  replyMessageId: string | null;
  replyTime: string | null;
}> {
  const apiKey = SMARTLEAD_API_KEY();
  const empty = { senderEmail: null, senderName: null, ccEmails: [], statsId: null, replyMessageId: null, replyTime: null };
  if (!apiKey) return empty;

  try {
    const resp = await fetch(
      `${SMARTLEAD_BASE_URL}/campaigns/${campaignId}/leads/${leadId}/message-history?api_key=${apiKey}`
    );
    if (!resp.ok) {
      console.error("SmartLead message-history failed:", resp.status);
      return empty;
    }
    const data = await resp.json();
    const history = data.history || data;

    // Find latest REPLY message
    const replies = Array.isArray(history)
      ? history.filter((m: any) => m.type === "REPLY")
      : [];
    const latestReply = replies[replies.length - 1];

    if (!latestReply) return empty;

    let senderName: string | null = null;
    // from is at the top-level of the response, not per-message
    const senderEmail = data.from || latestReply.from_email || null;

    const ccEmails: string[] = [];
    if (latestReply.cc && typeof latestReply.cc === "string") {
      ccEmails.push(...latestReply.cc.split(",").map((e: string) => e.trim()).filter(Boolean));
    }

    return {
      senderEmail,
      senderName,
      ccEmails,
      statsId: latestReply.stats_id ? String(latestReply.stats_id) : null,
      replyMessageId: latestReply.message_id || null,
      replyTime: latestReply.time || null,
    };
  } catch (err) {
    console.error("fetchMessageHistory error:", err);
    return { senderEmail: null, senderName: null, ccEmails: [], statsId: null, replyMessageId: null, replyTime: null };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();

    // SmartLead webhook payload — exact shape depends on webhook config
    // Common fields: event_type, lead_email, lead_name, lead_id, campaign_id,
    // message_id, reply_text, reply_html, reply_subject, from_email, from_name,
    // email_account, is_first_reply
    const {
      event_type,
      lead_email,
      lead_name,
      lead_id,
      campaign_id,
      message_id,
      reply_text,
      reply_html,
      reply_subject,
      from_email,
      from_name,
      email_account,
      is_first_reply,
    } = payload;

    // Only process reply events (SmartLead uses "EMAIL_REPLY")
    if (event_type && event_type !== "EMAIL_REPLY" && event_type !== "REPLY_RECEIVED") {
      return new Response(JSON.stringify({ message: "Ignored event type", event_type }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!lead_email) {
      return new Response(JSON.stringify({ error: "Missing required field: lead_email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Deduplicate by smartlead_message_id
    const dedupeId = message_id || `${campaign_id}_${lead_id}_${Date.now()}`;
    if (message_id) {
      const { data: existing } = await supabase
        .from("inbound_replies")
        .select("id")
        .eq("smartlead_message_id", message_id)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ message: "Duplicate, skipped", id: existing.id }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Build lead name
    const leadName = (lead_name || "").trim()
      || (from_name || "").trim()
      || lead_email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

    // Fetch thread context from SmartLead API — needed for sender details + stats_id for reply API
    let senderEmail = from_email || lead_email;
    let senderName = from_name || null;
    let ccEmails: string[] = [];
    let statsId: string | null = null;
    let replyMessageId: string | null = null;
    let replyTime: string | null = null;

    if (campaign_id && lead_id) {
      const details = await fetchMessageHistory(String(campaign_id), String(lead_id));
      if (details.senderEmail) senderEmail = details.senderEmail;
      if (details.senderName) senderName = details.senderName;
      if (details.ccEmails.length > 0) ccEmails = details.ccEmails;
      statsId = details.statsId;
      replyMessageId = details.replyMessageId;
      replyTime = details.replyTime;
    }

    if (senderName) {
      senderName = senderName.replace(/\b\w/g, (c: string) => c.toUpperCase());
    }

    // Determine first reply
    const isFirstReply = is_first_reply === true || is_first_reply === "true";
    let firstReplyReceivedAt: string | null = null;
    if (isFirstReply) {
      const { data: existingLead } = await supabase
        .from("inbound_replies")
        .select("id")
        .eq("lead_email", lead_email)
        .eq("source", "smartlead")
        .not("first_reply_received_at", "is", null)
        .limit(1)
        .maybeSingle();
      if (!existingLead) {
        firstReplyReceivedAt = new Date().toISOString();
      }
    }

    const { data: reply, error: insertError } = await supabase.from("inbound_replies").insert({
      source: "smartlead",
      smartlead_message_id: dedupeId,
      smartlead_lead_id: lead_id ? String(lead_id) : null,
      smartlead_campaign_id: campaign_id ? String(campaign_id) : null,
      smartlead_stats_id: statsId,
      smartlead_reply_message_id: replyMessageId,
      smartlead_reply_time: replyTime,
      instantly_email_id: null,
      instantly_unibox_url: null,
      lead_email,
      lead_name: leadName,
      email_account: email_account || null,
      reply_subject: reply_subject || null,
      reply_text: reply_text || null,
      reply_html: reply_html || null,
      raw_payload: payload,
      is_first_reply: isFirstReply,
      first_reply_received_at: firstReplyReceivedAt,
      cc_emails: ccEmails.length > 0 ? ccEmails : null,
      sender_email: senderEmail,
      sender_name: senderName,
      status: "received",
    }).select("id").single();

    if (insertError) throw insertError;

    // Audit log
    await supabase.from("audit_logs").insert({
      reply_id: reply.id,
      event_type: "reply_received",
      event_payload: { source: "smartlead", message_id: dedupeId, lead_email, sender_email: senderEmail, campaign_id, stats_id: statsId },
    });

    // Trigger classification (same pipeline as Instantly)
    const classifyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/classify-reply`;
    fetch(classifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ reply_id: reply.id }),
    }).catch(console.error);

    return new Response(JSON.stringify({ success: true, id: reply.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("SmartLead webhook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
