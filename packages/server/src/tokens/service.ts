import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import type { User } from "../auth/users";
import type { Database } from "../db/client";
import { apiTokens, users } from "../db/schema";
import { recordAudit } from "../entities/repository";
import { MAX_LIVE_TOKENS, TOKEN_LIFETIME_DAYS } from "./policy";

export const TOKEN_PREFIX = "oth_pat_";

/** `oth_pat_` then 32 random bytes in base64url, which is 43 characters. */
const TOKEN_SHAPE = /^oth_pat_[A-Za-z0-9_-]{43}$/;

/** "Last used" is written at most this often, so a busy session is not a write per call. */
export const LAST_USED_EVERY_MS = 60_000;

const DAY_MS = 24 * 3600_000;

/** What a tool call knows about the token it came through. */
export type TokenInfo = { id: string; name: string; mayPublish: boolean };

/** A token as the Team page lists it: never the token, never its hash. */
export type TokenListing = {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  mayPublish: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
};

export type TokenRefusal = "malformed" | "unknown" | "revoked" | "expired" | "disabled";

export type ResolvedToken =
  | { ok: true; user: User; token: TokenInfo }
  | { ok: false; reason: TokenRefusal };

export class TooManyTokensError extends Error {
  constructor() {
    super(`You already have ${MAX_LIVE_TOKENS} Claude Code tokens. Revoke one you no longer use, then make this one.`);
    this.name = "TooManyTokensError";
  }
}

/**
 * Hex SHA-256 of the whole token. A token is 256 random bits, so a fast hash
 * is enough: there is nothing to guess, only a copy of the table to make
 * useless.
 */
export function hashToken(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function looksLikeToken(value: string): boolean {
  return TOKEN_SHAPE.test(value);
}

/**
 * Makes a token for `owner`, who is whoever is signed in. The token is in
 * the answer and nowhere else: only its hash is kept, so nothing can show it
 * again (spec §6.1, "shown once").
 */
export async function mintToken(
  db: Database, owner: User, input: { name: string; mayPublish: boolean }, now: Date = new Date(),
): Promise<{ token: TokenListing; secret: string }> {
  const secret = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const id = `tok_${randomUUID()}`;
  const expiresAt = new Date(now.getTime() + TOKEN_LIFETIME_DAYS * DAY_MS);
  // One transaction, so a record that fails to write takes its token with it:
  // no live token exists that the trail never saw made.
  await db.transaction(async t => {
    const tx = t as unknown as Database;
    // The owner's row is locked first, so two tabs making a token at once
    // count one after the other and cannot both be the fifth. NO KEY UPDATE
    // rather than UPDATE, so the owner signing in meanwhile is not held up.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, owner.id)).for("no key update");
    const live = await tx.select({ id: apiTokens.id }).from(apiTokens).where(and(
      eq(apiTokens.userId, owner.id), isNull(apiTokens.revokedAt), gt(apiTokens.expiresAt, now),
    ));
    if (live.length >= MAX_LIVE_TOKENS) throw new TooManyTokensError();

    await tx.insert(apiTokens).values({
      id, userId: owner.id, name: input.name, tokenHash: hashToken(secret),
      mayPublish: input.mayPublish, createdAt: now, expiresAt,
    });
    // On the record like every other change, but only as the Team page shows
    // it: the whole team reads audit rows, so neither the token nor its hash.
    await recordAudit(tx, "token", id, "create", owner.id, null, {
      id, name: input.name, userId: owner.id, mayPublish: input.mayPublish, expiresAt,
    });
  });
  return {
    secret,
    token: {
      id, name: input.name, ownerId: owner.id, ownerName: owner.displayName, mayPublish: input.mayPublish,
      createdAt: now.toISOString(), lastUsedAt: null, expiresAt: expiresAt.toISOString(),
    },
  };
}

/**
 * Who a token speaks for, checked on every call: revoking a token or
 * disabling its person takes effect on the very next one. Changing TEAM_CODE
 * does not end a token (spec §6.1).
 */
export async function resolveToken(db: Database, secret: string, now: Date = new Date()): Promise<ResolvedToken> {
  // The shape check costs nothing and keeps junk away from the database.
  if (!looksLikeToken(secret)) return { ok: false, reason: "malformed" };
  const [row] = await db.select({ token: apiTokens, user: users }).from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(eq(apiTokens.tokenHash, hashToken(secret)));
  if (!row) return { ok: false, reason: "unknown" };
  if (row.token.revokedAt) return { ok: false, reason: "revoked" };
  if (row.token.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" };
  if (row.user.disabledAt) return { ok: false, reason: "disabled" };
  const last = row.token.lastUsedAt?.getTime();
  if (last === undefined || now.getTime() - last >= LAST_USED_EVERY_MS) {
    await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.token.id));
  }
  return {
    ok: true,
    user: { id: row.user.id, email: row.user.email, displayName: row.user.displayName },
    token: { id: row.token.id, name: row.token.name, mayPublish: row.token.mayPublish },
  };
}

