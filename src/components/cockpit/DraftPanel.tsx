import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, RefreshCw, AlertTriangle, Pencil, RotateCcw, CheckCircle, Archive, ArchiveRestore } from "lucide-react";
import { FeedbackChips } from "./FeedbackChips";
import { DiffView } from "./DiffView";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DraftPanelProps {
  reply: any;
  latestDraft: any;
  previousDraft: any;
  onApprove: (opts?: { extraToEmails?: string[]; extraCcEmails?: string[] }) => void;
  onRegenerate: (feedback: string) => void;
  onMarkManual: () => void;
  onSaveDraft: (text: string) => void;
  onRetrySend: () => void;
  onMarkResponded: () => void;
  onArchive: () => void;
  onRestore: () => void;
  isApproving: boolean;
  isRegenerating: boolean;
  isMarkingManual: boolean;
  isMarkingResponded: boolean;
  isArchiving: boolean;
  isRestoring: boolean;
  isSaving: boolean;
  isRetrying: boolean;
  feedbackRef?: React.RefObject<HTMLTextAreaElement>;
  editorRef?: React.RefObject<HTMLTextAreaElement>;
}

export function DraftPanel({
  reply,
  latestDraft,
  previousDraft,
  onApprove,
  onRegenerate,
  onMarkManual,
  onSaveDraft,
  onRetrySend,
  onMarkResponded,
  onArchive,
  onRestore,
  isApproving,
  isRegenerating,
  isMarkingManual,
  isMarkingResponded,
  isArchiving,
  isRestoring,
  isSaving,
  isRetrying,
  feedbackRef,
  editorRef,
}: DraftPanelProps) {
  const [feedback, setFeedback] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedDraft, setEditedDraft] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [extraTo, setExtraTo] = useState("");
  const [extraCc, setExtraCc] = useState("");

  // Reset state when reply changes
  useEffect(() => {
    setFeedback("");
    setIsEditing(false);
    setEditedDraft("");
    setShowDiff(false);
    setExtraTo("");
    setExtraCc("");
  }, [reply?.id]);

  // Auto-show diff when there's a previous version
  useEffect(() => {
    if (previousDraft && latestDraft && previousDraft.id !== latestDraft.id) {
      setShowDiff(true);
    }
  }, [latestDraft?.id, previousDraft?.id]);

  const handleChipClick = useCallback((chip: string) => {
    setFeedback((prev) => (prev ? `${prev}, ${chip.toLowerCase()}` : chip));
  }, []);

  const handleRegenerate = useCallback(() => {
    if (feedback.trim()) {
      onRegenerate(feedback);
      setFeedback("");
    }
  }, [feedback, onRegenerate]);

  const handleStartEdit = useCallback(() => {
    setEditedDraft(latestDraft?.draft_text || "");
    setIsEditing(true);
  }, [latestDraft]);

  const handleSaveEdit = useCallback(() => {
    if (editedDraft.trim()) {
      onSaveDraft(editedDraft);
      setIsEditing(false);
    }
  }, [editedDraft, onSaveDraft]);

  if (!reply) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">No reply selected</p>
      </div>
    );
  }

  const canApprove = ["awaiting_review", "regenerated"].includes(reply.status);
  const isFailed = reply.status === "failed";

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Draft header */}
      <div className="p-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Draft</span>
            {latestDraft && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                v{latestDraft.version_number} · {latestDraft.created_by === "ai:first-reply" ? "first-reply" : latestDraft.created_by === "ai:follow-up" ? "follow-up" : latestDraft.created_by === "manual" ? "manual" : latestDraft.created_by}
              </span>
            )}
            {reply.review_status === "reviewing" && (
              <span className="text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded animate-pulse font-medium">
                reviewing...
              </span>
            )}
            {reply.review_status === "reviewed" && (
              <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded font-medium">
                R{reply.review_iterations}
              </span>
            )}
            {reply.review_status === "needs_human" && (
              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                R{reply.review_iterations}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {previousDraft && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowDiff(!showDiff)}
                    className={cn(
                      "p-1 rounded text-[10px] transition-colors",
                      showDiff ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Diff
                  </button>
                </TooltipTrigger>
                <TooltipContent>Toggle version diff</TooltipContent>
              </Tooltip>
            )}
            {latestDraft && !isEditing && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleStartEdit}
                    className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Edit draft (E)</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* Draft content */}
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        {!latestDraft ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
            No draft generated yet
          </div>
        ) : isEditing ? (
          <div className="flex flex-col gap-2 h-full">
            <Textarea
              ref={editorRef}
              value={editedDraft}
              onChange={(e) => setEditedDraft(e.target.value)}
              className="flex-1 min-h-[250px] text-sm resize-none"
              autoFocus
            />
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={handleSaveEdit} disabled={isSaving} className="text-xs h-7">
                {isSaving ? "Saving..." : "Save draft"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="text-xs h-7">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-muted/30 rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed">
              {latestDraft.draft_text}
            </div>

            {/* Diff view */}
            {showDiff && previousDraft && (
              <DiffView
                oldText={previousDraft.draft_text}
                newText={latestDraft.draft_text}
              />
            )}
          </>
        )}

        {/* Feedback + Regenerate section */}
        {canApprove && !isEditing && (
          <div className="space-y-2 pt-1">
            <FeedbackChips onChipClick={handleChipClick} />
            <div className="flex gap-2">
              <Textarea
                ref={feedbackRef}
                placeholder="Quick instruction to regenerate..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="min-h-[44px] max-h-[100px] text-xs resize-none"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    handleRegenerate();
                  }
                }}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleRegenerate}
                    disabled={isRegenerating || !feedback.trim()}
                    className="shrink-0 h-[44px] w-[44px]"
                  >
                    <RefreshCw className={cn("w-4 h-4", isRegenerating && "animate-spin")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Regenerate (R then ⌘↵)</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}
      </div>

      {/* Action bar - fixed at bottom */}
      <div className="p-3 border-t border-border shrink-0 space-y-2">
        {/* Extra To/CC recipients */}
        {canApprove && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground w-6 shrink-0">To:</span>
              <input
                type="text"
                value={extraTo}
                onChange={(e) => setExtraTo(e.target.value)}
                placeholder="Add recipients (comma-separated)"
                className="flex-1 h-6 px-2 text-[11px] rounded border border-border/60 bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground w-6 shrink-0">CC:</span>
              <input
                type="text"
                value={extraCc}
                onChange={(e) => setExtraCc(e.target.value)}
                placeholder="Add CC (comma-separated)"
                className="flex-1 h-6 px-2 text-[11px] rounded border border-border/60 bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        )}

        {canApprove && (
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="flex-1 bg-success hover:bg-success/90 text-success-foreground h-9"
                  onClick={() => onApprove({
                    extraToEmails: extraTo ? extraTo.split(",").map(e => e.trim()) : undefined,
                    extraCcEmails: extraCc ? extraCc.split(",").map(e => e.trim()) : undefined,
                  })}
                  disabled={isApproving || !latestDraft}
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  {isApproving ? "Sending..." : "Approve & send"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Approve & send (A)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onMarkManual}
                  disabled={isMarkingManual}
                  className="h-9 w-9 shrink-0"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mark manual review (M)</TooltipContent>
            </Tooltip>
          </div>
        )}

        {isFailed && (
          <Button
            className="w-full h-9"
            onClick={onRetrySend}
            disabled={isRetrying}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            {isRetrying ? "Retrying..." : "Retry send"}
          </Button>
        )}

        {/* Mark as responded manually — for when Julia replied outside the system */}
        {reply.status !== "sent" && !reply.archived_at && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="w-full h-8 text-xs text-muted-foreground"
                onClick={onMarkResponded}
                disabled={isMarkingResponded}
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                {isMarkingResponded ? "Marking..." : "Mark as responded"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Mark this email as already responded to (e.g., replied directly in Gmail)</TooltipContent>
          </Tooltip>
        )}

        {/* Archive / Restore */}
        {reply.archived_at ? (
          <Button
            variant="outline"
            className="w-full h-8 text-xs text-muted-foreground"
            onClick={onRestore}
            disabled={isRestoring}
          >
            <ArchiveRestore className="w-3.5 h-3.5 mr-1.5" />
            {isRestoring ? "Restoring..." : "Restore from archive"}
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="w-full h-8 text-xs text-muted-foreground/60 hover:text-muted-foreground"
                onClick={onArchive}
                disabled={isArchiving}
              >
                <Archive className="w-3.5 h-3.5 mr-1.5" />
                {isArchiving ? "Archiving..." : "Archive"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Archive this thread</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
