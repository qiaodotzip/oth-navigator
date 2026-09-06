import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { storeAsset } from "../assets/storage";
import type { Database } from "../db/client";
import { captures, keyframes, places, sightings } from "../db/schema";
import { createTestDb } from "../testing/harness";
import { exportCaptureForLabelling } from "./surveyExport";
import { importProposals } from "./surveyImport";

let db: Database;
let dataDir: string;
let outDir: string;

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);

beforeEach(async () => {
  db = await createTestDb();
  dataDir = await mkdtemp(join(tmpdir(), "oth-survey-data-"));
  outDir = await mkdtemp(join(tmpdir(), "oth-survey-out-"));
  await db.insert(captures).values({
    id: "cap_1", kind: "photos", filename: "L1 photos", levelId: "oth-L1",
  });
  for (const [i, id] of ["kf_a", "kf_b"].entries()) {
    const stored = await storeAsset(dataDir, png, "png");
    await db.insert(keyframes).values({
      id, captureId: "cap_1", timeMs: i * 1000, imageId: id,
      storagePath: stored.storagePath, checksum: stored.checksum,
      widthPx: 640, heightPx: 480, sizeBytes: png.byteLength,
    });
  }
});

async function proposalsFile(proposals: unknown[], captureId = "cap_1") {
  const file = join(outDir, "proposals.json");
  await writeFile(file, JSON.stringify({ captureId, proposals }), "utf8");
  return file;
}

describe("survey:export", () => {
  it("writes every frame plus the brief the agent reads", async () => {
    const { frames, dir } = await exportCaptureForLabelling(db, dataDir, "cap_1", outDir);
    expect(frames).toBe(2);
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.frames).toHaveLength(2);
    expect(await readFile(join(dir, "LABELLING.md"), "utf8")).toMatch(/individual/i);
  });

  it("lists what is already named, so a second pass links instead of duplicating", async () => {
    await db.insert(places).values({ id: "pl_1", nameEn: "NTUC", category: "retail" });
    const { dir } = await exportCaptureForLabelling(db, dataDir, "cap_1", outDir);
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.knownPlaces).toEqual([{ id: "pl_1", nameEn: "NTUC", category: "retail" }]);
  });

  it("orders frames by the timeline, as the filmstrip does", async () => {
    const { dir } = await exportCaptureForLabelling(db, dataDir, "cap_1", outDir);
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest.frames.map((f: { keyframeId: string }) => f.keyframeId)).toEqual(["kf_a", "kf_b"]);
  });

  it("refuses a capture that does not exist", async () => {
    await expect(exportCaptureForLabelling(db, dataDir, "cap_nope", outDir)).rejects.toThrow();
  });
});

describe("survey:import", () => {
  it("creates a place and a sighting, both proposed", async () => {
    const file = await proposalsFile([
      { keyframeId: "kf_a", nameEn: "NTUC FairPrice", category: "retail" },
    ]);
    const r = await importProposals(db, file);
    expect(r.places).toBe(1);
    expect(r.sightings).toBe(1);
    const [place] = await db.select().from(places);
    expect(place!.status).toBe("proposed");
    const [sighting] = await db.select().from(sightings);
    expect(sighting!.status).toBe("proposed");
  });

  it("links two proposals of the same shop to one place", async () => {
    // The seventh sighting of NTUC must not make a seventh NTUC.
    const file = await proposalsFile([
      { keyframeId: "kf_a", nameEn: "NTUC FairPrice", category: "retail" },
      { keyframeId: "kf_b", nameEn: "ntuc fairprice", category: "retail" },
    ]);
    const r = await importProposals(db, file);
    expect(r.places).toBe(1);
    expect(r.sightings).toBe(2);
    expect(r.linked).toBe(1);
  });

  it("links to a place the manifest already knew", async () => {
    await db.insert(places).values({ id: "pl_1", nameEn: "Library", category: "community" });
    const file = await proposalsFile([
      { keyframeId: "kf_a", nameEn: "Library", category: "community", placeId: "pl_1" },
    ]);
    const r = await importProposals(db, file);
    expect(r.places).toBe(0);
    expect(r.linked).toBe(1);
  });

  it("refuses a frame that is not in this capture, naming which proposal", async () => {
    const file = await proposalsFile([
      { keyframeId: "kf_a", nameEn: "Real", category: "retail" },
      { keyframeId: "kf_elsewhere", nameEn: "Wrong frame", category: "retail" },
    ]);
    const r = await importProposals(db, file);
    expect(r.sightings).toBe(1);
    expect(r.rejected).toEqual([{ index: 1, reason: "no frame kf_elsewhere in this capture" }]);
  });

  it("refuses a nameless proposal rather than making an unnamed place", async () => {
    const file = await proposalsFile([{ keyframeId: "kf_a", nameEn: "", category: "retail" }]);
    await expect(importProposals(db, file)).rejects.toThrow(/not a proposals file/);
  });

  it("keeps the box when the labeller said which of two shops it meant", async () => {
    const file = await proposalsFile([{
      keyframeId: "kf_a", nameEn: "Kopitiam", category: "retail",
      box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    }]);
    await importProposals(db, file);
    const [sighting] = await db.select().from(sightings);
    expect(sighting!.box).toEqual({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  });

  it("refuses a box measured in pixels", async () => {
    const file = await proposalsFile([{
      keyframeId: "kf_a", nameEn: "Kopitiam", category: "retail",
      box: { x: 120, y: 80, w: 300, h: 200 },
    }]);
    await expect(importProposals(db, file)).rejects.toThrow();
  });

  it("records who proposed it, so a bad pass can be found and undone", async () => {
    const file = await proposalsFile([{ keyframeId: "kf_a", nameEn: "X", category: "retail" }]);
    await importProposals(db, file, "wei-claude-code");
    const [place] = await db.select().from(places);
    expect(place!.proposedBy).toBe("wei-claude-code");
  });

  it("refuses a file for a capture that does not exist", async () => {
    const file = await proposalsFile([{ keyframeId: "kf_a", nameEn: "X" }], "cap_nope");
    await expect(importProposals(db, file)).rejects.toThrow(/no capture/);
  });
});

describe("a labeller that can read the floor off the frame", () => {
  it("puts a place on the level the proposal names, not the capture's", async () => {
    // A directory board says which floor each facility is on; a walkthrough
    // usually cannot, so the capture's level is only the fallback.
    const file = await proposalsFile([
      { keyframeId: "kf_a", nameEn: "Gymnasium", category: "sports", levelId: "oth-L7" },
    ]);
    await importProposals(db, file);
    const [place] = await db.select().from(places);
    expect(place!.levelId).toBe("oth-L7");
  });

  it("falls back to the capture's level when the frame does not say", async () => {
    const file = await proposalsFile([{ keyframeId: "kf_a", nameEn: "Shop", category: "retail" }]);
    await importProposals(db, file);
    const [place] = await db.select().from(places);
    expect(place!.levelId).toBe("oth-L1");
  });
});
