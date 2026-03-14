import { cn } from "@/lib/utils";
import { QueueFilter } from "@/hooks/useCockpitData";
import { Flame, Zap, AlertTriangle, Eye, Keyboard, Send, Archive, List, RotateCcw } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { SHORTCUTS } from "@/hooks/useKeyboardShortcuts";
import { useState } from "react";

interface WorkloadBarProps {
  counts: Record<QueueFilter, number>;
  activeFilter: QueueFilter;
  onFilterChange: (f: QueueFilter) => void;
  onRetryAllFailed?: () => void;
  isRetryingAll?: boolean;
}

type FilterGroup = "action" | "browse";

const FILTERS: { key: QueueFilter; label: string; icon: typeof Flame; urgent?: boolean; group: FilterGroup }[] = [
  { key: "hot_review", label: "Hot", icon: Flame, urgent: true, group: "action" },
  { key: "simple_review", label: "Simple", icon: Zap, urgent: true, group: "action" },
  { key: "failed", label: "Failed", icon: AlertTriangle, urgent: true, group: "action" },
  { key: "manual_review", label: "Manual", icon: Eye, group: "action" },
  { key: "all", label: "All", icon: List, group: "browse" },
  { key: "sent", label: "Sent", icon: Send, group: "browse" },
  { key: "skipped", label: "Skipped", icon: Eye, group: "browse" },
  { key: "archived", label: "Archived", icon: Archive, group: "browse" },
];

export function WorkloadBar({ counts, activeFilter, onFilterChange, onRetryAllFailed, isRetryingAll }: WorkloadBarProps) {
  const [showShortcuts, setShowShortcuts] = useState(false);

  const actionFilters = FILTERS.filter(f => f.group === "action");
  const browseFilters = FILTERS.filter(f => f.group === "browse");

  const renderFilter = ({ key, label, icon: Icon, urgent }: typeof FILTERS[number]) => {
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
        <Icon className="w-3 h-3" />
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
  };

  return (
    <div className="h-11 border-b border-border bg-card flex items-center px-3 gap-1 shrink-0">
      {actionFilters.map(renderFilter)}
      <div className="w-px h-5 bg-border mx-1" />
      {browseFilters.map(renderFilter)}

      <div className="ml-auto flex items-center gap-1">
        {activeFilter === "failed" && counts.failed > 0 && onRetryAllFailed && (
          <button
            onClick={onRetryAllFailed}
            disabled={isRetryingAll}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={cn("w-3 h-3", isRetryingAll && "animate-spin")} />
            {isRetryingAll ? "Retrying..." : `Retry all (${counts.failed})`}
          </button>
        )}
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
