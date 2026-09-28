import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, type User } from "../auth/users";
import type { Database } from "../db/client";
import { apiTokens, auditLog, users } from "../db/schema";
import { createTestDb } from "../testing/harness";
import { MAX_LIVE_TOKENS, TOKEN_LIFETIME_DAYS } from "./policy";
import {
  LAST_USED_EVERY_MS, TooManyTokensError, hashToken, listTokens, mintToken, resolveToken, revokeToken,
} from "./service";

const DAY = 24 * 3600_000;

let db: Database;
let wei: User;

beforeEach(async () => {
  db = await createTestDb();
  wei = await createUser(db, { email: "wei@example.com", password: "unused", displayName: "Wei" });
});

describe("minting a token", () => {
  it("gives the token once, as oth_pat_ and 43 characters, and keeps only its hash", async () => {
    const { secret, token } = await mintToken(db, wei, { name: "Wei's laptop", mayPublish: false });
    expect(secret).toMatch(/^oth_pat_[A-Za-z0-9_-]{43}$/);
    const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, token.id));
    expect(row?.tokenHash).toBe(hashToken(secret));
    expect(JSON.stringify(row)).not.toContain(secret.slice("oth_pat_".length));
    expect(JSON.stringify(token)).not.toContain(secret);
  });

  it("lasts the decided 90 days", async () => {
    expect(TOKEN_LIFETIME_DAYS).toBe(90);
    const { token } = await mintToken(db, wei, { name: "a", mayPublish: false }, new Date("2026-09-28T00:00:00Z"));
    expect(token.expiresAt).toBe("2026-12-27T00:00:00.000Z");
  });

  it("stops at five live tokens a person, and a revoked one makes room", async () => {
    const made = [];
    for (let i = 0; i < MAX_LIVE_TOKENS; i++) made.push(await mintToken(db, wei, { name: `t${i}`, mayPublish: false }));
    await expect(mintToken(db, wei, { name: "sixth", mayPublish: false })).rejects.toBeInstanceOf(TooManyTokensError);
    await revokeToken(db, made[0]!.token.id, wei.id);
    await expect(mintToken(db, wei, { name: "sixth", mayPublish: false })).resolves.toBeTruthy();
  });

  it("lets no more than five through when several are made at once", async () => {
    const tries = await Promise.allSettled(
      Array.from({ length: MAX_LIVE_TOKENS + 2 }, (_, i) => mintToken(db, wei, { name: `t${i}`, mayPublish: false })),
    );
    expect(tries.filter(t => t.status === "fulfilled")).toHaveLength(MAX_LIVE_TOKENS);
    for (const t of tries.filter(t => t.status === "rejected")) {
      expect((t as PromiseRejectedResult).reason).toBeInstanceOf(TooManyTokensError);
    }
    expect(await db.select().from(apiTokens)).toHaveLength(MAX_LIVE_TOKENS);
  });

  it("leaves no token behind when its making cannot be put on the record", async () => {
    await db.execute(sql`drop table audit_log`);
    await expect(mintToken(db, wei, { name: "a", mayPublish: false })).rejects.toThrow();
    expect(await db.select().from(apiTokens)).toEqual([]);
  });

  it("puts the making on the record without the token or its hash", async () => {
    const { secret, token } = await mintToken(db, wei, { name: "Wei's laptop", mayPublish: true });
    const rows = await db.select().from(auditLog).where(eq(auditLog.entityId, token.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityType: "token", action: "create", actorId: wei.id });
    expect(JSON.stringify(rows)).not.toContain(secret);
    expect(JSON.stringify(rows)).not.toContain(hashToken(secret));
  });
});

