import { stat } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

/**
 * Every table data:export carries, in the order data:import writes them.
 * People come first, so the one foreign key (a session's user) and every
 * owner, author and audit actor resolve. Soft-deleted rows go too: Undo and
 * restore need them.
 */
export const CARRIED_TABLES = [
  "users",
  "buildings", "levels", "rooms", "doorways", "entrances", "portals", "portal_endpoints", "nav_hints",
  "pathway_kinds", "pathways", "assets", "object_kinds", "placements", "tenants", "level_images", "plan_pdfs", "room_drafts",
  "floor_setup",
  "captures", "keyframes", "places", "sightings",
  "published_versions", "audit_log",
] as const;

/**
 * Left behind on purpose: sign-ins, advisory locks and Claude Code tokens
 * belong to the server they were made on. A token made against a laptop's
 * server is no key to Railway's.
 */
export const LEFT_BEHIND = ["sessions", "entity_locks", "api_tokens"] as const;

/** Tables whose rows name a file under the data folder, in `storage_path`, with its `size_bytes`. */
export const FILE_TABLES = ["assets", "level_images", "keyframes", "plan_pdfs"] as const;

export type TableName = (typeof CARRIED_TABLES)[number];
export type Counts = Record<TableName, number>;

export const EXPORT_FORMAT = "oth-data-export";
export const EXPORT_VERSION = 1;

/** `export.json`: the rows as the database gave them, raw, with what to check them against. */
export type ExportFile = {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  migrations: number;
  counts: Counts;
  files: number;
  tables: Record<TableName, Record<string, unknown>[]>;
};

/**
 * Tables in the schema that neither list mentions. A migration that adds one
 * stops both commands until someone decides whether it is carried, rather
 * than letting it be left behind unnoticed.
 */
export async function unknownTables(db: Database): Promise<string[]> {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  const known = new Set<string>([...CARRIED_TABLES, ...LEFT_BEHIND]);
  return rows.map(r => r.tablename).filter(t => !known.has(t));
}

/**
 * Why this command must not run, or null when it may: the one refusal both
 * commands give for a table neither list mentions. Each throws it as its own
 * kind of refusal.
 */
export async function unknownTablesProblem(
  db: Database, command: "data:export" | "data:import",
): Promise<string | null> {
  const unknown = await unknownTables(db);
  if (unknown.length === 0) return null;
  return `${command} doesn't know the table(s) ${unknown.join(", ")}. ` +
    "Add each to CARRIED_TABLES or LEFT_BEHIND in cli/dataTables.ts.";
}

export async function countRows(db: Database): Promise<Counts> {
  const counts = {} as Counts;
  for (const table of CARRIED_TABLES) {
    const { rows } = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(table)}`,
    );
    counts[table] = rows[0]?.n ?? 0;
  }
  return counts;
}

/** How far the schema has come: an export fits only a database at the same point. */
export async function migrationCount(db: Database): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
  );
  return rows[0]?.n ?? 0;
}

/** Forward slashes, whatever wrote it: the Windows laptop wrote `assets\ab\….jpg`. */
export function portablePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * A file's size, or null when nothing is there. Both commands check every
 * file against the size its row records, since a copy taken while a file
 * was being written has the name but not all of the bytes.
 */
export async function sizeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}
