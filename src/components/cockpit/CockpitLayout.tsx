import { useEffect, useRef, useCallback } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { WorkloadBar } from "./WorkloadBar";
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
      data.approveMutation.mutate();
    }
  }, [data]);

  useKeyboardShortcuts({
    onNext: data.selectNext,
    onPrev: data.selectPrev,
    onApprove: () => {
      const canApprove = data.selectedReply && ["awaiting_review", "regenerated"].includes(data.selectedReply.status);
      if (canApprove && data.latestDraft) data.approveMutation.mutate();
    },
    onRegenerate: () => feedbackRef.current?.focus(),
    onEdit: () => editorRef.current?.focus(),
    onManual: () => {
      if (data.selectedReply) data.markManualMutation.mutate();
    },
    onSearch: () => searchRef.current?.focus(),
    onSubmit: handleSubmit,
    onEscape: () => {
      (document.activeElement as HTMLElement)?.blur();
    },
  });

  return (
    <div className="flex flex-col h-full">
      <WorkloadBar
        counts={data.counts}
        activeFilter={data.activeFilter}
        onFilterChange={data.setActiveFilter}
      />

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left: Queue */}
        <ResizablePanel defaultSize={22} minSize={16} maxSize={35}>
          <ReplyQueue
            ref={searchRef}
            replies={data.queue}
            selectedId={data.selectedId}
            onSelect={data.setSelectedId}
            search={data.search}
            onSearchChange={data.setSearch}
            isLoading={data.queueLoading}
          />
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
            onApprove={() => data.approveMutation.mutate()}
            onRegenerate={(fb) => data.regenerateMutation.mutate(fb)}
            onMarkManual={() => data.markManualMutation.mutate()}
            onSaveDraft={(text) => data.saveDraftMutation.mutate(text)}
            onRetrySend={() => data.retrySendMutation.mutate()}
            isApproving={data.approveMutation.isPending}
            isRegenerating={data.regenerateMutation.isPending}
            isMarkingManual={data.markManualMutation.isPending}
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
