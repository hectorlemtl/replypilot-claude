import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCallback, useState, useMemo } from "react";
import { startOfDay, subDays } from "date-fns";

export type QueueFilter = "hot_review" | "simple_review" | "failed" | "manual_review" | "all" | "sent" | "skipped" | "waiting_for_reply";
export type DatePreset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";
export type SortBy = "newest" | "oldest" | "hot_first" | "failed_first" | "awaiting_first";

const PRIORITY_ORDER: Record<string, number> = {
  hot: 0,
  simple: 1,
  warm: 2,
  for_later: 3,
  cold: 4,
  out_of_office: 5,
};

const STATUS_PRIORITY: Record<string, number> = {
  failed: 0,
  awaiting_review: 1,
  regenerated: 2,
  manual_review: 3,
  received: 4,
  classified: 5,
  drafted: 6,
  approved: 7,
  sent: 8,
  rejected: 9,
  skipped: 10,
};

function getDateRange(preset: DatePreset, customFrom?: string, customTo?: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: null };
    case "yesterday":
      return { from: startOfDay(subDays(now, 1)), to: startOfDay(now) };
    case "last7":
      return { from: startOfDay(subDays(now, 7)), to: null };
    case "last30":
      return { from: startOfDay(subDays(now, 30)), to: null };
    case "custom":
      return {
        from: customFrom ? startOfDay(new Date(customFrom)) : null,
        to: customTo ? new Date(new Date(customTo).getTime() + 86400000) : null, // end of day
      };
    default:
      return { from: null, to: null };
  }
}

export function filterByDate<T extends { received_at: string | null }>(
  items: T[],
  preset: DatePreset,
  customFrom?: string,
  customTo?: string,
): T[] {
  if (preset === "all") return items;
  const { from, to } = getDateRange(preset, customFrom, customTo);
  return items.filter((item) => {
    if (!item.received_at) return false;
    const date = new Date(item.received_at);
    if (from && date < from) return false;
    if (to && date >= to) return false;
    return true;
  });
}

export function sortReplies<T extends { received_at: string | null; temperature?: string | null; status: string }>(
  items: T[],
  sortBy: SortBy,
): T[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime();
      case "oldest":
        return new Date(a.received_at || 0).getTime() - new Date(b.received_at || 0).getTime();
      case "hot_first": {
        const pa = PRIORITY_ORDER[a.temperature || ""] ?? 99;
        const pb = PRIORITY_ORDER[b.temperature || ""] ?? 99;
        return pa !== pb ? pa - pb : new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime();
      }
      case "failed_first": {
        const fa = a.status === "failed" ? 0 : 1;
        const fb = b.status === "failed" ? 0 : 1;
        return fa !== fb ? fa - fb : new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime();
      }
      case "awaiting_first": {
        const sa = STATUS_PRIORITY[a.status] ?? 99;
        const sb = STATUS_PRIORITY[b.status] ?? 99;
        return sa !== sb ? sa - sb : new Date(b.received_at || 0).getTime() - new Date(a.received_at || 0).getTime();
      }
      default:
        return 0;
    }
  });
  return sorted;
}

