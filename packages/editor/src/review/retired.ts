/**
 * Proposals rejected or merged from Review in this session, by the floor they
 * were reviewed on. A decision that retires a proposal deletes it, so the map
 * no longer has it to count: without these, "28 of 192 decided" would become
 * "28 of 191" on a reject, where it should become "29 of 192".
 *
 * Kept for the session, not for the screen, so the count holds as you come
 * and go. Only those still gone from the map count: an Undo brings one back
 * to wait again, and it is counted there instead.
 */
const retired = new Map<string, Set<string>>();

export function noteRetired(levelId: string, placeId: string): void {
  const ids = retired.get(levelId) ?? new Set<string>();
  ids.add(placeId);
  retired.set(levelId, ids);
}

/** How many of those retired on this floor are still off the map. */
export function retiredCount(levelId: string, livePlaceIds: ReadonlySet<string>): number {
  let n = 0;
  for (const id of retired.get(levelId) ?? []) if (!livePlaceIds.has(id)) n++;
  return n;
}
