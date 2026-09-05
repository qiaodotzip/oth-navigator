import { describe, expect, it } from "vitest";
import { parseModel } from "../schema/model";
import { coVisiblePairs, sequentialPairs } from "./graph";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const level = {
  id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
  nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
};

const frame = (id: string, timeMs: number, captureId = "cap_1") =>
  ({ id, captureId, timeMs, imageId: id, widthPx: 640, heightPx: 480 });

const sighting = (placeId: string, keyframeId: string, extra = {}) =>
  ({ id: `sg_${placeId}_${keyframeId}`, placeId, keyframeId, ...extra });

function model(keyframes: unknown[], sightings: unknown[], captures = [
  { id: "cap_1", kind: "video", filename: "a.mp4" },
  { id: "cap_2", kind: "video", filename: "b.mp4" },
]) {
  return parseModel({ building, levels: [level], captures, keyframes, sightings });
}

describe("coVisiblePairs", () => {
  it("pairs two places seen in the same frame", () => {
    const m = model([frame("kf1", 0)], [sighting("a", "kf1"), sighting("b", "kf1")]);
    expect(coVisiblePairs(m)).toEqual([{ a: "a", b: "b" }]);
  });

  it("says nothing about places in different frames", () => {
    const m = model([frame("kf1", 0), frame("kf2", 1000)], [sighting("a", "kf1"), sighting("b", "kf2")]);
    expect(coVisiblePairs(m)).toEqual([]);
  });

  it("never pairs a place with itself, however often it is sighted", () => {
    const m = model([frame("kf1", 0)], [
      sighting("a", "kf1"), { id: "sg_dup", placeId: "a", keyframeId: "kf1" },
    ]);
    expect(coVisiblePairs(m)).toEqual([]);
  });

  it("reports a pair once however many frames show both", () => {
    const m = model([frame("kf1", 0), frame("kf2", 1000)], [
      sighting("a", "kf1"), sighting("b", "kf1"), sighting("a", "kf2"), sighting("b", "kf2"),
    ]);
    expect(coVisiblePairs(m)).toHaveLength(1);
  });

  it("orders each pair, so a pair is its own key whichever way round it was seen", () => {
    const m = model([frame("kf1", 0)], [sighting("z", "kf1"), sighting("a", "kf1")]);
    expect(coVisiblePairs(m)[0]).toEqual({ a: "a", b: "z" });
  });

  it("pairs all three when three shops share a frame", () => {
    const m = model([frame("kf1", 0)], [
      sighting("a", "kf1"), sighting("b", "kf1"), sighting("c", "kf1"),
    ]);
    expect(coVisiblePairs(m)).toHaveLength(3);
  });

  it("ignores a soft-deleted sighting", () => {
    const m = model([frame("kf1", 0)], [
      sighting("a", "kf1"), sighting("b", "kf1", { deletedAt: "2026-09-01T00:00:00.000Z" }),
    ]);
    expect(coVisiblePairs(m)).toEqual([]);
  });
});

describe("sequentialPairs", () => {
  it("pairs places in consecutive frames of one capture", () => {
    // You walked past one and then the other, so a route exists between them.
    const m = model([frame("kf1", 0), frame("kf2", 1000)], [sighting("a", "kf1"), sighting("b", "kf2")]);
    expect(sequentialPairs(m)).toContainEqual({ a: "a", b: "b" });
  });

  it("orders frames by time, not by the order they were grabbed", () => {
    // Scrubbing backwards is normal, so insertion order means nothing.
    const m = model([frame("kf2", 2000), frame("kf1", 1000), frame("kf3", 3000)], [
      sighting("a", "kf1"), sighting("b", "kf2"), sighting("c", "kf3"),
    ]);
    const pairs = sequentialPairs(m);
    expect(pairs).toContainEqual({ a: "a", b: "b" });
    expect(pairs).toContainEqual({ a: "b", b: "c" });
    expect(pairs).not.toContainEqual({ a: "a", b: "c" });
  });

  it("does not pair across two different captures", () => {
    const m = model([frame("kf1", 0, "cap_1"), frame("kf2", 1000, "cap_2")], [
      sighting("a", "kf1"), sighting("b", "kf2"),
    ]);
    expect(sequentialPairs(m)).toEqual([]);
  });

  it("does not pair across a gap of more than one frame", () => {
    const m = model([frame("kf1", 0), frame("kf2", 1000), frame("kf3", 2000)], [
      sighting("a", "kf1"), sighting("c", "kf3"),
    ]);
    expect(sequentialPairs(m)).toEqual([]);
  });

  it("says nothing for a capture with one frame", () => {
    const m = model([frame("kf1", 0)], [sighting("a", "kf1")]);
    expect(sequentialPairs(m)).toEqual([]);
  });

  it("ignores a soft-deleted frame", () => {
    const m = model(
      [frame("kf1", 0), { ...frame("kf2", 1000), deletedAt: "2026-09-01T00:00:00.000Z" }],
      [sighting("a", "kf1"), sighting("b", "kf2")],
    );
    expect(sequentialPairs(m)).toEqual([]);
  });
});
