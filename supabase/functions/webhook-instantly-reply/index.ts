import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fetch actual sender + CC from Instantly API (webhook only gives lead info)
async function fetchEmailDetails(emailId: string): Promise<{
  senderEmail: string | null;
  senderName: string | null;
  ccEmails: string[];
}> {
  const INSTANTLY_API_KEY = Deno.env.get("INSTANTLY_API_KEY");
  if (!INSTANTLY_API_KEY) return { senderEmail: null, senderName: null, ccEmails: [] };

  try {
    const resp = await fetch(`https://api.instantly.ai/api/v2/emails/${emailId}`, {
      headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}` },
    });
    if (!resp.ok) {
      console.error("Instantly get_email failed:", resp.status);
      return { senderEmail: null, senderName: null, ccEmails: [] };
    }
    const data = await resp.json();

    // Extract actual sender
    const fromJson = data.from_address_json?.[0];
    const senderEmail = data.from_address_email || fromJson?.address || null;
    let senderName = fromJson?.name || null;
    // Title-case the sender name if present
    if (senderName) {
      senderName = senderName.replace(/\b\w/g, (c: string) => c.toUpperCase());
    }

    // Extract CC list
    const ccEmails: string[] = [];
    if (data.cc_address_json && Array.isArray(data.cc_address_json)) {
      for (const cc of data.cc_address_json) {
        if (cc.address) ccEmails.push(cc.address);
      }
    } else if (data.cc_address_email_list) {
      const raw = data.cc_address_email_list;
      if (typeof raw === "string") {
        ccEmails.push(...raw.split(",").map((e: string) => e.trim()).filter(Boolean));
      }
    }

    return { senderEmail, senderName, ccEmails };
  } catch (err) {
    console.error("fetchEmailDetails error:", err);
    return { senderEmail: null, senderName: null, ccEmails: [] };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const { email_id, unibox_url, is_first, lead_email, reply_html, reply_text, email_account, reply_subject } = payload;

    if (!email_id || !lead_email) {
      return new Response(JSON.stringify({ error: "Missing required fields: email_id, lead_email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Deduplicate
    const { data: existing } = await supabase
      .from("inbound_replies")
      .select("id")
      .eq("instantly_email_id", email_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ message: "Duplicate, skipped", id: existing.id }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use firstName/lastName from Instantly campaign data, fall back to email parsing
    const firstName = (payload.firstName || "").trim();
    const lastName = (payload.lastName || "").trim();
    const leadName = firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(" ")
      : lead_email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

    // Fetch actual sender and CC from Instantly API
    const { senderEmail, senderName, ccEmails } = await fetchEmailDetails(email_id);

    // Determine if this is the first reply ever from this lead
    const isFirstReply = is_first === true || is_first === "true";
    let firstReplyReceivedAt: string | null = null;
    if (isFirstReply) {
      // Check if we already have a reply from this lead (idempotent)
      const { data: existingLead } = await supabase
        .from("inbound_replies")
        .select("id")
        .eq("lead_email", lead_email)
        .not("first_reply_received_at", "is", null)
        .limit(1)
        .maybeSingle();
      if (!existingLead) {
        firstReplyReceivedAt = new Date().toISOString();
      }
    }

    const { data: reply, error: insertError } = await supabase.from("inbound_replies").insert({
      instantly_email_id: email_id,
      instantly_unibox_url: unibox_url || null,
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
      event_payload: { email_id, lead_email, sender_email: senderEmail },
    });

    // Trigger classification
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
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
