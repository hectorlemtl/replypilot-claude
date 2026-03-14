import { DatePreset, SortBy } from "@/hooks/useCockpitData";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface QueueFiltersProps {
  datePreset: DatePreset;
  onDatePresetChange: (v: DatePreset) => void;
  customDateFrom: string;
  onCustomDateFromChange: (v: string) => void;
  customDateTo: string;
  onCustomDateToChange: (v: string) => void;
  sortBy: SortBy;
  onSortByChange: (v: SortBy) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "hot_first", label: "Hot first" },
  { value: "failed_first", label: "Failed first" },
  { value: "awaiting_first", label: "Awaiting first" },
];

export function QueueFilters({
  datePreset,
  onDatePresetChange,
  customDateFrom,
  onCustomDateFromChange,
  customDateTo,
  onCustomDateToChange,
  sortBy,
  onSortByChange,
  onClear,
  hasActiveFilters,
}: QueueFiltersProps) {
  return (
    <div className="px-2 py-1.5 border-b border-border bg-card/50 space-y-1.5 shrink-0">
      <div className="flex items-center gap-1.5">
        {/* Date preset */}
        <Select value={datePreset} onValueChange={(v) => onDatePresetChange(v as DatePreset)}>
          <SelectTrigger className="h-7 text-[11px] w-[110px] px-2 border-border/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-xs">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={sortBy} onValueChange={(v) => onSortByChange(v as SortBy)}>
          <SelectTrigger className="h-7 text-[11px] flex-1 min-w-[100px] px-2 border-border/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onClear}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Custom date range inputs */}
      {datePreset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customDateFrom}
            onChange={(e) => onCustomDateFromChange(e.target.value)}
            className="h-7 flex-1 rounded-md border border-border/60 bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-[10px] text-muted-foreground">to</span>
          <input
            type="date"
            value={customDateTo}
            onChange={(e) => onCustomDateToChange(e.target.value)}
            className="h-7 flex-1 rounded-md border border-border/60 bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}
    </div>
  );
}
