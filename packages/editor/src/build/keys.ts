import type { Tool } from "../state/store";
import { isTyping } from "../ui/typing";

export type BuildKeyAction =
  | { kind: "tool"; tool: Tool }
  | { kind: "fit" }
  | { kind: "delete" }
  | { kind: "cancel" };

/**
 * Spec §11's keys, by lower-cased `KeyboardEvent.key`. Space is the canvas's
 * own (hold to pan), and so is Backspace while a shape is being drawn.
 */
export const BUILD_KEYS: Readonly<Record<string, BuildKeyAction>> = {
  v: { kind: "tool", tool: "select" },
  a: { kind: "tool", tool: "draw-area" },
  r: { kind: "tool", tool: "draw-room" },
  p: { kind: "tool", tool: "draw-pathway" },
  e: { kind: "tool", tool: "place-entrance" },
  l: { kind: "tool", tool: "place-portal" },
  f: { kind: "fit" },
  delete: { kind: "delete" },
  escape: { kind: "cancel" },
};

export type KeyInput = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  /** Where the key was pressed: a field that takes text keeps all its keys. */
  target?: EventTarget | null;
  /** True while a shape has points, when Backspace takes one back instead. */
  drafting?: boolean;
};

/** What a key press means in Build, or null when it means nothing here. */
export function buildKeyAction(input: KeyInput): BuildKeyAction | null {
  // Ctrl+R reloads, Cmd+L goes to the address bar: those belong to the browser.
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  if (isTyping(input.target)) return null;
  const key = input.key.toLowerCase();
  if (key === "delete" || key === "backspace") {
    // Mid-shape these take back a corner, which the canvas does; deleting the
    // selection from under a half-drawn shape would be a surprise.
    if (input.drafting) return null;
    // A Mac laptop has no Delete key: its Backspace is the one people press.
    return { kind: "delete" };
  }
  return BUILD_KEYS[key] ?? null;
}
