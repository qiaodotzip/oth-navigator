import { live, parseModel, pointInPolygon, type MapModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { insidePoint, portalFromRoom } from "./portalFromRoom";

const sq = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> =>
  [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };
const levels = [
  { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
  { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 5 },
];
const ell: Array<[number, number]> = [[20, 0], [30, 0], [30, 2], [22, 2], [22, 10], [20, 10]];
const rooms = [
  { id: "L1-esc", levelId: "oth-L1", kind: "room", footprint: sq(4, 2, 6, 12), heightM: 6, nameEn: "Escalator - 07" },
  { id: "L1-ell", levelId: "oth-L1", kind: "room", footprint: ell, heightM: 3 },
  { id: "L1-col", levelId: "oth-L1", kind: "detail", footprint: sq(40, 0, 41, 1), heightM: 6 },
  { id: "L2-esc", levelId: "oth-L2", kind: "room", footprint: sq(4, 2, 6, 12), heightM: 5, nameEn: "Escalator - 07" },
];
const model = parseModel({ building, levels, rooms });
const room = (m: MapModel, id: string) => live(m.rooms).find(r => r.id === id)!;

describe("portalFromRoom", () => {
  it("makes a room a new escalator stop with its outline, inside it, and opens the room", () => {
    const plan = portalFromRoom(model, room(model, "L1-esc"), "escalator", 1000);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.portal).toEqual({ id: "portal-1000", kind: "escalator" });
    expect(plan.endpoint).toMatchObject({ portalId: "portal-1000", levelId: "oth-L1", roomId: "L1-esc", footprint: sq(4, 2, 6, 12) });
    expect(pointInPolygon(plan.endpoint.point, sq(4, 2, 6, 12))).toBe(true);
    expect(plan.roomPatch).toEqual({ kind: "area", walkable: true });
  });

  it("joins the same escalator's stop on the floor below", () => {
    const withLower = parseModel({
      building, levels, rooms,
      portals: [{ id: "esc-7", kind: "escalator" }],
      portalEndpoints: [{ id: "esc-7-1", portalId: "esc-7", levelId: "oth-L1", roomId: "L1-esc", point: [5, 7], footprint: sq(4, 2, 6, 12) }],
    });
    const plan = portalFromRoom(withLower, room(withLower, "L2-esc"), "escalator", 2000);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.portal).toBeNull();
    expect(plan.endpoint.portalId).toBe("esc-7");
  });

  it("starts a new one rather than join a lift of another kind at the same spot", () => {
    const withLift = parseModel({
      building, levels, rooms,
      portals: [{ id: "lift-a", kind: "lift" }],
      portalEndpoints: [{ id: "lift-a-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-esc", point: [5, 7] }],
    });
    const plan = portalFromRoom(withLift, room(withLift, "L2-esc"), "stair", 3000);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.portal).toEqual({ id: "portal-3000", kind: "stair" });
    expect(plan.endpoint.portalId).toBe("portal-3000");
  });

  it("refuses furniture", () => {
    expect(portalFromRoom(model, room(model, "L1-col"), "lift", 1)).toMatchObject({ ok: false });
  });

  it("refuses a space that is already a stop", () => {
    const already = parseModel({
      building, levels, rooms,
      portals: [{ id: "esc-7", kind: "escalator" }],
      portalEndpoints: [{ id: "esc-7-1", portalId: "esc-7", levelId: "oth-L1", roomId: "L1-esc", point: [5, 7], footprint: sq(4, 2, 6, 12) }],
    });
    expect(portalFromRoom(already, room(already, "L1-esc"), "escalator", 1)).toMatchObject({ ok: false });
  });
});

describe("insidePoint", () => {
  it("puts the point inside an L-shaped room, where its centroid is not", () => {
    expect(pointInPolygon(insidePoint(ell), ell)).toBe(true);
  });
});
