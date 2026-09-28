import { parseModel, pointInPolygon } from "@oth/model";
import { describe, expect, it } from "vitest";
import { placesByRoom, roomLabels } from "./labels";

const iso = "2026-09-20T00:00:00.000Z";
const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4, nameEn: "Shop" },
    { id: "L1-claim", levelId: "oth-L1", kind: "room", footprint: sq(20), heightM: 4 },
    { id: "L1-dup", levelId: "oth-L1", kind: "room", footprint: sq(40), heightM: 4 },
    { id: "L1-named", levelId: "oth-L1", kind: "room", footprint: sq(60), heightM: 4, nameEn: "Unit 7" },
    { id: "L1-blank", levelId: "oth-L1", kind: "room", footprint: sq(80), heightM: 4, nameEn: "   " },
    { id: "L1-old", levelId: "oth-L1", kind: "room", footprint: sq(100), heightM: 4, nameEn: "Old", deletedAt: iso },
    // Real L1's two bound concourse areas (plan:l1 binds them on purpose).
    { id: "L1-west-concourse-1", levelId: "oth-L1", kind: "area", footprint: sq(120), heightM: 6, nameEn: "West Concourse (north)" },
    { id: "L1-west-concourse-2", levelId: "oth-L1", kind: "area", footprint: sq(140), heightM: 6, nameEn: "West Concourse (middle)" },
    { id: "L1-pair", levelId: "oth-L1", kind: "room", footprint: sq(160), heightM: 4, nameEn: "Unit 9" },
    {
      id: "L1-ell", levelId: "oth-L1", kind: "area", heightM: 5, nameEn: "Plaza",
      footprint: [[0, 20], [10, 20], [10, 21], [1, 21], [1, 30], [0, 30]],
    },
    { id: "L2-a", levelId: "oth-L2", kind: "room", footprint: sq(0), heightM: 3, nameEn: "Upstairs" },
  ],
  places: [
    { id: "pl_star", nameEn: "Starbucks", category: "retail", roomId: "L1-shop" },
    { id: "pl_tea", nameEn: "iTea", category: "retail", roomId: "L1-claim", status: "proposed" },
    // Three on one room the drawing never named, one of them still a claim.
    { id: "pl_a", nameEn: "Aardvark", category: "retail", roomId: "L1-dup", status: "proposed" },
    { id: "pl_z", nameEn: "Zest", category: "retail", roomId: "L1-dup" },
    { id: "pl_y", nameEn: "Yolk", category: "retail", roomId: "L1-dup" },
    // Deleted: its room falls back to the drawing's name.
    { id: "pl_gone", nameEn: "Gone", category: "retail", roomId: "L1-named", deletedAt: iso },
    // Bound to a room that has since been deleted: bound to nothing.
    { id: "pl_orphan", nameEn: "Orphan", category: "retail", roomId: "L1-old" },
    // In model order, not name order, as plan:l1 writes them.
    { id: "pl-west-escalator-library", nameEn: "Escalator to the 2nd storey (library)", category: "facility", roomId: "L1-west-concourse-1" },
    { id: "pl-west-gate-6", nameEn: "Gate 6", category: "facility", roomId: "L1-west-concourse-1" },
    { id: "pl-west-gate-5", nameEn: "Gate 5", category: "facility", roomId: "L1-west-concourse-1" },
    // Real L1 binds Gates 2 to 4 here; one is enough for the one-place rule.
    { id: "pl-west-gate-2", nameEn: "Gate 2", category: "facility", roomId: "L1-west-concourse-2" },
    { id: "pl_p1", nameEn: "Kopi", category: "retail", roomId: "L1-pair", status: "proposed" },
    { id: "pl_p2", nameEn: "Kaya", category: "retail", roomId: "L1-pair", status: "proposed" },
  ],
});

describe("placesByRoom", () => {
  it("lists every live place on a room, all equal, by name", () => {
    expect(placesByRoom(model).get("L1-dup")?.map(p => p.id)).toEqual(["pl_a", "pl_y", "pl_z"]);
    expect(placesByRoom(model).get("L1-west-concourse-1")?.map(p => p.id)).toEqual([
      "pl-west-escalator-library", "pl-west-gate-5", "pl-west-gate-6",
    ]);
  });

  it("leaves out deleted places, and rooms that are gone", () => {
    expect(placesByRoom(model).has("L1-named")).toBe(false);
    expect(placesByRoom(model).has("L1-old")).toBe(false);
  });
});

describe("roomLabels", () => {
  const labels = roomLabels(model, "oth-L1");
  const byRoom = new Map(labels.map(l => [l.roomId, l]));

  it("names a room with one place by that place: confirmed, or proposed", () => {
    expect(byRoom.get("L1-shop")).toMatchObject({ name: "Starbucks", tone: "confirmed" });
    expect(byRoom.get("L1-claim")).toMatchObject({ name: "iTea", tone: "proposed" });
  });

  it("names a room with one place by the place, over the drawing's own name", () => {
    expect(byRoom.get("L1-west-concourse-2")).toMatchObject({ name: "Gate 2", tone: "confirmed" });
  });

  it("names a room with several places by its own name and how many, never by one of them", () => {
    expect(byRoom.get("L1-west-concourse-1")).toMatchObject({
      name: "West Concourse (north) · 3 places", tone: "confirmed",
    });
  });

  it("counts the places on a room the drawing never named, with a confirmed one ticking it", () => {
    expect(byRoom.get("L1-dup")).toMatchObject({ name: "3 places", tone: "confirmed" });
  });

  it("marks several places proposed while none of them is confirmed", () => {
    expect(byRoom.get("L1-pair")).toMatchObject({ name: "Unit 9 · 2 places", tone: "proposed" });
  });

  it("falls back to the drawing's own name, and to nothing without one", () => {
    expect(byRoom.get("L1-named")).toMatchObject({ name: "Unit 7", tone: "drawing" });
    expect(byRoom.has("L1-blank")).toBe(false);
  });

  it("labels only this floor's live rooms", () => {
    expect(byRoom.has("L1-old")).toBe(false);
    expect(byRoom.has("L2-a")).toBe(false);
  });

  it("anchors a label inside an L-shaped area, with only the room a centred label has there", () => {
    const ell = byRoom.get("L1-ell")!;
    const footprint = model.rooms.find(r => r.id === "L1-ell")!.footprint;
    // Inside the L's one-metre arms, not at its centroid in the crook.
    expect(pointInPolygon(ell.at, footprint)).toBe(true);
    expect(ell.at[0] <= 1 || ell.at[1] <= 21).toBe(true);
    // About a metre, one way or both: never the arm's full ten.
    expect(Math.min(ell.widthM, ell.heightM)).toBeGreaterThan(0.9);
    expect(Math.min(ell.widthM, ell.heightM)).toBeLessThan(1.3);
    expect(ell.liftM).toBe(5);
  });
});
