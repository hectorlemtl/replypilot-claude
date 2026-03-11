import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCallback, useState, useMemo } from "react";
import { startOfDay, subDays } from "date-fns";

export type UntrackedFilter = "leads" | "support" | "pending" | "all" | "archived";
export type DatePreset = "all" | "today" | "yesterday" | "last7" | "last30" | "custom";
export type SortBy = "newest" | "oldest" | "confidence_high" | "leads_first";

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
        to: customTo ? new Date(new Date(customTo).getTime() + 86400000) : null,
      };
    default:
      return { from: null, to: null };
  }
}

function filterByDate<T extends { received_at: string | null }>(
  items: T[], preset: DatePreset, customFrom?: string, customTo?: string,
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

function sortEmails<T extends { received_at: string | null; triage_confidence?: number | null; is_lead_signal?: boolean | null }>(
  items: T[], sortBy: SortBy,
): T[] {
  const sorted = [...items];
  const receivedTime = (r: T) => new Date(r.received_at || 0).getTime();
  sorted.sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return receivedTime(b) - receivedTime(a);
      case "oldest":
        return receivedTime(a) - receivedTime(b);
      case "confidence_high": {
        const ca = a.triage_confidence ?? 0;
        const cb = b.triage_confidence ?? 0;
        return cb - ca || receivedTime(b) - receivedTime(a);
      }
      case "leads_first": {
        const la = a.is_lead_signal ? 0 : 1;
        const lb = b.is_lead_signal ? 0 : 1;
        return la !== lb ? la - lb : receivedTime(b) - receivedTime(a);
      }
      default:
        return 0;
    }
  });
  return sorted;
}

