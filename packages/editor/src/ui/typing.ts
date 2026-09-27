/** Input types that take no typed text, so a letter pressed on one is a shortcut. */
const NOT_TEXT = new Set(["checkbox", "radio", "range", "button", "submit", "reset", "file", "color"]);

/**
 * Whether a key press belongs to a field someone is typing in. A single-letter
 * shortcut or Delete must never fire while a name is being typed.
 */
export function isTyping(target: EventTarget | null | undefined): boolean {
  if (target instanceof HTMLInputElement) return !NOT_TEXT.has(target.type);
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
