import { afterEach, describe, expect, it, vi } from "vitest";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { createTestDb } from "../testing/harness";
import { LiveTokens } from "./live";
import { hashToken, mintToken, revokeToken } from "./service";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LiveTokens", () => {
  it("reads every live token's hash at most once a minute, one read for every caller", async () => {
    const db = await createTestDb();
    const wei = await createUser(db, { email: "wei@example.com", password: "unused", displayName: "Wei" });
    const kept = await mintToken(db, wei, { name: "kept", mayPublish: false });
    const gone = await mintToken(db, wei, { name: "gone", mayPublish: false });
    await revokeToken(db, gone.token.id, wei.id);
    const select = vi.spyOn(db, "select");
    const live = new LiveTokens(db);
    const [a, b] = await Promise.all([live.hashes(0), live.hashes(0)]);
    expect(a).toBe(b);
    expect(a?.has(hashToken(kept.secret))).toBe(true);
    expect(a?.has(hashToken(gone.secret))).toBe(false);
    await live.hashes(59_999);
    expect(select).toHaveBeenCalledTimes(1);
    await live.hashes(60_000);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("takes a token made since its last read at once", async () => {
    const db = await createTestDb();
    const live = new LiveTokens(db);
    await live.hashes(0);
    live.add("fresh-hash");
    expect((await live.hashes(1))?.has("fresh-hash")).toBe(true);
  });

  it("answers null after a failed read, and reads again only five seconds on", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    let tries = 0;
    const broken = {
      select: () => {
        tries++;
        throw new Error("Connection terminated unexpectedly");
      },
    } as unknown as Database;
    const live = new LiveTokens(broken);
    expect(await live.hashes(0)).toBeNull();
    expect(await live.hashes(4_999)).toBeNull();
    expect(tries).toBe(1);
    expect(await live.hashes(5_000)).toBeNull();
    expect(tries).toBe(2);
    expect(logged).toHaveBeenCalled();
  });
});
