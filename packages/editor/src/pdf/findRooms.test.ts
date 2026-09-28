import { pointInPolygon } from "@oth/model";
import { describe, expect, it } from "vitest";
import { prepareFind } from "./extract";
import { findRooms, roomsExtent, type FindInput, type FindResult } from "./findRooms";
import type { ModelLine } from "./labels";
import { openPdf } from "./pdfjs";
import { runFindRooms } from "./runFind";
import { readSheet } from "./sheet";
import { planSheet, storedTurned, syntheticPdf, type SyntheticPage } from "./testing/syntheticPdf";

const MPP = 0.1;

/** A blank raster at 0.1 m a pixel, whose model origin makes pixel (x, y) the point (x/10, (H − y)/10). */
function raster(width: number, height: number) {
  const ink = new Uint8Array(width * height);
  const box = (x0: number, y0: number, x1: number, y1: number, wall = 2) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const edge = x < x0 + wall || x >= x1 - wall || y < y0 + wall || y >= y1 - wall;
        if (edge) ink[y * width + x] = 1;
      }
    }
  };
  const clear = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) ink.fill(0, y * width + x0, y * width + x1);
  };
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) ink.fill(1, y * width + x0, y * width + x1);
  };
  const at = (px: number, py: number): [number, number] => [px * MPP, (height - py) * MPP];
  /** A line of text centred at pixel (px, py), 1.6 × 0.6 m unless told otherwise. */
  const label = (text: string, px: number, py: number, halfW = 0.8, halfH = 0.3): ModelLine => {
    const [x, y] = at(px, py);
    return { text, x, y, box: { minX: x - halfW, minY: y - halfH, maxX: x + halfW, maxY: y + halfH } };
  };
  const input = (lines: ModelLine[]): FindInput => ({
    ink, width, height, metresPerPixel: MPP, originX: 0, originY: height * MPP, lines,
  });
  return { ink, box, clear, fill, label, input };
}

const names = (r: FindResult) => r.drafts.map(d => d.nameEn).sort();

describe("findRooms, on a raster", () => {
  it("floods a room from its label and puts its walls back where they were", () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    const { drafts } = findRooms(r.input([r.label("SHOP", 100, 80)]));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ nameEn: "Shop", kind: "room", holes: [] });
    // 10 × 8 m inside 0.2 m walls, less the corners the script's clean cuts.
    expect(drafts[0]!.areaM2).toBeGreaterThan(70);
    expect(drafts[0]!.areaM2).toBeLessThanOrEqual(9.6 * 7.6);
    const xs = drafts[0]!.footprint!.map(p => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(5.2, 1);
    expect(Math.max(...xs)).toBeCloseTo(14.8, 1);
  });

  it("does not join two rooms through a door narrower than a metre", () => {
    const r = raster(260, 160);
    r.box(30, 40, 132, 120);
    r.box(130, 40, 230, 120);
    r.clear(130, 76, 132, 85);
    const { drafts } = findRooms(r.input([r.label("SHOP", 80, 80), r.label("STORE", 180, 80)]));
    expect(drafts.map(d => d.nameEn).sort()).toEqual(["Shop", "Store"]);
    for (const d of drafts) expect(d.areaM2).toBeLessThan(80);
  });

  it("takes a doorway wider than a metre as a way through, so both labels name one space", () => {
    const r = raster(260, 160);
    r.box(30, 40, 132, 120);
    r.box(130, 40, 230, 120);
    r.clear(130, 70, 132, 90);
    const { drafts } = findRooms(r.input([r.label("SHOP", 80, 80), r.label("STORE ROOM", 180, 80)]));
    expect(drafts.map(d => d.nameEn)).toEqual(["Store Room"]);
  });

  it("erases the lettering first, so a name's own ink does not wall it off", () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    r.fill(94, 78, 106, 82);
    expect(names(findRooms(r.input([r.label("SHOP", 100, 80)])))).toEqual(["Shop"]);
  });

  it("leaves escalators out and reports them, with where they are", () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    const { drafts, skippedLabels } = findRooms(r.input([r.label("ESCALATOR", 100, 80)]));
    expect(drafts).toEqual([]);
    expect(skippedLabels).toEqual([{ text: "Escalator", at: [10, 8] }]);
  });

  it("makes a void a void draft, where the script dropped it", () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    expect(findRooms(r.input([r.label("VOID", 100, 80)])).drafts[0]).toMatchObject({ nameEn: "Void", kind: "void" });
  });

  it("lists a plaza the drawing leaves open as a space to draw by hand, with no shape", () => {
    const r = raster(600, 600);
    r.box(50, 50, 150, 130);
    const { drafts } = findRooms(r.input([r.label("PLAZA", 400, 400)]));
    expect(drafts).toEqual([{ nameEn: "Plaza", kind: "area", holes: [], labelPoint: [40, 20], areaM2: 0 }]);
  });

  it("skips what is not the name of a space", () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    const lines = [r.label("UP TO 2ND FLR", 100, 70), r.label("PL-01", 100, 80), r.label("FFL +111.50", 100, 90)];
    expect(findRooms(r.input(lines)).drafts).toEqual([]);
  });

  it("keeps only spaces from 3 to 2,500 m²", () => {
    // A 1.3 × 1.3 m cupboard, named in lettering small enough to leave its walls alone.
    const r = raster(200, 160);
    r.box(85, 65, 102, 82);
    expect(findRooms(r.input([r.label("STORE", 93, 73, 0.2, 0.1)])).drafts).toEqual([]);
  });

  it("keeps a hole of 6 m² or more, and fills a smaller one", () => {
    const r = raster(300, 260);
    r.box(20, 20, 280, 240);
    r.box(60, 60, 95, 95);
    r.box(200, 180, 215, 195);
    const [room] = findRooms(r.input([r.label("HALL", 150, 130)])).drafts;
    expect(room!.holes).toHaveLength(1);
  });

  it("gives the extent of the rooms it found, which Part D's finders stay inside", () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    const extent = roomsExtent(findRooms(r.input([r.label("SHOP", 100, 80)])).drafts)!;
    expect(extent.minX).toBeCloseTo(5.2, 1);
    expect(extent.maxY).toBeCloseTo(11.8, 1);
  });

  it("runs in place where there is no Worker, as under the tests", async () => {
    const r = raster(200, 160);
    r.box(50, 40, 150, 120);
    expect(names(await runFindRooms(r.input([r.label("SHOP", 100, 80)])))).toEqual(["Shop"]);
  });
});

