/**
 * Per token (spec §6.4). The counters are kept in memory, which works
 * because Railway runs one instance; a deploy resets them, which only ever
 * lets a token go sooner.
 */
export const LIMITS = {
  readsPerMinute: 120,
  writesPerMinute: 60,
  publishEveryMs: 10 * 60_000,
  inFlight: 4,
  bodyBytes: 256 * 1024,
};

export type Limits = typeof LIMITS;

/**
 * Made-up tokens allowed across the whole server in a window, like wrong
 * team codes (gate/gate.ts), so a flood of them cannot hammer the database.
 */
export const BAD_TOKEN_LIMIT = { max: 20, windowMs: 15 * 60_000 };

/**
 * Every tool that only reads. Anything else, including a tool added later
 * and not listed here, counts as a write, which is the safe way round.
 */
export const READ_TOOLS: ReadonlySet<string> = new Set([
  "list_floors", "get_floor", "get", "check_floor", "list_frames", "view_frame", "view_plan",
]);

export type CallKind = "read" | "write" | "publish";

/**
 * What each message in a request would do. A request is one JSON-RPC message
 * or a batch of them, and anything that is not a tool call (initialising,
 * listing the tools, a ping) reads.
 */
export function callKinds(body: unknown): CallKind[] {
  const messages = Array.isArray(body) ? body : [body];
  return messages.map(message => {
    const m = message as { method?: unknown; params?: { name?: unknown } } | null;
    if (m?.method !== "tools/call") return "read";
    const name = typeof m.params?.name === "string" ? m.params.name : "";
    if (READ_TOOLS.has(name)) return "read";
    return name === "publish" ? "publish" : "write";
  });
}

export type Refused = { message: string; retryAfterS: number };

const MINUTE = 60_000;

function seconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

function times(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export class TokenLimits {
  private readonly reads = new Map<string, number[]>();
  private readonly writes = new Map<string, number[]>();
  private readonly lastPublish = new Map<string, number>();
  private readonly flying = new Map<string, number>();

  constructor(readonly limits: Limits = LIMITS) {}

  /**
   * Counts a request's calls against its token, or says how long to wait.
   * A refused request counts for nothing, so waiting is always enough. A
   * publish is only checked here: the publish tool claims the slot itself,
   * so one the map's errors refuse costs no ten-minute wait.
   */
  admit(tokenId: string, kinds: readonly CallKind[], now: number): Refused | null {
    const reads = (this.reads.get(tokenId) ?? []).filter(t => now - t < MINUTE);
    const writes = (this.writes.get(tokenId) ?? []).filter(t => now - t < MINUTE);
    const readCount = kinds.filter(k => k === "read").length;
    const writeCount = kinds.length - readCount;

    if (readCount > 0 && reads.length + readCount > this.limits.readsPerMinute) {
      const wait = reads.length > 0 ? seconds(reads[0]! + MINUTE - now) : 60;
      return {
        retryAfterS: wait,
        message: `Slow down: this token has read the map ${times(this.limits.readsPerMinute, "time")} in the last minute. Wait ${wait} seconds, then carry on.`,
      };
    }
    if (writeCount > 0 && writes.length + writeCount > this.limits.writesPerMinute) {
      const wait = writes.length > 0 ? seconds(writes[0]! + MINUTE - now) : 60;
      return {
        retryAfterS: wait,
        message: `Slow down: this token has made ${times(this.limits.writesPerMinute, "change")} in the last minute. Wait ${wait} seconds, then carry on.`,
      };
    }
    if (kinds.includes("publish")) {
      const last = this.lastPublish.get(tokenId);
      if (last !== undefined && now - last < this.limits.publishEveryMs) {
        const wait = seconds(last + this.limits.publishEveryMs - now);
        return {
          retryAfterS: wait,
          message: `This token published less than ten minutes ago. Wait ${wait} seconds, then publish again.`,
        };
      }
    }
    this.reads.set(tokenId, [...reads, ...new Array<number>(readCount).fill(now)]);
    this.writes.set(tokenId, [...writes, ...new Array<number>(writeCount).fill(now)]);
    return null;
  }

  /** Takes the token's publish slot, or false while its last publish is under ten minutes old. */
  claimPublish(tokenId: string, now: number): boolean {
    const last = this.lastPublish.get(tokenId);
    if (last !== undefined && now - last < this.limits.publishEveryMs) return false;
    this.lastPublish.set(tokenId, now);
    return true;
  }

  /** Gives the slot back when nothing was published. */
  releasePublish(tokenId: string, claimedAt: number): void {
    if (this.lastPublish.get(tokenId) === claimedAt) this.lastPublish.delete(tokenId);
  }

  /** One more request in flight for this token, or false at its limit. */
  enter(tokenId: string): boolean {
    const n = this.flying.get(tokenId) ?? 0;
    if (n >= this.limits.inFlight) return false;
    this.flying.set(tokenId, n + 1);
    return true;
  }

  leave(tokenId: string): void {
    const n = (this.flying.get(tokenId) ?? 1) - 1;
    if (n <= 0) this.flying.delete(tokenId);
    else this.flying.set(tokenId, n);
  }
}
