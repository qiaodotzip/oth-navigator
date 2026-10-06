import type { Database } from "../db/client";
import { redactError } from "./redact";
import { liveTokenHashes } from "./service";

/** How stale the hashes may be. */
const EVERY_MS = 60_000;

/** After a failed read, how long before the next one is tried. */
const RETRY_MS = 5_000;

type Read = { at: number; failed: boolean; hashes: Promise<Set<string> | null> };

/**
 * The live tokens' hashes, which /mcp checks a token it has not yet accepted
 * against while a flood of made-up tokens has its window full. One per app,
 * shared with the Team page's routes.
 *
 * Read at most once a minute, however many requests wait on it, and after a
 * failed read not again for five seconds, so a flood can't turn a struggling
 * database into a read per request. A token made on the Team page is added at
 * once, so a teammate who makes one during a flood can use it straight away.
 */
export class LiveTokens {
  private held: Read | null = null;

  constructor(private readonly db: Database) {}

  /** The hashes, or null while the last read failed under five seconds ago. */
  hashes(at: number): Promise<Set<string> | null> {
    const held = this.held;
    if (held && at - held.at < (held.failed ? RETRY_MS : EVERY_MS)) return held.hashes;
    return this.read(at).hashes;
  }

  /**
   * A token just made. With nothing held, the next read will find it.
   *
   * The rejection handler is not decoration: a promise this consumes and never
   * catches is an unhandled rejection, which Node exits the process over. The
   * held read catches its own failure today, so this cannot fire — the handler
   * is here so that the next thing to throw in there cannot take the server
   * down. Losing the hash is harmless: the next read finds the token anyway.
   */
  add(hash: string): void {
    void this.held?.hashes.then(
      set => {
        set?.add(hash);
      },
      () => {},
    );
  }

  private read(at: number): Read {
    const read: Read = { at, failed: false, hashes: Promise.resolve(null) };
    read.hashes = liveTokenHashes(this.db, new Date(at)).catch((err: unknown) => {
      read.failed = true;
      console.error("Reading the live Claude Code tokens failed", redactError(err));
      return null;
    });
    this.held = read;
    return read;
  }
}
