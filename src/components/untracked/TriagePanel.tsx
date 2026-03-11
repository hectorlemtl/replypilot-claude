import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CategoryBadge } from "./CategoryBadge";
import { Ban, X, Star, HelpCircle, Archive, RotateCcw, CheckCircle, User, Send } from "lucide-react";
import { useState } from "react";

interface TriagePanelProps {
  email: any | null;
  knownContact: any | null;
  onMarkSpam: () => void;
  onMarkIgnored: () => void;
  onMarkInterested: () => void;
  onMarkNeedsReply: () => void;
  onMarkDone: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onSaveNotes: (notes: string) => void;
  onSendReply: (text: string) => void;
  isMarkingSpam: boolean;
  isMarkingIgnored: boolean;
  isMarkingInterested: boolean;
  isMarkingNeedsReply: boolean;
  isMarkingDone: boolean;
  isArchiving: boolean;
  isRestoring: boolean;
  isSavingNotes: boolean;
  isSendingReply: boolean;
}

export function TriagePanel({
  email,
  knownContact,
  onMarkSpam,
  onMarkIgnored,
  onMarkInterested,
  onMarkNeedsReply,
  onMarkDone,
  onArchive,
  onRestore,
  onSaveNotes,
  isMarkingSpam,
  isMarkingIgnored,
  isMarkingInterested,
  isMarkingNeedsReply,
  isMarkingDone,
  isArchiving,
  isRestoring,
  isSavingNotes,
  isSendingReply,
}: TriagePanelProps) {
  const [notes, setNotes] = useState("");
  const [replyText, setReplyText] = useState("");
  const [showReply, setShowReply] = useState(false);

  // Reset notes when email changes
  const emailId = email?.id;
  const [lastEmailId, setLastEmailId] = useState<string | null>(null);
  if (emailId !== lastEmailId) {
    setLastEmailId(emailId);
    setNotes(email?.review_notes || "");
    setReplyText("");
    setShowReply(false);
  }

  if (!email) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p className="text-sm">Select an email to triage</p>
      </div>
    );
  }

  const isArchived = !!email.archived_at;
  const isPending = email.review_status === "pending";
  const confidence = email.triage_confidence;
  const confidencePercent = confidence != null ? Math.round(confidence * 100) : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* AI Assessment */}
      <div className="p-4 border-b border-border shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Assessment</h3>
          {email.review_status !== "pending" && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">
              {email.review_status}
            </span>
          )}
        </div>

        {email.triage_category ? (
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <CategoryBadge category={email.triage_category} />
              {confidencePercent !== null && (
                <span className="text-[10px] text-muted-foreground">{confidencePercent}% confidence</span>
              )}
              {email.is_lead_signal && (
                <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5" /> Lead signal
                </span>
              )}
            </div>

            {email.triage_reasoning && (
              <p className="text-xs text-muted-foreground leading-relaxed">{email.triage_reasoning}</p>
            )}

            {email.suggested_action && (
              <div className="text-[10px] text-muted-foreground">
                Suggested: <span className="font-medium">{email.suggested_action.replace(/_/g, " ")}</span>
              </div>
            )}

            {/* Confidence bar */}
            {confidencePercent !== null && (
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    confidencePercent >= 80 ? "bg-emerald-500" :
                    confidencePercent >= 50 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${confidencePercent}%` }}
                />
              </div>
            )}

            {email.ai_interest_value != null && (
              <div className="text-[10px] text-muted-foreground">
                Instantly interest score: <span className="font-medium">{email.ai_interest_value}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground italic">Classification pending...</p>
          </div>
        )}
      </div>

      {/* Known Contact */}
      {knownContact && (
        <div className="px-4 py-2 border-b border-border bg-amber-50/50 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-amber-700">
            <User className="w-3 h-3" />
            <span className="font-medium">Known contact</span>
          </div>
          <div className="text-[10px] text-amber-600 mt-0.5">
            {knownContact.lead_name || knownContact.lead_email}
            {knownContact.campaigns?.name && (
              <span> — {knownContact.campaigns.name}</span>
            )}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="p-4 border-b border-border shrink-0 space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Quick Actions</h3>

        {isPending && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                onClick={onMarkInterested}
                disabled={isMarkingInterested}
              >
                <Star className="w-3 h-3 mr-1" /> Interested
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                onClick={onMarkNeedsReply}
                disabled={isMarkingNeedsReply}
              >
                <HelpCircle className="w-3 h-3 mr-1" /> Needs Reply
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                onClick={onMarkSpam}
                disabled={isMarkingSpam}
              >
                <Ban className="w-3 h-3 mr-1" /> Spam
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={onMarkIgnored}
                disabled={isMarkingIgnored}
              >
                <X className="w-3 h-3 mr-1" /> Not Relevant
              </Button>
            </div>
            <Button
              size="sm"
              className="h-8 text-xs w-full bg-primary"
              onClick={() => setShowReply(!showReply)}
            >
              <Send className="w-3 h-3 mr-1" /> {showReply ? "Hide Reply" : "Reply"}
            </Button>

            {showReply && (
              <div className="space-y-2 mt-2">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply..."
                  className="text-xs resize-none min-h-[100px]"
                />
                <Button
                  size="sm"
                  className="h-8 text-xs w-full"
                  onClick={() => onSendReply(replyText)}
                  disabled={isSendingReply || !replyText.trim()}
                >
                  <Send className="w-3 h-3 mr-1" /> {isSendingReply ? "Sending..." : "Send Reply"}
                </Button>
              </div>
            )}
          </div>
        )}

        {!isPending && !isArchived && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs flex-1"
              onClick={onMarkDone}
              disabled={isMarkingDone}
            >
              <CheckCircle className="w-3 h-3 mr-1" /> Done
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs flex-1"
              onClick={onArchive}
              disabled={isArchiving}
            >
              <Archive className="w-3 h-3 mr-1" /> Archive
            </Button>
          </div>
        )}

        {isArchived && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs w-full"
            onClick={onRestore}
            disabled={isRestoring}
          >
            <RotateCcw className="w-3 h-3 mr-1" /> Restore
          </Button>
        )}
      </div>

      {/* Notes */}
      <div className="p-4 flex-1 flex flex-col min-h-0">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes</h3>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add reviewer notes..."
          className="flex-1 text-xs resize-none min-h-[60px]"
        />
        {notes !== (email.review_notes || "") && (
          <Button
            size="sm"
            className="mt-2 h-7 text-xs"
            onClick={() => onSaveNotes(notes)}
            disabled={isSavingNotes}
          >
            Save Notes
          </Button>
        )}
      </div>
    </div>
  );
}
