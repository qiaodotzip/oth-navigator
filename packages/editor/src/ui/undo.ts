import type { Api, EntityType } from "../api/client";
import type { Removal } from "../flow/removeLayer";
import type { Saver } from "../state/save";
import { offerUndo } from "./offerUndo";

/** What each part is called when an undo only half works. */
const PART: Partial<Record<EntityType, string>> = {
  portal: "the lift or stair",
  portalEndpoint: "its stop on this floor",
  room: "the space",
  pathway: "the pathway",
  entrance: "the entrance",
  placement: "the placed model",
  doorway: "the doorway",
  pathwayKind: "the walkway type",
};

const part = (r: Removal) => PART[r.type] ?? r.type;

/**
 * Deletes, then offers Undo, instead of asking "are you sure?" first.
 *
 * Every delete here is soft, so undoing is a restore at the version the delete
 * left (one more than it had). Restores run in reverse, so a lift comes back
 * before its last stop. The Undo is `offerUndo`'s, so it sounds like every
 * other Undo in the app: it reloads whatever the outcome, and a teammate's
 * change since is refused rather than overwritten. A half-done undo says what
 * did come back, and its Retry restores only what did not.
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

  // Kept across attempts, so Retry carries on from where the last try stopped
  // instead of restoring the first part twice.
  const pending = [...done].reverse();
  const restored: Removal[] = [];

  offerUndo({
    message: `Deleted ${label}`,
    undone: `Restored ${label}`,
    // Read when the failure is said, so it names what came back and the part
    // the undo stopped at. A noun phrase, since offerUndo's every sentence
    // wraps it: "Couldn't undo the rest of Lift A (the lift or stair came
    // back), its stop on this floor. Check your connection, then retry."
    what: () => restored.length === 0
      ? label
      : `the rest of ${label} (${restored.map(part).join(" and ")} came back), ${part(pending[0]!)}`,
    run: async () => {
      while (pending.length > 0) {
        const next = pending[0]!;
        await api.restoreEntity(next.type, next.id, next.version + 1);
        restored.push(pending.shift()!);
      }
    },
    refresh: saver.refresh,
  });
  return done.length === removals.length;
}
