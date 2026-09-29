import { parseModel, type ValidationReport } from "@oth/model";
import { describe, expect, it } from "vitest";
import { findLevel, floorIssues, floorPart, frameList, frameTags, spotsView, summariseFloors } from "./views";

const square = [[0, 0], [4, 0], [4, 4], [0, 4]];

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4, ownerIds: ["u_gone"] },
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6, ownerIds: ["u_wei"] },
  ],
  rooms: [
    { id: "r1", levelId: "oth-L1", kind: "room", footprint: square, heightM: 4 },
    { id: "r2", levelId: "oth-L1", kind: "room", footprint: square, heightM: 4 },
    { id: "r3", levelId: "oth-L2", kind: "area", footprint: square, heightM: 4 },
  ],
  places: [
    { id: "pl_a", nameEn: "A", category: "retail", levelId: "oth-L1", roomId: "r1" },
    { id: "pl_b", nameEn: "B", category: "retail", levelId: "oth-L1", status: "proposed" },
    { id: "pl_c", nameEn: "C", category: "retail", levelId: "oth-L1" },
    { id: "pl_d", nameEn: "D", category: "retail", levelId: "oth-L2", roomId: "gone" },
  ],
});

describe("summariseFloors", () => {
  it("gives each floor lowest first, its owners by name, and how far its map has come", () => {
    expect(summariseFloors(model, new Map([["u_wei", "Wei"]]))).toEqual([
      { id: "oth-L1", code: "L1", name: "Level 1", version: 0, owners: ["Wei"], rooms: 2, places: { confirmed: 2, proposed: 1 }, bound: 1 },
      { id: "oth-L2", code: "L2", name: "Level 2", version: 0, owners: ["u_gone"], rooms: 1, places: { confirmed: 1, proposed: 0 }, bound: 0 },
    ]);
  });
});

