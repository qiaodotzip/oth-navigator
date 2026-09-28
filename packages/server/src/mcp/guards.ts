import type { Database } from "../db/client";
import { activeLocks } from "../locks/service";
import { Refusal } from "./results";

/**
 * An agent never edits under someone's hands (spec §6.4). A write to anything
 * a person holds a lock on in the browser is refused, whoever holds it. That
 * includes the token's own person, who may be mid-edit in a tab.
 */
export async function refuseIfLocked(db: Database, targets: readonly { type: string; id: string }[]): Promise<void> {
  if (targets.length === 0) return;
  const held = await activeLocks(db);
  for (const target of targets) {
    const lock = held.find(l => l.entityType === target.type && l.entityId === target.id);
    if (lock) {
      throw new Refusal(
        `Not saved: ${lock.lockedByName} is editing ${target.type} ${target.id} now. Leave it, and try again once they have moved on.`,
      );
    }
  }
}
