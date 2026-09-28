import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import { buildStepForCode, buildStepsDone, floorProgress, nextStepText, reviewCounts, waitingReview } from "./floorProgress";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const levels = [
  { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
  { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
];
const frame = (id: string, captureId: string) => ({ id, captureId, imageId: id, widthPx: 640, heightPx: 480 });

const model = parseModel({
  building,
  levels,
  captures: [
    { id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" },
    { id: "cap_2", kind: "video", filename: "l2.mp4", levelId: "oth-L2" },
  ],
  keyframes: [frame("kf_1", "cap_1"), frame("kf_2", "cap_1"), frame("kf_3", "cap_1"), frame("kf_9", "cap_2")],
  places: [
    { id: "p_own", nameEn: "Library", category: "community", levelId: "oth-L1" },
    { id: "p_seen", nameEn: "iTea", category: "retail", status: "proposed" },
    { id: "p_up", nameEn: "Gym", category: "sports", status: "proposed" },
  ],
  sightings: [
    { id: "s1", placeId: "p_seen", keyframeId: "kf_1", status: "proposed" },
    { id: "s2", placeId: "p_up", keyframeId: "kf_9", status: "proposed" },
  ],
});

const noImages: LevelImage[] = [];

describe("floorProgress", () => {
  it("counts the floor's frames that carry any tag", () => {
    expect(floorProgress(model, null, noImages, "oth-L1").survey).toEqual({ tagged: 1, total: 3 });
  });

  it("counts review over places on the floor, their own level or their footage's", () => {
    expect(floorProgress(model, null, noImages, "oth-L1").review).toEqual({ confirmed: 1, proposed: 1 });
    expect(waitingReview(model, "oth-L2")).toBe(1);
  });

  it("names the floorplan as next on a floor where nothing is built", () => {
    const p = floorProgress(model, null, noImages, "oth-L1");
    expect(p.build).toEqual({ done: 0, total: 6, next: "floorplan" });
    expect(nextStepText(p)).toBe("Next: add the floorplan and set its scale");
  });
});

describe("buildStepsDone", () => {
  it("does not call binding done on a floor with nothing to bind", () => {
    const empty = parseModel({ building, levels });
    expect(buildStepsDone(empty, null, noImages, "oth-L1").bind).toBe(false);
  });

  const library = { id: "L1-lib", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3 };
  const bindings = [
    { id: "a", nameEn: "Library", category: "community", levelId: "oth-L1", roomId: "L1-lib" },
    { id: "w", nameEn: "Covered link", category: "facility", levelId: "oth-L1", pathwayKindId: "pk-1" },
  ];

  it("calls binding done once every confirmed unit on the floor has a room, walkways aside", () => {
    const bound = parseModel({ building, levels, rooms: [library], places: bindings });
    expect(buildStepsDone(bound, null, noImages, "oth-L1").bind).toBe(true);
  });

  it("does not count a place as bound to a room that has been deleted", () => {
    const gone = parseModel({
      building, levels, rooms: [{ ...library, deletedAt: "2026-09-28T08:00:00.000Z" }], places: bindings,
    });
    expect(buildStepsDone(gone, null, noImages, "oth-L1").bind).toBe(false);
  });
});

describe("buildStepForCode", () => {
  it("files place issues under Bind places, and the rest where the checklist puts them", () => {
    expect(buildStepForCode("place.unbound")).toBe("bind");
    // A room nobody filmed: binding answers it from the place's side, or Survey does.
    expect(buildStepForCode("room.unsurveyed")).toBeNull();
    expect(buildStepForCode("area.unreachable")).toBe("pathways");
    expect(buildStepForCode("entrance.offFloor")).toBe("entrances");
    expect(buildStepForCode("portal.endpoints.insufficient")).toBe("entrances");
    expect(buildStepForCode("something.else")).toBeNull();
  });
});

describe("reviewCounts", () => {
  it("counts confirmed and still-proposed places on a floor, by the floor they are on", () => {
    const model = parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
      captures: [{ id: "cap_1", kind: "video", filename: "a.mp4", levelId: "oth-L1" }],
      keyframes: [{ id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", widthPx: 64, heightPx: 36 }],
      places: [
        { id: "p1", nameEn: "Mine", category: "retail", levelId: "oth-L1" },
        { id: "p2", nameEn: "Seen on L1", category: "retail", status: "proposed" },
        { id: "p3", nameEn: "Nowhere", category: "retail", status: "proposed" },
      ],
      sightings: [{ id: "s1", placeId: "p2", keyframeId: "kf_1", status: "proposed" }],
    });
    expect(reviewCounts(model, "oth-L1")).toEqual({ confirmed: 1, proposed: 1 });
  });
});
