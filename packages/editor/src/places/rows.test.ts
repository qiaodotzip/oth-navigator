import { parseModel, type ValidationReport } from "@oth/model";
import { describe, expect, it } from "vitest";
import { floorUnits } from "../flow/buildSteps";
import {
  filterRows, onMapLine, placeRows, placesSummary, readPlacesFilter, rowAction, toBindLine, whereText, type PlaceRow,
} from "./rows";

const iso = "2026-09-20T00:00:00.000Z";
const sq = (x: number): [number, number][] => [[x, 0], [x + 10, 0], [x + 10, 10], [x, 10]];
const frame = (id: string, extra = {}) => ({ id, captureId: "cap_1", imageId: id, widthPx: 640, heightPx: 480, ...extra });

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [
    { id: "L1-shop", levelId: "oth-L1", kind: "room", footprint: sq(0), heightM: 4, nameEn: "Shop" },
    { id: "L1-kiosk", levelId: "oth-L1", kind: "room", footprint: sq(20), heightM: 4 },
    { id: "L1-cafe", levelId: "oth-L1", kind: "room", footprint: sq(40), heightM: 4, nameEn: "Cafe" },
    { id: "L1-empty", levelId: "oth-L1", kind: "room", footprint: sq(60), heightM: 4, nameEn: "Unit 7" },
    { id: "L1-void", levelId: "oth-L1", kind: "void", footprint: sq(80), heightM: 4 },
    { id: "L1-old", levelId: "oth-L1", kind: "room", footprint: sq(100), heightM: 4, deletedAt: iso },
    { id: "L2-shop", levelId: "oth-L2", kind: "room", footprint: sq(0), heightM: 4, nameEn: "Upstairs" },
  ],
  captures: [{ id: "cap_1", kind: "video", filename: "l1.mp4", levelId: "oth-L1" }],
  keyframes: [frame("kf_1"), frame("kf_2"), frame("kf_bin", { deletedAt: iso })],
  places: [
    { id: "pl_star", nameEn: "Starbucks", category: "retail", levelId: "oth-L1", roomId: "L1-shop" },
    { id: "pl_books", nameEn: "Anchor Books", category: "retail", levelId: "oth-L1" },
    { id: "pl_gone", nameEn: "Gone Shop", category: "retail", levelId: "oth-L1", roomId: "L1-old" },
    { id: "pl_up", nameEn: "Up There", category: "retail", levelId: "oth-L1", roomId: "L2-shop" },
    { id: "pl_kiosk", nameEn: "Kiosk", category: "retail", levelId: "oth-L1", roomId: "L1-kiosk" },
    { id: "pl_cafe", nameEn: "Toast Box", category: "retail", levelId: "oth-L1", roomId: "L1-cafe" },
    { id: "pl_claim", nameEn: "iTea", category: "retail", levelId: "oth-L1", status: "proposed" },
    { id: "pl_walk", nameEn: "Covered link", category: "facility", levelId: "oth-L1", pathwayKindId: "pk-1" },
    { id: "pl_l2", nameEn: "Gym", category: "sports", levelId: "oth-L2", roomId: "L2-shop" },
    { id: "pl_del", nameEn: "Deleted", category: "retail", levelId: "oth-L1", deletedAt: iso },
  ],
  sightings: [
    { id: "s_star", placeId: "pl_star", keyframeId: "kf_1", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    { id: "s_books", placeId: "pl_books", keyframeId: "kf_1" },
    { id: "s_gone", placeId: "pl_gone", keyframeId: "kf_2" },
    { id: "s_up", placeId: "pl_up", keyframeId: "kf_2" },
    // A claim, and a confirmed tag on a frame in the bin: no confirmed photo.
    { id: "s_kiosk_claim", placeId: "pl_kiosk", keyframeId: "kf_2", status: "proposed" },
    { id: "s_kiosk_bin", placeId: "pl_kiosk", keyframeId: "kf_bin" },
    { id: "s_cafe", placeId: "pl_cafe", keyframeId: "kf_1" },
  ],
});

const report: ValidationReport = {
  issues: [{
    severity: "warning", code: "place.adjacencyBroken", entityType: "place", entityId: "pl_cafe", levelId: "oth-L1",
    message: '"Toast Box" and "Starbucks" appear in the same photo, but the rooms they are bound to are 52 m apart.',
  }],
  errorCount: 0,
  warningCount: 1,
  ok: true,
};

const rows = placeRows(model, report, "oth-L1");
const row = (id: string) => rows.find(r => r.place.id === id)!;

