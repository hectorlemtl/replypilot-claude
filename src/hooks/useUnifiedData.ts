import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────
export interface UnifiedReply {
  id: string;
  dedup_key: string;
  source_system: string;
  lead_email: string;
  lead_name: string | null;
  sender_email: string | null;
  sender_name: string | null;
  reply_subject: string | null;
  reply_text: string | null;
  campaign_name: string | null;
  sequence_step: number | null;
  company_name: string | null;
  company_domain: string | null;
  ein: string | null;
  org_state: string | null;
  org_city: string | null;
  org_total_emails_sent: number | null;
  org_total_replies: number | null;
  org_total_positive: number | null;
  temperature: string | null;
  reasoning: string | null;
  classification_source: string | null;
  rp_status: string | null;
  rp_draft_count: number | null;
  rp_sent_at: string | null;
  is_first_reply: boolean;
  wants_pdf: boolean;
  simple_affirmative: boolean;
  original_reply_category: string | null;
  themes: string[] | null;
  primary_theme: string | null;
  received_at: string;
  synced_at: string | null;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface ExplorerFilters {
  searchQuery?: string;
  themes?: string[];
  temperature?: string[];
  campaign?: string;
  dateRange?: DateRange;
  state?: string;
  source?: string;
  rpStatus?: string;
  sortBy?: "newest" | "oldest" | "hot_first";
  page?: number;
}

// ─── KPIs ─────────────────────────────────────────────────
export function useKPIs(dateRange?: DateRange, campaign?: string) {
  return useQuery({
    queryKey: ["unified-kpis", dateRange, campaign],
    queryFn: async () => {
      let query = supabase
        .from("unified_replies")
        .select("temperature, rp_status, received_at, rp_sent_at");

      if (dateRange?.start) query = query.gte("received_at", dateRange.start);
      if (dateRange?.end) query = query.lte("received_at", dateRange.end);
      if (campaign) query = query.eq("campaign_name", campaign);

      const { data, error } = await query;
      if (error) throw error;

      const total = data?.length || 0;
      const hot = data?.filter(r => r.temperature === "hot").length || 0;
      const warm = data?.filter(r => r.temperature === "warm").length || 0;
      const simple = data?.filter(r => r.temperature === "simple").length || 0;
      const cold = data?.filter(r => r.temperature === "cold").length || 0;
      const forLater = data?.filter(r => r.temperature === "for_later").length || 0;
      const ooo = data?.filter(r => r.temperature === "out_of_office").length || 0;
      const positive = hot + warm + simple;
      const sent = data?.filter(r => r.rp_status === "sent").length || 0;
      const unclassified = data?.filter(r => !r.temperature).length || 0;

      // Avg response time for sent replies
      const sentReplies = data?.filter(r => r.rp_status === "sent" && r.rp_sent_at && r.received_at) || [];
      let avgResponseHours = 0;
      if (sentReplies.length > 0) {
        const totalMs = sentReplies.reduce((sum, r) => {
          return sum + (new Date(r.rp_sent_at!).getTime() - new Date(r.received_at).getTime());
        }, 0);
        avgResponseHours = Math.round(totalMs / sentReplies.length / 1000 / 60 / 60);
      }

      return {
        total, hot, warm, simple, cold, forLater, ooo, positive, sent, unclassified,
        avgResponseHours,
        positiveRate: total > 0 ? Math.round(positive / total * 100) : 0,
        hotRate: total > 0 ? Math.round(hot / total * 100) : 0,
      };
    },
    refetchInterval: 5 * 60 * 1000, // 5 min
  });
}

// ─── Daily time series ────────────────────────────────────
export function useDailyReplies(dateRange?: DateRange, campaign?: string) {
  return useQuery({
    queryKey: ["unified-daily", dateRange, campaign],
    queryFn: async () => {
      let query = supabase
        .from("v_daily_replies")
        .select("*")
        .order("reply_date");

      if (dateRange?.start) query = query.gte("reply_date", dateRange.start);
      if (dateRange?.end) query = query.lte("reply_date", dateRange.end);
      if (campaign) query = query.eq("campaign_name", campaign);

      const { data, error } = await query;
      if (error) throw error;

      // Aggregate across campaigns for the same date
      const byDate = new Map<string, any>();
      for (const row of data || []) {
        const existing = byDate.get(row.reply_date) || {
          reply_date: row.reply_date, total: 0, hot: 0, warm: 0, simple: 0, cold: 0, for_later: 0, ooo: 0, positive: 0,
        };
        existing.total += row.total;
        existing.hot += row.hot;
        existing.warm += row.warm;
        existing.simple += row.simple;
        existing.cold += row.cold;
        existing.for_later += row.for_later;
        existing.ooo += row.ooo;
        existing.positive += row.positive;
        byDate.set(row.reply_date, existing);
      }

      return Array.from(byDate.values());
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

// ─── Campaign funnel ──────────────────────────────────────
export function useCampaignFunnel() {
  return useQuery({
    queryKey: ["unified-campaign-funnel"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_campaign_funnel")
        .select("*");
      if (error) throw error;
      return data;
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

// ─── Weekly cohort ────────────────────────────────────────
export function useWeeklyCohort() {
  return useQuery({
    queryKey: ["unified-weekly-cohort"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_weekly_cohort")
        .select("*")
        .order("reply_week");
      if (error) throw error;
      return data;
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

// ─── Org engagement ───────────────────────────────────────
export function useOrgEngagement(limit = 50) {
  return useQuery({
    queryKey: ["unified-orgs", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_org_engagement")
        .select("*")
        .limit(limit);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

// ─── Theme distribution ──────────────────────────────────
export function useThemeDistribution() {
  return useQuery({
    queryKey: ["unified-themes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_theme_distribution")
        .select("*");
      if (error) throw error;
      return data;
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

// ─── Classification quality ──────────────────────────────
export function useClassificationQuality() {
  return useQuery({
    queryKey: ["unified-classification-quality"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_classification_quality")
        .select("*");
      if (error) throw error;
      return data;
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

// ─── Explorer search ─────────────────────────────────────
const PAGE_SIZE = 50;

export function useExplorerReplies(filters: ExplorerFilters) {
  return useQuery({
    queryKey: ["explorer-replies", filters],
    queryFn: async () => {
      let query = supabase
        .from("unified_replies")
        .select("*", { count: "exact" });

      // Full-text search
      if (filters.searchQuery && filters.searchQuery.length >= 2) {
        query = query.textSearch("search_vector", filters.searchQuery, {
          type: "websearch",
          config: "english",
        });
      }

      // Theme filter (ANY of selected themes)
      if (filters.themes && filters.themes.length > 0) {
        query = query.overlaps("themes", filters.themes);
      }

      // Temperature filter
      if (filters.temperature && filters.temperature.length > 0) {
        query = query.in("temperature", filters.temperature);
      }

      if (filters.campaign) query = query.eq("campaign_name", filters.campaign);
      if (filters.dateRange?.start) query = query.gte("received_at", filters.dateRange.start);
      if (filters.dateRange?.end) query = query.lte("received_at", filters.dateRange.end);
      if (filters.state) query = query.eq("org_state", filters.state);
      if (filters.source) query = query.eq("source_system", filters.source);
      if (filters.rpStatus) query = query.eq("rp_status", filters.rpStatus);

      // Sort
      switch (filters.sortBy) {
        case "oldest": query = query.order("received_at", { ascending: true }); break;
        case "hot_first": query = query.order("temperature", { ascending: true }); break;
        default: query = query.order("received_at", { ascending: false }); break;
      }

      // Pagination
      const page = filters.page || 0;
      query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (error) throw error;
      return { replies: (data || []) as UnifiedReply[], total: count || 0 };
    },
    keepPreviousData: true,
  });
}

// ─── Theme counts (for explorer sidebar) ─────────────────
export function useThemeCounts(filters: Omit<ExplorerFilters, "themes" | "page">) {
  return useQuery({
    queryKey: ["explorer-theme-counts", filters],
    queryFn: async () => {
      // Fetch all themes from matching replies
      let query = supabase
        .from("unified_replies")
        .select("themes");

      if (filters.searchQuery && filters.searchQuery.length >= 2) {
        query = query.textSearch("search_vector", filters.searchQuery, { type: "websearch", config: "english" });
      }
      if (filters.temperature && filters.temperature.length > 0) {
        query = query.in("temperature", filters.temperature);
      }
      if (filters.campaign) query = query.eq("campaign_name", filters.campaign);
      if (filters.dateRange?.start) query = query.gte("received_at", filters.dateRange.start);
      if (filters.dateRange?.end) query = query.lte("received_at", filters.dateRange.end);

      const { data, error } = await query;
      if (error) throw error;

      // Count themes client-side
      const counts = new Map<string, number>();
      for (const row of data || []) {
        if (row.themes) {
          for (const t of row.themes as string[]) {
            counts.set(t, (counts.get(t) || 0) + 1);
          }
        }
      }

      return Object.fromEntries(counts);
    },
  });
}

// ─── Distinct campaigns list ─────────────────────────────
export function useCampaignList() {
  return useQuery({
    queryKey: ["unified-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unified_replies")
        .select("campaign_name")
        .not("campaign_name", "is", null);
      if (error) throw error;
      const unique = [...new Set((data || []).map(r => r.campaign_name).filter(Boolean))];
      return unique as string[];
    },
  });
}

// ─── Sync metadata ───────────────────────────────────────
export function useSyncStatus() {
  return useQuery({
    queryKey: ["sync-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_metadata")
        .select("*")
        .eq("id", "unified_replies_sync")
        .single();
      if (error) throw error;
      return data;
    },
  });
}
