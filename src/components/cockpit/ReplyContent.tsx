import { TemperatureBadge } from "@/components/TemperatureBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { ExternalLink, Check, X, FileText, Clock } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface ReplyContentProps {
  reply: any;
  isLoading: boolean;
}

export function ReplyContent({ reply, isLoading }: ReplyContentProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-4 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  if (!reply) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Select a reply to review</p>
        <p className="text-xs mt-1">Use J/K to navigate the queue</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header - compact metadata */}
      <div className="p-3 border-b border-border shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate">
            {reply.lead_name || reply.lead_email}
          </span>
          <TemperatureBadge temperature={reply.temperature} />
          <StatusBadge status={reply.status} />
          {reply.instantly_unibox_url && (
            <a
              href={reply.instantly_unibox_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-primary hover:text-frozen flex items-center gap-1 shrink-0"
            >
              <ExternalLink className="w-3 h-3" />
              Instantly
            </a>
          )}
        </div>

        {/* Compact metadata row */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <span>{reply.lead_email}</span>
          {reply.reply_subject && (
            <>
              <span className="text-border">|</span>
              <span className="truncate max-w-[200px]">{reply.reply_subject}</span>
            </>
          )}
          {reply.received_at && (
            <>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(new Date(reply.received_at), "MMM d, h:mm a")}
              </span>
            </>
          )}
          {reply.wants_pdf && (
            <>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1 text-primary font-medium">
                <FileText className="w-3 h-3" />
                Wants PDF
              </span>
            </>
          )}
          {reply.simple_affirmative && (
            <>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1 text-success font-medium">
                <Check className="w-3 h-3" />
                Simple yes
              </span>
            </>
          )}
        </div>
      </div>

      {/* Original reply body */}
      <div className="flex-1 p-4">
        <div className="bg-muted/40 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
          {reply.reply_text || "No text content"}
        </div>

        {reply.reasoning && (
          <div className="mt-3 px-3 py-2 rounded-md bg-primary/5 border border-primary/10">
            <p className="text-[11px] text-primary font-medium mb-0.5">AI classification</p>
            <p className="text-xs text-muted-foreground">{reply.reasoning}</p>
          </div>
        )}

        {reply.processing_error && (
          <div className="mt-3 px-3 py-2 rounded-md bg-destructive/5 border border-destructive/10">
            <p className="text-[11px] text-destructive font-medium mb-0.5">Error</p>
            <p className="text-xs text-destructive/80">{reply.processing_error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
