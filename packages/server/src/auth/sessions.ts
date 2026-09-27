import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { sessions, users } from "../db/schema";
import type { User } from "./users";

export const SESSION_COOKIE = "oth_session";

export async function createSession(db: Database, userId: string, ttlHours: number) {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

/** Returns null for an unknown, expired, or disabled-user session. */
export async function resolveSession(db: Database, token: string): Promise<User | null> {
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, token));

  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() < Date.now()) return null;
  if (row.user.disabledAt) return null;
  return {
    id: row.user.id,
    email: row.user.email,
    displayName: row.user.displayName,
    mustChangePassword: row.user.mustChangePassword,
  };
}

export async function revokeSession(db: Database, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, token));
}
