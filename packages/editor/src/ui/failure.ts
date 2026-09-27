import { ApiError, ConflictError, isUnauthorized } from "../api/client";
import { toast } from "./toast";

/**
 * Whether sending the same request again could work. A refusal (a 4xx) will
 * be refused again; a request that never arrived, or a server that fell over
 * (a 5xx), may well go through the second time.
 */
export function worthRetrying(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status >= 500;
}

/** What the server said, when it said something in words. */
export function serverWords(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const said = (err.body as { error?: unknown } | null)?.error;
  return typeof said === "string" && said.trim() !== "" ? said.trim().replace(/\.$/, "") : null;
}

/**
 * Says a request failed, in words a teammate can act on (spec §6). Errors
 * stay until dismissed, and offer Retry only where trying again could work.
 *
 * `doing` finishes the sentence "Couldn't …": "save your change", "add L1.png".
 */
export function reportFailure(
  err: unknown,
  { doing, retry }: { doing: string; retry?: () => void | Promise<void> },
): void {
  // A 401 already opened the session-ended dialog; a toast would only contradict it.
  if (isUnauthorized(err)) return;
  if (err instanceof ConflictError) {
    toast({ tone: "error", message: `Couldn't ${doing}: someone changed it since. Reload to see the latest.` });
    return;
  }
  if (!worthRetrying(err)) {
    const said = serverWords(err) ?? `the server refused it (HTTP ${(err as ApiError).status})`;
    toast({ tone: "error", message: `Couldn't ${doing}: ${said}.` });
    return;
  }
  toast({
    tone: "error",
    message: err instanceof ApiError
      ? `Couldn't ${doing}: the server had a problem. Try again in a moment.`
      : `Couldn't ${doing}. Check your connection, then retry.`,
    action: retry ? { label: "Retry", run: retry } : undefined,
  });
}
