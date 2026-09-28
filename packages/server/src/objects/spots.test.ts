import { parseModel, type Vec2 } from "@oth/model";
import { describe, expect, it } from "vitest";
import { confidenceFor, objectSpotReport, suggestObjectSpots } from "./spots";

const sq = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const frames = (cap: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${cap}-${i}`, captureId: cap, timeMs: i * 1000, imageId: `${cap}-${i}`, widthPx: 640, heightPx: 480 }));
const seen = (id: string, placeId: string, frame: string) => ({ id, placeId, keyframeId: frame });

/**
 * A corridor 60 m by 6 m, walkable, with shops north of it (Starbucks, Gong
 * Cha, Guardian) and one south (Popular), each bound to its survey place.
 * One capture of 31 frames walks it. A wastebin is 0.5 m deep, so it stands
 * 0.35 m in from the corridor's edge.
 */
const corridor = (sightings: ReturnType<typeof seen>[], extra: Record<string, unknown> = {}) => parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-corridor", levelId: "oth-L1", kind: "area", footprint: sq(0, 0, 60, 6), heightM: 6, walkable: true },
    { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: sq(0, 6, 10, 14), heightM: 6 },
    { id: "L1-b", levelId: "oth-L1", kind: "room", footprint: sq(10, 6, 20, 14), heightM: 6 },
    { id: "L1-c", levelId: "oth-L1", kind: "room", footprint: sq(40, 6, 50, 14), heightM: 6 },
    { id: "L1-s", levelId: "oth-L1", kind: "room", footprint: sq(20, -8, 30, 0), heightM: 6 },
  ],
  captures: [
    { id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" },
    { id: "cap_2", kind: "video", filename: "L2 walk.mp4", levelId: "oth-L2" },
  ],
  keyframes: [...frames("cap_1", 31), ...frames("cap_2", 3)],
  places: [
    { id: "pl_a", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-a" },
    { id: "pl_b", nameEn: "Gong Cha", category: "retail", levelId: "oth-L1", roomId: "L1-b" },
    { id: "pl_c", nameEn: "Guardian", category: "retail", levelId: "oth-L1", roomId: "L1-c" },
    { id: "pl_s", nameEn: "Popular", category: "retail", levelId: "oth-L1", roomId: "L1-s" },
    { id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "bin" },
  ],
  sightings: [
    seen("sg_a", "pl_a", "cap_1-5"), seen("sg_b", "pl_b", "cap_1-6"), seen("sg_c", "pl_c", "cap_1-20"), seen("sg_s", "pl_s", "cap_1-28"),
    ...sightings,
  ],
  objectKinds: [{ id: "bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }],
  ...extra,
});

const at = (p: Vec2) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];

describe("suggestObjectSpots", () => {
  it("places a bin seen between two bound shops at the corridor's edge by their fronts, facing into it, sure of it", () => {
    const [spot, ...rest] = suggestObjectSpots(corridor([seen("sg_bin", "pl_bin", "cap_1-5")]), "oth-L1");
    expect(rest).toEqual([]);
    expect({ ...spot!, position: at(spot!.position) }).toEqual({
      objectKindId: "bin", position: [10, 5.65], rotationDeg: 0, sightingIds: ["sg_bin"], confidence: "high", anchors: ["L1-a", "L1-b"],
    });
  });

  it("faces a bin by a shop on the other side the other way, and is less sure with one shop", () => {
    const [spot] = suggestObjectSpots(corridor([seen("sg_bin", "pl_bin", "cap_1-28")]), "oth-L1");
    expect({ position: at(spot!.position), rotationDeg: spot!.rotationDeg, confidence: spot!.confidence, anchors: spot!.anchors })
      .toEqual({ position: [25, 0.35], rotationDeg: 180, confidence: "low", anchors: ["L1-s"] });
  });

  it("guesses from filming order between the frames before and after that were placed, with no anchors", () => {
    const [spot] = suggestObjectSpots(corridor([seen("sg_bin", "pl_bin", "cap_1-13")]), "oth-L1");
    // Frame 13 has no anchors within 3 frames either side. The nearest earlier frame that did (frame 9, anchored
    // only by Gong Cha, since Starbucks's own frame 5 is out of frame 9's reach) sits at Gong Cha's front (15, 6);
    // the nearest later one (frame 17, anchored by Guardian) sits at Guardian's front (45, 6). Their midpoint is (30, 6).
    expect({ position: at(spot!.position), confidence: spot!.confidence, anchors: spot!.anchors })
      .toEqual({ position: [30, 5.65], confidence: "low", anchors: [] });
  });

  it("merges two sightings of one bin a few frames apart, keeping both", () => {
    const spots = suggestObjectSpots(corridor([seen("sg_1", "pl_bin", "cap_1-5"), seen("sg_2", "pl_bin", "cap_1-8")]), "oth-L1");
    expect(spots.map(s => s.sightingIds)).toEqual([["sg_1", "sg_2"]]);
  });

  it("never merges two bins boxed in one frame, however close", () => {
    const spots = suggestObjectSpots(corridor([seen("sg_1", "pl_bin", "cap_1-6"), seen("sg_2", "pl_bin", "cap_1-6")]), "oth-L1");
    expect(spots.map(s => s.sightingIds)).toEqual([["sg_1"], ["sg_2"]]);
  });

  it("keeps apart sightings more than 10 frames apart, or more than 3 m apart", () => {
    const far = suggestObjectSpots(corridor([seen("sg_1", "pl_bin", "cap_1-5"), seen("sg_2", "pl_bin", "cap_1-20")]), "oth-L1");
    expect(far.map(s => s.sightingIds)).toEqual([["sg_1"], ["sg_2"]]);
  });
});

describe("objectSpotReport", () => {
  it("skips a sighting already on a placement, so a second run gives only what is left", () => {
    const model = corridor([seen("sg_1", "pl_bin", "cap_1-5"), seen("sg_2", "pl_bin", "cap_1-28")], {
      placements: [{ id: "L1-wastebin-1", levelId: "oth-L1", objectKindId: "bin", position: [10, 5.65, 0], sightingIds: ["sg_1"] }],
    });
    const report = objectSpotReport(model, "oth-L1");
    expect(report.spots.map(s => s.sightingIds)).toEqual([["sg_2"]]);
    expect(report.alreadyPlaced).toBe(1);
  });

  it("reads only this floor's frames, and says which sighting it can't place", () => {
    const model = corridor([seen("sg_up", "pl_bin", "cap_2-1")]);
    expect(objectSpotReport(model, "oth-L1")).toEqual({ spots: [], unplaced: [], alreadyPlaced: 0 });
    expect(objectSpotReport(model, "oth-L2").unplaced).toEqual([{
      sightingId: "sg_up", frameId: "cap_2-1", objectKindId: "bin", reason: "the floor has no walkable area to stand it in yet",
    }]);
  });
});

describe("confidenceFor", () => {
  it("works out again how sure a placing was, from the map as it is now", () => {
    const model = corridor([seen("sg_1", "pl_bin", "cap_1-5"), seen("sg_2", "pl_bin", "cap_1-28")]);
    const confidence = confidenceFor(model, "oth-L1");
    expect(confidence(["sg_1"])).toBe("high");
    expect(confidence(["sg_2"])).toBe("low");
  });
});
