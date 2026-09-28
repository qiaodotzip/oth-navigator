import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import {
  boundToRoom, framesText, kindNameProblem, makeObjectWrites, mapRoomIds, notAnObject, objectCandidates, objectRows,
  onMapText, parseSize, referenceObject, sizeFields,
} from "./objects";

const iso = "2026-09-20T00:00:00.000Z";
const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];
const frame = (id: string) => ({ id, captureId: "cap_1", imageId: id, widthPx: 640, heightPx: 480 });
const object = (id: string, levelId: string, objectKindId: string, extra = {}) =>
  ({ id, levelId, objectKindId, position: [3, 3, 0], ...extra });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
    { id: "oth-L3", buildingId: "oth", code: "L3", ordinal: 3, nameEn: "L3", nameZh: "三楼", elevationM: 10, heightM: 4 },
  ],
  rooms: [
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4 },
    { id: "L1-old", levelId: "oth-L1", kind: "room", footprint: sq(20), heightM: 4, deletedAt: iso },
  ],
  assets: [{
    id: "asset_recycle", filename: "recycle.glb", storagePath: "a", checksum: "c", sizeBytes: 10, triangleCount: 5,
    bbox: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
  }],
  objectKinds: [
    { id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } },
    { id: "ok_recycle", nameEn: "Recycling bin", size: { w: 0.6, d: 0.5, h: 1.1 }, assetId: "asset_recycle" },
    { id: "ok_bench", nameEn: "Old bench", size: { w: 2, d: 0.6, h: 0.5 }, deletedAt: iso },
  ],
  captures: [{ id: "cap_1", kind: "video", filename: "level 1.mp4", levelId: "oth-L1" }],
  keyframes: ["kf_1", "kf_2", "kf_3", "kf_4", "kf_5"].map(frame),
  places: [
    // As on the live server: facility, filmed on L1, filed under no floor.
    { id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "ok_bin" },
    { id: "pl_recycle", nameEn: "Recycling bin", category: "facility", objectKindId: "ok_recycle" },
    { id: "pl_cooler", nameEn: "water cooler", category: "facility" },
    { id: "pl_fire", nameEn: "Fire cabinet", category: "facility", status: "proposed", proposedBy: "Claude Code (Stef)" },
    { id: "pl_gone", nameEn: "Gone Shop", category: "retail", levelId: "oth-L1", roomId: "L1-old" },
    { id: "pl_star", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-shop" },
    { id: "pl_walk", nameEn: "Covered link", category: "facility", pathwayKindId: "pk-1" },
    { id: "pl_del", nameEn: "Deleted", category: "facility", deletedAt: iso },
  ],
  sightings: [
    { id: "s1", placeId: "pl_bin", keyframeId: "kf_1" },
    { id: "s2", placeId: "pl_bin", keyframeId: "kf_2", box: { x: 0.4, y: 0.4, w: 0.2, h: 0.3 } },
    { id: "s3", placeId: "pl_bin", keyframeId: "kf_3" },
    { id: "s4", placeId: "pl_bin", keyframeId: "kf_4" },
    { id: "s5", placeId: "pl_bin", keyframeId: "kf_5" },
    { id: "s6", placeId: "pl_cooler", keyframeId: "kf_3" },
  ],
  placements: [
    object("L1-bin-2", "oth-L1", "ok_bin"),
    object("L1-bin-1", "oth-L1", "ok_bin"),
    object("L2-bin-1", "oth-L2", "ok_bin"),
    object("L1-bin-gone", "oth-L1", "ok_bin", { deletedAt: iso }),
  ],
});

