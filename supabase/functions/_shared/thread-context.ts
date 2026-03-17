// Shared thread context helper for generate-draft and regenerate-draft

interface ThreadEntry {
  role: "lead" | "julia";
  date: string;
  text: string;
  replyId: string;
}

export interface ThreadContext {
  entries: ThreadEntry[];
  formatted: string;
  deckAlreadyShared: boolean;
  threadLength: number;
}

/**
 * Build full thread history for a lead's conversation.
 * Fetches all inbound_replies for the same lead_email, ordered chronologically.
 * For sent replies, fetches the latest draft_versions row (what Julia actually sent).
 */
export async function buildThreadContext(
  supabase: any,
  leadEmail: string,
  currentReplyId: string
): Promise<ThreadContext> {
  // Get all replies in this thread (excluding current)
  const { data: replies } = await supabase
    .from("inbound_replies")
    .select("id, reply_text, received_at, status, sender_name, lead_name")
    .eq("lead_email", leadEmail)
    .neq("id", currentReplyId)
    .order("received_at", { ascending: true });

  if (!replies || replies.length === 0) {
    return { entries: [], formatted: "", deckAlreadyShared: false, threadLength: 0 };
  }

  const entries: ThreadEntry[] = [];

  for (const r of replies) {
    // Add the lead's inbound message
    entries.push({
      role: "lead",
      date: formatDate(r.received_at),
      text: (r.reply_text || "").slice(0, 500),
      replyId: r.id,
    });

    // If this reply was sent, fetch what Julia actually sent
    if (r.status === "sent") {
      const { data: draft } = await supabase
        .from("draft_versions")
        .select("draft_text")
        .eq("reply_id", r.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      if (draft?.draft_text) {
        entries.push({
          role: "julia",
          date: formatDate(r.received_at),
          text: draft.draft_text.slice(0, 500),
          replyId: r.id,
        });
      }
    }
  }

  const deckAlreadyShared = detectDeckShared(entries);

  // Build human-readable timeline
  const formatted = entries
    .map((e, i) => {
      const speaker = e.role === "lead" ? "Lead" : "Julia";
      return `[${i + 1}] ${speaker} (${e.date}): "${e.text}"`;
    })
    .join("\n");

  return {
    entries,
    formatted,
    deckAlreadyShared,
    threadLength: entries.length,
  };
}

/**
 * Scan Julia's messages for deck URL patterns or phrases indicating deck was shared.
 */
export function detectDeckShared(entries: ThreadEntry[]): boolean {
  const deckPatterns = [
    /comparison\s+deck/i,
    /fee\s+breakdown/i,
    /zeffy-vs-paypal/i,
    /zeffy\.com\/compare/i,
    /paypal\s+vs\s+zeffy/i,
    /here\s+is\s+(your|the)\s+.*deck/i,
    /deck\s+as\s+promised/i,
    /bit\.ly\//i,
    /docs\.google\.com\/presentation/i,
  ];

  for (const entry of entries) {
    if (entry.role !== "julia") continue;
    for (const pattern of deckPatterns) {
      if (pattern.test(entry.text)) return true;
    }
  }
  return false;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "Unknown";
  }
}
