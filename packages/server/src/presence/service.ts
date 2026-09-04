export type Presence = {
  userId: string;
  displayName: string;
  levelId: string | null;
  lastSeen: number;
};

/**
 * In-memory and deliberately so. Presence is ephemeral, worthless after a
 * restart, and this server runs as a single Railway instance. Persisting it
 * would be pure cost.
 */
export class PresenceTracker {
  private readonly entries = new Map<string, Presence>();
  private readonly subscribers = new Set<(all: Presence[]) => void>();

  constructor(private readonly ttlMs: number = 30_000) {}

  heartbeat(userId: string, displayName: string, levelId: string | null): void {
    this.entries.set(userId, { userId, displayName, levelId, lastSeen: Date.now() });
    const all = this.list();
    for (const fn of this.subscribers) fn(all);
  }

  list(): Presence[] {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, p] of this.entries) {
      if (p.lastSeen < cutoff) this.entries.delete(id);
    }
    return [...this.entries.values()];
  }

  subscribe(fn: (all: Presence[]) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }
}
