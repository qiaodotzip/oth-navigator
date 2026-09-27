export type ReviewCommand = "accept" | "reject" | "skip" | "list" | "closeList" | "prevFrame" | "nextFrame";

/** Review's keys (spec §10), in one table. A Map, so "constructor" is not a key. */
const KEYS = new Map<string, ReviewCommand>([
  ["a", "accept"], ["A", "accept"],
  ["r", "reject"], ["R", "reject"],
  ["s", "skip"], ["S", "skip"],
  ["l", "list"], ["L", "list"],
  ["Escape", "closeList"],
  ["ArrowLeft", "prevFrame"],
  ["ArrowRight", "nextFrame"],
]);

export function reviewCommand(key: string): ReviewCommand | null {
  return KEYS.get(key) ?? null;
}
