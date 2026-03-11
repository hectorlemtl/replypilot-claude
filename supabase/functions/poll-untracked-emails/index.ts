import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PAGES_PER_RUN = 5;
const PAGE_SIZE = 100;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();

  try {
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

    // Check if sync is enabled
    const { data: settings } = await supabase.from("app_settings").select("*").single();
    const syncMode = settings?.untracked_sync_mode || "emode_others";

    let totalFetched = 0;
    let newCount = 0;
    let skippedDuplicate = 0;
    let skippedTracked = 0;
    let cursor: string | null = null;
    let pagesProcessed = 0;

    for (let page = 0; page < MAX_PAGES_PER_RUN; page++) {
      // Build Instantly API URL
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        mode: syncMode,
        email_type: "received",
        sort_order: "desc",
      });
      if (cursor) params.set("starting_after", cursor);

      const resp = await fetch(`https://api.instantly.ai/api/v2/emails?${params}`, {
        headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}` },
      });

      if (resp.status === 429) {
        console.warn("Rate limited by Instantly, stopping this run");
        break;
      }

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`Instantly API error: ${resp.status}`, errText);
        await supabase.from("audit_logs").insert({
          event_type: "untracked_poll_failed",
          event_payload: { error: errText, status_code: resp.status, page },
        });
        break;
      }

      const data = await resp.json();
      const items = data.items || [];
      pagesProcessed++;

      if (items.length === 0) break;

      let pageNewCount = 0;

      for (const email of items) {
        totalFetched++;
        const emailId = email.id;
        if (!emailId) continue;

        // Check if already in untracked_emails
        const { data: existingUntracked } = await supabase
          .from("untracked_emails")
          .select("id")
          .eq("instantly_email_id", emailId)
          .maybeSingle();

        if (existingUntracked) {
          skippedDuplicate++;
          continue;
        }

        // Check if already tracked as a campaign reply
        const { data: existingTracked } = await supabase
          .from("inbound_replies")
          .select("id")
          .eq("instantly_email_id", emailId)
          .maybeSingle();

        if (existingTracked) {
          skippedTracked++;
          continue;
        }

        // Parse sender info
        const senderEmail = email.from_address_email || "";
        let senderName: string | null = null;
        if (email.from_address_json?.[0]?.name) {
          senderName = email.from_address_json[0].name
            .replace(/\b\w/g, (c: string) => c.toUpperCase());
        }

        // Insert
        const { error: insertError } = await supabase.from("untracked_emails").insert({
          instantly_email_id: emailId,
          instantly_thread_id: email.thread_id || null,
          instantly_mode: syncMode,
          sender_email: senderEmail || "unknown@unknown.com",
          sender_name: senderName,
          recipient_email: email.to_address_email_list || null,
          email_account: email.eaccount || null,
          cc: email.cc_address_email_list || null,
          subject: email.subject || null,
          body_text: email.body?.text || null,
          body_html: email.body?.html || null,
          content_preview: email.content_preview || null,
          has_attachment: !!(email.attachment_json?.files?.length),
          raw_payload: email,
          instantly_campaign_id: email.campaign_id || null,
          instantly_lead: email.lead || null,
          instantly_lead_id: email.lead_id || null,
          is_auto_reply: email.is_auto_reply === 1,
          ai_interest_value: email.ai_interest_value ?? null,
          ue_type: email.ue_type ?? null,
          received_at: email.timestamp_email || email.timestamp_created || new Date().toISOString(),
        });

        if (insertError) {
          // Unique constraint violation = duplicate, skip
          if (insertError.code === "23505") {
            skippedDuplicate++;
            continue;
          }
          console.error("Insert error:", insertError);
          continue;
        }

        pageNewCount++;
        newCount++;

        // Get the inserted row ID for classification trigger
        const { data: inserted } = await supabase
          .from("untracked_emails")
          .select("id")
          .eq("instantly_email_id", emailId)
          .single();

        if (inserted) {
          // Fire-and-forget classification
          const classifyUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/classify-untracked`;
          fetch(classifyUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ untracked_id: inserted.id }),
          }).catch(console.error);
        }
      }

      // If no new items on this page, all were duplicates — we've caught up
      if (pageNewCount === 0) break;

      // Pagination
      cursor = data.next_starting_after || null;
      if (!cursor) break;
    }

    // Update sync timestamp
    await supabase.from("app_settings").update({
      untracked_sync_last_at: new Date().toISOString(),
    }).eq("id", settings?.id);

    const durationMs = Date.now() - startTime;

    // Audit log
    await supabase.from("audit_logs").insert({
      event_type: "untracked_poll_completed",
      event_payload: {
        total_fetched: totalFetched,
        new_count: newCount,
        skipped_duplicate: skippedDuplicate,
        skipped_tracked: skippedTracked,
        pages: pagesProcessed,
        mode: syncMode,
        duration_ms: durationMs,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      total_fetched: totalFetched,
      new_count: newCount,
      skipped_duplicate: skippedDuplicate,
      skipped_tracked: skippedTracked,
      pages: pagesProcessed,
      duration_ms: durationMs,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Poll untracked error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
