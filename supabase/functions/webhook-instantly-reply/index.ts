import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Extract lead name from email if possible
    const leadName = lead_email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

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
      is_first_reply: is_first === true || is_first === "true",
      status: "received",
    }).select("id").single();

    if (insertError) throw insertError;

    // Audit log
    await supabase.from("audit_logs").insert({
      reply_id: reply.id,
      event_type: "reply_received",
      event_payload: { email_id, lead_email },
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
