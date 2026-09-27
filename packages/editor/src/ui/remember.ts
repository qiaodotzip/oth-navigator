/**
 * Per-browser memory for conveniences only — the last floor, the last tab.
 * Private windows and blocked storage throw; that is never an error here.
 */
export function recall(key: string): string | null {
  try {
    return localStorage.getItem(`oth.${key}`);
  } catch {
    return null;
  }
}

export function remember(key: string, value: string): void {
  try {
    localStorage.setItem(`oth.${key}`, value);
  } catch {
    // Not worth mentioning: the app works the same, it just forgets.
  }
}