describe("objectRows", () => {
  const rows = objectRows(model);
  const row = (id: string) => rows.find(r => r.kind.id === id)!;

  it("lists each live kind, by name", () => {
    expect(rows.map(r => r.kind.id)).toEqual(["ok_recycle", "ok_bin"]);
  });

  it("says Box until the kind has a model, and Model once it has", () => {
    expect(row("ok_bin").look).toBe("Box");
    expect(row("ok_recycle").look).toBe("Model");
  });

  it("says Box for a kind whose model is missing, which is how it is drawn", () => {
    const lost = parseModel({ ...model, assets: [] });
    expect(objectRows(lost).find(r => r.kind.id === "ok_recycle")?.look).toBe("Box");
  });

  it("counts the live objects of each kind per floor, lowest floor first", () => {
    expect(row("ok_bin").onMap).toEqual([{ code: "L1", count: 2 }, { code: "L2", count: 1 }]);
    expect(row("ok_recycle").onMap).toEqual([]);
  });

  it("counts the frames it is seen in, best one first", () => {
    expect(row("ok_bin").frames).toBe(5);
    expect(row("ok_bin").best?.sighting.id).toBe("s2");
    expect(row("ok_recycle").best).toBeNull();
  });
});

describe("onMapText and framesText", () => {
  it("says where its objects are, or that none is on the map yet", () => {
    const rows = objectRows(model);
    expect(onMapText(rows.find(r => r.kind.id === "ok_bin")!)).toBe("On the map: L1 2 · L2 1");
    expect(onMapText(rows.find(r => r.kind.id === "ok_recycle")!)).toBe("Not on the map yet");
  });

  it("counts frames in words", () => {
    expect([framesText(0), framesText(1), framesText(5)]).toEqual(["No frames", "1 frame", "5 frames"]);
  });
});

describe("objectCandidates", () => {
  it("offers every place that could be an object: proposals and places no floor claims included, by name", () => {
    expect(objectCandidates(model).map(p => p.id)).toEqual(["pl_fire", "pl_gone", "pl_cooler"]);
  });
});

describe("parseSize", () => {
  it("reads metres, with or without a leading zero", () => {
    expect(parseSize({ w: "0.6", d: " .5 ", h: "1" })).toEqual({ ok: true, size: { w: 0.6, d: 0.5, h: 1 } });
  });

  it("refuses a side that is blank, zero, negative, not a number, or written with a comma", () => {
    for (const w of ["", "0", "-1", "abc", "1,2"]) {
      expect(parseSize({ w, d: "0.5", h: "1" })).toEqual({ ok: false, reason: "Give each side in metres, above 0, like 0.6." });
    }
  });

  it("refuses a side over 10 m, which is almost always centimetres", () => {
    expect(parseSize({ w: "60", d: "0.5", h: "1" }))
      .toEqual({ ok: false, reason: "60 m is more than 10 m. Sizes are in metres: 60 cm is 0.6." });
  });

  it("round-trips a size through the form's fields", () => {
    expect(parseSize(sizeFields({ w: 0.45, d: 0.3, h: 1.2 }))).toEqual({ ok: true, size: { w: 0.45, d: 0.3, h: 1.2 } });
  });
});

