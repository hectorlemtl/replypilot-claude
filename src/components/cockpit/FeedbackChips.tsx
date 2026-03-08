import { cn } from "@/lib/utils";

const CHIPS = [
  "Shorter",
  "Less salesy",
  "More personalized",
  "Answer pricing directly",
  "Mention the PDF",
  "Push to demo",
  "Softer tone",
  "More direct",
  "Acknowledge objection first",
];

interface FeedbackChipsProps {
  onChipClick: (chip: string) => void;
}

export function FeedbackChips({ onChipClick }: FeedbackChipsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {CHIPS.map((chip) => (
        <button
          key={chip}
          onClick={() => onChipClick(chip)}
          className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors",
            "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary",
            "border border-transparent hover:border-primary/20"
          )}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