const UPRIGHT: SyntheticPage = { width: 400, height: 300, content: planSheet() };

/** A sheet found the way the app finds a real one. */
async function findOnSheet(page: SyntheticPage, image = { metresPerPixel: 0.05, offsetX: 0, offsetY: 0 }) {
  const { doc, close } = await openPdf(syntheticPdf([page]));
  try {
    const p = await doc.getPage(1);
    const reading = await readSheet(p);
    const w = reading.window;
    const sheet = { clipPt: [w.x0, w.y0, w.x1, w.y1] as const, pointsPerPixel: image.metresPerPixel / reading.calibration.metresPerPoint! };
    return findRooms(await prepareFind(doc, p, sheet, image, MPP));
  } finally {
    await close();
  }
}

describe("findRooms, on a sheet", () => {
  it("finds the plan's rooms: two either side of a door, a void, an open plaza, and an escalator left out", async () => {
    const { drafts, skippedLabels } = await findOnSheet(UPRIGHT);
    const byName = Object.fromEntries(drafts.map(d => [d.nameEn, d]));
    expect(Object.keys(byName).sort()).toEqual(["Changing Room", "Plaza", "Shop", "Void"]);
    expect(byName.Shop!.kind).toBe("room");
    expect(byName.Void!.kind).toBe("void");
    expect(byName.Plaza!.footprint).toBeUndefined();
    // 12 × 10 m and 9 × 10 m inside 0.2 m walls, less the cut corners and the door.
    expect(byName.Shop!.areaM2).toBeGreaterThan(105);
    expect(byName.Shop!.areaM2).toBeLessThan(118);
    expect(byName["Changing Room"]!.areaM2).toBeGreaterThan(105);
    expect(byName.Void!.areaM2).toBeGreaterThan(78);
    expect(skippedLabels.map(s => s.text)).toEqual(["Escalator"]);
  });

  it.each([
    // Stored as L1's sheet is: a portrait page that /Rotate turns back to landscape.
    ["stored turned by 90°", storedTurned(planSheet(), 90)],
    ["stored turned by 270°", storedTurned(planSheet(), 270)],
    ["on a MediaBox that starts at (100, 50)", { ...UPRIGHT, origin: [100, 50] as [number, number] }],
  ])("finds the same rooms, in the same places, on a sheet %s", async (_how, page) => {
    const upright = await findOnSheet(UPRIGHT);
    const other = await findOnSheet(page);
    const byName = (r: FindResult) => Object.fromEntries(r.drafts.map(d => [d.nameEn, d]));
    expect(Object.keys(byName(other)).sort()).toEqual(Object.keys(byName(upright)).sort());
    for (const [name, d] of Object.entries(byName(upright))) {
      const o = byName(other)[name]!;
      expect(Math.abs(o.areaM2 - d.areaM2)).toBeLessThan(1);
      expect(o.labelPoint[0]).toBeCloseTo(d.labelPoint[0], 0);
      expect(o.labelPoint[1]).toBeCloseTo(d.labelPoint[1], 0);
    }
    // Text and raster in one frame: every name sits inside the space it named.
    for (const d of other.drafts) {
      if (d.footprint) expect(pointInPolygon(d.labelPoint, d.footprint, d.holes ?? [])).toBe(true);
    }
  });

  it("finds the rooms where the plan is now: a plan moved by Align moves every draft by as much", async () => {
    const here = await findOnSheet(UPRIGHT);
    const moved = await findOnSheet(UPRIGHT, { metresPerPixel: 0.05, offsetX: 100, offsetY: -50 });
    const shop = (r: FindResult) => r.drafts.find(d => d.nameEn === "Shop")!.footprint!;
    const a = shop(here);
    const b = shop(moved);
    expect(b).toHaveLength(a.length);
    b.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(a[i]![0] + 100, 1);
      expect(p[1]).toBeCloseTo(a[i]![1] - 50, 1);
    });
  });
});
