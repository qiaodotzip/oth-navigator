import { ConflictError, isUnauthorized } from "../api/client";
import { serverWords, worthRetrying } from "./failure";
import { toast } from "./toast";

/**
 * An Undo on the toast that says what just happened (spec §10: "Accepted
 * Festive Mall · Undo").
 *
 * Undoing runs `run`, then reloads whatever the outcome, so the screen shows
 * what the server now has. A teammate's change since is refused rather than
 * overwritten, and the toast says so. An undo that never arrived offers
 * Retry, which runs the same `run` again — so a `run` of several steps must
 * carry on from where it stopped. A 401 says nothing: the sign-in dialog over
 * the page is the message. Worded like `deleteWithUndo`, so every Undo in the
 * app sounds the same.
 */
export function offerUndo({ message, undone, what, run, refresh }: {
  message: string;
  /** Said when the undo worked: "Frame 3 is back". */
  undone: string;
  /**
   * What was undone, for the failure messages: "frame 3", "Gate 1". A `run`
   * of several steps passes a function, read when the failure is said, so it
   * names the step that failed rather than counting them all.
   */
  what: string | (() => string);
  run: () => Promise<unknown>;
  refresh: () => Promise<void>;
}): void {
  async function undo(): Promise<void> {
    try {
      await run();
      toast({ tone: "success", message: undone });
    } catch (err) {
      if (isUnauthorized(err)) return;
      const conflict = err instanceof ConflictError;
      const named = typeof what === "string" ? what : what();
      const retry = !conflict && worthRetrying(err) ? { label: "Retry", run: undo } : undefined;
      toast({
        tone: "error",
        action: retry,
        message: conflict
          ? `Couldn't undo: ${named} was changed since. Reload to see the latest.`
          : retry
            ? `Couldn't undo ${named}. Check your connection, then retry.`
            // A refusal that trying again would only meet the same way, so the
            // next step is to reload rather than to retry.
            : `Couldn't undo ${named}: ${serverWords(err) ?? "the server refused it"}. Reload to see where it stands.`,
      });
    } finally {
      await refresh().catch(() => {});
    }
  }

  toast({ message, action: { label: "Undo", run: undo } });
}
