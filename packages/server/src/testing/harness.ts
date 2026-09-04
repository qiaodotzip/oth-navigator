import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "../db/client";
import * as schema from "../db/schema";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * A fresh in-memory Postgres per call. PGlite rather than Docker so the whole
 * suite is `npm test` on any machine, Windows included.
 */
export async function createTestDb(): Promise<Database> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve(here, "../../drizzle") });
  return db as unknown as Database;
}

/**
 * Hono's `Response.json()` is typed `unknown`. Tests assert on shapes they
 * already know, so this keeps them readable without an assertion on every line.
 */
export async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
