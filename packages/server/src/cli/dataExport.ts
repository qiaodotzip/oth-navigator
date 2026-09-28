import { copyFile, cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { sql } from "drizzle-orm";
import { assetFile } from "../assets/storage";
import type { Database } from "../db/client";
import {
  CARRIED_TABLES, EXPORT_FORMAT, EXPORT_VERSION, FILE_TABLES,
  migrationCount, portablePath, sizeOf, unknownTablesProblem,
  type Counts, type ExportFile, type TableName,
} from "./dataTables";

export class ExportRefused extends Error {
  override name = "ExportRefused";
}

async function emptyOrMissing(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length === 0;
  } catch {
    return true;
  }
}

/**
 * Writes one server's model to a folder laid out like a data folder:
 * `export.json` beside `assets/` and `published/`. That covers every carried
 * row, and every file those rows name. data:import reads it into another
 * server (spec §13).
 *
 * Run it against a copy of a PGlite data folder, never one a running server
 * holds. Every file is checked for being there, at the size its row records,
 * before anything is written.
 */
export async function exportData(
  db: Database, dataDir: string, outDir: string,
): Promise<{ dir: string; counts: Counts; files: number; bytes: number }> {
  const dir = resolve(outDir);
  if (!(await emptyOrMissing(dir))) {
    throw new ExportRefused(`${dir} already has files in it. Export into a new, empty folder.`);
  }
  const problem = await unknownTablesProblem(db, "data:export");
  if (problem) throw new ExportRefused(problem);

  const tables = {} as Record<TableName, Record<string, unknown>[]>;
  for (const table of CARRIED_TABLES) {
    const { rows } = await db.execute(sql`select * from ${sql.identifier(table)}`);
    tables[table] = rows as Record<string, unknown>[];
  }
  // A mistyped DATA_DIR opens a new, empty database there instead of failing,
  // and an empty export would then import "successfully" on the new server.
  if (tables.users.length === 0 && tables.levels.length === 0) {
    throw new ExportRefused(`Nothing to export from ${resolve(dataDir)}: check DATA_DIR points at the data folder.`);
  }

  // Each file once, however many rows name it, and with forward slashes in
  // the rows from here on, so the new server finds it on Linux.
  const sizes = new Map<string, number>();
  for (const table of FILE_TABLES) {
    for (const row of tables[table]) {
      const path = portablePath(String(row.storage_path));
      row.storage_path = path;
      sizes.set(path, Number(row.size_bytes));
    }
  }

  const wrong: string[] = [];
  for (const [path, size] of sizes) {
    if ((await sizeOf(assetFile(dataDir, path))) !== size) wrong.push(path);
  }
  if (wrong.length > 0) {
    throw new ExportRefused(
      `${wrong.length} file(s) the rows name are not in ${dataDir} at the size recorded, ` +
        `e.g. ${wrong.slice(0, 3).join(", ")}. Copy the whole data folder, assets included, and export again.`,
    );
  }

  await mkdir(dir, { recursive: true });
  let bytes = 0;
  for (const [path, size] of sizes) {
    const target = assetFile(dir, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(assetFile(dataDir, path), target);
    bytes += size;
  }
  // The published bundles are files that published_versions rows point at by version.
  if ((await sizeOf(join(dataDir, "published"))) !== null) {
    await cp(join(dataDir, "published"), join(dir, "published"), { recursive: true });
  }

  const counts = Object.fromEntries(CARRIED_TABLES.map(t => [t, tables[t].length])) as Counts;
  const file: ExportFile = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    migrations: await migrationCount(db),
    counts,
    files: sizes.size,
    tables,
  };
  await writeFile(join(dir, "export.json"), JSON.stringify(file), "utf8");
  return { dir, counts, files: sizes.size, bytes };
}