const survey = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6, ownerIds: ["u_wei"] },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-shop-12", levelId: "oth-L1", kind: "room", footprint: square, heightM: 4, nameEn: "Shop 12" },
    { id: "L2-hall", levelId: "oth-L2", kind: "area", footprint: square, heightM: 4, nameEn: "Hall" },
  ],
  pathways: [{ id: "pw_1", levelId: "oth-L1", polyline: [[0, 0], [5, 0]], nameEn: "Mall street" }],
  entrances: [{ id: "e_1", levelId: "oth-L1", roomId: "L1-shop-12", point: [1, 1], nameEn: "Main" }],
  portals: [{ id: "lift_a", kind: "lift", nameEn: "Lift A" }],
  portalEndpoints: [{ id: "lift_a-L1", portalId: "lift_a", levelId: "oth-L1", roomId: "L1-shop-12", point: [2, 2] }],
  captures: [
    { id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" },
    { id: "cap_2", kind: "video", filename: "L2 walk.mp4", levelId: "oth-L2" },
  ],
  keyframes: [
    { id: "kf_2", captureId: "cap_1", timeMs: 2000, imageId: "kf_2", widthPx: 640, heightPx: 480 },
    { id: "kf_1", captureId: "cap_1", timeMs: 1000, imageId: "kf_1", widthPx: 640, heightPx: 480 },
    { id: "kf_3", captureId: "cap_1", timeMs: 3000, imageId: "kf_3", widthPx: 640, heightPx: 480 },
    { id: "kf_9", captureId: "cap_2", timeMs: 1000, imageId: "kf_9", widthPx: 640, heightPx: 480 },
  ],
  places: [
    { id: "pl_sb", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-shop-12" },
    { id: "pl_gc", nameEn: "Gong Cha", category: "retail", levelId: "oth-L1", status: "proposed" },
  ],
  sightings: [
    { id: "sg_1", placeId: "pl_sb", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { id: "sg_2", placeId: "pl_gc", keyframeId: "kf_2", status: "proposed" },
  ],
});

describe("findLevel", () => {
  it("finds a floor by its code, in any case, or by its id", () => {
    expect(findLevel(survey, "l1")?.id).toBe("oth-L1");
    expect(findLevel(survey, "oth-L2")?.code).toBe("L2");
    expect(findLevel(survey, "L9")).toBeNull();
  });
});

describe("floorPart", () => {
  const L1 = () => findLevel(survey, "L1")!;
  const names = new Map([["u_wei", "Wei"]]);

  it("gives the floor's id and code and how many of each part by default", () => {
    expect(floorPart(survey, L1(), names, "summary", 0, 100)).toEqual({
      floor: { id: "oth-L1", code: "L1", name: "Level 1", owners: ["Wei"] },
      counts: {
        rooms: 1, stops: 1, pathways: 1, entrances: 1,
        places: { confirmed: 1, proposed: 1, unbound: 0 }, objectKinds: 0, objects: 0,
      },
      parts: ["rooms", "places", "pathways", "entrances", "objects"],
    });
  });

  it("lists each part a page at a time, leaving out what is at its default", () => {
    expect(floorPart(survey, L1(), names, "rooms", 0, 100)).toEqual({
      floor: "L1", part: "rooms", total: 1, offset: 0,
      rooms: [{ id: "L1-shop-12", name: "Shop 12", kind: "room", centre: [2, 2], place: { id: "pl_sb", name: "Starbucks" }, stop: "lift" }],
    });
    // Each part comes in id order; a place gives the frames it was filmed on, for view_frame.
    expect(floorPart(survey, L1(), names, "places", 0, 100)).toEqual({
      floor: "L1", part: "places", total: 2, offset: 0,
      places: [
        { id: "pl_gc", name: "Gong Cha", category: "retail", status: "proposed", frames: [{ id: "kf_2", file: "L1 walk.mp4", timeMs: 2000 }] },
        {
          id: "pl_sb", name: "Starbucks", category: "retail", status: "confirmed", roomId: "L1-shop-12",
          frames: [{ id: "kf_1", file: "L1 walk.mp4", timeMs: 1000 }],
        },
      ],
    });
    expect(floorPart(survey, L1(), names, "pathways", 0, 100)).toMatchObject({
      pathways: [{ id: "pw_1", name: "Mall street", widthM: 2.4, lengthM: 5, from: [0, 0], to: [5, 0] }],
    });
    expect(floorPart(survey, L1(), names, "entrances", 0, 100)).toMatchObject({
      entrances: [{ id: "e_1", name: "Main", roomId: "L1-shop-12", point: [1, 1] }],
    });
    expect(floorPart(survey, L1(), names, "places", 1, 1)).toMatchObject({
      floor: "L1", part: "places", total: 2, offset: 1,
      places: [{ id: "pl_sb", name: "Starbucks" }],
    });
    expect(floorPart(survey, L1(), names, "places", 0, 1)).toMatchObject({ next: 1 });
  });

  it("says who proposed a place, its version once it has one, and a walkway's kind", () => {
    const model = parseModel({
      ...survey,
      places: [
        { id: "pl_gc", nameEn: "Gong Cha", category: "retail", levelId: "oth-L1", status: "proposed", proposedBy: "Claude Code (Wei)", version: 3 },
        { id: "pl_walk", nameEn: "Festive Walk", category: "facility", levelId: "oth-L1", pathwayKindId: "walkway" },
      ],
    });
    expect(floorPart(model, findLevel(model, "L1")!, names, "places", 0, 100)).toMatchObject({
      places: [
        { id: "pl_gc", status: "proposed", proposedBy: "Claude Code (Wei)", version: 3 },
        { id: "pl_walk", status: "confirmed", pathwayKindId: "walkway" },
      ],
    });
  });

  it("gives a place up to 3 of its frames, the first, middle and last filmed, each with its footage and time", () => {
    const model = parseModel({
      ...survey,
      keyframes: [
        ...survey.keyframes,
        { id: "kf_5", captureId: "cap_1", timeMs: 5000, imageId: "kf_5", widthPx: 640, heightPx: 480 },
        { id: "kf_4", captureId: "cap_1", timeMs: 4000, imageId: "kf_4", widthPx: 640, heightPx: 480 },
      ],
      sightings: [
        { id: "sg_5", placeId: "pl_sb", keyframeId: "kf_5" },
        { id: "sg_3", placeId: "pl_sb", keyframeId: "kf_3" },
        { id: "sg_1", placeId: "pl_sb", keyframeId: "kf_1" },
        { id: "sg_4", placeId: "pl_sb", keyframeId: "kf_4" },
        { id: "sg_2", placeId: "pl_sb", keyframeId: "kf_2" },
        // A tag deleted since is not a frame the place was seen on.
        { id: "sg_x", placeId: "pl_gc", keyframeId: "kf_9", deletedAt: "2026-09-28T00:00:00.000Z" },
      ],
    });
    const { places } = floorPart(model, findLevel(model, "L1")!, names, "places", 0, 100) as unknown as { places: { id: string; frames?: unknown }[] };
    expect(places.find(p => p.id === "pl_sb")!.frames).toEqual([
      { id: "kf_1", file: "L1 walk.mp4", timeMs: 1000 },
      { id: "kf_3", file: "L1 walk.mp4", timeMs: 3000 },
      { id: "kf_5", file: "L1 walk.mp4", timeMs: 5000 },
    ]);
    expect(places.find(p => p.id === "pl_gc")!.frames).toBeUndefined();
  });

  it("gives every part in id order, the objects' kinds too, so paging never depends on the order rows are stored in", () => {
    const at = (x: number): [number, number][] => [[x, 0], [x + 4, 0], [x + 4, 4], [x, 4]];
    const model = parseModel({
      ...survey,
      rooms: ["L1-c", "L1-a", "L1-b"].map((id, i) => ({ id, levelId: "oth-L1", kind: "room", footprint: at(i * 10), heightM: 4 })),
      places: ["pl_c", "pl_a", "pl_b"].map(id => ({ id, nameEn: id, category: "retail", levelId: "oth-L1" })),
      sightings: [],
      pathways: ["pw_c", "pw_a", "pw_b"].map(id => ({ id, levelId: "oth-L1", polyline: [[0, 0], [5, 0]] })),
      entrances: ["e_c", "e_a", "e_b"].map(id => ({ id, levelId: "oth-L1", roomId: "L1-a", point: [1, 1] })),
      portalEndpoints: [],
      objectKinds: ["ok_c", "ok_a", "ok_b"].map(id => ({ id, nameEn: id, size: { w: 0.5, d: 0.5, h: 1 } })),
      placements: ["L1-o-c", "L1-o-a", "L1-o-b"].map(id => ({ id, levelId: "oth-L1", objectKindId: "ok_a", position: [1, 1, 0] })),
    });
    const ids = (part: "rooms" | "places" | "pathways" | "entrances" | "objects", key: string = part) =>
      ((floorPart(model, findLevel(model, "L1")!, names, part, 0, 100) as unknown as Record<string, { id: string }[]>)[key] ?? []).map(i => i.id);
    expect(ids("rooms")).toEqual(["L1-a", "L1-b", "L1-c"]);
    expect(ids("places")).toEqual(["pl_a", "pl_b", "pl_c"]);
    expect(ids("pathways")).toEqual(["pw_a", "pw_b", "pw_c"]);
    expect(ids("entrances")).toEqual(["e_a", "e_b", "e_c"]);
    expect(ids("objects")).toEqual(["L1-o-a", "L1-o-b", "L1-o-c"]);
    expect(ids("objects", "kinds")).toEqual(["ok_a", "ok_b", "ok_c"]);
  });

  it("keeps every page of an L1-sized floor under 40,000 characters, and pages through all of it", () => {
    const long = "Some Rather Long Shop Name, Festive Walk";
    const big = parseModel({
      ...survey,
      rooms: Array.from({ length: 260 }, (_, i) => ({
        id: `L1-unit-${String(i).padStart(3, "0")}-${long.toLowerCase().replace(/[^a-z]+/g, "-")}`, levelId: "oth-L1",
        kind: i % 5 === 0 ? "area" : "room", walkable: i % 5 === 0, heightM: 6, nameEn: `Unit ${i}: ${long}`, version: i % 7,
        footprint: [[i * 10, 0], [i * 10 + 8, 0], [i * 10 + 8, 12], [i * 10, 12]],
        ...(i % 3 === 0 ? { verification: { status: "cad", evidence: [`pdf:${"a".repeat(64)}`] } } : {}),
      })),
      places: Array.from({ length: 200 }, (_, i) => ({
        id: `pl_${String(i).padStart(3, "0")}${"x".repeat(30)}`, nameEn: `${long} ${i}`, category: "retail", levelId: "oth-L1",
        status: i % 2 ? "proposed" : "confirmed", proposedBy: i % 2 ? "Claude Code (Demo Author)" : "",
        ...(i % 4 === 0 ? { roomId: `L1-unit-${String(i).padStart(3, "0")}-${long.toLowerCase().replace(/[^a-z]+/g, "-")}` } : {}),
        version: i % 5,
      })),
    });
    const level = findLevel(big, "L1")!;
    expect(JSON.stringify(floorPart(big, level, names, "summary", 0, 100)).length).toBeLessThan(40_000);
    for (const [part, total] of [["rooms", 260], ["places", 200]] as const) {
      for (const limit of [100, 200]) {
        const seen: { id: string }[] = [];
        let offset: number | undefined = 0;
        while (offset !== undefined) {
          const reply = floorPart(big, level, names, part, offset, limit) as Record<string, unknown> & { next?: number };
          expect(JSON.stringify(reply).length, `${part} from ${offset}`).toBeLessThan(40_000);
          seen.push(...(reply[part] as { id: string }[]));
          offset = reply.next;
        }
        expect(new Set(seen.map(s => s.id)).size, `${part}, ${limit} a page`).toBe(total);
      }
    }
  });
});

describe("floorPart's objects", () => {
  it("lists every kind of object with its places, this floor's objects, and marks an object's place", () => {
    const withObjects = parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [
        { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
        { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
      ],
      captures: [{ id: "cap_1", kind: "video", filename: "L1 walk.mp4", levelId: "oth-L1" }],
      keyframes: [{ id: "kf_1", captureId: "cap_1", timeMs: 0, imageId: "kf_1", widthPx: 640, heightPx: 480 }],
      objectKinds: [{ id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }],
      places: [{ id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "ok_bin" }],
      sightings: [{ id: "sg_1", placeId: "pl_bin", keyframeId: "kf_1" }],
      placements: [
        { id: "L1-wastebin-1", levelId: "oth-L1", objectKindId: "ok_bin", position: [10.004, 5.651, 0], rotationDeg: 90, sightingIds: ["sg_1"] },
        { id: "L2-wastebin-1", levelId: "oth-L2", objectKindId: "ok_bin", position: [1, 1, 0], sightingIds: [] },
      ],
    });
    const level = findLevel(withObjects, "L1")!;
    expect(floorPart(withObjects, level, new Map(), "objects", 0, 100)).toEqual({
      floor: "L1", part: "objects", total: 1, offset: 0,
      kinds: [{ id: "ok_bin", name: "wastebin", size: { w: 0.5, d: 0.5, h: 1 }, look: "Box", placeIds: ["pl_bin"] }],
      objects: [{ id: "L1-wastebin-1", kindId: "ok_bin", position: [10, 5.65], rotationDeg: 90, sightings: 1 }],
    });
    expect(floorPart(withObjects, level, new Map(), "places", 0, 100)).toMatchObject({
      places: [{ id: "pl_bin", name: "wastebin", category: "facility", status: "confirmed", objectKindId: "ok_bin" }],
    });
  });
});

describe("floorIssues", () => {
  it("keeps one floor's issues, errors first, and says how many more there are", () => {
    const issue = (severity: "error" | "warning", entityId: string, levelId?: string) =>
      ({ severity, code: `x.${entityId}`, message: entityId, entityType: "room" as const, entityId, levelId });
    const report: ValidationReport = {
      issues: [issue("error", "a", "oth-L1"), issue("error", "b", "oth-L2"), issue("warning", "c", "oth-L1"), issue("warning", "d", "oth-L1")],
      errorCount: 2, warningCount: 2, ok: false,
    };
    expect(floorIssues(report, "oth-L1", 2)).toEqual({
      total: 3,
      errors: 1,
      warnings: 2,
      issues: [
        { severity: "error", code: "x.a", message: "a", entityType: "room", entityId: "a" },
        { severity: "warning", code: "x.c", message: "c", entityType: "room", entityId: "c" },
      ],
      more: 1,
    });
    // Only the codes asked for, counted and listed alone.
    expect(floorIssues(report, "oth-L1", 100, ["x.d", "x.b"])).toEqual({
      codes: ["x.d", "x.b"], total: 1, errors: 0, warnings: 1,
      issues: [{ severity: "warning", code: "x.d", message: "d", entityType: "room", entityId: "d" }],
    });
  });
});

describe("frameList", () => {
  it("gives a floor's frames in filming order, filtered by what is tagged on them", () => {
    const ids = (show: "untagged" | "proposed" | "tagged" | "all") => frameList(survey, "oth-L1", show, 40, 0).frames.map(f => f.id);
    expect(ids("untagged")).toEqual(["kf_3"]);
    expect(ids("proposed")).toEqual(["kf_2"]);
    expect(ids("tagged")).toEqual(["kf_1"]);
    expect(ids("all")).toEqual(["kf_1", "kf_2", "kf_3"]);
    expect(frameList(survey, "oth-L1", "all", 1, 1)).toEqual({
      total: 3, offset: 1, frames: [{ id: "kf_2", captureId: "cap_1", timeMs: 2000, tags: 1, proposed: 1 }],
    });
  });
});

describe("spotsView", () => {
  it("gives a spot its anchor room when it stands inside it, not the first walkable room that holds it (contract v5)", () => {
    // Rehearsal 3's L1 in small: the Stadium's rectangle, first in the model, is traced right over the West
    // Concourse, and a wastebin anchored on the concourse (Gate 5's room) stands in both.
    const stadium = parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
      rooms: [
        { id: "L1-stadium", levelId: "oth-L1", kind: "area", walkable: true, footprint: [[0, 0], [40, 0], [40, 60], [0, 60]], heightM: 6 },
        { id: "L1-west-concourse-1", levelId: "oth-L1", kind: "area", walkable: true, footprint: [[0, 10], [10, 10], [10, 50], [0, 50]], heightM: 6 },
      ],
      places: [{ id: "pl-gate-5", nameEn: "Gate 5", category: "facility", levelId: "oth-L1", roomId: "L1-west-concourse-1" }],
      objectKinds: [{ id: "bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }],
    });
    const spot = (position: [number, number], anchors: string[]) => spotsView(stadium, findLevel(stadium, "L1")!, {
      spots: [{ objectKindId: "bin", position, rotationDeg: 0, sightingIds: ["sg_1"], confidence: "low", anchors }],
      unplaced: [], alreadyPlaced: 0,
    }, new Set()).spots[0]!.placement.roomId;
    expect(spot([0.5, 30], ["L1-west-concourse-1"])).toBe("L1-west-concourse-1");
    // Outside its anchor, it keeps the walkable room that holds it.
    expect(spot([20, 30], ["L1-west-concourse-1"])).toBe("L1-stadium");
  });
});

describe("frameTags", () => {
  it("says what is tagged on a frame, with each tag's place, status and box", () => {
    expect(frameTags(survey, "kf_1")).toEqual([
      { sightingId: "sg_1", placeId: "pl_sb", name: "Starbucks", category: "retail", status: "confirmed", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    ]);
    expect(frameTags(survey, "kf_3")).toEqual([]);
  });
});
