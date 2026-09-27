import { describe, expect, it } from "vitest";
import { parseModel } from "../schema/model";
import { placeLevel, placeLevels } from "./levels";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const levels = [
  { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
  { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
];
const captures = [
  { id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" },
  { id: "cap_2", kind: "video", filename: "l2.mp4", levelId: "oth-L2" },
  { id: "cap_x", kind: "video", filename: "unfiled.mp4" },
];
const frame = (id: string, captureId: string) =>
  ({ id, captureId, imageId: id, widthPx: 640, heightPx: 480 });
const keyframes = [frame("kf_1", "cap_1"), frame("kf_2", "cap_1"), frame("kf_3", "cap_2"), frame("kf_4", "cap_2"), frame("kf_x", "cap_x")];
const place = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, nameEn: id, category: "retail", ...extra });
const seen = (id: string, placeId: string, keyframeId: string, extra: Record<string, unknown> = {}) =>
  ({ id, placeId, keyframeId, ...extra });

function model(places: unknown[], sightings: unknown[]) {
  return parseModel({ building, levels, captures, keyframes, places, sightings });
}

describe("placeLevel", () => {
  it("uses the place's own level when it has one", () => {
    const m = model([place("p", { levelId: "oth-L2" })], [seen("s", "p", "kf_1")]);
    expect(placeLevel(m, m.places[0]!)).toBe("oth-L2");
  });

  it("otherwise takes the level of the footage it was seen in", () => {
    const m = model([place("p")], [seen("s", "p", "kf_1")]);
    expect(placeLevel(m, m.places[0]!)).toBe("oth-L1");
  });

  it("goes with the level it was seen on most", () => {
    const m = model([place("p")], [seen("a", "p", "kf_1"), seen("b", "p", "kf_3"), seen("c", "p", "kf_4")]);
    expect(placeLevel(m, m.places[0]!)).toBe("oth-L2");
  });

  it("breaks a tie toward the lower floor, so the answer is the same on every reload", () => {
    const m = model([place("p")], [seen("a", "p", "kf_3"), seen("b", "p", "kf_1")]);
    expect(placeLevel(m, m.places[0]!)).toBe("oth-L1");
  });

  it("has no level when nothing says where it is", () => {
    const m = model([place("p")], [seen("a", "p", "kf_x")]);
    expect(placeLevel(m, m.places[0]!)).toBeUndefined();
  });

  it("ignores a deleted sighting", () => {
    const m = model([place("p")], [seen("a", "p", "kf_3", { deletedAt: "2026-09-27T00:00:00.000Z" }), seen("b", "p", "kf_1")]);
    expect(placeLevel(m, m.places[0]!)).toBe("oth-L1");
  });
});

describe("placeLevels", () => {
  it("answers for every place at once", () => {
    const m = model([place("p1"), place("p2", { levelId: "oth-L2" })], [seen("a", "p1", "kf_1")]);
    expect(placeLevels(m)).toEqual(new Map([["p1", "oth-L1"], ["p2", "oth-L2"]]));
  });
});
