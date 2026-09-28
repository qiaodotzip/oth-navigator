import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { worldToScreen } from "../plan/viewport";
import { selectionBBox, zoomViewportTo } from "./zoomTo";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [{ id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[100, 100], [120, 100], [120, 110], [100, 110]], heightM: 3 }],
  pathways: [{ id: "L1-p", levelId: "oth-L1", polyline: [[0, 50], [80, 50]], widthM: 4 }],
  entrances: [{ id: "en-1", levelId: "oth-L1", roomId: "L1-a", point: [105, 105] }],
});

describe("selectionBBox", () => {
  it("frames a room with some floor around it", () => {
    const box = selectionBBox(model, { type: "room", id: "L1-a" })!;
    expect(box.minX).toBeLessThan(100);
    expect(box.maxX).toBeGreaterThan(120);
    expect(box.minY).toBeLessThan(100);
    expect(box.maxY).toBeGreaterThan(110);
  });

  it("gives a straight pathway some height, so it can be framed at all", () => {
    const box = selectionBBox(model, { type: "pathway", id: "L1-p" })!;
    expect(box.maxY - box.minY).toBeGreaterThan(4);
  });

  it("frames a point with its surroundings, rather than filling the screen with it", () => {
    const box = selectionBBox(model, { type: "entrance", id: "en-1" })!;
    expect(box.maxX - box.minX).toBeGreaterThanOrEqual(20);
  });

  it("frames nothing for nothing selected, for something gone, or before the map loads", () => {
    expect(selectionBBox(model, null)).toBeNull();
    expect(selectionBBox(model, { type: "room", id: "gone" })).toBeNull();
    expect(selectionBBox(null, { type: "room", id: "L1-a" })).toBeNull();
  });
});

describe("zoomViewportTo", () => {
  it("puts the selection in the middle of the canvas", () => {
    const vp = zoomViewportTo(model, { type: "room", id: "L1-a" }, 1000, 700)!;
    const [x, y] = worldToScreen(vp, [110, 105]);
    expect(x).toBeCloseTo(500);
    expect(y).toBeCloseTo(350);
  });

  it("has no view of nothing", () => {
    expect(zoomViewportTo(model, null, 1000, 700)).toBeNull();
  });
});
