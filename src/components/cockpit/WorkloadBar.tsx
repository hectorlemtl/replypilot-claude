import { cn } from "@/lib/utils";
import { QueueFilter } from "@/hooks/useCockpitData";
import { Flame, Zap, AlertTriangle, Eye, Keyboard, Clock, Archive } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { SHORTCUTS } from "@/hooks/useKeyboardShortcuts";
import { useState } from "react";

interface WorkloadBarProps {
  counts: Record<QueueFilter, number>;
  activeFilter: QueueFilter;
  onFilterChange: (f: QueueFilter) => void;
}

const FILTERS: { key: QueueFilter; label: string; icon: typeof Flame; urgent?: boolean }[] = [
  { key: "hot_review", label: "Hot", icon: Flame, urgent: true },
  { key: "simple_review", label: "Simple", icon: Zap, urgent: true },
  { key: "failed", label: "Failed", icon: AlertTriangle, urgent: true },
  { key: "manual_review", label: "Manual", icon: Eye },
  { key: "waiting_for_reply", label: "Waiting", icon: Clock },
  { key: "all", label: "All", icon: Eye },
  { key: "sent", label: "Sent", icon: Eye },
  { key: "archived", label: "Archived", icon: Archive },
];

export function WorkloadBar({ counts, activeFilter, onFilterChange }: WorkloadBarProps) {
  const [showShortcuts, setShowShortcuts] = useState(false);

  return (
    <div className="h-11 border-b border-border bg-card flex items-center px-3 gap-1 shrink-0">
      {FILTERS.map(({ key, label, icon: Icon, urgent }) => {
        const count = counts[key];
        const isActive = activeFilter === key;
        const hasItems = count > 0;

        return (
          <button
            key={key}
            onClick={() => onFilterChange(key)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
              isActive
                ? "bg-primary text-primary-foreground"
                : hasItems && urgent
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {key === "hot_review" && <Flame className="w-3 h-3" />}
            {key === "simple_review" && <Zap className="w-3 h-3" />}
            {key === "failed" && <AlertTriangle className="w-3 h-3" />}
            {key === "waiting_for_reply" && <Clock className="w-3 h-3" />}
            {key === "archived" && <Archive className="w-3 h-3" />}
            {label}
            {count > 0 && (
              <span className={cn(
                "min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : hasItems && urgent
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground"
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}

      <div className="ml-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowShortcuts(!showShortcuts)}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Keyboard className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" className="p-3">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold mb-2">Keyboard shortcuts</p>
              {SHORTCUTS.map(s => (
                <div key={s.key} className="flex justify-between gap-4 text-xs">
                  <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">{s.key}</kbd>
                  <span className="text-muted-foreground">{s.action}</span>
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
