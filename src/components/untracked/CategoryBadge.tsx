import { cn } from "@/lib/utils";

const CATEGORY_CONFIG: Record<string, { label: string; className: string }> = {
  nonprofit_interest: { label: "Interest", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  partnership: { label: "Partnership", className: "bg-blue-100 text-blue-700 border-blue-200" },
  media_request: { label: "Media", className: "bg-purple-100 text-purple-700 border-purple-200" },
  support_request: { label: "Support", className: "bg-amber-100 text-amber-700 border-amber-200" },
  other: { label: "Other", className: "bg-slate-100 text-slate-600 border-slate-200" },
  spam: { label: "Spam", className: "bg-red-100 text-red-600 border-red-200" },
  newsletter: { label: "Newsletter", className: "bg-gray-100 text-gray-500 border-gray-200" },
  auto_reply: { label: "Auto-reply", className: "bg-gray-100 text-gray-500 border-gray-200" },
  noise: { label: "Noise", className: "bg-gray-100 text-gray-500 border-gray-200" },
};

export function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const config = CATEGORY_CONFIG[category] || { label: category, className: "bg-gray-100 text-gray-500 border-gray-200" };
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border", config.className)}>
      {config.label}
    </span>
  );
}

export function ConfidenceDot({ confidence }: { confidence: number | null }) {
  if (confidence === null || confidence === undefined) return null;
  const color = confidence >= 0.8 ? "bg-emerald-500" : confidence >= 0.5 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className={cn("inline-block w-1.5 h-1.5 rounded-full", color)} title={`${Math.round(confidence * 100)}%`} />
  );
}
