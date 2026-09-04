import { randomBytes } from "node:crypto";
import { createUser, findUserByEmail, type User } from "../auth/users";
import type { Database } from "../db/client";

/**
 * There is no signup route. Accounts exist because someone ran this, which is
 * the whole of "invite-only" for a team of four.
 */
export async function inviteUser(
  db: Database, email: string, displayName: string,
): Promise<{ user: User; password: string }> {
  if (await findUserByEmail(db, email)) {
    throw new Error(`a user with email ${email} already exists`);
  }
  const password = randomBytes(16).toString("base64url");
  const user = await createUser(db, { email, password, displayName });
  return { user, password };
}
