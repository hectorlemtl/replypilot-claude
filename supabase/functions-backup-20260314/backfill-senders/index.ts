import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const INSTANTLY_API_KEY = Deno.env.get("INSTANTLY_API_KEY")!;

  // Get replies missing sender_email
  const { data: replies } = await supabase
    .from("inbound_replies")
    .select("id, instantly_email_id, lead_email")
    .is("sender_email", null)
    .not("instantly_email_id", "is", null)
    .limit(50); // batch of 50

  if (!replies?.length) {
    return new Response(JSON.stringify({ message: "Nothing to backfill" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let updated = 0;
  let errors = 0;

  for (const reply of replies) {
    try {
      const resp = await fetch(`https://api.instantly.ai/api/v2/emails/${reply.instantly_email_id}`, {
        headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}` },
      });
      if (!resp.ok) { errors++; continue; }
      const data = await resp.json();

      const fromJson = data.from_address_json?.[0];
      const senderEmail = data.from_address_email || fromJson?.address || null;
      let senderName = fromJson?.name || null;
      if (senderName) {
        senderName = senderName.replace(/\b\w/g, (c: string) => c.toUpperCase());
      }

      // CC
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

      await supabase.from("inbound_replies").update({
        sender_email: senderEmail,
        sender_name: senderName,
        cc_emails: ccEmails.length > 0 ? ccEmails : null,
      }).eq("id", reply.id);

      updated++;
    } catch (err) {
      console.error(`Error for ${reply.id}:`, err);
      errors++;
    }
  }

  return new Response(JSON.stringify({ total: replies.length, updated, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