describe("resolving a token", () => {
  it("finds its person and what it may do", async () => {
    const { secret, token } = await mintToken(db, wei, { name: "Wei's laptop", mayPublish: true });
    expect(await resolveToken(db, secret)).toEqual({
      ok: true,
      user: { id: wei.id, email: "wei@example.com", displayName: "Wei" },
      token: { id: token.id, name: "Wei's laptop", mayPublish: true },
    });
  });

  it("refuses anything not shaped like a token before asking the database", async () => {
    expect(await resolveToken(db, "A".repeat(51))).toEqual({ ok: false, reason: "malformed" });
    expect(await resolveToken(db, "oth_pat_short")).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses a well-formed token nobody made", async () => {
    expect(await resolveToken(db, `oth_pat_${"A".repeat(43)}`)).toEqual({ ok: false, reason: "unknown" });
  });

  it("refuses an expired token", async () => {
    const { secret } = await mintToken(db, wei, { name: "old", mayPublish: false }, new Date(Date.now() - 91 * DAY));
    expect(await resolveToken(db, secret)).toEqual({ ok: false, reason: "expired" });
  });

  it("refuses a revoked token from the next call on", async () => {
    const { secret, token } = await mintToken(db, wei, { name: "a", mayPublish: false });
    expect((await resolveToken(db, secret)).ok).toBe(true);
    await revokeToken(db, token.id, wei.id);
    expect(await resolveToken(db, secret)).toEqual({ ok: false, reason: "revoked" });
  });

  it("refuses the token of someone who can no longer sign in", async () => {
    const { secret } = await mintToken(db, wei, { name: "a", mayPublish: false });
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, wei.id));
    expect(await resolveToken(db, secret)).toEqual({ ok: false, reason: "disabled" });
  });

  it("stamps last used at most once a minute", async () => {
    const t0 = new Date("2026-09-28T06:00:00Z");
    const { secret, token } = await mintToken(db, wei, { name: "a", mayPublish: false }, t0);
    const lastUsed = async () =>
      (await db.select().from(apiTokens).where(eq(apiTokens.id, token.id)))[0]?.lastUsedAt?.toISOString() ?? null;
    await resolveToken(db, secret, t0);
    expect(await lastUsed()).toBe(t0.toISOString());
    await resolveToken(db, secret, new Date(t0.getTime() + LAST_USED_EVERY_MS - 1));
    expect(await lastUsed()).toBe(t0.toISOString());
    const later = new Date(t0.getTime() + LAST_USED_EVERY_MS);
    await resolveToken(db, secret, later);
    expect(await lastUsed()).toBe(later.toISOString());
  });
});

describe("listing tokens", () => {
  it("lists everyone's live tokens with whose they are, never the token or its hash", async () => {
    const amy = await createUser(db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
    const a = await mintToken(db, wei, { name: "Wei's laptop", mayPublish: false }, new Date("2026-09-28T01:00:00Z"));
    const b = await mintToken(db, amy, { name: "Amy's desktop", mayPublish: true }, new Date("2026-09-28T02:00:00Z"));
    const gone = await mintToken(db, amy, { name: "old", mayPublish: false }, new Date("2026-09-28T03:00:00Z"));
    await revokeToken(db, gone.token.id, wei.id);
    const listed = await listTokens(db, new Date("2026-09-29T00:00:00Z"));
    expect(listed).toEqual([a.token, b.token]);
    expect(listed[1]).toMatchObject({ ownerId: amy.id, ownerName: "Amy", mayPublish: true });
    for (const secret of [a.secret, b.secret]) {
      expect(JSON.stringify(listed)).not.toContain(secret);
      expect(JSON.stringify(listed)).not.toContain(hashToken(secret));
    }
  });
});

describe("revoking a token", () => {
  it("says false for a token that does not exist, and true again for one already revoked", async () => {
    expect(await revokeToken(db, "tok_nope", wei.id)).toBe(false);
    const { token } = await mintToken(db, wei, { name: "a", mayPublish: false });
    expect(await revokeToken(db, token.id, wei.id)).toBe(true);
    expect(await revokeToken(db, token.id, wei.id)).toBe(true);
    const revokes = (await db.select().from(auditLog)).filter(r => r.action === "revoke");
    expect(revokes).toHaveLength(1);
  });

  it("puts one revoke on the record when two people revoke the same token at once", async () => {
    const amy = await createUser(db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
    const { token } = await mintToken(db, wei, { name: "a", mayPublish: false });
    expect(await Promise.all([revokeToken(db, token.id, wei.id), revokeToken(db, token.id, amy.id)])).toEqual([true, true]);
    const revokes = (await db.select().from(auditLog)).filter(r => r.action === "revoke");
    expect(revokes).toHaveLength(1);
    const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, token.id));
    expect(row?.revokedBy).toBe(revokes[0]?.actorId);
  });
});