/**
 * The hashes of every token that is neither revoked nor expired, and never the
 * tokens, which are not kept. /mcp checks a token against them while a flood
 * of made-up ones has its window full.
 */
export async function liveTokenHashes(db: Database, now: Date = new Date()): Promise<Set<string>> {
  const rows = await db.select({ hash: apiTokens.tokenHash }).from(apiTokens)
    .where(and(isNull(apiTokens.revokedAt), gt(apiTokens.expiresAt, now)));
  return new Set(rows.map(r => r.hash));
}

/** Everyone's live tokens, oldest first. The team is flat: anyone sees, and may revoke, any. */
export async function listTokens(db: Database, now: Date = new Date()): Promise<TokenListing[]> {
  const rows = await db.select({ token: apiTokens, ownerName: users.displayName }).from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(and(isNull(apiTokens.revokedAt), gt(apiTokens.expiresAt, now)))
    .orderBy(asc(apiTokens.createdAt));
  return rows.map(({ token, ownerName }) => ({
    id: token.id,
    name: token.name,
    ownerId: token.userId,
    ownerName,
    mayPublish: token.mayPublish,
    createdAt: token.createdAt.toISOString(),
    lastUsedAt: token.lastUsedAt ? token.lastUsedAt.toISOString() : null,
    expiresAt: token.expiresAt.toISOString(),
  }));
}

/**
 * Ends a token at once. Every call is checked against this table, so the
 * next one with it is refused. False when there is no such token; revoking
 * one already revoked changes nothing and says true.
 */
export async function revokeToken(db: Database, id: string, actorId: string, now: Date = new Date()): Promise<boolean> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    // Only the call that actually ends the token writes the record, so two
    // people revoking it at once leave one row, naming whoever was first.
    const [ended] = await tx.update(apiTokens).set({ revokedAt: now, revokedBy: actorId })
      .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
      .returning({ name: apiTokens.name, userId: apiTokens.userId });
    if (ended) {
      await recordAudit(tx, "token", id, "revoke", actorId, null, { id, name: ended.name, userId: ended.userId });
      return true;
    }
    const [exists] = await tx.select({ id: apiTokens.id }).from(apiTokens).where(eq(apiTokens.id, id));
    return exists !== undefined;
  });
}

export type TokenNotice = { id: string; name: string; createdAt: string };

/**
 * Live tokens made in this person's name that they have not been told about,
 * now marked as told (spec §6.1). Signing in is picking a name, so anyone
 * past the gate can make a token as anyone: telling the owner is what makes
 * that visible.
 */
export async function claimNotices(db: Database, userId: string, now: Date = new Date()): Promise<TokenNotice[]> {
  const rows = await db.update(apiTokens).set({ announcedAt: now })
    .where(and(
      eq(apiTokens.userId, userId), isNull(apiTokens.announcedAt), isNull(apiTokens.revokedAt), gt(apiTokens.expiresAt, now),
    ))
    .returning({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt });
  return rows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(r => ({ id: r.id, name: r.name, createdAt: r.createdAt.toISOString() }));
}
