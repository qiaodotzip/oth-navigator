import { createHash } from "node:crypto";
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

/** What the rows say a file is: its size, and the sha256 `storeAsset` recorded as its checksum. */
type Wanted = { size: number; checksums: Set<string> };

/**
 * Whether the file at this path is the one its rows describe. Size first,
 * which is cheap, then the bytes: an upload torn or mixed up on the way can
 * be the right size and still the wrong file.
 */
async function inspectFile(path: string, want: Wanted): Promise<"ok" | "missing" | "altered"> {
  if ((await sizeOf(path)) !== want.size) return "missing";
  if (want.checksums.size === 0) return "ok";
  const hash = createHash("sha256").update(await readFile(path)).digest("hex");
  return [...want.checksums].every(c => c === hash) ? "ok" : "altered";
}

/**
 * Every file the rows name, in the data folder at its recorded size and
 * checksum. A file already there is left alone, which is the case when the
 * export was uploaded straight into the volume. Anything missing or altered
 * refuses the import before a file is copied or a row is written, and so
 * does a path that `assetFile` refuses as not a plain one inside a data
 * folder: an export.json edited by hand, or not from data:export, could
 * otherwise write anywhere.
 *
 * The files are placed before the rows' transaction, which cannot take them
 * back, so an import that fails part-way leaves them behind. That is
 * harmless: they are named by their content, no row points at them yet, and
 * the next run finds them here and counts them as already there.
 */
async function placeFiles(file: ExportFile, from: string, dataDir: string) {
  // Each file once, however many rows name it; every row's checksum must hold.
  const wanted = new Map<string, Wanted>();
  for (const table of FILE_TABLES) {
    for (const row of file.tables[table] ?? []) {
      const path = String(row.storage_path);
      const want = wanted.get(path) ?? { size: Number(row.size_bytes), checksums: new Set<string>() };
      if (typeof row.checksum === "string" && row.checksum) want.checksums.add(row.checksum);
      wanted.set(path, want);
    }
  }
  const toCopy: { source: string; target: string }[] = [];
  const missing: string[] = [];
  const altered: string[] = [];
  const unsafe: string[] = [];
  let alreadyThere = 0;
  for (const [path, want] of wanted) {
    let target: string;
    let source: string;
    try {
      target = assetFile(dataDir, path);
      source = assetFile(from, path);
    } catch {
      unsafe.push(JSON.stringify(path));
      continue;
    }
    const here = await inspectFile(target, want);
    if (here === "ok") {
      alreadyThere += 1;
      continue;
    }
    const there = await inspectFile(source, want);
    if (there === "ok") toCopy.push({ source, target });
    else if (here === "altered" || there === "altered") altered.push(path);
    else missing.push(path);
  }
  if (unsafe.length > 0) {
    throw new ImportRefused(
      `export.json names ${unsafe.length} file(s) by a path that isn't a plain one inside the data folder, ` +
        `e.g. ${unsafe.slice(0, 3).join(", ")}. Nothing was imported. Import a folder data:export wrote, unedited.`,
    );
  }
  if (altered.length > 0) {
    throw new ImportRefused(
      `${altered.length} file(s) are the right size but not the bytes their rows' checksum records, ` +
        `e.g. ${altered.slice(0, 3).join(", ")}. Nothing was imported. ` +
        "Copy or upload the export again, or export again from a fresh copy of the data folder.",
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
 * Publishes whose bundle folder is in neither the data folder nor the
 * export. Their rows would list a version the app has nothing to serve for.
 */
async function missingBundles(file: ExportFile, from: string, dataDir: string): Promise<string[]> {
  const missing: string[] = [];
  for (const row of file.tables.published_versions ?? []) {
    const id = String(row.id);
    let found = false;
    try {
      found = (await sizeOf(assetFile(dataDir, `published/${id}`))) !== null ||
        (await sizeOf(assetFile(from, `published/${id}`))) !== null;
    } catch {
      // An id that isn't a plain folder name has no folder to find.
    }
    if (!found) missing.push(id);
  }
  return missing;
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
 * a row in it stops it. Before it writes anything, every file must match
 * its row's size and checksum, and every publish must have its bundle
 * folder, since a move by upload can go wrong without a word. Every row
 * goes in one transaction, and the counts are checked against the export's
 * inside that transaction, so the database gets all of it or none of it
 * (spec §16).
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
  const noBundle = await missingBundles(file, from, dataDir);
  if (noBundle.length > 0) {
    throw new ImportRefused(
      `${noBundle.length} published version(s) have no folder under published/ in ${from} or ${dataDir}, ` +
        `e.g. ${noBundle.slice(0, 3).join(", ")}. Nothing was imported. Copy published/ along with the export.`,
    );
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
