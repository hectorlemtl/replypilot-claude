import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCallback, useState, useMemo } from "react";

export type QueueFilter = "hot_review" | "warm_review" | "failed" | "manual_review" | "all" | "sent" | "skipped";

const PRIORITY_ORDER: Record<string, number> = {
  hot: 0,
  warm: 1,
  for_later: 2,
  cold: 3,
  out_of_office: 4,
};

export function useCockpitData() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("hot_review");
  const [search, setSearch] = useState("");

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
    if (!allReplies) return { hot_review: 0, warm_review: 0, failed: 0, manual_review: 0, all: 0, sent: 0, skipped: 0 };
    return {
      hot_review: allReplies.filter(r => r.temperature === "hot" && ["awaiting_review", "regenerated"].includes(r.status)).length,
      warm_review: allReplies.filter(r => r.temperature === "warm" && ["awaiting_review", "regenerated"].includes(r.status)).length,
      failed: allReplies.filter(r => r.status === "failed").length,
      manual_review: allReplies.filter(r => r.status === "manual_review").length,
      all: allReplies.length,
      sent: allReplies.filter(r => r.status === "sent").length,
      skipped: allReplies.filter(r => r.status === "skipped").length,
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
          query = query.eq("temperature", "hot" as any).in("status", ["awaiting_review", "regenerated"] as any);
          break;
        case "warm_review":
          query = query.eq("temperature", "warm" as any).in("status", ["awaiting_review", "regenerated"] as any);
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

  // Auto-select first if nothing selected
  const queue = queueReplies || [];

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

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["cockpit_all_replies"] });
    queryClient.invalidateQueries({ queryKey: ["cockpit_queue"] });
    queryClient.invalidateQueries({ queryKey: ["cockpit_reply", selectedId] });
    queryClient.invalidateQueries({ queryKey: ["cockpit_drafts", selectedId] });
  }, [queryClient, selectedId]);

  // Approve & send
  const approveMutation = useMutation({
    mutationFn: async () => {
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
        body: { reply_id: selectedId, draft_version_id: latestDraft.id },
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
    saveDraftMutation,
    retrySendMutation,
  };
}
