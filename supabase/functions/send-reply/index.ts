import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { reply_id, draft_version_id, auto_send, extra_to_emails, extra_cc_emails } = await req.json();
    if (!reply_id) {
      return new Response(JSON.stringify({ error: "Missing reply_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Block auto-send for now — all sends require manual approval
    if (auto_send) {
      return new Response(JSON.stringify({ message: "Auto-send disabled, queued for review" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    const INSTANTLY_API_KEY = Deno.env.get("INSTANTLY_API_KEY");

    // Check API key for Instantly-source replies only
    const replySource = reply.source || "instantly";
    if (replySource === "instantly" && !INSTANTLY_API_KEY) {
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

    // Build full email body with quoted previous conversation (Gmail style)
    const receivedDate = reply.received_at
      ? new Date(reply.received_at).toLocaleString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "";
    const senderName = reply.sender_name || reply.lead_name || reply.lead_email;
    const senderEmail = reply.sender_email || reply.lead_email;

    // HTML version: draft + quoted original
    let fullHtml = draft.draft_html || `<p>${(draft.draft_text || "").replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
    if (reply.reply_html || reply.reply_text) {
      const quotedHtml = reply.reply_html || `<p>${(reply.reply_text || "").replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
      fullHtml += `<br><br><div style="border-left:1px solid #ccc;padding-left:12px;margin-left:0;color:#555">` +
        `<p style="color:#888;font-size:12px">On ${receivedDate}, ${senderName} &lt;${senderEmail}&gt; wrote:</p>` +
        quotedHtml +
        `</div>`;
    }

    // Text version: draft + quoted original
    let fullText = draft.draft_text || "";
    if (reply.reply_text) {
      const quotedLines = reply.reply_text.split("\n").map((l: string) => `> ${l}`).join("\n");
      fullText += `\n\nOn ${receivedDate}, ${senderName} <${senderEmail}> wrote:\n${quotedLines}`;
    }

    // Include CC recipients — merge existing CCs with any extras added by reviewer
    const allCcs: string[] = [
      ...(reply.cc_emails || []),
      ...(extra_cc_emails || []),
    ].filter((e: string) => e && e.includes("@"));

    // Include extra To recipients if reviewer added any
    const extraTos = (extra_to_emails || []).filter((e: string) => e && e.includes("@"));

    const source = reply.source || "instantly";
    let sendResponse;
    let responseBody;
    let success = false;
    let sendPayload: Record<string, unknown> = {};
    let provider = source;

    if (source === "smartlead") {
      // SmartLead API — reply to lead from master inbox
      const SMARTLEAD_API_KEY = Deno.env.get("SMARTLEAD_API_KEY");
      if (!SMARTLEAD_API_KEY) {
        await supabase.from("send_attempts").insert({
          reply_id,
          draft_version_id: draft.id,
          provider: "smartlead",
          success: false,
          request_payload: { error: "SMARTLEAD_API_KEY not configured" },
        });
        await supabase.from("inbound_replies").update({
          status: "failed",
          processing_error: "SmartLead API key not configured",
        }).eq("id", reply_id);

        return new Response(JSON.stringify({ error: "SMARTLEAD_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // SmartLead reply API: POST /campaigns/{campaign_id}/reply-email-thread
      // Requires email_stats_id (stats_id from message-history) and reply_message_id
      // If stats_id is missing, try to fetch it from the SmartLead API
      let statsId = reply.smartlead_stats_id;
      let replyMessageId = reply.smartlead_reply_message_id;
      let replyTime = reply.smartlead_reply_time;

      if (!reply.smartlead_campaign_id) {
        await supabase.from("send_attempts").insert({
          reply_id,
          draft_version_id: draft.id,
          provider: "smartlead",
          success: false,
          request_payload: { error: "Missing smartlead_campaign_id" },
        });
        await supabase.from("inbound_replies").update({
          status: "failed",
          processing_error: "Missing SmartLead campaign ID. Cannot reply.",
        }).eq("id", reply_id);

        return new Response(JSON.stringify({ error: "Missing SmartLead campaign ID" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If stats_id is missing, attempt to fetch it from message history
      if (!statsId && reply.smartlead_lead_id) {
        try {
          const histResp = await fetch(
            `https://server.smartlead.ai/api/v1/campaigns/${reply.smartlead_campaign_id}/leads/${reply.smartlead_lead_id}/message-history?api_key=${SMARTLEAD_API_KEY}`
          );
          if (histResp.ok) {
            const histData = await histResp.json();
            const history = histData.history || [];
            const replies = history.filter((m: any) => m.type === "REPLY");
            const latestReply = replies[replies.length - 1];
            if (latestReply) {
              statsId = latestReply.stats_id ? String(latestReply.stats_id) : null;
              replyMessageId = replyMessageId || latestReply.message_id || null;
              replyTime = replyTime || latestReply.time || null;
              // Persist the recovered stats_id for future retries
              if (statsId) {
                await supabase.from("inbound_replies").update({
                  smartlead_stats_id: statsId,
                  smartlead_reply_message_id: replyMessageId,
                  smartlead_reply_time: replyTime,
                }).eq("id", reply_id);
              }
            }
          }
        } catch (histErr) {
          console.error("Failed to recover SmartLead stats_id:", histErr);
        }
      }

      if (!statsId) {
        await supabase.from("send_attempts").insert({
          reply_id,
          draft_version_id: draft.id,
          provider: "smartlead",
          success: false,
          request_payload: { error: "Missing smartlead_stats_id even after recovery attempt" },
        });
        await supabase.from("inbound_replies").update({
          status: "failed",
          processing_error: "Missing SmartLead thread context (stats_id). Cannot reply. Try re-polling this lead.",
        }).eq("id", reply_id);

        return new Response(JSON.stringify({ error: "Missing SmartLead thread context" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      sendPayload = {
        email_stats_id: statsId,
        email_body: fullHtml,
        reply_message_id: replyMessageId || undefined,
        reply_email_time: replyTime || undefined,
      };

      if (allCcs.length > 0) {
        sendPayload.cc = [...new Set(allCcs)].join(", ");
      }

      try {
        sendResponse = await fetch(
          `https://server.smartlead.ai/api/v1/campaigns/${reply.smartlead_campaign_id}/reply-email-thread?api_key=${SMARTLEAD_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sendPayload),
          }
        );
        const responseText = await sendResponse.text();
        try {
          responseBody = JSON.parse(responseText);
        } catch {
          responseBody = { error: responseText };
        }
        success = sendResponse.ok;
      } catch (fetchErr) {
        responseBody = { error: String(fetchErr) };
      }
    } else {
      // Instantly API v2 — POST /api/v2/emails/reply
      sendPayload = {
        reply_to_uuid: reply.instantly_email_id,
        eaccount: reply.email_account,
        subject: reply.reply_subject?.startsWith("Re:") ? reply.reply_subject : `Re: ${reply.reply_subject || ""}`,
        body: {
          html: fullHtml,
          text: fullText,
        },
      };

      if (allCcs.length > 0) {
        sendPayload.cc_address_email_list = [...new Set(allCcs)].join(", ");
      }

      if (extraTos.length > 0) {
        sendPayload.to_address_email_list = extraTos.join(", ");
      }

      try {
        sendResponse = await fetch("https://api.instantly.ai/api/v2/emails/reply", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${INSTANTLY_API_KEY}`,
          },
          body: JSON.stringify(sendPayload),
        });
        const responseText = await sendResponse.text();
        try {
          responseBody = JSON.parse(responseText);
        } catch {
          responseBody = { error: responseText };
        }
        success = sendResponse.ok;
      } catch (fetchErr) {
        responseBody = { error: String(fetchErr) };
      }
    }

    // Log send attempt
    await supabase.from("send_attempts").insert({
      reply_id,
      draft_version_id: draft.id,
      provider,
      provider_message_id: responseBody?.id || null,
      request_payload: sendPayload,
      response_payload: responseBody,
      status_code: sendResponse?.status || null,
      success,
    });

    // Update reply status
    await supabase.from("inbound_replies").update({
      status: success ? "sent" : "failed",
      processing_error: success ? null : `Send failed: ${sendResponse?.status || "unknown"} - ${JSON.stringify(responseBody)}`,
    }).eq("id", reply_id);

    // Audit log
    await supabase.from("audit_logs").insert({
      reply_id,
      event_type: success ? "reply_sent" : "send_failed",
      event_payload: {
        draft_version: draft.version_number,
        auto_send: false,
        status_code: sendResponse?.status,
        response: responseBody,
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
