export type SurveyCommand =
  | "prev" | "next" | "nextUntagged" | "focusName" | "tag" | "dropBox" | "bin" | "toggleGrid";

/**
 * The survey's keys (spec §9), in one table so the screen and its hints
 * agree. A Map rather than an object, so "constructor" is not a key.
 * Backspace bins too: it is the Delete key on a Mac laptop, and a bin is undone
 * from its toast.
 */
const KEYS = new Map<string, SurveyCommand>([
  ["ArrowLeft", "prev"],
  ["ArrowRight", "next"],
  ["n", "nextUntagged"], ["N", "nextUntagged"],
  ["t", "focusName"], ["T", "focusName"],
  ["Enter", "tag"],
  ["Escape", "dropBox"],
  ["Delete", "bin"], ["Backspace", "bin"],
  ["g", "toggleGrid"], ["G", "toggleGrid"],
]);

export function surveyCommand(key: string): SurveyCommand | null {
  return KEYS.get(key) ?? null;
}
