import { cn } from "@/lib/utils";
import { TemperatureBadge } from "@/components/TemperatureBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, Inbox } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { forwardRef } from "react";

interface ReplyQueueProps {
  replies: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  isLoading: boolean;
  searchRef?: React.RefObject<HTMLInputElement>;
}

export const ReplyQueue = forwardRef<HTMLInputElement, ReplyQueueProps>(
  ({ replies, selectedId, onSelect, search, onSearchChange, isLoading }, ref) => {
    if (isLoading) {
      return (
        <div className="flex flex-col h-full">
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
      <div className="flex flex-col h-full">
        {/* Search */}
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

        {/* Queue items */}
        <div className="flex-1 overflow-y-auto">
          {!replies.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <Inbox className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">No replies in this queue</p>
            </div>
          ) : (
            replies.map((reply) => {
              const isSelected = reply.id === selectedId;
              const isHot = reply.temperature === "hot";
              const waitTime = reply.received_at
                ? formatDistanceToNow(new Date(reply.received_at), { addSuffix: false })
                : null;

              return (
                <button
                  key={reply.id}
                  onClick={() => onSelect(reply.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b border-border transition-colors",
                    isSelected
                      ? "bg-primary/8 border-l-2 border-l-primary"
                      : isHot && ["awaiting_review", "regenerated"].includes(reply.status)
                        ? "bg-destructive/3 hover:bg-destructive/6 border-l-2 border-l-transparent"
                        : "hover:bg-accent/50 border-l-2 border-l-transparent"
                  )}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-foreground truncate flex-1">
                      {reply.lead_name || reply.lead_email}
                    </span>
                    <TemperatureBadge temperature={reply.temperature} />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mb-1">
                    {reply.reply_text?.slice(0, 60) || reply.reply_subject || "No preview"}
                  </p>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={reply.status} />
                    {waitTime && (
                      <span className={cn(
                        "text-[10px]",
                        isHot ? "text-destructive font-medium" : "text-muted-foreground"
                      )}>
                        {waitTime}
                      </span>
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

ReplyQueue.displayName = "ReplyQueue";
