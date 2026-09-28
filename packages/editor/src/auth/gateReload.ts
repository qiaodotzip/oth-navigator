const KEY = "oth.gateReloadAt";

/** Long enough that a page which comes straight back gated is not reloaded again. */
const QUIET_MS = 30_000;

function sessionStore(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Reloads so the server can show its team-code page in place of the app.
 * Only once in half a minute: a page that loads and is refused again at
 * once, like the Vite dev server in front of an API with TEAM_CODE set,
 * must not reload for ever. Says whether it reloaded.
 */
export function reloadForGate(
  reload: () => void = () => window.location.reload(),
  storage: Pick<Storage, "getItem" | "setItem"> | null = sessionStore(),
  now: number = Date.now(),
): boolean {
  const last = Number(storage?.getItem(KEY) ?? 0);
  if (now - last < QUIET_MS) return false;
  try {
    storage?.setItem(KEY, String(now));
  } catch {
    // Nowhere to remember it: reload all the same.
  }
  reload();
  return true;
}
