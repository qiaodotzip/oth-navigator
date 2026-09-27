import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomSchema } from "@oth/model";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { levelImages, levels, rooms } from "../db/schema";
import { createTestDb } from "../testing/harness";
import { captures, keyframes, places, sightings } from "../db/schema";
import { L1_PLAN, WALKTHROUGH_FEATURES, importL1Plan, readSpaces } from "./planL1";

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
    const r = await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    expect(r.spaces).toBe(3);
    const all = await db.select().from(rooms);
    expect(all).toHaveLength(3);
  });

  it("makes an area walkable and leaves a service space alone", async () => {
    await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    const [hall] = await db.select().from(rooms).where(eq(rooms.id, "L1-hallway-1"));
    const [store] = await db.select().from(rooms).where(eq(rooms.id, "L1-store"));
    expect(hall?.walkable).toBe(true);
    expect(store?.walkable).toBe(false);
  });

  it("calls the result unverified, because nobody has stood in it", async () => {
    await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    const [room] = await db.select().from(rooms).where(eq(rooms.id, "L1-media-room"));
    expect(room?.verification).toEqual({ status: "unverified", evidence: [] });
  });

  it("leaves a space someone has already edited alone", async () => {
    await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    await db.update(rooms).set({ nameEn: "Press Room" }).where(eq(rooms.id, "L1-media-room"));
    const again = await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    expect(again.spaces).toBe(0);
    expect(again.skipped).toBe(3);
    const [room] = await db.select().from(rooms).where(eq(rooms.id, "L1-media-room"));
    expect(room?.nameEn).toBe("Press Room");
  });

  it("hangs the drawing at the scale the drawing states", async () => {
    const r = await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    expect(r.underlay).toBe("added");
    const [img] = await db.select().from(levelImages);
    expect(img?.metresPerPixel).toBe(0.07);
    expect(img?.offsetX).toBe(-25);
    expect(img?.offsetY).toBe(300);
  });

  it("does not touch an underlay that already agrees", async () => {
    await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    const [before] = await db.select().from(levelImages);
    const again = await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    expect(again.underlay).toBe("unchanged");
    const [after] = await db.select().from(levelImages);
    expect(after?.version).toBe(before?.version);
  });

  it("corrects an underlay whose calibration has drifted", async () => {
    await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    await db.update(levelImages).set({ metresPerPixel: 0.21 });
    const again = await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    expect(again.underlay).toBe("recalibrated");
    const [img] = await db.select().from(levelImages);
    expect(img?.metresPerPixel).toBe(0.07);
  });

  it("still seeds the spaces when the raster is not on disk", async () => {
    const r = await importL1Plan(db, dataDir, { imagesDir: dataDir, files: [file] });
    expect(r.underlay).toBe("missing");
    expect(r.spaces).toBe(3);
  });
});

describe("the walkthrough's features", () => {
  async function withFrames() {
    await db.insert(captures).values({ id: "cap_1", kind: "video", filename: "level 1" });
    for (const f of WALKTHROUGH_FEATURES) {
      for (const id of f.keyframeIds) {
        await db.insert(keyframes).values({
          id, captureId: "cap_1", imageId: id, storagePath: `a/${id}`,
          checksum: id, widthPx: 3840, heightPx: 2160, sizeBytes: 1,
        }).onConflictDoNothing();
      }
    }
  }

  it("says nothing it has no frame for", async () => {
    const r = await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    expect(r.features).toBe(0);
    expect(r.sightings).toBe(0);
    expect(r.featuresWithoutFrames).toContain("Gate 5");
    expect(await db.select().from(places)).toEqual([]);
  });

  it("names the gates the drawing does not, once the frames are here", async () => {
    await withFrames();
    const r = await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    expect(r.features).toBe(WALKTHROUGH_FEATURES.length);
    expect(r.featuresWithoutFrames).toEqual([]);
    const named = (await db.select().from(places)).map(p => p.nameEn);
    expect(named).toContain("Gate 5");
    expect(named).toContain("Escalator to the 2nd storey (library)");
  });

  it("keeps the frame that shows each one", async () => {
    await withFrames();
    const r = await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    expect(r.sightings).toBe(WALKTHROUGH_FEATURES.reduce((n, f) => n + f.keyframeIds.length, 0));
    const seen = await db.select().from(sightings)
      .where(eq(sightings.placeId, "pl-west-gate-5"));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.status).toBe("confirmed");
  });

  it("does not bind a gate to a stretch of concourse this import never made", async () => {
    // The test fixture has no concourse in it, so nothing may claim one.
    await withFrames();
    await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    const [gate] = await db.select().from(places).where(eq(places.id, "pl-west-gate-5"));
    expect(gate?.roomId).toBeNull();
  });

  it("leaves the gate the walk passed outside the slice unbound", async () => {
    expect(WALKTHROUGH_FEATURES.find(f => f.nameEn === "Gate 1")?.roomId).toBe("");
  });

  it("adds nothing on a second run", async () => {
    await withFrames();
    await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    const again = await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    expect(again.features).toBe(0);
    expect(again.sightings).toBe(0);
  });
});

describe("the west concourse", () => {
  it("is a walkable area, not a room you arrive in", async () => {
    const { spaces } = await readSpaces();
    const segs = spaces.filter(s => s.id.startsWith("L1-west-concourse"));
    expect(segs.length).toBeGreaterThanOrEqual(3);
    for (const s of segs) expect(s.kind).toBe("area");
  });

  it("stands its columns on the 9 m structural grid", async () => {
    const { spaces } = await readSpaces();
    const cols = spaces.filter(s => s.id.startsWith("L1-west-column"));
    expect(cols.length).toBeGreaterThan(10);
    for (const c of cols) {
      expect(c.kind).toBe("detail");
      // A column the drawing fills black: near enough square, under 1.4 m.
      const xs = c.footprint.map(p => p[0]!);
      const ys = c.footprint.map(p => p[1]!);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      expect(w).toBeLessThan(1.4);
      expect(Math.abs(w - h)).toBeLessThan(0.3);
    }
  });

  it("runs the length of the field's west side", async () => {
    const { spaces } = await readSpaces();
    const ys = spaces.filter(s => s.id.startsWith("L1-west-concourse"))
      .flatMap(s => s.footprint.map(p => p[1]!));
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(120);
  });

  it("gives every space on the storey the height of the storey it is on", async () => {
    await db.insert(levels).values({
      id: "oth-L1", buildingId: "b", ordinal: 1, nameEn: "Level 1", nameZh: "",
      code: "L1", elevationM: 0, heightM: 5,
    });
    await importL1Plan(db, dataDir, { imagesDir, files: [file] });
    const [r] = await db.select().from(rooms).where(eq(rooms.id, "L1-media-room"));
    expect(r?.heightM).toBe(5);
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
