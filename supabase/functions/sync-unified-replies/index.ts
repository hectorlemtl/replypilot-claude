import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Instantly-sync Supabase (source of campaign data)
function getInstantlySyncClient() {
  return createClient(
    Deno.env.get("INSTANTLY_SYNC_SUPABASE_URL")!,
    Deno.env.get("INSTANTLY_SYNC_SUPABASE_KEY")!,
  );
}

// ReplyPilot Supabase (local — destination)
function getLocalClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

interface SyncStats {
  instantly_sync_new: number;
  instantly_sync_updated: number;
  replypilot_new: number;
  replypilot_updated: number;
  errors: number;
  duration_ms: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const start = Date.now();
  const stats: SyncStats = {
    instantly_sync_new: 0, instantly_sync_updated: 0,
    replypilot_new: 0, replypilot_updated: 0,
    errors: 0, duration_ms: 0,
  };

  try {
    const remote = getInstantlySyncClient();
    const local = getLocalClient();

    // 1. Get last sync timestamp
    const { data: syncMeta } = await local
      .from("sync_metadata")
      .select("last_sync_at")
      .eq("id", "unified_replies_sync")
      .single();

    const lastSync = syncMeta?.last_sync_at || null;
    console.log(`Last sync: ${lastSync || "INITIAL SYNC"}`);

    // 2. Build org lookup cache from campaign_orgs_summary
    const orgCache = new Map<string, any>();
    const { data: orgs } = await remote
      .from("campaign_orgs_summary")
      .select("company_name, company_domain, ein, state, city, total_emails_sent, total_replies, total_positive_replies");
    for (const org of (orgs || [])) {
      if (org.company_name) orgCache.set(org.company_name, org);
    }
    console.log(`Loaded ${orgCache.size} org summaries`);

    // 3. Sync from instantly-sync campaign_replies
    const BATCH_SIZE = 500;
    let offset = 0;

    while (true) {
      let query = remote
        .from("campaign_replies")
        .select("*")
        .order("reply_at", { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      if (lastSync) {
        query = remote
          .from("campaign_replies")
          .select("*")
          .gte("reply_at", lastSync)
          .order("reply_at", { ascending: true })
          .range(offset, offset + BATCH_SIZE - 1);
      }

      const { data: replies, error } = await query;
      if (error) { console.error("Fetch campaign_replies error:", error); stats.errors++; break; }
      if (!replies || replies.length === 0) break;

      const upsertRows = [];
      for (const r of replies) {
        if (!r.instantly_email_id) continue;

        const dedupKey = `instantly:${r.instantly_email_id}`;
        const org = r.company_name ? orgCache.get(r.company_name) : null;

        // Determine best classification
        let temperature = r.ai_temperature || null;
        let reasoning = r.ai_reasoning || null;
        let confidence = r.ai_confidence || null;
        let classificationSource = "unclassified";

        if (r.ai_temperature && r.classification_version?.includes("claude")) {
          classificationSource = "instantly_sync_claude";
        } else if (r.reply_category && r.reply_category !== "unknown") {
          // Map keyword categories to temperatures
          const catToTemp: Record<string, string> = {
            hot: "hot", warm: "warm", negative: "cold",
            auto_reply: "out_of_office", unsubscribe: "cold",
            wrong_person: "cold", do_not_contact: "cold",
            bounce: "cold", closed: "cold",
          };
          temperature = catToTemp[r.reply_category] || null;
          classificationSource = "instantly_sync_keyword";
        }

        upsertRows.push({
          dedup_key: dedupKey,
          source_system: "instantly_sync",
          instantly_email_id: r.instantly_email_id,
          lead_email: r.lead_email || r.from_email,
          lead_name: r.from_name,
          sender_email: r.from_email,
          sender_name: r.from_name,
          reply_subject: r.subject,
          reply_text: r.body_text,
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          sequence_step: r.sequence_step ? parseInt(r.sequence_step) : null,
          thread_id: r.thread_id,
          company_name: r.company_name,
          company_domain: r.company_domain || org?.company_domain,
          ein: org?.ein,
          org_state: org?.state,
          org_city: org?.city,
          org_total_emails_sent: org?.total_emails_sent,
          org_total_replies: org?.total_replies,
          org_total_positive: org?.total_positive_replies,
          temperature,
          reasoning,
          confidence,
          classification_source: classificationSource,
          original_reply_category: r.reply_category,
          original_interest_status: r.interest_status?.toString(),
          original_ai_interest_value: r.ai_interest_value?.toString(),
          received_at: r.reply_at,
          synced_at: new Date().toISOString(),
        });
      }

      if (upsertRows.length > 0) {
        // Batch upsert — let PostgreSQL handle dedup via ON CONFLICT
        // ignoreDuplicates=false means it will update existing rows
        const { error: upsertErr, count } = await local
          .from("unified_replies")
          .upsert(upsertRows, {
            onConflict: "dedup_key",
            ignoreDuplicates: false,
          });

        if (upsertErr) {
          console.error("Batch upsert error:", upsertErr);
          stats.errors += upsertRows.length;
        } else {
          stats.instantly_sync_new += upsertRows.length;
        }
      }

      offset += replies.length;
      if (replies.length < BATCH_SIZE) break;
    }

    console.log(`Instantly-sync: ${stats.instantly_sync_new} new, ${stats.instantly_sync_updated} updated`);

    // 4. Sync from ReplyPilot inbound_replies
    offset = 0;
    while (true) {
      let query = local
        .from("inbound_replies")
        .select("*, draft_versions(id)")
        .order("received_at", { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      if (lastSync) {
        query = local
          .from("inbound_replies")
          .select("*, draft_versions(id)")
          .gte("updated_at", lastSync)
          .order("received_at", { ascending: true })
          .range(offset, offset + BATCH_SIZE - 1);
      }

      const { data: replies, error } = await query;
      if (error) { console.error("Fetch inbound_replies error:", error); stats.errors++; break; }
      if (!replies || replies.length === 0) break;

      const rpRows = [];
      for (const r of replies as any[]) {
        let dedupKey: string;
        if (r.source === "smartlead" && r.smartlead_message_id) {
          dedupKey = `smartlead:${r.smartlead_message_id}`;
        } else if (r.instantly_email_id) {
          dedupKey = `instantly:${r.instantly_email_id}`;
        } else {
          continue;
        }

        const draftCount = Array.isArray(r.draft_versions) ? r.draft_versions.length : 0;

        rpRows.push({
          dedup_key: dedupKey,
          source_system: "both",
          instantly_email_id: r.instantly_email_id || null,
          smartlead_message_id: r.smartlead_message_id || null,
          replypilot_reply_id: r.id,
          lead_email: r.lead_email,
          lead_name: r.lead_name,
          sender_email: r.sender_email,
          sender_name: r.sender_name,
          reply_subject: r.reply_subject,
          reply_text: r.reply_text,
          reply_html: r.reply_html,
          temperature: r.temperature,
          reasoning: r.reasoning,
          classification_source: "replypilot_claude",
          rp_status: r.status,
          rp_draft_count: draftCount,
          rp_sent_at: r.status === "sent" ? r.updated_at : null,
          is_first_reply: r.is_first_reply || false,
          wants_pdf: r.wants_pdf || false,
          simple_affirmative: r.simple_affirmative || false,
          received_at: r.received_at,
          synced_at: new Date().toISOString(),
        });
      }

      if (rpRows.length > 0) {
        const { error: upsertErr } = await local
          .from("unified_replies")
          .upsert(rpRows, { onConflict: "dedup_key", ignoreDuplicates: false });

        if (upsertErr) {
          console.error("RP batch upsert error:", upsertErr);
          stats.errors += rpRows.length;
        } else {
          stats.replypilot_new += rpRows.length;
        }
      }

      offset += replies.length;
      if (replies.length < BATCH_SIZE) break;
    }

    console.log(`ReplyPilot: ${stats.replypilot_new} new, ${stats.replypilot_updated} updated`);

    // 5. Update sync metadata
    stats.duration_ms = Date.now() - start;
    await local
      .from("sync_metadata")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_result: stats,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "unified_replies_sync");

    // 6. Data quality check
    const { count: totalCount } = await local
      .from("unified_replies")
      .select("*", { count: "exact", head: true });

    const { count: unclassifiedCount } = await local
      .from("unified_replies")
      .select("*", { count: "exact", head: true })
      .is("temperature", null);

    console.log(`Total unified: ${totalCount}, Unclassified: ${unclassifiedCount} (${totalCount ? Math.round((unclassifiedCount || 0) / totalCount * 100) : 0}%)`);

    return new Response(JSON.stringify({ ...stats, total_unified: totalCount, unclassified: unclassifiedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Sync error:", err);
    stats.duration_ms = Date.now() - start;
    return new Response(JSON.stringify({ error: String(err), stats }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
