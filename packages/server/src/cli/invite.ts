import { randomBytes } from "node:crypto";
import { isNull } from "drizzle-orm";
import { createUser, findUserByEmail, type User } from "../auth/users";
import type { Database } from "../db/client";
import { users } from "../db/schema";

/** A name that collides, case-insensitively, with someone already on the team. */
export class DuplicateNameError extends Error {
  constructor(displayName: string) {
    super(`Someone called ${displayName} is already on the team.`);
    this.name = "DuplicateNameError";
  }
}

function slugify(name: string): string {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "person";
}

/** The first `<slug>@team.oth.local` nobody has yet, trying `-2`, `-3`, … until one is free. */
async function freeHiddenEmail(db: Database, displayName: string): Promise<string> {
  const base = slugify(displayName);
  for (let n = 1; ; n += 1) {
    const email = n === 1 ? `${base}@team.oth.local` : `${base}-${n}@team.oth.local`;
    if (!(await findUserByEmail(db, email))) return email;
  }
}

async function activeUserNamed(db: Database, displayName: string): Promise<boolean> {
  const rows = await db.select({ displayName: users.displayName }).from(users).where(isNull(users.disabledAt));
  const target = displayName.toLowerCase();
  return rows.some(r => r.displayName.toLowerCase() === target);
}

/**
 * Adds a person by name. There is no password to set or send: signing in is
 * picking a name from a list, so the name is the whole of the account, and
 * two people can't share one.
 *
 * The email and password columns are both `NOT NULL` and nothing checks
 * either any more: the email is a hidden slug nobody sees, and the password
 * is the hash of a random value nobody will ever need, because no route
 * verifies it.
 */
export async function inviteUser(
  db: Database, displayName: string, invitedBy?: string,
): Promise<{ user: User }> {
  const name = displayName.trim();
  if (await activeUserNamed(db, name)) throw new DuplicateNameError(name);

  const email = await freeHiddenEmail(db, name);
  const password = randomBytes(32).toString("base64url");
  const user = await createUser(db, { email, password, displayName: name, invitedBy });
  return { user };
}
