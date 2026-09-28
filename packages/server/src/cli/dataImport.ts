import { copyFile, cp, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { and, eq, isNull, sql } from "drizzle-orm";
import { assetFile } from "../assets/storage";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { captures, levels } from "../db/schema";
import { recordAudit } from "../entities/repository";
import {
  CARRIED_TABLES, EXPORT_FORMAT, EXPORT_VERSION, FILE_TABLES,
  countRows, migrationCount, sizeOf, unknownTablesProblem,
  type Counts, type ExportFile,
} from "./dataTables";

export class ImportRefused extends Error {
  override name = "ImportRefused";
}

/** Rows per statement: well inside any parameter limit, and few round trips. */
const CHUNK = 500;

/**
 * Every file the rows name, in the data folder at its recorded size. A file
 * already there is left alone, which is the case when the export was
 * uploaded straight into the volume. Anything missing refuses the import
 * before a file is copied or a row is written, and so does a path that
 * `assetFile` refuses as not a plain one inside a data folder: an
 * export.json edited by hand, or not from data:export, could otherwise
 * write anywhere.
 *
 * The files are placed before the rows' transaction, which cannot take them
 * back, so an import that fails part-way leaves them behind. That is
 * harmless: they are named by their content, no row points at them yet, and
 * the next run finds them here and counts them as already there.
 */
async function placeFiles(file: ExportFile, from: string, dataDir: string) {
  const sizes = new Map<string, number>();
  for (const table of FILE_TABLES) {
    for (const row of file.tables[table] ?? []) sizes.set(String(row.storage_path), Number(row.size_bytes));
  }
  const toCopy: { source: string; target: string }[] = [];
  const missing: string[] = [];
  const unsafe: string[] = [];
  let alreadyThere = 0;
  for (const [path, size] of sizes) {
    let target: string;
    let source: string;
    try {
      target = assetFile(dataDir, path);
      source = assetFile(from, path);
    } catch {
      unsafe.push(JSON.stringify(path));
      continue;
    }
    if ((await sizeOf(target)) === size) alreadyThere += 1;
    else if ((await sizeOf(source)) === size) toCopy.push({ source, target });
    else missing.push(path);
  }
  if (unsafe.length > 0) {
    throw new ImportRefused(
      `export.json names ${unsafe.length} file(s) by a path that isn't a plain one inside the data folder, ` +
        `e.g. ${unsafe.slice(0, 3).join(", ")}. Nothing was imported. Import a folder data:export wrote, unedited.`,
    );
  }
  if (missing.length > 0) {
    throw new ImportRefused(
      `${missing.length} file(s) are neither in ${dataDir} nor in ${from} at the size their rows record, ` +
        `e.g. ${missing.slice(0, 3).join(", ")}. Nothing was imported.`,
    );
  }
  for (const { source, target } of toCopy) {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  return { copied: toCopy.length, alreadyThere };
}

/**
 * Files every live capture that has no floor under the floor with this code,
 * as Survey's "File under" button would: a version on, and on the record.
 */
async function fileUnfiled(tx: Database, code: string): Promise<string[]> {
  const [level] = await tx.select().from(levels).where(and(eq(levels.code, code), isNull(levels.deletedAt)));
  if (!level) throw new ImportRefused(`There is no floor ${code} in this export. Nothing was imported.`);
  const waiting = await tx.select().from(captures).where(and(isNull(captures.levelId), isNull(captures.deletedAt)));
  for (const before of waiting) {
    const [after] = await tx.update(captures)
      .set({ levelId: level.id, version: before.version + 1, updatedAt: new Date(), updatedBy: null })
      .where(eq(captures.id, before.id))
      .returning();
    await recordAudit(tx, "capture", before.id, "update", null, before as Row, (after ?? null) as Row | null);
  }
  return waiting.map(c => c.filename);
}

/**
 * Reads a data:export folder into this server's empty database and data
 * folder (spec §13). It refuses rather than merges: any carried table with
 * a row in it stops it. Every row goes in one transaction, and the counts
 * are checked against the export's inside that transaction, so the database
 * gets all of it or none of it (spec §16).
 *
 * The files, `published/` included, are copied before that transaction, so
 * a rollback leaves them in the data folder while the database stays empty.
 * Put right whatever stopped it and run it again: it finds them there and
 * carries on.
 */
export async function importData(
  db: Database, dataDir: string, fromDir: string, options: { fileUnder?: string } = {},
): Promise<{ counts: Counts; files: { copied: number; alreadyThere: number }; filed: string[]; unfiled: string[] }> {
  const from = resolve(fromDir);
  let file: ExportFile;
  try {
    file = JSON.parse(await readFile(join(from, "export.json"), "utf8")) as ExportFile;
  } catch {
    throw new ImportRefused(`${from} has no readable export.json. Point data:import at the folder data:export wrote.`);
  }
  if (file.format !== EXPORT_FORMAT || file.version !== EXPORT_VERSION) {
    throw new ImportRefused(`${join(from, "export.json")} isn't a data:export file this version reads.`);
  }

  const problem = await unknownTablesProblem(db, "data:import");
  if (problem) throw new ImportRefused(problem);
  const migrations = await migrationCount(db);
  if (migrations !== file.migrations) {
    throw new ImportRefused(
      `The export was made at migration ${file.migrations}, and this database is at ${migrations}. ` +
        "Export and import with the same version of the app.",
    );
  }
  const before = await countRows(db);
  const occupied = CARRIED_TABLES.filter(t => before[t] > 0);
  if (occupied.length > 0) {
    throw new ImportRefused(
      `This database already has data (${occupied.map(t => `${t}: ${before[t]}`).join(", ")}). ` +
        "data:import only fills an empty database; it never merges.",
    );
  }
  const code = options.fileUnder;
  if (code && !(file.tables.levels ?? []).some(l => l.code === code && l.deleted_at == null)) {
    throw new ImportRefused(`There is no floor ${code} in this export. Nothing was imported.`);
  }

  // Files first, outside the transaction; see the note above.
  const files = await placeFiles(file, from, dataDir);
  if (resolve(from) !== resolve(dataDir) && (await sizeOf(join(from, "published"))) !== null) {
    await cp(join(from, "published"), join(dataDir, "published"), { recursive: true, force: false });
  }

  const done = await db.transaction(async t => {
    const tx = t as unknown as Database;
    for (const table of CARRIED_TABLES) {
      const rows = file.tables[table] ?? [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = JSON.stringify(rows.slice(i, i + CHUNK));
        await tx.execute(
          sql`insert into ${sql.identifier(table)} select * from json_populate_recordset(null::${sql.identifier(table)}, ${chunk}::json)`,
        );
      }
    }
    const counts = await countRows(tx);
    const short = CARRIED_TABLES.filter(t => counts[t] !== file.counts[t]);
    if (short.length > 0) {
      throw new ImportRefused(
        `The counts differ from the export's for ${short.map(t => `${t} (${counts[t]} of ${file.counts[t]})`).join(", ")}. ` +
          "Nothing was imported.",
      );
    }
    const filed = code ? await fileUnfiled(tx, code) : [];
    const unfiled = (await tx.select({ filename: captures.filename }).from(captures)
      .where(and(isNull(captures.levelId), isNull(captures.deletedAt)))).map(c => c.filename);
    return { counts, filed, unfiled };
  });

  return { ...done, files };
}
