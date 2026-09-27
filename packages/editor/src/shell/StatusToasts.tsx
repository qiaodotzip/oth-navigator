import { useEffect } from "react";
import { useEditorStore } from "../state/store";
import { toast } from "../ui/toast";

/** How the older panels phrase a failure. */
export function looksLikeError(message: string): boolean {
  return /\b(can't|cannot|couldn't|could not|refused|failed|error|not allowed)\b|HTTP \d{3}/i.test(message);
}

/**
 * The status bar is gone; the panels that still report through setStatus now
 * report as toasts. Each message is shown once and cleared, so the same text
 * set twice in a row still shows twice.
 */
export function StatusToasts() {
  const status = useEditorStore(s => s.status);
  const setStatus = useEditorStore(s => s.setStatus);
  useEffect(() => {
    if (!status) return;
    toast({ message: status, tone: looksLikeError(status) ? "error" : "info" });
    setStatus(null);
  }, [status, setStatus]);
  return null;
}