export function useUntrackedData() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<UntrackedFilter>("leads");
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  // All emails for counting
  const { data: allEmails } = useQuery({
    queryKey: ["untracked_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("untracked_emails")
        .select("id, review_status, triage_category, is_lead_signal, received_at, archived_at");
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  const counts = useMemo(() => {
    if (!allEmails) return { leads: 0, support: 0, pending: 0, all: 0, archived: 0 };
    const active = allEmails.filter(r => !r.archived_at);
    const archived = allEmails.filter(r => !!r.archived_at);
    return {
      leads: active.filter(r => r.is_lead_signal && r.review_status === "pending").length,
      support: active.filter(r => r.triage_category === "support_request" && r.review_status === "pending").length,
      pending: active.filter(r => r.review_status === "pending").length,
      all: active.length,
      archived: archived.length,
    };
  }, [allEmails]);

  // Filtered queue
  const { data: queueEmails, isLoading: queueLoading } = useQuery({
    queryKey: ["untracked_queue", activeFilter, search],
    queryFn: async () => {
      let query = supabase
        .from("untracked_emails")
        .select("id, sender_email, sender_name, subject, content_preview, body_text, triage_category, triage_confidence, is_lead_signal, review_status, received_at, archived_at, is_auto_reply, ai_interest_value")
        .order("received_at", { ascending: false });

      // Archive filter
      if (activeFilter === "archived") {
        query = query.not("archived_at", "is", null);
      } else {
        query = query.is("archived_at", null);
      }

      switch (activeFilter) {
        case "leads":
          query = query.eq("is_lead_signal", true).eq("review_status", "pending");
          break;
        case "support":
          query = query.eq("triage_category", "support_request").eq("review_status", "pending");
          break;
        case "pending":
          query = query.eq("review_status", "pending");
          break;
        case "all":
          break;
        case "archived":
          break;
      }

      if (search) {
        query = query.or(`sender_email.ilike.%${search}%,subject.ilike.%${search}%,body_text.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  // Selected email full data
  const { data: selectedEmail, isLoading: emailLoading } = useQuery({
    queryKey: ["untracked_email", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("untracked_emails")
        .select("*")
        .eq("id", selectedId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedId,
  });

  // Sync status
  const { data: syncStatus } = useQuery({
    queryKey: ["untracked_sync_status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("untracked_sync_enabled, untracked_sync_last_at, untracked_sync_mode")
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Check if sender is a known contact
  const { data: knownContact } = useQuery({
    queryKey: ["untracked_known_contact", selectedEmail?.sender_email],
    queryFn: async () => {
      if (!selectedEmail?.sender_email) return null;
      const { data, error } = await supabase
        .from("inbound_replies")
        .select("id, lead_name, lead_email, campaign_id, campaigns(name)")
        .or(`lead_email.eq.${selectedEmail.sender_email},sender_email.eq.${selectedEmail.sender_email}`)
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!selectedEmail?.sender_email,
  });

  // Apply client-side date filter and sorting
  const queue = useMemo(() => {
    const raw = queueEmails || [];
    const dated = filterByDate(raw, datePreset, customDateFrom, customDateTo);
    return sortEmails(dated, sortBy);
  }, [queueEmails, datePreset, customDateFrom, customDateTo, sortBy]);

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
    setSortBy("newest");
  }, []);

  const hasActiveFilters = datePreset !== "all" || sortBy !== "newest";

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["untracked_all"] });
    queryClient.invalidateQueries({ queryKey: ["untracked_queue"] });
    queryClient.invalidateQueries({ queryKey: ["untracked_email", selectedId] });
  }, [queryClient, selectedId]);

  // --- Mutations ---

  const setReviewStatus = (status: string, shouldArchive: boolean) => ({
    mutationFn: async (notes?: string) => {
      const update: Record<string, unknown> = {
        review_status: status,
        reviewed_by: "reviewer",
        reviewed_at: new Date().toISOString(),
      };
      if (shouldArchive) update.archived_at = new Date().toISOString();
      if (notes) update.review_notes = notes;
      await supabase.from("untracked_emails").update(update).eq("id", selectedId!);
      await supabase.from("audit_logs").insert({
        event_type: "untracked_reviewed",
        event_payload: { untracked_id: selectedId, review_status: status, archived: shouldArchive },
      });
    },
    onSuccess: () => {
      toast({ title: `Marked as ${status}` });
      invalidateAll();
      setTimeout(selectNext, 300);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: String(err), variant: "destructive" as const });
    },
  });

  const markSpamMutation = useMutation(setReviewStatus("spam", true));
  const markIgnoredMutation = useMutation(setReviewStatus("ignored", true));
  const markInterestedMutation = useMutation(setReviewStatus("interested", false));
  const markNeedsReplyMutation = useMutation(setReviewStatus("needs_reply", false));
  const markDoneMutation = useMutation(setReviewStatus("done", false));

  const archiveMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("untracked_emails").update({
        archived_at: new Date().toISOString(),
      }).eq("id", selectedId!);
    },
    onSuccess: () => {
      toast({ title: "Archived" });
      invalidateAll();
      setTimeout(selectNext, 300);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("untracked_emails").update({
        archived_at: null,
        review_status: "pending",
      }).eq("id", selectedId!);
    },
    onSuccess: () => {
      toast({ title: "Restored" });
      invalidateAll();
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      await supabase.from("untracked_emails").update({
        review_notes: notes,
      }).eq("id", selectedId!);
    },
    onSuccess: () => {
      toast({ title: "Notes saved" });
      queryClient.invalidateQueries({ queryKey: ["untracked_email", selectedId] });
    },
  });

  // Sync now
  const syncNowMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("poll-untracked-emails", { body: {} });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Sync completed" });
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["untracked_sync_status"] });
    },
    onError: (err) => {
      toast({ title: "Sync failed", description: String(err), variant: "destructive" });
    },
  });

  // Send reply to untracked email
  const sendReplyMutation = useMutation({
    mutationFn: async (replyText: string) => {
      if (!replyText.trim()) throw new Error("Reply text is empty");
      const { data, error } = await supabase.functions.invoke("send-untracked-reply", {
        body: { untracked_id: selectedId, reply_text: replyText.trim() },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Reply sent" });
      invalidateAll();
      setTimeout(selectNext, 300);
    },
    onError: (err) => {
      toast({ title: "Send failed", description: String(err), variant: "destructive" });
    },
  });

  // Batch classify unclassified emails
  const classifyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("batch-classify-untracked", { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const msg = data?.classified
        ? `Classified ${data.classified} emails (${data.ai_classified} AI, ${data.rule_matched} rules)`
        : "Nothing to classify";
      toast({ title: msg });
      invalidateAll();
    },
    onError: (err) => {
      toast({ title: "Classification failed", description: String(err), variant: "destructive" });
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
    selectedEmail,
    emailLoading,
    syncStatus,
    knownContact,
    // Navigation
    selectNext,
    selectPrev,
    // Mutations
    markSpamMutation,
    markIgnoredMutation,
    markInterestedMutation,
    markNeedsReplyMutation,
    markDoneMutation,
    archiveMutation,
    restoreMutation,
    saveNotesMutation,
    syncNowMutation,
    classifyMutation,
    sendReplyMutation,
  };
}