export function useCockpitData() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("hot_review");
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("oldest");

  // All replies for counting
  const { data: allReplies } = useQuery({
    queryKey: ["cockpit_all_replies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inbound_replies")
        .select("id, status, temperature, received_at");
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  const counts = useMemo(() => {
    if (!allReplies) return { hot_review: 0, simple_review: 0, failed: 0, manual_review: 0, all: 0, sent: 0, skipped: 0, waiting_for_reply: 0 };
    return {
      hot_review: allReplies.filter(r => (r.temperature === "hot" || r.temperature === "warm") && ["awaiting_review", "regenerated"].includes(r.status)).length,
      simple_review: allReplies.filter(r => r.temperature === "simple" && ["awaiting_review", "regenerated"].includes(r.status)).length,
      failed: allReplies.filter(r => r.status === "failed").length,
      manual_review: allReplies.filter(r => r.status === "manual_review").length,
      all: allReplies.length,
      sent: allReplies.filter(r => r.status === "sent").length,
      skipped: allReplies.filter(r => r.status === "skipped").length,
      waiting_for_reply: allReplies.filter(r => r.status === "sent").length,
    };
  }, [allReplies]);

  // Filtered queue
  const { data: queueReplies, isLoading: queueLoading } = useQuery({
    queryKey: ["cockpit_queue", activeFilter, search],
    queryFn: async () => {
      let query = supabase
        .from("inbound_replies")
        .select("id, lead_email, lead_name, temperature, status, reply_subject, reply_text, received_at, wants_pdf, simple_affirmative")
        .order("received_at", { ascending: true });

      switch (activeFilter) {
        case "hot_review":
          query = query.in("temperature", ["hot", "warm"] as any).in("status", ["awaiting_review", "regenerated"] as any);
          break;
        case "simple_review":
          query = query.eq("temperature", "simple" as any).in("status", ["awaiting_review", "regenerated"] as any);
          break;
        case "failed":
          query = query.eq("status", "failed" as any);
          break;
        case "manual_review":
          query = query.eq("status", "manual_review" as any);
          break;
        case "sent":
          query = query.eq("status", "sent" as any).order("received_at", { ascending: false });
          break;
        case "waiting_for_reply":
          query = query.eq("status", "sent" as any).order("received_at", { ascending: false });
          break;
        case "skipped":
          query = query.in("status", ["skipped"] as any).order("received_at", { ascending: false });
          break;
        case "all":
          query = query.order("received_at", { ascending: false });
          break;
      }

      if (search) {
        query = query.or(`lead_email.ilike.%${search}%,reply_subject.ilike.%${search}%,reply_text.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  // Selected reply full data
  const { data: selectedReply, isLoading: replyLoading } = useQuery({
    queryKey: ["cockpit_reply", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inbound_replies")
        .select("*, campaigns(name, deck_link, calendar_link)")
        .eq("id", selectedId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  // Drafts for selected reply
  const { data: drafts } = useQuery({
    queryKey: ["cockpit_drafts", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("draft_versions")
        .select("*")
        .eq("reply_id", selectedId!)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  // Apply client-side date filter and sorting on top of DB-filtered results
  const queue = useMemo(() => {
    const raw = queueReplies || [];
    const dated = filterByDate(raw, datePreset, customDateFrom, customDateTo);
    return sortReplies(dated, sortBy);
  }, [queueReplies, datePreset, customDateFrom, customDateTo, sortBy]);

  const selectNext = useCallback(() => {
    if (!queue.length) { setSelectedId(null); return; }
    const currentIdx = queue.findIndex(r => r.id === selectedId);
    if (currentIdx < queue.length - 1) {
      setSelectedId(queue[currentIdx + 1].id);
    } else if (queue.length > 1) {
      setSelectedId(queue[0].id);
    } else {
      setSelectedId(null);
    }
  }, [queue, selectedId]);

  const selectPrev = useCallback(() => {
    if (!queue.length) return;
    const currentIdx = queue.findIndex(r => r.id === selectedId);
    if (currentIdx > 0) {
      setSelectedId(queue[currentIdx - 1].id);
    }
  }, [queue, selectedId]);

  const clearFilters = useCallback(() => {
    setDatePreset("all");
    setCustomDateFrom("");
    setCustomDateTo("");
    setSortBy("oldest");
  }, []);

  const hasActiveFilters = datePreset !== "all" || sortBy !== "oldest";

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["cockpit_all_replies"] });
    queryClient.invalidateQueries({ queryKey: ["cockpit_queue"] });
    queryClient.invalidateQueries({ queryKey: ["cockpit_reply", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["cockpit_drafts", selectedId] });
  }, [queryClient, selectedId]);

  // Approve & send
  const approveMutation = useMutation({
    mutationFn: async ({ extraToEmails, extraCcEmails }: { extraToEmails?: string[]; extraCcEmails?: string[] } = {}) => {
      const latestDraft = drafts?.[0];
      if (!latestDraft) throw new Error("No draft to approve");

      await supabase.from("approval_actions").insert({
        reply_id: selectedId!,
        draft_version_id: latestDraft.id,
        action: "approved",
        acted_by: "reviewer",
      });

      await supabase.from("inbound_replies").update({ status: "approved" }).eq("id", selectedId!);

      const { error } = await supabase.functions.invoke("send-reply", {
        body: {
          reply_id: selectedId,
          draft_version_id: latestDraft.id,
          extra_to_emails: extraToEmails?.filter(e => e.trim()) || [],
          extra_cc_emails: extraCcEmails?.filter(e => e.trim()) || [],
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "✓ Sent", description: "Reply approved and sent" });
      invalidateAll();
      // Auto-advance after a short delay to let data refresh
      setTimeout(selectNext, 300);
    },
    onError: (err) => {
      toast({ title: "Send failed", description: String(err), variant: "destructive" });
    },
  });

  // Regenerate
  const regenerateMutation = useMutation({
    mutationFn: async (feedback: string) => {
      if (!feedback.trim()) throw new Error("Provide feedback");

      const latestDraft = drafts?.[0];
      await supabase.from("approval_actions").insert({
        reply_id: selectedId!,
        draft_version_id: latestDraft?.id,
        action: "rejected",
        feedback: feedback.trim(),
        acted_by: "reviewer",
      });

      await supabase.from("inbound_replies").update({ status: "rejected" }).eq("id", selectedId!);

      const { error } = await supabase.functions.invoke("regenerate-draft", {
        body: { reply_id: selectedId, feedback: feedback.trim() },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Regenerating...", description: "Draft is being regenerated" });
      // Refetch drafts after delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["cockpit_drafts", selectedId] });
        queryClient.invalidateQueries({ queryKey: ["cockpit_reply", selectedId] });
        queryClient.invalidateQueries({ queryKey: ["cockpit_queue"] });
      }, 3000);
    },
    onError: (err) => {
      toast({ title: "Regeneration failed", description: String(err), variant: "destructive" });
    },
  });

  // Mark manual
  const markManualMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("inbound_replies").update({ status: "manual_review" }).eq("id", selectedId!);
    },
    onSuccess: () => {
      toast({ title: "Marked for manual review" });
      invalidateAll();
      setTimeout(selectNext, 300);
    },
  });

  // Mark as responded manually (when Julia replied directly outside the system)
  const markRespondedMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("inbound_replies").update({ status: "sent" }).eq("id", selectedId!);
      await supabase.from("audit_logs").insert({
        reply_id: selectedId!,
        event_type: "manually_marked_responded",
        event_payload: { marked_by: "reviewer" },
      });
    },
    onSuccess: () => {
      toast({ title: "Marked as responded" });
      invalidateAll();
      setTimeout(selectNext, 300);
    },
  });

  // Save edited draft
  const saveDraftMutation = useMutation({
    mutationFn: async (text: string) => {
      const nextVersion = (drafts?.[0]?.version_number || 0) + 1;
      await supabase.from("draft_versions").insert({
        reply_id: selectedId!,
        version_number: nextVersion,
        draft_text: text,
        draft_html: `<p>${text.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`,
        created_by: "manual",
      });
      await supabase.from("inbound_replies").update({ status: "awaiting_review" }).eq("id", selectedId!);
    },
    onSuccess: () => {
      toast({ title: "Draft saved" });
      queryClient.invalidateQueries({ queryKey: ["cockpit_drafts", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["cockpit_reply", selectedId] });
    },
  });

  // Retry send
  const retrySendMutation = useMutation({
    mutationFn: async () => {
      const latestDraft = drafts?.[0];
      if (!latestDraft) throw new Error("No draft");
      const { error } = await supabase.functions.invoke("send-reply", {
        body: { reply_id: selectedId, draft_version_id: latestDraft.id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Retrying send..." });
      invalidateAll();
      setTimeout(selectNext, 300);
    },
    onError: (err) => {
      toast({ title: "Retry failed", description: String(err), variant: "destructive" });
    },
  });

  return {
    // State
    selectedId,
    setSelectedId,
    activeFilter,
    setActiveFilter,
    search,
    setSearch,
    // Date & sort filters
    datePreset,
    setDatePreset,
    customDateFrom,
    setCustomDateFrom,
    customDateTo,
    setCustomDateTo,
    sortBy,
    setSortBy,
    clearFilters,
    hasActiveFilters,
    // Data
    counts,
    queue,
    queueLoading,
    selectedReply,
    replyLoading,
    drafts: drafts || [],
    latestDraft: drafts?.[0] || null,
    previousDraft: drafts?.[1] || null,
    // Navigation
    selectNext,
    selectPrev,
    // Mutations
    approveMutation,
    regenerateMutation,
    markManualMutation,
    markRespondedMutation,
    saveDraftMutation,
    retrySendMutation,
  };
}