describe("placeRows", () => {
  it("lists this floor's confirmed places, gaps first, then by name, with every gap named", () => {
    expect(rows.map(r => [r.place.id, r.gaps])).toEqual([
      ["pl_books", ["unbound"]],
      ["pl_gone", ["roomGone"]],
      ["pl_kiosk", ["noConfirmedPhoto"]],
      ["pl_cafe", ["photosDisagree"]],
      ["pl_up", ["otherFloor"]],
      ["pl_star", []],
    ]);
  });

  it("leaves out proposals, walkways, other floors' places and deleted ones", () => {
    const ids = rows.map(r => r.place.id);
    for (const out of ["pl_claim", "pl_walk", "pl_l2", "pl_del"]) expect(ids).not.toContain(out);
  });

  it("counts a place on the map only when its room is live and on this floor", () => {
    expect(rows.filter(r => r.onMap).map(r => r.place.id).sort()).toEqual(["pl_cafe", "pl_kiosk", "pl_star"]);
    expect(row("pl_gone").room).toBeNull();
    expect(row("pl_up").room?.id).toBe("L2-shop");
  });

  it("says 'Not on the map' or 'Room gone' for exactly the places Bind places is waiting on", () => {
    const waiting = floorUnits(model, "oth-L1").waiting.map(p => p.id).sort();
    const missing = rows
      .filter(r => r.gaps.includes("unbound") || r.gaps.includes("roomGone"))
      .map(r => r.place.id)
      .sort();
    expect(missing).toEqual(waiting);
    expect(waiting).toEqual(["pl_books", "pl_gone"]);
  });

  it("shows each place by its best frame, never one from the bin", () => {
    expect(row("pl_star").best?.sighting.id).toBe("s_star");
    expect(row("pl_kiosk").best?.sighting.id).toBe("s_kiosk_claim");
  });

  it("reads 'photos disagree' from the report, and only from it", () => {
    expect(placeRows(model, null, "oth-L1").find(r => r.place.id === "pl_cafe")!.gaps).toEqual([]);
  });
});

describe("placesSummary", () => {
  it("counts the heading, the filters, Review's queue, the rooms with no place bound and the walkways left out", () => {
    expect(placesSummary(model, rows, "oth-L1")).toEqual({
      confirmed: 6, onMap: 3, gaps: 5, waiting: 1,
      // Unit 7. A void is not surveyed, and a deleted room is not counted.
      unboundRooms: 1,
      // Covered link: confirmed, and counted in Review, but drawn as a pathway.
      walkways: 1,
    });
  });

  it("counts only this floor's confirmed walkways", () => {
    expect(placesSummary(model, placeRows(model, report, "oth-L2"), "oth-L2").walkways).toBe(0);
  });
});

describe("rowAction", () => {
  it("shows a bound place's room on the map, on that room's own floor", () => {
    expect(rowAction(model, row("pl_star"), "L1")).toEqual({ label: "Show on map", to: "/floors/L1/build?select=room%3AL1-shop&step=bind" });
    expect(rowAction(model, row("pl_up"), "L1")).toEqual({ label: "Show on map", to: "/floors/L2/build?select=room%3AL2-shop&step=bind" });
  });

  it("sends a place with no room, or whose room is gone, to Bind places with it picked", () => {
    expect(rowAction(model, row("pl_books"), "L1")).toEqual({ label: "Bind it", to: "/floors/L1/build?place=pl_books&step=bind" });
    expect(rowAction(model, row("pl_gone"), "L1")).toEqual({ label: "Bind it", to: "/floors/L1/build?place=pl_gone&step=bind" });
  });
});

describe("whereText", () => {
  it("says where each place is on the map, after the row's heading has named it", () => {
    expect(whereText(model, row("pl_star"))).toBe("→ Shop (L1-shop)");
    expect(whereText(model, row("pl_kiosk"))).toBe("→ Unnamed room (L1-kiosk)");
    expect(whereText(model, row("pl_up"))).toBe("→ Upstairs (L2-shop) on L2");
    expect(whereText(model, row("pl_gone"))).toBe("→ a room since deleted (L1-old)");
    expect(whereText(model, row("pl_books"))).toBe("→ no room yet");
  });
});

describe("filters", () => {
  it("reads the filter leniently, gaps by default", () => {
    expect(readPlacesFilter({})).toBe("gaps");
    expect(readPlacesFilter({ filter: "all" })).toBe("all");
    expect(readPlacesFilter({ filter: "bogus" })).toBe("gaps");
  });

  it("filters to gaps, to what is on the map, or to all; the first two can overlap", () => {
    const ids = (r: PlaceRow[]) => r.map(x => x.place.id);
    expect(ids(filterRows(rows, "gaps"))).toHaveLength(5);
    expect(ids(filterRows(rows, "on-map"))).toEqual(["pl_kiosk", "pl_cafe", "pl_star"]);
    expect(filterRows(rows, "all")).toHaveLength(6);
  });
});

describe("onMapLine", () => {
  it("says how much of the survey has reached the map", () => {
    expect(onMapLine(28, 30)).toBe("28 of 30 confirmed places are on the map");
    expect(onMapLine(1, 1)).toBe("1 of 1 confirmed place is on the map");
  });
});

describe("toBindLine", () => {
  it("gives the Floors card the heading's numbers, worded apart from Review's confirmed", () => {
    expect(toBindLine(6, 17)).toBe("6 of 17 places to bind are on the map");
    expect(toBindLine(0, 1)).toBe("0 of 1 place to bind is on the map");
  });
});

describe("a kind of object", () => {
  // Filmed on L1 and confirmed, as the live wastebin is.
  const withBin = parseModel({
    ...model,
    objectKinds: [{ id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }],
    places: [...model.places, { id: "pl_bin", nameEn: "wastebin", category: "facility", objectKindId: "ok_bin" }],
    sightings: [...model.sightings, { id: "s_bin", placeId: "pl_bin", keyframeId: "kf_1" }],
  });

  it("is placed as markers, never bound, so neither the checklist nor Bind places waits on it", () => {
    expect(placeRows(withBin, report, "oth-L1").map(r => r.place.id)).not.toContain("pl_bin");
    expect(floorUnits(withBin, "oth-L1").waiting.map(p => p.id)).not.toContain("pl_bin");
  });
});
