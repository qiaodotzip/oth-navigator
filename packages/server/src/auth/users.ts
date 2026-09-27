import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import { hashPassword } from "./password";

export type User = {
  id: string;
  email: string;
  displayName: string;
  /** True while the account is on a one-time password from an invite or reset. */
  mustChangePassword: boolean;
};

export type CreateUserInput = {
  email: string;
  password: string;
  displayName: string;
  invitedBy?: string;
  mustChangePassword?: boolean;
};

/** Invite-only: there is no self-service signup route anywhere in this server. */
export async function createUser(db: Database, input: CreateUserInput): Promise<User> {
  const id = `user_${randomUUID()}`;
  const email = input.email.toLowerCase().trim();
  const mustChangePassword = input.mustChangePassword ?? false;
  await db.insert(users).values({
    id,
    email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    invitedBy: input.invitedBy ?? null,
    mustChangePassword,
  });
  return { id, email, displayName: input.displayName, mustChangePassword };
}

export async function findUserByEmail(db: Database, email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  return rows[0] ?? null;
}
