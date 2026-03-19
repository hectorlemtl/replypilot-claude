import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SMARTLEAD_BASE = "https://server.smartlead.ai/api/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SMARTLEAD_API_KEY = Deno.env.get("SMARTLEAD_API_KEY");
    if (!SMARTLEAD_API_KEY) {
      return new Response(JSON.stringify({ error: "SMARTLEAD_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get campaign IDs to poll — for now hardcoded, could be from app_settings
    const body = await req.json().catch(() => ({}));
    const campaignIds: string[] = body.campaign_ids || ["3024388"];

    let totalNew = 0;
    let totalSkipped = 0;

    for (const campaignId of campaignIds) {
      // Fetch leads with COMPLETED status (they have replies)
      let offset = 0;
      const limit = 50;
      let hasMore = true;

      while (hasMore) {
        const leadsResp = await fetch(
          `${SMARTLEAD_BASE}/campaigns/${campaignId}/leads?api_key=${SMARTLEAD_API_KEY}&limit=${limit}&offset=${offset}&status=COMPLETED`
        );

        if (!leadsResp.ok) {
          console.error(`Failed to fetch leads: ${leadsResp.status}`);
          break;
        }

        const leadsData = await leadsResp.json();
        const leads = leadsData.data || [];
        if (leads.length === 0) {
          hasMore = false;
          break;
        }

        for (const leadEntry of leads) {
          const lead = leadEntry.lead;
          const leadId = String(lead.id);
          const leadEmail = lead.email;

          // Fetch message history for this lead
          const histResp = await fetch(
            `${SMARTLEAD_BASE}/campaigns/${campaignId}/leads/${leadId}/message-history?api_key=${SMARTLEAD_API_KEY}`
          );

          if (!histResp.ok) {
            console.error(`Failed to fetch history for lead ${leadId}: ${histResp.status}`);
            continue;
          }

          const histData = await histResp.json();
          const history = histData.history || [];

          // Process each REPLY message
          const replies = history.filter((m: any) => m.type === "REPLY");

          for (const reply of replies) {
            const messageId = reply.message_id;
            if (!messageId) continue;

            // Dedup check
            const { data: existing } = await supabase
              .from("inbound_replies")
              .select("id")
              .eq("smartlead_message_id", messageId)
              .maybeSingle();

            if (existing) {
              totalSkipped++;
              continue;
            }

            // Extract plain text from HTML
            const htmlBody = reply.email_body || "";
            const plainText = htmlBody
              .replace(/<div class="gmail_quote[^>]*>[\s\S]*$/i, "") // remove quoted text
              .replace(/<br\s*\/?>/gi, "\n")
              .replace(/<\/div>/gi, "\n")
              .replace(/<\/p>/gi, "\n")
              .replace(/<[^>]+>/g, "")
              .replace(/&nbsp;/g, " ")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&amp;/g, "&")
              .replace(/&#39;/g, "'")
              .replace(/\n{3,}/g, "\n\n")
              .trim();

            // Extract sender info
            const senderEmail = reply.from || histData.from || leadEmail;
            // Parse CC
            const ccEmails: string[] = [];
            if (reply.cc && Array.isArray(reply.cc)) {
              ccEmails.push(...reply.cc.filter(Boolean));
            }
            // Check if "to" field has multiple recipients (CCs)
            const toField = reply.to || "";
            if (toField.includes(",")) {
              const extraRecipients = toField.split(",").map((e: string) => e.trim()).filter((e: string) => e && e !== histData.from);
              ccEmails.push(...extraRecipients);
            }

            // Build lead name
            const firstName = (lead.first_name || "").trim();
            const lastName = (lead.last_name || "").trim();
            const leadName = firstName || lastName
              ? [firstName, lastName].filter(Boolean).join(" ")
              : leadEmail.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

            // Check if first reply
            const isFirstReply = replies.indexOf(reply) === 0;
            let firstReplyReceivedAt: string | null = null;
            if (isFirstReply) {
              const { data: existingFirst } = await supabase
                .from("inbound_replies")
                .select("id")
                .eq("lead_email", leadEmail)
                .eq("source", "smartlead")
                .not("first_reply_received_at", "is", null)
                .limit(1)
                .maybeSingle();
              if (!existingFirst) {
                firstReplyReceivedAt = reply.time || new Date().toISOString();
              }
            }

            // Find the subject from the SENT message
            const sentMsg = history.find((m: any) => m.type === "SENT");
            const subject = sentMsg?.subject || null;

            const { data: inserted, error: insertError } = await supabase.from("inbound_replies").insert({
              source: "smartlead",
              smartlead_message_id: messageId,
              smartlead_lead_id: leadId,
              smartlead_campaign_id: campaignId,
              smartlead_stats_id: reply.stats_id || null,
              smartlead_reply_message_id: messageId,
              smartlead_reply_time: reply.time || null,
              instantly_email_id: null,
              lead_email: leadEmail,
              lead_name: leadName,
              email_account: histData.from || null,
              reply_subject: subject ? `Re: ${subject}` : null,
              reply_text: plainText,
              reply_html: htmlBody,
              raw_payload: { lead: leadEntry, reply_message: reply, history_meta: { from: histData.from, to: histData.to } },
              is_first_reply: isFirstReply,
              first_reply_received_at: firstReplyReceivedAt,
              cc_emails: ccEmails.length > 0 ? [...new Set(ccEmails)] : null,
              sender_email: senderEmail,
              sender_name: leadName,
              status: "received",
              received_at: reply.time || new Date().toISOString(),
            }).select("id").single();

            if (insertError) {
              if (insertError.code === "23505") {
                totalSkipped++;
                continue;
              }
              console.error("Insert error:", insertError);
              continue;
            }

            totalNew++;

            // Audit log
            await supabase.from("audit_logs").insert({
              reply_id: inserted.id,
              event_type: "reply_received",
              event_payload: { source: "smartlead", method: "poll", message_id: messageId, lead_email: leadEmail, campaign_id: campaignId },
            });

            // Trigger classification
            const classifyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/classify-reply`;
            fetch(classifyUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({ reply_id: inserted.id }),
            }).catch(console.error);
          }
        }

        offset += limit;
        if (leads.length < limit) hasMore = false;
      }
    }

    // Audit
    await supabase.from("audit_logs").insert({
      event_type: "smartlead_poll_completed",
      event_payload: { new_count: totalNew, skipped_count: totalSkipped, campaign_ids: campaignIds },
    });

    return new Response(JSON.stringify({ success: true, new_count: totalNew, skipped_count: totalSkipped }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Poll SmartLead error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
