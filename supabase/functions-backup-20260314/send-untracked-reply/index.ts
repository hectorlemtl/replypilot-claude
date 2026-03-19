import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { untracked_id, reply_text } = await req.json();
    if (!untracked_id || !reply_text?.trim()) {
      return new Response(JSON.stringify({ error: "Missing untracked_id or reply_text" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const INSTANTLY_API_KEY = Deno.env.get("INSTANTLY_API_KEY");
    if (!INSTANTLY_API_KEY) {
      return new Response(JSON.stringify({ error: "INSTANTLY_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: email } = await supabase
      .from("untracked_emails")
      .select("*")
      .eq("id", untracked_id)
      .single();

    if (!email) throw new Error("Untracked email not found");

    // Build reply with quoted original (Gmail style)
    const receivedDate = email.received_at
      ? new Date(email.received_at).toLocaleString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "";
    const senderName = email.sender_name || email.sender_email;
    const senderEmail = email.sender_email;

    // HTML version
    let replyHtml = `<p>${reply_text.trim().replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
    if (email.body_html || email.body_text) {
      const quotedHtml = email.body_html || `<p>${(email.body_text || "").replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
      replyHtml += `<br><br><div style="border-left:1px solid #ccc;padding-left:12px;margin-left:0;color:#555">` +
        `<p style="color:#888;font-size:12px">On ${receivedDate}, ${senderName} &lt;${senderEmail}&gt; wrote:</p>` +
        quotedHtml +
        `</div>`;
    }

    // Text version
    let replyFullText = reply_text.trim();
    if (email.body_text) {
      const quotedLines = email.body_text.split("\n").map((l: string) => `> ${l}`).join("\n");
      replyFullText += `\n\nOn ${receivedDate}, ${senderName} <${senderEmail}> wrote:\n${quotedLines}`;
    }

    const sendPayload: Record<string, unknown> = {
      reply_to_uuid: email.instantly_email_id,
      eaccount: email.email_account,
      subject: email.subject?.startsWith("Re:") ? email.subject : `Re: ${email.subject || ""}`,
      body: {
        html: replyHtml,
        text: replyFullText,
      },
    };

    // Include CC if present
    if (email.cc) {
      sendPayload.cc_address_email_list = email.cc;
    }

    let sendResponse;
    let responseBody;
    let success = false;

    try {
      sendResponse = await fetch("https://api.instantly.ai/api/v2/emails/reply", {
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

    // Update untracked email status
    await supabase.from("untracked_emails").update({
      review_status: success ? "done" : "needs_reply",
      reviewed_by: "reviewer",
      reviewed_at: new Date().toISOString(),
    }).eq("id", untracked_id);

    // Audit log
    await supabase.from("audit_logs").insert({
      event_type: success ? "untracked_reply_sent" : "untracked_reply_failed",
      event_payload: {
        untracked_id,
        reply_to: senderEmail,
        eaccount: email.email_account,
        status_code: sendResponse?.status,
        success,
        response: responseBody,
      },
    });

    if (!success) {
      return new Response(JSON.stringify({
        error: `Send failed: ${sendResponse?.status}`,
        details: responseBody,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Send untracked reply error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
