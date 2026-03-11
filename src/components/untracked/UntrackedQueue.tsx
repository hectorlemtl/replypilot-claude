import { cn } from "@/lib/utils";
import { CategoryBadge, ConfidenceDot } from "./CategoryBadge";
import { Search, Inbox, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { forwardRef } from "react";

interface UntrackedQueueProps {
  emails: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  isLoading: boolean;
}

export const UntrackedQueue = forwardRef<HTMLInputElement, UntrackedQueueProps>(
  ({ emails, selectedId, onSelect, search, onSearchChange, isLoading }, ref) => {
    if (isLoading) {
      return (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input ref={ref} placeholder="Search..." className="pl-8 h-8 text-xs" disabled />
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse text-xs text-muted-foreground">Loading...</div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="p-2 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              ref={ref}
              placeholder="Search... ( / )"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!emails.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <Inbox className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">No emails in this queue</p>
            </div>
          ) : (
            emails.map((email) => {
              const isSelected = email.id === selectedId;
              const isLead = email.is_lead_signal;
              const waitTime = email.received_at
                ? formatDistanceToNow(new Date(email.received_at), { addSuffix: false })
                : null;

              return (
                <button
                  key={email.id}
                  onClick={() => onSelect(email.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b border-border transition-colors",
                    isSelected
                      ? "bg-primary/8 border-l-2 border-l-primary"
                      : isLead
                        ? "bg-emerald-50/50 hover:bg-emerald-50 border-l-2 border-l-transparent"
                        : "hover:bg-accent/50 border-l-2 border-l-transparent"
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-foreground truncate flex-1">
                      {email.sender_name || email.sender_email}
                    </span>
                    <ConfidenceDot confidence={email.triage_confidence} />
                    <CategoryBadge category={email.triage_category} />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mb-1">
                    {email.subject || email.content_preview?.slice(0, 60) || "No subject"}
                  </p>
                  <div className="flex items-center gap-2">
                    {isLead && (
                      <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium">
                        <Zap className="w-2.5 h-2.5" />
                        Lead signal
                      </span>
                    )}
                    {email.is_auto_reply && (
                      <span className="text-[10px] text-muted-foreground">Auto-reply</span>
                    )}
                    {waitTime && (
                      <span className="text-[10px] text-muted-foreground ml-auto">{waitTime}</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }
);

UntrackedQueue.displayName = "UntrackedQueue";
