import { parseModel, RoomDraftSchema, type RoomDraft } from "@oth/model";
import { describe, expect, it } from "vitest";
import { ApiError, ConflictError } from "../api/client";
import { checkSections, showTarget, undoRefusal } from "./check";
import { change } from "./testing";

const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4 },
    { id: "L1-gone", levelId: "oth-L1", kind: "room", footprint: sq(20), heightM: 4, deletedAt: "2026-09-28T10:00:00.000Z" },
    { id: "L2-a", levelId: "oth-L2", kind: "room", footprint: sq(0), heightM: 4 },
  ],
  portals: [{ id: "lift_1", kind: "lift" }],
  portalEndpoints: [
    { id: "pe_1", portalId: "lift_1", levelId: "oth-L1", roomId: "L1-a", point: [5, 5] },
    { id: "pe_2", portalId: "lift_1", levelId: "oth-L2", roomId: "L2-a", point: [5, 5] },
  ],
  places: [{ id: "pl_star", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-a" }],
});
const draft = (id: string, over: Partial<RoomDraft> = {}): RoomDraft => RoomDraftSchema.parse({
  id, levelId: "oth-L1", nameEn: id, kind: "room", footprint: sq(40), labelPoint: [45, 5], areaM2: 100,
  source: { checksum: "c".repeat(64), page: 1 }, ...over,
});
const on = (entityType: string, entityId: string, drafts: RoomDraft[] = []) =>
  showTarget(model, { entityType, entityId }, "oth-L1", drafts);

describe("showTarget", () => {
  it("selects what a change made, while it is still on this floor", () => {
    expect(on("room", "L1-a")).toEqual({ kind: "select", selection: { type: "room", id: "L1-a" } });
    expect(on("room", "L1-gone")).toBeNull();
    expect(on("room", "L2-a")).toBeNull();
  });

  it("shows a stop at its end on this floor, and a place at the room it is bound to", () => {
    expect(on("portal", "lift_1")).toEqual({ kind: "select", selection: { type: "portalEndpoint", id: "pe_1" } });
    expect(on("place", "pl_star")).toEqual({ kind: "select", selection: { type: "room", id: "L1-a" } });
  });

  it("frames a draft row's outline from the floor's own drafts, without selecting", () => {
    expect(on("roomDraft", "rd_1", [draft("rd_1")])).toEqual({ kind: "frame", box: { minX: 36, minY: -4, maxX: 54, maxY: 14 } });
  });

  it("has nothing to show for a draft not in the floor's drafts, an open draft with no outline, or anything the map doesn't select", () => {
    expect(on("roomDraft", "rd_1")).toBeNull();
    expect(on("roomDraft", "rd_open", [draft("rd_open", { footprint: undefined })])).toBeNull();
    expect(on("objectKind", "ok_bin")).toBeNull();
  });

  it("frames a draft row's own box first, even with an empty drafts store; null without either (contract v3, amendment 3)", () => {
    const box = { minX: 1, minY: 2, maxX: 3, maxY: 4 };
    expect(showTarget(model, { entityType: "roomDraft", entityId: "rd_1", box }, "oth-L1", [])).toEqual({ kind: "frame", box });
    expect(showTarget(model, { entityType: "roomDraft", entityId: "rd_1" }, "oth-L1", [])).toBeNull();
  });
});

describe("checkSections", () => {
  it("groups in the spec's order, low-confidence objects first, other changes last, and counts the labels apart", () => {
    const { sections, labels } = checkSections([
      change({ auditId: "p", group: "pathways" }),
      change({ auditId: "o1", group: "objects", confidence: "high" }),
      change({ auditId: "o2", group: "objects", confidence: "low" }),
      change({ auditId: "r", group: "rooms" }),
      change({ auditId: "x", group: "other" }),
      change({ auditId: "t", group: "labels" }),
    ]);
    expect(sections.map(s => [s.label, s.rows.map(r => r.auditId)])).toEqual([
      ["Rooms made from drafts", ["r"]],
      ["Objects placed", ["o2", "o1"]],
      ["Pathways", ["p"]],
      ["Other changes", ["x"]],
    ]);
    expect(labels).toBe(1);
  });

  it("lists the frames Claude binned, after entrances, where Undo can put them back", () => {
    const { sections } = checkSections([
      change({ auditId: "f", group: "frames", entityType: "keyframe", entityId: "kf_1", action: "delete" }),
      change({ auditId: "e", group: "entrances" }),
    ]);
    expect(sections.map(s => [s.label, s.rows.map(r => r.auditId)])).toEqual([["Entrances", ["e"]], ["Frames binned", ["f"]]]);
  });

  it("puts a group it doesn't know under Other changes", () => {
    const { sections } = checkSections([change({ auditId: "n", group: "navHints" as never })]);
    expect(sections.map(s => s.label)).toEqual(["Other changes"]);
  });
});

describe("undoRefusal", () => {
  it("reads the server's reason from a 409", () => {
    expect(undoRefusal(new ConflictError(null, { reason: "Wei has bound Starbucks to it since." })))
      .toBe("Wei has bound Starbucks to it since");
    expect(undoRefusal(new ConflictError(null, { error: "It has changed since." }))).toBe("It has changed since");
    expect(undoRefusal(new ConflictError(null, null))).toBe("it has changed since Claude made it");
  });

  it("is no refusal when the undo never reached the server, or the server fell over", () => {
    expect(undoRefusal(new TypeError("Failed to fetch"))).toBeNull();
    expect(undoRefusal(new ApiError(500, null))).toBeNull();
  });
});
