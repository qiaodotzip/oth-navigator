import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomSchema } from "@oth/model";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { levelImages, rooms } from "../db/schema";
import { createTestDb } from "../testing/harness";
import { L1_PLAN, importL1Plan, readSpaces } from "./planL1";

let db: Database;
let dataDir: string;
let imagesDir: string;
let file: string;

const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

const SPACES = {
  levelId: "oth-L1",
  spaces: [
    { id: "L1-media-room", nameEn: "Media Room", kind: "room", areaM2: 24.3,
      footprint: [[124, 113], [129.7, 113], [129.7, 108], [124, 108]], holes: [] },
    { id: "L1-hallway-1", nameEn: "Hallway 1 Stadium", kind: "area", areaM2: 60,
      footprint: [[130, 165], [134, 165], [134, 155], [130, 155]], holes: [] },
    { id: "L1-store", nameEn: "Store", kind: "service", areaM2: 6.7,
      footprint: [[131, 79], [133, 79], [133, 77], [131, 77]], holes: [] },
  ],
};

beforeEach(async () => {
  db = await createTestDb();
  dataDir = await mkdtemp(join(tmpdir(), "oth-plan-data-"));
  imagesDir = await mkdtemp(join(tmpdir(), "oth-plan-img-"));
  await writeFile(join(imagesDir, L1_PLAN.file), jpg);
  file = join(imagesDir, "spaces.json");
  await writeFile(file, JSON.stringify(SPACES), "utf8");
});

describe("plan:l1", () => {
  it("seeds every space on the sheet", async () => {
    const r = await importL1Plan(db, dataDir, { imagesDir, file });
    expect(r.spaces).toBe(3);
    const all = await db.select().from(rooms);
    expect(all).toHaveLength(3);
  });

  it("makes an area walkable and leaves a service space alone", async () => {
    await importL1Plan(db, dataDir, { imagesDir, file });
    const [hall] = await db.select().from(rooms).where(eq(rooms.id, "L1-hallway-1"));
    const [store] = await db.select().from(rooms).where(eq(rooms.id, "L1-store"));
    expect(hall?.walkable).toBe(true);
    expect(store?.walkable).toBe(false);
  });

  it("calls the result unverified, because nobody has stood in it", async () => {
    await importL1Plan(db, dataDir, { imagesDir, file });
    const [room] = await db.select().from(rooms).where(eq(rooms.id, "L1-media-room"));
    expect(room?.verification).toEqual({ status: "unverified", evidence: [] });
  });

  it("leaves a space someone has already edited alone", async () => {
    await importL1Plan(db, dataDir, { imagesDir, file });
    await db.update(rooms).set({ nameEn: "Press Room" }).where(eq(rooms.id, "L1-media-room"));
    const again = await importL1Plan(db, dataDir, { imagesDir, file });
    expect(again.spaces).toBe(0);
    expect(again.skipped).toBe(3);
    const [room] = await db.select().from(rooms).where(eq(rooms.id, "L1-media-room"));
    expect(room?.nameEn).toBe("Press Room");
  });

  it("hangs the drawing at the scale the drawing states", async () => {
    const r = await importL1Plan(db, dataDir, { imagesDir, file });
    expect(r.underlay).toBe("added");
    const [img] = await db.select().from(levelImages);
    expect(img?.metresPerPixel).toBe(0.07);
    expect(img?.offsetX).toBe(-25);
    expect(img?.offsetY).toBe(300);
  });

  it("does not touch an underlay that already agrees", async () => {
    await importL1Plan(db, dataDir, { imagesDir, file });
    const [before] = await db.select().from(levelImages);
    const again = await importL1Plan(db, dataDir, { imagesDir, file });
    expect(again.underlay).toBe("unchanged");
    const [after] = await db.select().from(levelImages);
    expect(after?.version).toBe(before?.version);
  });

  it("corrects an underlay whose calibration has drifted", async () => {
    await importL1Plan(db, dataDir, { imagesDir, file });
    await db.update(levelImages).set({ metresPerPixel: 0.21 });
    const again = await importL1Plan(db, dataDir, { imagesDir, file });
    expect(again.underlay).toBe("recalibrated");
    const [img] = await db.select().from(levelImages);
    expect(img?.metresPerPixel).toBe(0.07);
  });

  it("still seeds the spaces when the raster is not on disk", async () => {
    const r = await importL1Plan(db, dataDir, { imagesDir: dataDir, file });
    expect(r.underlay).toBe("missing");
    expect(r.spaces).toBe(3);
  });
});

describe("the extracted 1st storey", () => {
  it("is a model the schema accepts, space by space", async () => {
    const { spaces } = await readSpaces();
    expect(spaces.length).toBeGreaterThan(100);
    for (const s of spaces) {
      expect(() => RoomSchema.parse({
        id: s.id, levelId: "oth-L1", kind: s.kind, footprint: s.footprint,
        holes: s.holes, heightM: 4.5, nameEn: s.nameEn,
      })).not.toThrow();
    }
  });

  it("gives every space its own id", async () => {
    const { spaces } = await readSpaces();
    const ids = spaces.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lands every space inside the site, not somewhere in the car park", async () => {
    // The sheet covers roughly 305 x 280 m from the model origin; a footprint
    // outside that means the registration slipped.
    const { spaces } = await readSpaces();
    for (const s of spaces) {
      for (const [x, y] of s.footprint) {
        expect(x).toBeGreaterThan(-25);
        expect(x).toBeLessThan(280);
        expect(y).toBeGreaterThan(20);
        expect(y).toBeLessThan(300);
      }
    }
  });

  it("finds the rooms the walkthrough went past", async () => {
    const { spaces } = await readSpaces();
    const names = spaces.map(s => s.nameEn.toLowerCase());
    for (const want of ["media room", "first aid", "community dance studio 1"]) {
      expect(names).toContain(want);
    }
    expect(names.filter(n => n === "stall").length).toBeGreaterThan(30);
  });

  it("keeps each footprint the size the drawing says it is", async () => {
    const { spaces } = await readSpaces();
    for (const s of spaces) {
      const xs = s.footprint.map(p => p[0]!);
      const ys = s.footprint.map(p => p[1]!);
      const box = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      // A polygon cannot be bigger than its own bounding box, and a room that
      // fills under a fiftieth of one is a sliver the tracing got wrong.
      expect(s.areaM2).toBeLessThanOrEqual(box + 1);
      expect(s.areaM2).toBeGreaterThan(box / 50);
    }
  });
});
