import { parseModel } from "../schema/model";
import { describe, expect, it } from "vitest";
import { entranceAt, portalEndpointAt } from "./placePoint";

const L1 = { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 };
const L2 = { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 };
const building = { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 };

const square = (x: number, y: number, size: number): [number, number][] =>
  [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];

const model = parseModel({
  building,
  levels: [L1, L2],
  rooms: [
    // A big open square with a shop standing inside it.
    { id: "L1-plaza", levelId: "oth-L1", kind: "area", footprint: square(0, 0, 100), heightM: 5, walkable: true },
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: square(10, 10, 10), heightM: 3, walkable: false },
    { id: "L1-bench", levelId: "oth-L1", kind: "detail", footprint: square(50, 50, 2), heightM: 1, walkable: false },
    { id: "L2-hall", levelId: "oth-L2", kind: "area", footprint: square(0, 0, 100), heightM: 4, walkable: true },
  ],
});

describe("entranceAt", () => {
  it("lands in the open area under the click", () => {
    const r = entranceAt(model, "oth-L1", [60, 5], 1);
    expect(r).toEqual({
      ok: true,
      entrance: { id: "oth-L1-entrance-1", levelId: "oth-L1", roomId: "L1-plaza", point: [60, 5] },
    });
  });

  it("prefers the walkable area over a shop standing inside it", () => {
    // Routing floods from the entrance, so an entrance inside a closed shop
    // would reach nothing.
    const r = entranceAt(model, "oth-L1", [15, 15], 1);
    expect(r.ok && r.entrance.roomId).toBe("L1-plaza");
  });

  it("says why when the click is outside every space", () => {
    const r = entranceAt(model, "oth-L1", [500, 500], 1);
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/inside an area/i) });
  });

  it("never lands on another level's space", () => {
    const r = entranceAt(model, "oth-L2", [15, 15], 1);
    expect(r.ok && r.entrance.roomId).toBe("L2-hall");
  });

  it("ignores details, which are furniture rather than floor", () => {
    const r = entranceAt(model, "oth-L1", [51, 51], 1);
    expect(r.ok && r.entrance.roomId).toBe("L1-plaza");
  });
});

describe("portalEndpointAt", () => {
  it("starts a new lift when nothing is above or below", () => {
    const r = portalEndpointAt(model, "oth-L1", [40, 40], 7);
    expect(r).toEqual({
      ok: true,
      portal: { id: "portal-7", kind: "lift" },
      endpoint: { id: "oth-L1-portal-7", portalId: "portal-7", levelId: "oth-L1", roomId: "L1-plaza", point: [40, 40] },
    });
  });

  it("puts the endpoint in the smallest space under the click", () => {
    // A lift lobby drawn inside a hall is where the lift is.
    const r = portalEndpointAt(model, "oth-L1", [15, 15], 7);
    expect(r.ok && r.endpoint.roomId).toBe("L1-shop");
  });

  it("joins the lift already placed at the same spot on another level", () => {
    const withLift = parseModel({
      building,
      levels: [L1, L2],
      rooms: model.rooms,
      portals: [{ id: "lift-a", kind: "lift" }],
      portalEndpoints: [{ id: "ep-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-plaza", point: [40, 40] }],
    });
    const r = portalEndpointAt(withLift, "oth-L2", [41, 41], 7);
    expect(r).toEqual({
      ok: true,
      portal: null,
      endpoint: { id: "oth-L2-portal-7", portalId: "lift-a", levelId: "oth-L2", roomId: "L2-hall", point: [41, 41] },
    });
  });

  it("does not join a lift that already stops on this level", () => {
    const withLift = parseModel({
      building,
      levels: [L1, L2],
      rooms: model.rooms,
      portals: [{ id: "lift-a", kind: "lift" }],
      portalEndpoints: [{ id: "ep-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-plaza", point: [40, 40] }],
    });
    const r = portalEndpointAt(withLift, "oth-L1", [41, 41], 7);
    expect(r.ok && r.portal).toEqual({ id: "portal-7", kind: "lift" });
  });

  it("does not join a lift further away than a shaft's width", () => {
    const withLift = parseModel({
      building,
      levels: [L1, L2],
      rooms: model.rooms,
      portals: [{ id: "lift-a", kind: "lift" }],
      portalEndpoints: [{ id: "ep-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-plaza", point: [40, 40] }],
    });
    const r = portalEndpointAt(withLift, "oth-L2", [60, 60], 7);
    expect(r.ok && r.portal).toEqual({ id: "portal-7", kind: "lift" });
  });

  it("says why when the click is outside every space", () => {
    const r = portalEndpointAt(model, "oth-L1", [500, 500], 7);
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/inside an area or room/i) });
  });
});
