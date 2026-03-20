import { useEffect, useRef, useCallback } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { WorkloadBar } from "./WorkloadBar";
import { QueueFilters } from "./QueueFilters";
import { ReplyQueue } from "./ReplyQueue";
import { ReplyContent } from "./ReplyContent";
import { DraftPanel } from "./DraftPanel";
import { useCockpitData } from "@/hooks/useCockpitData";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export function CockpitLayout() {
  const data = useCockpitData();
  const searchRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Auto-select first reply when queue loads and nothing is selected
  useEffect(() => {
    if (data.queue.length && !data.selectedId) {
      data.setSelectedId(data.queue[0].id);
    }
  }, [data.queue, data.selectedId]);

  const handleSubmit = useCallback(() => {
    // If feedback has text, regenerate
    if (feedbackRef.current && feedbackRef.current.value.trim()) {
      data.regenerateMutation.mutate(feedbackRef.current.value);
      return;
    }
    // Otherwise approve if possible
    const canApprove = data.selectedReply && ["awaiting_review", "regenerated"].includes(data.selectedReply.status);
    if (canApprove && data.latestDraft) {
      data.approveMutation.mutate({});
    }
  }, [data]);

  useKeyboardShortcuts({
    onNext: data.selectNext,
    onPrev: data.selectPrev,
    onApprove: () => {
      const canApprove = data.selectedReply && ["awaiting_review", "regenerated"].includes(data.selectedReply.status);
      if (canApprove && data.latestDraft) data.approveMutation.mutate({});
    },
    onRegenerate: () => feedbackRef.current?.focus(),
    onEdit: () => {
      // Toggle edit mode — the DraftPanel needs to enter edit mode first, then focus the textarea
      if (editorRef.current) {
        editorRef.current.focus();
      } else if (data.latestDraft && data.selectedReply) {
        // Dispatch a custom event that DraftPanel listens to
        window.dispatchEvent(new CustomEvent("replypilot:start-edit"));
      }
    },
    onManual: () => {
      if (data.selectedReply) data.markManualMutation.mutate();
    },
    onRetry: () => {
      if (data.selectedReply?.status === "failed" && data.latestDraft) data.retrySendMutation.mutate();
    },
    onSearch: () => searchRef.current?.focus(),
    onSubmit: handleSubmit,
    onEscape: () => {
      (document.activeElement as HTMLElement)?.blur();
      window.dispatchEvent(new CustomEvent("replypilot:cancel-edit"));
    },
  });

  return (
    <div className="flex flex-col h-full">
      <WorkloadBar
        counts={data.counts}
        activeFilter={data.activeFilter}
        onFilterChange={data.setActiveFilter}
        onRetryAllFailed={() => data.retryAllFailedMutation.mutate()}
        isRetryingAll={data.retryAllFailedMutation.isPending}
        onReviewAllHot={() => data.reviewAllHotMutation.mutate()}
        isReviewingAll={data.reviewAllHotMutation.isPending}
        onSendAllAuto={() => data.sendAllAutoMutation.mutate()}
        isSendingAllAuto={data.sendAllAutoMutation.isPending}
        autoSendableCount={data.autoSendableCount}
      />

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left: Queue */}
        <ResizablePanel defaultSize={22} minSize={16} maxSize={35}>
          <div className="flex flex-col h-full">
            <QueueFilters
              datePreset={data.datePreset}
              onDatePresetChange={data.setDatePreset}
              customDateFrom={data.customDateFrom}
              onCustomDateFromChange={data.setCustomDateFrom}
              customDateTo={data.customDateTo}
              onCustomDateToChange={data.setCustomDateTo}
              sortBy={data.sortBy}
              onSortByChange={data.setSortBy}
              onClear={data.clearFilters}
              hasActiveFilters={data.hasActiveFilters}
            />
            <ReplyQueue
              ref={searchRef}
              replies={data.queue}
              selectedId={data.selectedId}
              onSelect={data.setSelectedId}
              search={data.search}
              onSearchChange={data.setSearch}
              isLoading={data.queueLoading}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Center: Original Reply */}
        <ResizablePanel defaultSize={40} minSize={25}>
          <ReplyContent
            reply={data.selectedReply}
            isLoading={data.replyLoading}
          />
        </ResizablePanel>

        <ResizableHandle />

        {/* Right: Draft + Actions */}
        <ResizablePanel defaultSize={38} minSize={25}>
          <DraftPanel
            reply={data.selectedReply}
            latestDraft={data.latestDraft}
            previousDraft={data.previousDraft}
            onApprove={(opts) => data.approveMutation.mutate(opts || {})}
            onRegenerate={(fb) => data.regenerateMutation.mutate(fb)}
            onMarkManual={() => data.markManualMutation.mutate()}
            onSaveDraft={(text) => data.saveDraftMutation.mutate(text)}
            onRetrySend={() => data.retrySendMutation.mutate()}
            onMarkResponded={() => data.markRespondedMutation.mutate()}
            onArchive={() => data.archiveMutation.mutate()}
            onRestore={() => data.restoreMutation.mutate()}
            isApproving={data.approveMutation.isPending}
            isRegenerating={data.regenerateMutation.isPending}
            isMarkingManual={data.markManualMutation.isPending}
            isMarkingResponded={data.markRespondedMutation.isPending}
            isArchiving={data.archiveMutation.isPending}
            isRestoring={data.restoreMutation.isPending}
            isSaving={data.saveDraftMutation.isPending}
            isRetrying={data.retrySendMutation.isPending}
            feedbackRef={feedbackRef}
            editorRef={editorRef}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
