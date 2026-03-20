import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tempConfig: Record<string, { label: string; className: string; icon: string }> = {
  hot: { label: "Hot", className: "bg-destructive/10 text-destructive border-destructive/30", icon: "🔥" },
  warm: { label: "Hot", className: "bg-destructive/10 text-destructive border-destructive/30", icon: "🔥" },
  simple: { label: "Simple", className: "bg-green-500/10 text-green-600 border-green-500/30", icon: "⚡" },
  for_later: { label: "For later", className: "bg-primary/10 text-primary border-primary/30", icon: "⏳" },
  cold: { label: "Cold", className: "bg-muted text-muted-foreground", icon: "❄️" },
  no_reply_needed: { label: "No reply", className: "bg-muted text-muted-foreground", icon: "💤" },
  out_of_office: { label: "OOO", className: "bg-muted text-muted-foreground", icon: "✈️" },
};

export function TemperatureBadge({ temperature }: { temperature: string | null }) {
  if (!temperature) return null;
  const config = tempConfig[temperature] || { label: temperature, className: "bg-muted text-muted-foreground", icon: "" };
  return (
    <Badge variant="outline" className={cn("font-medium text-xs", config.className)}>
      {config.icon} {config.label}
    </Badge>
  );
}
