import { describe, expect, it } from "vitest";
import { parseModel } from "../schema/model";
import { buildBundle } from "./build";

const meta = {
  version: "2026-09-04T12-00-00",
  createdAt: "2026-09-04T12:00:00.000Z",
  createdBy: "user_1",
};

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const level = {
  id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
  nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
};
const lobby = {
  id: "L1-lobby", levelId: "oth-L1", kind: "area",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 6, walkable: true, nameEn: "Lobby", nameZh: "大堂",
};
const entrance = { id: "e-main", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5] };

const model = parseModel({ building, levels: [level], rooms: [lobby], entrances: [entrance] });

function paths(files: { path: string }[]) {
  return files.map(f => f.path).sort();
}

function manifestOf(files: { path: string; contents: string }[]) {
  return JSON.parse(files.find(f => f.path === "manifest.json")?.contents ?? "{}");
}

describe("buildBundle", () => {
  it("emits the documented file set", () => {
    expect(paths(buildBundle(model, meta))).toEqual([
      "building.json",
      "levels/L1.json",
      "manifest.json",
      "nav.json",
      "placements.json",
    ]);
  });

  it("is byte-identical across repeated builds", () => {
    const a = buildBundle(model, meta);
    const b = buildBundle(model, meta);
    expect(a.map(f => f.contents)).toEqual(b.map(f => f.contents));
  });

  it("records a checksum for every non-manifest file", () => {
    expect(Object.keys(manifestOf(buildBundle(model, meta)).checksums).sort()).toEqual([
      "building.json",
      "levels/L1.json",
      "nav.json",
      "placements.json",
    ]);
  });

  it("carries the publish metadata into the manifest", () => {
    const m = manifestOf(buildBundle(model, meta));
    expect(m.version).toBe(meta.version);
    expect(m.createdBy).toBe("user_1");
  });

  it("bakes a navigation grid per level into nav.json", () => {
    const files = buildBundle(model, meta);
    const nav = JSON.parse(files.find(f => f.path === "nav.json")?.contents ?? "{}");
    expect(nav.grids).toHaveLength(1);
    expect(nav.grids[0].levelId).toBe("oth-L1");
    expect(nav.grids[0].cellSizeM).toBe(0.25);
    expect(typeof nav.grids[0].bits).toBe("string");
  });

  it("refuses to build a model that fails validation", () => {
    const broken = parseModel({
      building,
      levels: [level],
      rooms: [{
        id: "bad", levelId: "oth-L1", kind: "room",
        footprint: [[0, 0], [2, 2], [2, 0], [0, 2]], heightM: 3, walkable: true,
      }],
      entrances: [{ id: "e", levelId: "oth-L1", roomId: "bad", point: [1, 1] }],
    });
    expect(() => buildBundle(broken, meta)).toThrow(/validation/i);
  });

  it("omits soft-deleted entities from the published bundle", () => {
    const withDeleted = parseModel({
      building,
      levels: [level],
      rooms: [lobby, {
        id: "L1-old", levelId: "oth-L1", kind: "room",
        footprint: [[20, 20], [30, 20], [30, 30], [20, 30]],
        heightM: 6, walkable: true, deletedAt: "2026-09-01T00:00:00.000Z",
      }],
      entrances: [entrance],
    });
    const l1 = buildBundle(withDeleted, meta).find(f => f.path === "levels/L1.json")?.contents ?? "";
    expect(l1).not.toContain("L1-old");
  });
});

describe("what the bundle deliberately omits", () => {
  const surveyed = parseModel({
    building, levels: [level], rooms: [lobby], entrances: [entrance],
    captures: [{ id: "cap_1", kind: "video", filename: "L1 walk.mp4" }],
    keyframes: [{ id: "kf_1", captureId: "cap_1", timeMs: 100, imageId: "kf_1", widthPx: 640, heightPx: 480 }],
    places: [{ id: "pl_1", nameEn: "NTUC", category: "retail", roomId: "L1-lobby" }],
    sightings: [{ id: "sg_1", placeId: "pl_1", keyframeId: "kf_1" }],
  });

  it("never ships survey evidence to visitors", () => {
    // Photographs of the building's interior are internal working material and
    // the bundle is public, so the survey layer stays server-side.
    const all = buildBundle(surveyed, meta).map(f => f.contents).join("");
    expect(all).not.toContain("kf_1");
    expect(all).not.toContain("cap_1");
    expect(all).not.toContain("sighting");
  });

  it("still ships the rooms the survey confirmed", () => {
    const all = buildBundle(surveyed, meta).map(f => f.contents).join("");
    expect(all).toContain("L1-lobby");
  });
});
