import { useEffect, useRef } from "react";
import { isTyping } from "./typing";

/**
 * Whether a key press belongs to something other than the workspace's
 * shortcuts (spec §9, §10: the keys are inactive while typing, so the N of
 * "NTUC" is never "next"): a field, a dialog or popover (Radix gives both
 * role="dialog"), the browser (Ctrl, Cmd, Alt), or a button that Enter and
 * Space press.
 */
export function ignoreKey(
  event: Pick<KeyboardEvent, "key" | "target" | "ctrlKey" | "metaKey" | "altKey" | "defaultPrevented">,
): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return true;
  if (isTyping(event.target)) return true;
  const el = event.target instanceof Element ? event.target : null;
  if (el?.closest('[role="dialog"], [role="alertdialog"]')) return true;
  if ((event.key === "Enter" || event.key === " ") && el?.closest("button, a, summary, [role='button']")) return true;
  return false;
}

/** A workspace's shortcuts, heard on the window while it is mounted. The latest handler is always the one called. */
export function useKeys(onKey: (event: KeyboardEvent) => void): void {
  const handler = useRef(onKey);
  handler.current = onKey;
  useEffect(() => {
    const listen = (event: KeyboardEvent) => {
      if (!ignoreKey(event)) handler.current(event);
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, []);
}
