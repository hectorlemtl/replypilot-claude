import { useEffect, useRef } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { TriageBar } from "./TriageBar";
import { UntrackedFilters } from "./UntrackedFilters";
import { UntrackedQueue } from "./UntrackedQueue";
import { UntrackedEmailContent } from "./UntrackedEmailContent";
import { TriagePanel } from "./TriagePanel";
import { useUntrackedData } from "@/hooks/useUntrackedData";

export function UntrackedLayout() {
  const data = useUntrackedData();
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-select first email when queue loads
  useEffect(() => {
    if (data.queue.length && !data.selectedId) {
      data.setSelectedId(data.queue[0].id);
    }
  }, [data.queue, data.selectedId]);

  return (
    <div className="flex flex-col h-full">
      <TriageBar
        counts={data.counts}
        activeFilter={data.activeFilter}
        onFilterChange={data.setActiveFilter}
        syncLastAt={data.syncStatus?.untracked_sync_last_at || null}
        onSyncNow={() => data.syncNowMutation.mutate()}
        isSyncing={data.syncNowMutation.isPending}
      />

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left: Queue */}
        <ResizablePanel defaultSize={22} minSize={16} maxSize={35}>
          <div className="flex flex-col h-full">
            <UntrackedFilters
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
            <UntrackedQueue
              ref={searchRef}
              emails={data.queue}
              selectedId={data.selectedId}
              onSelect={data.setSelectedId}
              search={data.search}
              onSearchChange={data.setSearch}
              isLoading={data.queueLoading}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Center: Email Content */}
        <ResizablePanel defaultSize={40} minSize={25}>
          <UntrackedEmailContent
            email={data.selectedEmail}
            isLoading={data.emailLoading}
          />
        </ResizablePanel>

        <ResizableHandle />

        {/* Right: Triage Panel */}
        <ResizablePanel defaultSize={38} minSize={25}>
          <TriagePanel
            email={data.selectedEmail}
            knownContact={data.knownContact}
            onMarkSpam={() => data.markSpamMutation.mutate()}
            onMarkIgnored={() => data.markIgnoredMutation.mutate()}
            onMarkInterested={() => data.markInterestedMutation.mutate()}
            onMarkNeedsReply={() => data.markNeedsReplyMutation.mutate()}
            onMarkDone={() => data.markDoneMutation.mutate()}
            onArchive={() => data.archiveMutation.mutate()}
            onRestore={() => data.restoreMutation.mutate()}
            onSaveNotes={(notes) => data.saveNotesMutation.mutate(notes)}
            isMarkingSpam={data.markSpamMutation.isPending}
            isMarkingIgnored={data.markIgnoredMutation.isPending}
            isMarkingInterested={data.markInterestedMutation.isPending}
            isMarkingNeedsReply={data.markNeedsReplyMutation.isPending}
            isMarkingDone={data.markDoneMutation.isPending}
            isArchiving={data.archiveMutation.isPending}
            isRestoring={data.restoreMutation.isPending}
            isSavingNotes={data.saveNotesMutation.isPending}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
