import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import { hashPassword } from "./password";

export type User = {
  id: string;
  email: string;
  displayName: string;
};

export type CreateUserInput = {
  email: string;
  password: string;
  displayName: string;
  invitedBy?: string;
};

/** Invite-only: there is no self-service signup route anywhere in this server. */
export async function createUser(db: Database, input: CreateUserInput): Promise<User> {
  const id = `user_${randomUUID()}`;
  const email = input.email.toLowerCase().trim();
  await db.insert(users).values({
    id,
    email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    invitedBy: input.invitedBy ?? null,
  });
  return { id, email, displayName: input.displayName };
}

export async function findUserByEmail(db: Database, email: string) {
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  return rows[0] ?? null;
}
