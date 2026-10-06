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
