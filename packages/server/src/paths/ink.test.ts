import { describe, expect, it } from "vitest";
import type { PlanImage } from "../mcp/plan";
import { INK_GREY, INK_PAIR_M, INK_SHARE, INK_SPAN_M, inkCrossed, inkRun, planInk, type PlanGrey } from "./ink";

/**
 * A sheet 10 × 10 m at 0.05 m a pixel, placed so world (0, 0) is its
 * bottom-left corner: world x runs right, world y runs up, image y runs down.
 */
const IMAGE: PlanImage = { widthPx: 200, heightPx: 200, metresPerPixel: 0.05, offsetX: 0, offsetY: 10 };
const paper = (grey = 255): PlanGrey => ({ data: new Uint8Array(200 * 200).fill(grey), widthPx: 200, heightPx: 200 });
/** A box of ink on the sheet, in metres. */
function draw(sheet: PlanGrey, x0: number, y0: number, x1: number, y1: number, grey = 0): PlanGrey {
  for (let px = Math.round(x0 / 0.05); px < Math.round(x1 / 0.05); px++) {
    for (let py = Math.round((10 - y1) / 0.05); py < Math.round((10 - y0) / 0.05); py++) {
      sheet.data[py * 200 + px] = grey;
    }
  }
  return sheet;
}
/** The run every test asks about: 8 m west to east, 5 m up the sheet. */
const across = (sheet: PlanGrey) => inkRun(sheet, IMAGE, [1, 5], [9, 5]);

describe("the ink probe (contract v6)", () => {
  it("reads an empty sheet as open floor the whole way", () => {
    const run = across(paper());
    expect(run.open).toBe(true);
    expect(run.openM).toBeCloseTo(8, 1);
    expect(run.runM).toBeCloseTo(8, 1);
    expect(run.why).toBe("");
  });

  it("stops at a wall drawn across the run, and says how far it got", () => {
    const run = across(draw(paper(), 4.9, 0, 5.1, 10));
    expect(run.open).toBe(false);
    // The wall stands 3.9 m along the run: it gets there, and no further than
    // the window that holds the wall (half of one is 0.5 m).
    expect(run.openM).toBeGreaterThan(3.3);
    expect(run.openM).toBeLessThanOrEqual(3.9);
  });

  it("crosses a dimension line: a drawing is full of thin lines, and none of them is a wall", () => {
    const run = across(draw(paper(), 4.97, 0, 5.03, 10));
    expect([run.open, run.why]).toEqual([true, ""]);
  });

  it("will not cross a wall drawn as two thin lines with white between, which the thin-line rule alone passes", () => {
    const cavity = draw(draw(paper(), 4.97, 0, 5.03, 10), 5.22, 0, 5.28, 10);
    // Each line on its own is thin enough to cross (the test above), and the pair holds under a
    // fifth of the window's ink; it is their spacing that reads as one wall.
    expect(inkRun(draw(paper(), 5.22, 0, 5.28, 10), IMAGE, [1, 5], [9, 5]).open).toBe(true);
    const run = across(cavity);
    expect(run.open).toBe(false);
    // 0.2 m of white between their inside faces — a cavity, not two drawings.
    expect(run.why).toContain("two lines 0.20 m apart");
    expect(run.openM).toBeLessThan(4.1);
  });

  it("will not cross a block of ink beside the run that spans none of it: furniture, hatching or a word", () => {
    // 1.2 × 0.4 m of ink, its near edge 0.1 m off the run: over a fifth of a window, never half a band.
    const run = across(draw(paper(), 5, 5.1, 6.2, 5.5));
    expect(run.open).toBe(false);
    expect(run.why).toContain("% of the drawing is ink");
    expect(run.openM).toBeLessThan(4.5);
  });

  it("fails closed on a run of no length: there is nothing there to read (review M1)", () => {
    for (const read of [inkRun, inkCrossed]) {
      expect(read(paper(), IMAGE, [5, 5], [5, 5])).toEqual({ open: false, openM: 0, runM: 0, why: "nothing to read" });
    }
  });

  it("fails closed off the plan's extent, however clear the paper is", () => {
    const run = inkRun(paper(), IMAGE, [1, 5], [12, 5]);
    expect(run.open).toBe(false);
    expect(run.why).toContain("off the plan");
    expect(run.openM).toBeLessThan(9.5);
  });

  it("fails closed on a plan it cannot read, such as a dark scan", () => {
    const run = across(paper(INK_GREY - 1));
    expect(run.open).toBe(false);
    expect(run.openM).toBe(0);
  });

  it("holds its measures to the drawing: a fifth of a window, a sixth of a metre of line, a wall's two faces", () => {
    expect([INK_SHARE, INK_SPAN_M, INK_PAIR_M]).toEqual([0.2, 0.15, 0.4]);
  });
});

