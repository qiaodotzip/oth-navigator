import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "../auth/password";
import { createUser, findUserByEmail, type User } from "../auth/users";
import type { Database } from "../db/client";
import { users } from "../db/schema";

/** One-time passwords are shown once and never stored in the clear. */
function oneTimePassword(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * There is no signup route. Accounts exist because someone ran this, which is
 * the whole of "invite-only" for a team of four.
 */
export async function inviteUser(
  db: Database, email: string, displayName: string, invitedBy?: string,
): Promise<{ user: User; password: string }> {
  if (await findUserByEmail(db, email)) {
    throw new Error(`a user with email ${email} already exists`);
  }
  const password = oneTimePassword();
  // A one-time password is meant to be replaced; the app asks until it is.
  const user = await createUser(db, { email, password, displayName, invitedBy, mustChangePassword: true });
  return { user, password };
}

/**
 * Issues a fresh password for an account that already exists.
 *
 * Without this, a forgotten password is a permanent lockout: there is no signup
 * route, no reset email, and `invite` refuses an address it already knows. For
 * a team of four sharing one server that is a real way to lose a person.
 */
export async function resetPassword(
  db: Database, email: string,
): Promise<{ user: User; password: string }> {
  const existing = await findUserByEmail(db, email);
  if (!existing) throw new Error(`no user with email ${email}`);

  const password = oneTimePassword();
  await db.update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true })
    .where(eq(users.id, existing.id));

  return {
    user: {
      id: existing.id,
      email: existing.email,
      displayName: existing.displayName,
      mustChangePassword: true,
    },
    password,
  };
}
