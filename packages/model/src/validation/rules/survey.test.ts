import { describe, expect, it } from "vitest";
import { parseModel } from "../../schema/model";
import { validateModel } from "../validate";
import { surveyRules } from "./survey";

const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const level = {
  id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
  nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
};

const room = (id: string, x: number) => ({
  id, levelId: "oth-L1", kind: "room",
  footprint: [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]],
  heightM: 3.5, walkable: false, nameEn: id, nameZh: "",
});

const codes = (extra: Record<string, unknown>) =>
  validateModel(parseModel({ building, levels: [level], ...extra }), surveyRules)
    .issues.map(i => i.code);

describe("place.unbound", () => {
  const place = { id: "pl_1", nameEn: "NTUC", category: "retail" };

  it("warns about a named place no room claims", () => {
    expect(codes({ places: [place] })).toContain("place.unbound");
  });

  it("says nothing once the place is bound", () => {
    expect(codes({ rooms: [room("L1-a", 0)], places: [{ ...place, roomId: "L1-a" }] }))
      .not.toContain("place.unbound");
  });

  it("names the place, so the message is actionable", () => {
    const report = validateModel(parseModel({ building, levels: [level], places: [place] }), surveyRules);
    expect(report.issues[0]?.message).toContain("NTUC");
  });

  it("says nothing of a kind of object, which is placed on the map, not bound", () => {
    expect(codes({ places: [{ ...place, nameEn: "wastebin", category: "facility", objectKindId: "ok_bin" }] }))
      .not.toContain("place.unbound");
  });
});

describe("room.unsurveyed", () => {
  it("warns about a traced room nobody has surveyed", () => {
    expect(codes({ rooms: [room("L1-a", 0)] })).toContain("room.unsurveyed");
  });

  it("says nothing once a place is bound to it", () => {
    expect(codes({
      rooms: [room("L1-a", 0)],
      places: [{ id: "pl_1", nameEn: "NTUC", category: "retail", roomId: "L1-a" }],
    })).not.toContain("room.unsurveyed");
  });

  it("says nothing about a detail, which is furniture rather than a place", () => {
    expect(codes({ rooms: [{ ...room("L1-d", 0), kind: "detail" }] }))
      .not.toContain("room.unsurveyed");
  });

  it("says nothing about a void, which is a hole", () => {
    expect(codes({ rooms: [{ ...room("L1-v", 0), kind: "void" }] }))
      .not.toContain("room.unsurveyed");
  });
});

describe("place.adjacencyBroken", () => {
  const shared = {
    captures: [{ id: "cap_1", kind: "video", filename: "a.mp4" }],
    keyframes: [{ id: "kf1", captureId: "cap_1", timeMs: 0, imageId: "kf1", widthPx: 640, heightPx: 480 }],
    sightings: [
      { id: "sg_1", placeId: "pl_a", keyframeId: "kf1" },
      { id: "sg_2", placeId: "pl_b", keyframeId: "kf1" },
    ],
  };

  const bound = (bx: number) => ({
    ...shared,
    rooms: [room("L1-a", 0), room("L1-b", bx)],
    places: [
      { id: "pl_a", nameEn: "NTUC", category: "retail", roomId: "L1-a" },
      { id: "pl_b", nameEn: "Coffee Bean", category: "retail", roomId: "L1-b" },
    ],
  });

  it("warns when two co-visible places are bound to rooms far apart", () => {
    expect(codes(bound(500))).toContain("place.adjacencyBroken");
  });

  it("says nothing when the bound rooms are near each other", () => {
    expect(codes(bound(12))).not.toContain("place.adjacencyBroken");
  });

  it("says nothing while either place is unbound, since there is nothing to check", () => {
    const m = bound(500);
    expect(codes({ ...m, places: [m.places[0]!, { ...m.places[1]!, roomId: undefined }] }))
      .not.toContain("place.adjacencyBroken");
  });

  it("says how far apart they are, since the number is what settles it", () => {
    const report = validateModel(parseModel({ building, levels: [level], ...bound(500) }), surveyRules);
    const issue = report.issues.find(i => i.code === "place.adjacencyBroken");
    expect(issue?.message).toMatch(/\d+ m apart/);
  });

  it("says nothing about places that were never seen together", () => {
    const m = bound(500);
    expect(codes({ ...m, sightings: [m.sightings[0]!] })).not.toContain("place.adjacencyBroken");
  });
});

describe("severity", () => {
  it("never blocks a publish, since every one is a question for a human", () => {
    const report = validateModel(
      parseModel({
        building, levels: [level],
        rooms: [room("L1-a", 0)],
        places: [{ id: "pl_1", nameEn: "NTUC", category: "retail" }],
      }),
      surveyRules,
    );
    expect(report.errorCount).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.warningCount).toBeGreaterThan(0);
  });
});
