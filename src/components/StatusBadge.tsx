import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; className: string }> = {
  received: { label: "Received", className: "bg-muted text-muted-foreground" },
  classified: { label: "Classified", className: "bg-muted text-muted-foreground" },
  skipped: { label: "Skipped", className: "bg-muted text-muted-foreground" },
  drafted: { label: "Drafted", className: "bg-primary/10 text-primary" },
  awaiting_review: { label: "Awaiting review", className: "bg-warning/15 text-warning-foreground border-warning/30" },
  approved: { label: "Approved", className: "bg-success/15 text-success border-success/30" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive" },
  regenerated: { label: "Regenerated", className: "bg-primary/10 text-primary" },
  sent: { label: "Sent", className: "bg-success/15 text-success border-success/30" },
  manual_review: { label: "Manual review", className: "bg-warning/15 text-warning-foreground border-warning/30" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive border-destructive/30" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={cn("font-medium text-xs", config.className)}>
      {config.label}
    </Badge>
  );
}
