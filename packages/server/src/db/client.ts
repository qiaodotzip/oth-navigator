import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

/**
 * The connection pool, with a listener for the errors it raises on its own.
 *
 * Postgres can drop an idle connection at any time: a Railway restart of the
 * database, a network blip. The pool reports that as an 'error' event, and an
 * EventEmitter with no 'error' listener throws, which would take the whole
 * server down over a connection nobody was using. The pool opens a new one on
 * the next query, so this only has to say it happened.
 */
export function createPool(
  url: string,
  log: (message: string, detail: unknown) => void = console.error,
): Pool {
  const pool = new Pool({ connectionString: url });
  // The message and code only: pg hangs the whole client off the error, and
  // printing that would be forty lines of noise in Railway's log per blip.
  pool.on("error", err => log("postgres: an idle connection failed; the pool will open a new one", {
    message: err.message,
    code: (err as { code?: unknown }).code,
  }));
  // A client a query or transaction has checked out loses the pool's listener
  // above, so the same drop mid-transaction would throw here too. Nothing to
  // log: whatever holds the client already rejects, its running query with
  // this error and its next one as "not queryable", and that rejection
  // reaches the app's onError and its log.
  pool.on("connect", client => {
    client.on("error", () => {});
  });
  return pool;
}

export async function createPostgresDb(url: string): Promise<Database> {
  return drizzlePg(createPool(url), { schema });
}