describe("what crosses a run, asked of floor the map already has", () => {
  it("is not stopped by the ink a room is drawn with, which `run` refuses", () => {
    // The same block of ink beside the run that the open-floor question refuses: inside a room the
    // map already calls floor, furniture, fixtures and a printed name are not a reason to stop.
    const sheet = draw(paper(), 5, 5.1, 6.2, 5.5);
    expect(across(sheet).open).toBe(false);
    expect(inkCrossed(sheet, IMAGE, [1, 5], [9, 5])).toMatchObject({ open: true, why: "" });
  });

  it("is stopped by a wall across it, wherever the model thinks the floor is", () => {
    const run = inkCrossed(draw(paper(), 4.9, 0, 5.1, 10), IMAGE, [1, 5], [9, 5]);
    expect(run.open).toBe(false);
    expect(run.openM).toBeGreaterThan(3.3);
    expect(run.openM).toBeLessThanOrEqual(3.9);
  });

  it("is stopped by a partition drawn as two thin lines, and not by one of them", () => {
    expect(inkCrossed(draw(draw(paper(), 4.97, 0, 5.03, 10), 5.22, 0, 5.28, 10), IMAGE, [1, 5], [9, 5]).open).toBe(false);
    expect(inkCrossed(draw(paper(), 4.97, 0, 5.03, 10), IMAGE, [1, 5], [9, 5]).open).toBe(true);
  });

  it("fails closed off the plan, as the open-floor question does", () => {
    expect(inkCrossed(paper(), IMAGE, [1, 5], [12, 5])).toMatchObject({ open: false });
  });
});

/**
 * What INK_SPAN is set to, held in place by the three runs that set it. The shapes are the ones
 * measured on real L1's crops, at the plan's own 0.07 m a pixel, and the three names are the
 * islands they come from (the gaps rehearsal 5 left, numbered as the report's table numbers them).
 * Move INK_SPAN and one of these fails: 0.5 shuts the Studio (East 3) run, 0.9 opens the cubicles.
 */
describe("INK_SPAN, calibrated on real L1's drawing", () => {
  /** L1's plan scale. The run is 17 m west to east, 10.5 m up a 21 m sheet. */
  const PLAN: PlanImage = { widthPx: 300, heightPx: 300, metresPerPixel: 0.07, offsetX: 0, offsetY: 21 };
  const blank = (): PlanGrey => ({ data: new Uint8Array(300 * 300).fill(255), widthPx: 300, heightPx: 300 });
  const at = (m: number) => Math.round(m / 0.07);
  /**
   * A line across the run at `x`: `thickM` along the run, covering `reachM` of the 1 m band the
   * probe looks across. `dashed` leaves the gaps of a dash-dot line, which is why a grid line
   * darkens less of the band than a wall does.
   */
  function line(sheet: PlanGrey, x: number, thickM: number, reachM: number, dashed = false): PlanGrey {
    for (let col = at(x); col < at(x + thickM) + 1; col++) {
      for (let row = at(21 - 10.5 - reachM / 2); row < at(21 - 10.5 + reachM / 2); row++) {
        if (dashed && row % 10 >= 7) continue;
        sheet.data[row * 300 + col] = 0;
      }
    }
    return sheet;
  }
  const crossing = (sheet: PlanGrey) => inkCrossed(sheet, PLAN, [2, 10.5], [19, 10.5]);

  it("lets the Studio (East 3) run through: a dash-dot grid line and a thin slab edge 0.31 m apart, in open Town Square", () => {
    // At 0.5 the grid line counts as spanning the run, the pair rule reads the two as one wall's
    // faces, and this run — the one bridge L1 has — is refused 10.2 m along.
    const townSquare = line(line(blank(), 8, 0.07, 3, true), 8.31, 0.07, 3);
    expect(crossing(townSquare)).toMatchObject({ open: true, why: "" });
  });

  it("still refuses the cubicles inside the opened Public Service Centre (island i17)", () => {
    // A partition 0.2 m thick across most, not all, of the band: it spans the run at 0.8 and stops
    // the bridge. At 0.9 it does not, which is the setting this test exists to refuse.
    const cubicle = crossing(line(blank(), 8, 0.2, 0.85));
    expect(cubicle.open).toBe(false);
    expect(cubicle.why).toContain("a line along");
  });

  it("still refuses the hawker centre's planter (island i09)", () => {
    // Its kerb is solid and crosses the whole band: no setting of INK_SPAN lets this through.
    expect(crossing(line(blank(), 8, 0.2, 1.2)).open).toBe(false);
  });
});

describe("planInk", () => {
  it("reads the plan's own bytes, as view_plan does, and answers the same as the pixels", async () => {
    const sharp = (await import("sharp")).default;
    const sheet = draw(paper(), 4.9, 0, 5.1, 10);
    const png = await sharp(Buffer.from(sheet.data), { raw: { width: 200, height: 200, channels: 1 } }).png().toBuffer();
    const ink = await planInk(new Uint8Array(png), IMAGE);
    expect(ink.run([1, 5], [9, 5]).open).toBe(false);
    expect(ink.run([1, 1], [4, 1]).open).toBe(true);
    expect(ink.crossed([1, 5], [9, 5]).open).toBe(false);
    expect(ink.crossed([1, 1], [4, 1]).open).toBe(true);
  });

  it("gives no probe at all for bytes that are no picture, so nothing is bridged", async () => {
    await expect(planInk(new Uint8Array([1, 2, 3]), IMAGE)).rejects.toThrow();
  });
});
