import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface DiffViewProps {
  oldText: string;
  newText: string;
}

export function DiffView({ oldText, newText }: DiffViewProps) {
  const diff = useMemo(() => computeWordDiff(oldText, newText), [oldText, newText]);

  if (!oldText || !newText) return null;

  return (
    <div className="text-xs space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground mb-1">Changes from previous version</p>
      <div className="bg-muted/30 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">
        {diff.map((part, i) => (
          <span
            key={i}
            className={cn(
              part.type === "added" && "bg-success/20 text-success-foreground",
              part.type === "removed" && "bg-destructive/15 text-destructive line-through",
            )}
          >
            {part.value}
          </span>
        ))}
      </div>
    </div>
  );
}

type DiffPart = { type: "same" | "added" | "removed"; value: string };

function computeWordDiff(oldStr: string, newStr: string): DiffPart[] {
  const oldWords = oldStr.split(/(\s+)/);
  const newWords = newStr.split(/(\s+)/);
  const result: DiffPart[] = [];

  // Simple LCS-based word diff
  const m = oldWords.length;
  const n = newWords.length;

  // For performance, use a simpler approach for long texts
  if (m > 500 || n > 500) {
    // Fallback: show full new text as added if very different
    if (oldStr === newStr) return [{ type: "same", value: newStr }];
    return [
      { type: "removed", value: oldStr },
      { type: "same", value: "\n\n" },
      { type: "added", value: newStr },
    ];
  }

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  let i = m, j = n;
  const parts: DiffPart[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      parts.unshift({ type: "same", value: oldWords[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      parts.unshift({ type: "added", value: newWords[j - 1] });
      j--;
    } else {
      parts.unshift({ type: "removed", value: oldWords[i - 1] });
      i--;
    }
  }

  // Merge consecutive same-type parts
  for (const part of parts) {
    if (result.length && result[result.length - 1].type === part.type) {
      result[result.length - 1].value += part.value;
    } else {
      result.push({ ...part });
    }
  }

  return result;
}
