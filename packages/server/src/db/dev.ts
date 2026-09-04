import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "./client";
import * as schema from "./schema";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * A file-backed PGlite database for local development.
 *
 * Without this, running the editor locally means installing and configuring
 * Postgres first. PGlite is the same engine the tests already use, so `npm run
 * dev` works on a fresh clone with nothing installed. Never used in production —
 * the entry point requires DATABASE_URL there.
 */
export async function createDevDb(dataDir: string): Promise<Database> {
  const path = join(dataDir, "dev-db");
  await mkdir(dataDir, { recursive: true });
  const client = new PGlite(path);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve(here, "../../drizzle") });
  return db as unknown as Database;
}
