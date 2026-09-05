/**
 * What the editor knows about other people.
 *
 * These live here rather than in the store because the API client returns them
 * and the store holds them — putting them in either would make the two import
 * each other.
 */

export type PresenceEntry = {
  userId: string;
  displayName: string;
  levelId: string | null;
};

export type LockEntry = {
  entityType: string;
  entityId: string;
  lockedBy: string;
  lockedByName: string;
};
