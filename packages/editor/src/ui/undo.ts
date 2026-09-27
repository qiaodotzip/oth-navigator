import { ConflictError, isUnauthorized, type Api } from "../api/client";
import type { Removal } from "../flow/removeLayer";
import type { Saver } from "../state/save";
import { toast } from "./toast";

/**
 * Deletes, then offers Undo, instead of asking "are you sure?" first.
 *
 * Every delete here is soft, so undoing is a restore at the version the delete
 * left (one more than it had). Restores run in reverse, so a lift comes back
 * before its last stop. If a teammate has touched it since, the restore is
 * refused, and the toast says so rather than overwriting what they did.
 */
export async function deleteWithUndo({
  api,
  saver,
  removals,
  label,
}: {
  api: Pick<Api, "restoreEntity">;
  saver: Pick<Saver, "remove" | "refresh">;
  removals: readonly Removal[];
  label: string;
}): Promise<boolean> {
  const done: Removal[] = [];
  for (const r of removals) {
    if (!(await saver.remove(r.type, r.id, r.version))) break;
    done.push(r);
  }
  if (done.length === 0) return false;

  toast({
    message: `Deleted ${label}`,
    action: {
      label: "Undo",
      run: async () => {
        try {
          for (const r of [...done].reverse()) await api.restoreEntity(r.type, r.id, r.version + 1);
          await saver.refresh();
          toast({ message: `Restored ${label}`, tone: "success" });
        } catch (err) {
          // A 401 means the session expired; the sign-in dialog over the
          // page says so, and this would only contradict it.
          if (isUnauthorized(err)) return;
          toast({
            tone: "error",
            message:
              err instanceof ConflictError
                ? `Couldn't undo: ${label} was changed since. Reload to see the latest.`
                : `Couldn't undo ${label}. Check your connection and try again.`,
          });
        }
      },
    },
  });
  return done.length === removals.length;
}
