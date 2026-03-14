import { cn } from "@/lib/utils";
import { UntrackedFilter } from "@/hooks/useUntrackedData";
import { Star, HelpCircle, Inbox, Archive, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
import { formatDistanceToNow, differenceInHours } from "date-fns";

interface TriageBarProps {
  counts: Record<UntrackedFilter, number>;
  activeFilter: UntrackedFilter;
  onFilterChange: (f: UntrackedFilter) => void;
  syncLastAt: string | null;
  onSyncNow: () => void;
  isSyncing: boolean;
  onClassify: () => void;
  isClassifying: boolean;
  pendingCount: number;
}

const FILTERS: { key: UntrackedFilter; label: string; icon: typeof Star; urgent?: boolean }[] = [
  { key: "leads", label: "Leads", icon: Star, urgent: true },
  { key: "support", label: "Support", icon: HelpCircle, urgent: true },
  { key: "pending", label: "Pending", icon: Inbox },
  { key: "all", label: "All", icon: Inbox },
  { key: "archived", label: "Archived", icon: Archive },
];

export function TriageBar({ counts, activeFilter, onFilterChange, syncLastAt, onSyncNow, isSyncing, onClassify, isClassifying, pendingCount }: TriageBarProps) {
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
                  ? "text-emerald-600 hover:bg-emerald-50"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {(key === "leads" || key === "support") && <Icon className="w-3 h-3" />}
            {key === "archived" && <Archive className="w-3 h-3" />}
            {label}
            {count > 0 && (
              <span className={cn(
                "min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center",
                isActive
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : hasItems && urgent
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-muted text-muted-foreground"
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}

      <div className="ml-auto flex items-center gap-2">
        {syncLastAt && (() => {
          const hoursAgo = differenceInHours(new Date(), new Date(syncLastAt));
          const isStale = hoursAgo >= 24;
          return (
            <span className={cn(
              "text-[10px] flex items-center gap-1",
              isStale ? "text-amber-600 font-medium" : "text-muted-foreground"
            )}>
              {isStale && <AlertCircle className="w-3 h-3" />}
              Synced {formatDistanceToNow(new Date(syncLastAt), { addSuffix: true })}
            </span>
          );
        })()}
        {isSyncing && (
          <span className="text-[10px] text-primary font-medium animate-pulse">Syncing...</span>
        )}
        <button
          onClick={onClassify}
          disabled={isClassifying || pendingCount === 0}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
        >
          <Sparkles className={cn("w-3 h-3", isClassifying && "animate-pulse")} />
          Classify
        </button>
        <button
          onClick={onSyncNow}
          disabled={isSyncing}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3 h-3", isSyncing && "animate-spin")} />
          {isSyncing ? "Syncing" : "Sync"}
        </button>
      </div>
    </div>
  );
}
