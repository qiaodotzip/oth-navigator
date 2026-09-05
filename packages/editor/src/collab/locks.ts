import type { Selection } from "../state/store";
import type { LockEntry } from "./types";

/**
 * Who is holding the selected entity, if it is not me.
 *
 * My own locks are deliberately invisible: I already know I am editing this,
 * and a badge on every row I touch would be noise rather than information.
 */
export function lockFor(
  locks: readonly LockEntry[],
  selection: Selection,
  myUserId: string | null,
): LockEntry | null {
  if (!selection) return null;
  return locks.find(
    l => l.entityType === selection.type && l.entityId === selection.id && l.lockedBy !== myUserId,
  ) ?? null;
}
