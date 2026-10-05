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
 * Why the database refused a query, in its own words.
 *
 * Since drizzle 0.45 a failed query throws with the SQL and its parameters in
 * the message and the database's error as the `cause`, so a test that wants
 * Postgres's words — a constraint's name, "duplicate key" — reads the whole
 * chain here rather than the message it is handed.
 */
export async function whyRejected(query: PromiseLike<unknown>): Promise<string> {
  try {
    await query;
  } catch (err) {
    const words: string[] = [];
    // A cause that leads back to itself would otherwise loop forever.
    const seen = new Set<unknown>();
    for (let e: unknown = err; e != null && !seen.has(e); e = (e as { cause?: unknown }).cause) {
      seen.add(e);
      words.push(String((e as { message?: unknown }).message ?? e));
    }
    return words.join("\n");
  }
  throw new Error("the query was expected to be rejected, and it was not");
}

/**
 * Hono's `Response.json()` is typed `unknown`. Tests assert on shapes they
 * already know, so this keeps them readable without an assertion on every line.
 */
export async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
