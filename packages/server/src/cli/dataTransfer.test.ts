import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { readAsset, storeAsset } from "../assets/storage";
import { createSession } from "../auth/sessions";
import {
  auditLog, captures, keyframes, levelImages, places, publishedVersions, sessions, sightings, users,
} from "../db/schema";
import { createTestDb } from "../testing/harness";
import { exportData, ExportRefused } from "./dataExport";
import { importData, ImportRefused } from "./dataImport";
import { CARRIED_TABLES, countRows, sizeOf, unknownTables, type ExportFile } from "./dataTables";
import { inviteUser } from "./invite";
import { seedBuilding } from "./seed";

const madeDirs: string[] = [];

async function tmp(name: string) {
  const dir = await mkdtemp(join(tmpdir(), `oth-${name}-`));
  madeDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(madeDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

const VERSION = "2026-09-04T09-07-35-019Z";

/**
 * A small server's worth of the real shape: a teammate with a session, the
 * eight floors, footage on no floor with two frames, and a proposal seen in
 * one of them. One frame's row was written by the Windows laptop with
 * backslashes. The other frame and the proposal's tag were binned in the
 * same moment. There is also a scaled plan, one publish, and an audit row.
 */
async function source() {
  const db = await createTestDb();
  const dataDir = await tmp("src");
  await seedBuilding(db);
  const { user } = await inviteUser(db, "Wei");
  await createSession(db, user.id, 24);
  const binnedAt = new Date("2026-09-27T02:54:36.487Z");

  await db.insert(captures).values({ id: "cap_1", kind: "video", filename: "level 1", levelId: null });
  const a = await storeAsset(dataDir, new Uint8Array([1, 2, 3]), "jpg");
  const b = await storeAsset(dataDir, new Uint8Array([4, 5, 6, 7]), "jpg");
  await db.insert(keyframes).values([
    {
      id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", storagePath: a.storagePath,
      checksum: a.checksum, widthPx: 4, heightPx: 3, sizeBytes: 3,
    },
    {
      id: "kf_2", captureId: "cap_1", timeMs: 500, imageId: "kf_2",
      storagePath: b.storagePath.split("/").join("\\"),
      checksum: b.checksum, widthPx: 4, heightPx: 3, sizeBytes: 4, deletedAt: binnedAt,
    },
  ]);
  await db.insert(places).values({ id: "pl_1", nameEn: "Gate 1", category: "facility", status: "proposed", proposedBy: "claude-code" });
  await db.insert(sightings).values({ id: "sg_1", placeId: "pl_1", keyframeId: "kf_2", status: "proposed", deletedAt: binnedAt });

  const plan = await storeAsset(dataDir, new Uint8Array([9, 9, 9, 9, 9]), "jpg");
  await db.insert(levelImages).values({
    id: "img_1", levelId: "oth-L1", filename: "L1.jpg", storagePath: plan.storagePath,
    checksum: plan.checksum, widthPx: 3000, heightPx: 2000, sizeBytes: 5, metresPerPixel: 0.21,
  });

  await db.insert(publishedVersions).values({ id: VERSION, manifest: { checksums: {} } });
  await mkdir(join(dataDir, "published", VERSION), { recursive: true });
  await writeFile(join(dataDir, "published", VERSION, "manifest.json"), "{}");

  await db.insert(auditLog).values({
    id: "audit_1", entityType: "place", entityId: "pl_1", action: "create", actorId: user.id, after: { nameEn: "Gate 1" },
  });
  return { db, dataDir, user, binnedAt };
}

async function exported() {
  const src = await source();
  const out = join(await tmp("out"), "export");
  const result = await exportData(src.db, src.dataDir, out);
  return { src, out, result };
}

const target = async () => ({ db: await createTestDb(), dataDir: await tmp("dst") });

describe("data:export and data:import", () => {
  it("carries every row and every file to an empty server, and leaves the sign-ins behind", async () => {
    const { src, out, result } = await exported();
    expect(result.counts).toMatchObject({
      users: 1, levels: 8, captures: 1, keyframes: 2, places: 1, sightings: 1,
      level_images: 1, published_versions: 1, audit_log: 1,
    });
    expect(result.files).toBe(3);

    const dst = await target();
    const imported = await importData(dst.db, dst.dataDir, out);
    expect(imported.counts).toEqual(result.counts);
    expect(imported.files).toEqual({ copied: 3, alreadyThere: 0 });
    expect(await dst.db.select().from(sessions)).toEqual([]);

    // The frame the laptop wrote with backslashes reads back on any system.
    const [kf] = await dst.db.select().from(keyframes).where(eq(keyframes.id, "kf_2"));
    expect(kf!.storagePath).not.toContain("\\");
    expect(Array.from(await readAsset(dst.dataDir, kf!.storagePath))).toEqual([4, 5, 6, 7]);

    // Binned in one moment, still one moment: Undo finds the frame and its tag together.
    const [sg] = await dst.db.select().from(sightings).where(eq(sightings.id, "sg_1"));
    expect(kf!.deletedAt?.toISOString()).toBe(src.binnedAt.toISOString());
    expect(sg!.deletedAt?.toISOString()).toBe(src.binnedAt.toISOString());

    // Plans keep their scale, publishes their bundles, and people their ids.
    const [img] = await dst.db.select().from(levelImages);
    expect(img!.metresPerPixel).toBe(0.21);
    expect(await readFile(join(dst.dataDir, "published", VERSION, "manifest.json"), "utf8")).toBe("{}");
    const [person] = await dst.db.select().from(users);
    expect(person!.id).toBe(src.user.id);
  }, 60_000);

  it("leaves files where they already are, as when they were uploaded straight into the data folder", async () => {
    const { out } = await exported();
    const db = await createTestDb();
    const r = await importData(db, out, out);
    expect(r.files).toEqual({ copied: 0, alreadyThere: 3 });
  }, 60_000);

  it("reports footage on no floor, and files it under the floor asked for, on the record", async () => {
    const { out } = await exported();

    const plain = await target();
    expect((await importData(plain.db, plain.dataDir, out)).unfiled).toEqual(["level 1"]);

    const dst = await target();
    const r = await importData(dst.db, dst.dataDir, out, { fileUnder: "L1" });
    expect(r.filed).toEqual(["level 1"]);
    expect(r.unfiled).toEqual([]);
    const [cap] = await dst.db.select().from(captures);
    expect(cap).toMatchObject({ levelId: "oth-L1", version: 1 });
    const trail = await dst.db.select().from(auditLog).where(eq(auditLog.entityId, "cap_1"));
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({ entityType: "capture", action: "update", actorId: null });
  }, 60_000);

  it("files nothing, and says so in what it returns, when all the footage already has a floor", async () => {
    const { out } = await exported();
    const path = join(out, "export.json");
    const doc = JSON.parse(await readFile(path, "utf8")) as ExportFile;
    // As on the real data: someone pressed File under L1 before the export.
    doc.tables.captures[0]!.level_id = "oth-L1";
    await writeFile(path, JSON.stringify(doc));

    const dst = await target();
    const r = await importData(dst.db, dst.dataDir, out, { fileUnder: "L1" });
    expect(r).toMatchObject({ filed: [], unfiled: [] });
    const [cap] = await dst.db.select().from(captures);
    expect(cap).toMatchObject({ levelId: "oth-L1", version: 0 });
    expect(await dst.db.select().from(auditLog).where(eq(auditLog.entityId, "cap_1"))).toEqual([]);
  }, 60_000);

  it("refuses a database that already has data, and adds nothing to it", async () => {
    const { out } = await exported();
    const dst = await target();
    await importData(dst.db, dst.dataDir, out);
    await expect(importData(dst.db, dst.dataDir, out)).rejects.toThrow(/already has data/);
    expect(await dst.db.select().from(places)).toHaveLength(1);
  }, 60_000);

  it("refuses when a file is missing, before writing a row or a file", async () => {
    const { src, out } = await exported();
    const [kf] = await src.db.select().from(keyframes).where(eq(keyframes.id, "kf_1"));
    await rm(join(out, kf!.storagePath));
    const dst = await target();
    await expect(importData(dst.db, dst.dataDir, out)).rejects.toBeInstanceOf(ImportRefused);
    expect(await dst.db.select().from(users)).toEqual([]);
    expect(await sizeOf(join(dst.dataDir, "assets"))).toBeNull();
  }, 60_000);

  it("refuses a file whose bytes aren't the ones its row's checksum names, and says which", async () => {
    const { src, out } = await exported();
    const [kf] = await src.db.select().from(keyframes).where(eq(keyframes.id, "kf_1"));
    // The right size and the wrong bytes, as a torn or mixed-up upload leaves it.
    await writeFile(join(out, kf!.storagePath), new Uint8Array([3, 2, 1]));
    const dst = await target();
    // Copied from the export, or already in the data folder after an upload
    // straight into the volume: checked either way.
    for (const dataDir of [dst.dataDir, out]) {
      const err = await importData(dst.db, dataDir, out).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ImportRefused);
      expect((err as Error).message).toContain(kf!.storagePath);
    }
    expect(await dst.db.select().from(users)).toEqual([]);
    expect(await sizeOf(join(dst.dataDir, "assets"))).toBeNull();
  }, 60_000);

  it("refuses a publish whose bundle folder isn't there, before writing a row or a file", async () => {
    const { out } = await exported();
    await rm(join(out, "published", VERSION), { recursive: true });
    const dst = await target();
    const err = await importData(dst.db, dst.dataDir, out).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportRefused);
    expect((err as Error).message).toContain(VERSION);
    expect(await dst.db.select().from(users)).toEqual([]);
    expect(await sizeOf(join(dst.dataDir, "assets"))).toBeNull();
  }, 60_000);

  it("refuses a file path that leads out of the data folder, before writing a row or a file", async () => {
    const { out } = await exported();
    const path = join(out, "export.json");
    const doc = JSON.parse(await readFile(path, "utf8")) as ExportFile;
    // An export.json edited by hand, or not from data:export at all: the
    // frame's file sits beside the export folder, and would land beside the
    // new server's data folder.
    doc.tables.keyframes[0]!.storage_path = "../escaped.jpg";
    await writeFile(path, JSON.stringify(doc));
    await writeFile(join(out, "..", "escaped.jpg"), new Uint8Array([1, 2, 3]));

    const root = await tmp("dst");
    const dst = { db: await createTestDb(), dataDir: join(root, "data") };
    const err = await importData(dst.db, dst.dataDir, out).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportRefused);
    expect((err as Error).message).toContain('"../escaped.jpg"');
    expect(await dst.db.select().from(users)).toEqual([]);
    expect(await sizeOf(join(root, "escaped.jpg"))).toBeNull();
    expect(await sizeOf(join(dst.dataDir, "assets"))).toBeNull();
  }, 60_000);

  it("writes no row at all when one fails part-way, and a re-run finds the files it already placed", async () => {
    const { out } = await exported();
    const path = join(out, "export.json");
    const good = await readFile(path, "utf8");
    // Two frames with one id: users, floors and footage are in by the time
    // the keyframes insert fails, so only the transaction can take them back.
    const doc = JSON.parse(good) as ExportFile;
    doc.tables.keyframes.push(doc.tables.keyframes[0]!);
    await writeFile(path, JSON.stringify(doc));

    const dst = await target();
    await expect(importData(dst.db, dst.dataDir, out)).rejects.toThrow(/duplicate key/);
    expect(await dst.db.select().from(users)).toEqual([]);
    expect(await countRows(dst.db)).toEqual(Object.fromEntries(CARRIED_TABLES.map(t => [t, 0])));

    // The files went into place before the transaction, so the rollback
    // leaves them. Once the export is put right, the next run uses them.
    await writeFile(path, good);
    const r = await importData(dst.db, dst.dataDir, out);
    expect(r.files).toEqual({ copied: 0, alreadyThere: 3 });
    expect(r.counts.users).toBe(1);
  }, 60_000);

  it("refuses a floor that isn't there for --file-under, and imports nothing", async () => {
    const { out } = await exported();
    const dst = await target();
    await expect(importData(dst.db, dst.dataDir, out, { fileUnder: "L9" })).rejects.toThrow(/no floor L9/);
    expect(await dst.db.select().from(users)).toEqual([]);
  }, 60_000);

  it("refuses an export made at a different migration", async () => {
    const { out } = await exported();
    const path = join(out, "export.json");
    const doc = JSON.parse(await readFile(path, "utf8")) as { migrations: number };
    doc.migrations -= 1;
    await writeFile(path, JSON.stringify(doc));
    const dst = await target();
    await expect(importData(dst.db, dst.dataDir, out)).rejects.toThrow(/migration/);
  }, 60_000);

  it("will not export into a folder that already has files", async () => {
    const src = await source();
    const out = await tmp("busy");
    await writeFile(join(out, "note.txt"), "x");
    await expect(exportData(src.db, src.dataDir, out)).rejects.toBeInstanceOf(ExportRefused);
  }, 60_000);

  it("exports nothing from a data folder with no team and no floors, and says what to check", async () => {
    // A mistyped DATA_DIR opens a new, empty database there rather than failing.
    const dataDir = await tmp("typo");
    const out = join(await tmp("out"), "export");
    const err = await exportData(await createTestDb(), dataDir, out).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExportRefused);
    expect((err as Error).message).toBe(`Nothing to export from ${dataDir}: check DATA_DIR points at the data folder.`);
    expect(await sizeOf(out)).toBeNull();
  }, 60_000);

  it("will not export when a row names a file that isn't there", async () => {
    const src = await source();
    const [kf] = await src.db.select().from(keyframes).where(eq(keyframes.id, "kf_1"));
    await rm(join(src.dataDir, kf!.storagePath));
    await expect(exportData(src.db, src.dataDir, join(await tmp("out"), "export"))).rejects.toThrow(/not in/);
  }, 60_000);

  it("knows every table in the schema, carried or left behind", async () => {
    expect(await unknownTables(await createTestDb())).toEqual([]);
  });
});