describe("makeObjectWrites", () => {
  const cooler = model.places.find(p => p.id === "pl_cooler")!;

  it("makes a kind named for the place, at the size asked, and says which kind the place joins", () => {
    expect(makeObjectWrites(cooler, "water cooler", { w: 0.4, d: 0.4, h: 1.2 }, model.objectKinds, () => "ok_new")).toEqual({
      objectKind: { id: "ok_new", nameEn: "water cooler", nameZh: "", size: { w: 0.4, d: 0.4, h: 1.2 } },
      objectKindId: "ok_new",
    });
  });

  it("joins a kind of the same name, whatever its case, at that kind's size", () => {
    const again = { ...cooler, id: "pl_bin_l2", nameEn: "Wastebin " };
    expect(makeObjectWrites(again, "Wastebin ", { w: 9, d: 9, h: 9 }, model.objectKinds))
      .toEqual({ objectKind: null, objectKindId: "ok_bin" });
  });

  it("joins the kind chosen whatever the place is called, so wast can be a wastebin", () => {
    const wast = { ...cooler, id: "pl_wast", nameEn: "wast" };
    expect(makeObjectWrites(wast, "wastebin", { w: 9, d: 9, h: 9 }, model.objectKinds))
      .toEqual({ objectKind: null, objectKindId: "ok_bin" });
  });

  it("never joins a deleted kind", () => {
    expect(makeObjectWrites(cooler, "Old bench", { w: 2, d: 0.6, h: 0.5 }, model.objectKinds, () => "ok_new").objectKindId)
      .toBe("ok_new");
  });

  it("names a new kind as typed, and gives it the place's Chinese name only when it is named for the place", () => {
    const wast = { ...cooler, id: "pl_wast", nameEn: "wast", nameZh: "垃圾" };
    const size = { w: 0.4, d: 0.4, h: 0.9 };
    expect(makeObjectWrites(wast, " Litter bin ", size, model.objectKinds, () => "ok_new").objectKind)
      .toEqual({ id: "ok_new", nameEn: "Litter bin", nameZh: "", size });
    expect(makeObjectWrites(wast, "Wast", size, model.objectKinds, () => "ok_new").objectKind)
      .toEqual({ id: "ok_new", nameEn: "Wast", nameZh: "垃圾", size });
  });
});

describe("kindNameProblem", () => {
  it("accepts a new name, or the kind's own in another case", () => {
    expect(kindNameProblem(model.objectKinds, "ok_bin", "Litter bin")).toBeNull();
    expect(kindNameProblem(model.objectKinds, "ok_bin", "Wastebin")).toBeNull();
  });

  it("refuses a blank name", () => {
    expect(kindNameProblem(model.objectKinds, "ok_bin", "  ")).toBe("Give the kind a name.");
  });

  it("refuses the name of another live kind, as the survey matches names", () => {
    expect(kindNameProblem(model.objectKinds, "ok_bin", "  recycling   BIN "))
      .toBe("There is a kind called Recycling bin already.");
  });

  it("lets a deleted kind's name be used again", () => {
    expect(kindNameProblem(model.objectKinds, "ok_bin", "Old bench")).toBeNull();
  });
});

describe("notAnObject", () => {
  it("gives the places of a kind none of which is on the map, to be places again", () => {
    expect(notAnObject(model, "ok_recycle")?.map(p => p.id)).toEqual(["pl_recycle"]);
  });

  it("refuses while any object of the kind is on the map, which would be left a kind of nothing", () => {
    expect(notAnObject(model, "ok_bin")).toBeNull();
  });

  it("does not count an object since deleted", () => {
    const cleared = parseModel({ ...model, placements: [model.placements.find(p => p.id === "L1-bin-gone")!] });
    expect(notAnObject(cleared, "ok_bin")?.map(p => p.id)).toEqual(["pl_bin"]);
  });
});

describe("boundToRoom", () => {
  const rooms = mapRoomIds(model);

  it("says a place bound to a room on the map is bound, and one whose room was deleted is not", () => {
    const place = (id: string) => model.places.find(p => p.id === id)!;
    expect(boundToRoom(place("pl_star"), rooms)).toBe(true);
    expect(boundToRoom(place("pl_gone"), rooms)).toBe(false);
    expect(boundToRoom(place("pl_cooler"), rooms)).toBe(false);
  });
});

describe("referenceObject", () => {
  it("takes this floor's object of the kind, first by id", () => {
    expect(referenceObject(model, "ok_bin", "oth-L1")?.id).toBe("L1-bin-1");
    expect(referenceObject(model, "ok_bin", "oth-L2")?.id).toBe("L2-bin-1");
  });

  it("takes another floor's when this floor has none, and none when the map has none", () => {
    expect(referenceObject(model, "ok_bin", "oth-L3")?.id).toBe("L1-bin-1");
    expect(referenceObject(model, "ok_recycle", "oth-L1")).toBeNull();
  });
});
