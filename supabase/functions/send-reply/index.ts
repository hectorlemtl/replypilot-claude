import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { reply_id, draft_version_id, auto_send } = await req.json();
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

    // Get the draft to send
    let draft;
    if (draft_version_id) {
      const { data } = await supabase.from("draft_versions").select("*").eq("id", draft_version_id).single();
      draft = data;
    } else {
      const { data } = await supabase.from("draft_versions")
        .select("*")
        .eq("reply_id", reply_id)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();
      draft = data;
    }

    if (!draft) throw new Error("No draft found to send");

    // Get settings
    const { data: settings } = await supabase.from("app_settings").select("*").single();
    const instantlyApiBase = settings?.instantly_api_base_url || "https://api.instantly.ai/api/v2";
    const INSTANTLY_API_KEY = Deno.env.get("INSTANTLY_API_KEY");

    if (!INSTANTLY_API_KEY) {
      await supabase.from("send_attempts").insert({
        reply_id,
        draft_version_id: draft.id,
        provider: "instantly",
        success: false,
        request_payload: { error: "INSTANTLY_API_KEY not configured" },
      });
      await supabase.from("inbound_replies").update({
        status: "failed",
        processing_error: "Instantly API key not configured",
      }).eq("id", reply_id);

      return new Response(JSON.stringify({ error: "INSTANTLY_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Instantly API v2 payload — POST /api/v2/emails/{email_id}
    const emailId = reply.instantly_email_id;
    const sendPayload = {
      reply_body: draft.draft_html || draft.draft_text,
      eaccount: reply.email_account,
    };

    let sendResponse;
    let responseBody;
    let success = false;

    try {
      sendResponse = await fetch(`${instantlyApiBase}/emails/${emailId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${INSTANTLY_API_KEY}`,
        },
        body: JSON.stringify(sendPayload),
      });
      responseBody = await sendResponse.json();
      success = sendResponse.ok;
    } catch (fetchErr) {
      responseBody = { error: String(fetchErr) };
    }

    // Log send attempt
    await supabase.from("send_attempts").insert({
      reply_id,
      draft_version_id: draft.id,
      provider: "instantly",
      provider_message_id: responseBody?.id || null,
      request_payload: sendPayload,
      response_payload: responseBody,
      status_code: sendResponse?.status || null,
      success,
    });

    // Update reply status
    await supabase.from("inbound_replies").update({
      status: success ? "sent" : "failed",
      processing_error: success ? null : `Send failed: ${sendResponse?.status || "unknown"}`,
    }).eq("id", reply_id);

    // Audit log
    await supabase.from("audit_logs").insert({
      reply_id,
      event_type: success ? "reply_sent" : "send_failed",
      event_payload: {
        draft_version: draft.version_number,
        auto_send: auto_send || false,
        status_code: sendResponse?.status,
      },
    });

    return new Response(JSON.stringify({ success, status_code: sendResponse?.status }), {
      status: success ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Send reply error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
