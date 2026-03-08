import { useEffect, useCallback } from "react";

interface ShortcutHandlers {
  onNext: () => void;
  onPrev: () => void;
  onApprove: () => void;
  onRegenerate: () => void;
  onEdit: () => void;
  onManual: () => void;
  onSearch: () => void;
  onSubmit: () => void;
  onEscape: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled = true) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Cmd/Ctrl+Enter always works
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handlers.onSubmit();
        return;
      }

      // Escape always works
      if (e.key === "Escape") {
        e.preventDefault();
        handlers.onEscape();
        return;
      }

      // Don't intercept when typing in inputs
      if (isInput) return;

      switch (e.key.toLowerCase()) {
        case "j":
          e.preventDefault();
          handlers.onNext();
          break;
        case "k":
          e.preventDefault();
          handlers.onPrev();
          break;
        case "a":
          e.preventDefault();
          handlers.onApprove();
          break;
        case "r":
          e.preventDefault();
          handlers.onRegenerate();
          break;
        case "e":
          e.preventDefault();
          handlers.onEdit();
          break;
        case "m":
          e.preventDefault();
          handlers.onManual();
          break;
        case "/":
          e.preventDefault();
          handlers.onSearch();
          break;
      }
    },
    [handlers, enabled]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

export const SHORTCUTS = [
  { key: "J / K", action: "Next / Previous reply" },
  { key: "A", action: "Approve & send" },
  { key: "R", action: "Focus regenerate" },
  { key: "E", action: "Edit draft" },
  { key: "M", action: "Mark manual review" },
  { key: "/", action: "Focus search" },
  { key: "⌘↵", action: "Submit current action" },
  { key: "Esc", action: "Unfocus / close" },
];
