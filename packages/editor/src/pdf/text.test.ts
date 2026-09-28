import { describe, expect, it } from "vitest";
import { openPdf } from "./pdfjs";
import { placeItem, readTextItems, wordsOf, type TextItem } from "./text";
import { centred, syntheticPdf, text, textUp } from "./testing/syntheticPdf";

const centre = (i: TextItem) => [(i.box.x0 + i.box.x1) / 2, (i.box.y0 + i.box.y1) / 2] as const;

async function itemsOf(rotate: 0 | 90, content: string) {
  const { doc, close } = await openPdf(syntheticPdf([{ width: 400, height: 300, rotate, content }]));
  try {
    return await readTextItems(await doc.getPage(1));
  } finally {
    await close();
  }
}

/** Helvetica's ascent and descent, 0.741 and −0.212, stretched to span its whole size as PyMuPDF stretches them. */
const ASCENT = 0.741 / 0.953;
const DESCENT = 0.212 / 0.953;

describe("readTextItems", () => {
  it("places text on the sheet as shown: y down, and turned with the page", async () => {
    const flat = await itemsOf(0, centred(112, 159, 2, "SHOP"));
    expect(flat.map(i => i.text)).toEqual(["SHOP"]);
    const [x, y] = centre(flat[0]!);
    expect(x).toBeCloseTo(112, 1);
    // The box runs from the descent to the ascent, so its middle is this far above the baseline at 159.
    const middle = 159 + (ASCENT - DESCENT);
    expect(y).toBeCloseTo(300 - middle, 1);

    // Turned a quarter clockwise, a point (x, y) on the page is shown at (y, x).
    const [tx, ty] = centre((await itemsOf(90, centred(112, 159, 2, "SHOP")))[0]!);
    expect(tx).toBeCloseTo(middle, 1);
    expect(ty).toBeCloseTo(112, 1);
  });

  it("places text printed up the sheet, reading upward", async () => {
    const [item] = await itemsOf(0, textUp(58, 30, 1.5, "9000"));
    expect(item!.uy).toBeCloseTo(-1, 6);
    // The letters stand to the left of the baseline at x = 58, and the descent reaches right of it.
    expect(item!.box.x0).toBeCloseTo(58 - ASCENT * 1.5, 1);
    expect(item!.box.x1).toBeCloseTo(58 + DESCENT * 1.5, 1);
    expect(item!.box.y1).toBeCloseTo(270, 1);
    expect(item!.box.y0).toBeCloseTo(270 - 3.336, 1);
  });

  it("leaves out runs of text that are only spaces", async () => {
    expect(await itemsOf(0, text(10, 10, 5, "   "))).toEqual([]);
  });
});

describe("placeItem", () => {
  // An unturned sheet 300 pt high: shown, a point (x, y) is at (x, 300 − y).
  const shown = (x: number, y: number): [number, number] => [x, 300 - y];
  const HELVETICA = { ascent: 0.741, descent: -0.212 };

  it("boxes a line as PyMuPDF does: descent to ascent, at the size its two scales average to", () => {
    // L1's lettering is drawn narrow: 0.639 pt along a line for every 1.111 pt up it. The
    // box was the height, 1.111 pt up from the baseline; the script erased less, and lower.
    const item = placeItem({ str: "STORAGE", transform: [0.639, 0, 0, 1.111, 100, 200], width: 3.1, height: 1.111 }, shown, HELVETICA)!;
    const size = Math.sqrt(0.639 * 1.111);
    expect(item.box.y0).toBeCloseTo(100 - ASCENT * size, 6);
    expect(item.box.y1).toBeCloseTo(100 + DESCENT * size, 6);
    expect(item.box.x0).toBe(100);
    expect(item.box.x1).toBeCloseTo(103.1, 6);
  });

  it("keeps a font's own ascent and descent when they already span its size", () => {
    const item = placeItem({ str: "9000", transform: [2, 0, 0, 2, 0, 100], width: 4, height: 2 }, shown, { ascent: 0.9, descent: -0.25 })!;
    expect(item.box.y0).toBeCloseTo(200 - 1.8, 6);
    expect(item.box.y1).toBeCloseTo(200 + 0.5, 6);
  });

  it("boxes the side the letters stand on for a line turned half round, where PyMuPDF boxes the other", () => {
    // As L1 prints RESTAURANT: read along −x, the letters hanging below the baseline (y up).
    const item = placeItem({ str: "RESTAURANT", transform: [-1.179, 0, 0, -1.515, 241.75, 137.47], width: 7.74, height: 1.515 }, shown, HELVETICA)!;
    const size = Math.sqrt(1.179 * 1.515);
    // Shown y down, so the letters reach down the sheet from the baseline at 162.53.
    expect(item.box.y0).toBeCloseTo(162.53 - DESCENT * size, 6);
    expect(item.box.y1).toBeCloseTo(162.53 + ASCENT * size, 6);
    expect(item.box.x0).toBeCloseTo(241.75 - 7.74, 6);
    expect(item.box.x1).toBeCloseTo(241.75, 6);
    expect(item.ux).toBeCloseTo(-1, 6);
  });
});

describe("wordsOf", () => {
  it("splits a run of text into words, each about where it is printed", () => {
    const item: TextItem = { text: "9000 4500", box: { x0: 0, y0: 0, x1: 47.26, y1: 10 }, ux: 1, uy: 0 };
    const words = wordsOf([item]);
    expect(words.map(w => w.text)).toEqual(["9000", "4500"]);
    // Placed by character count: within a point of where Helvetica puts them (11.1 and 36.1).
    expect(Math.abs(words[0]!.x - 11.1)).toBeLessThan(1);
    expect(Math.abs(words[1]!.x - 36.1)).toBeLessThan(1);
    expect(words[0]!.y).toBe(5);
  });

  it("splits text reading up the sheet along its own direction", () => {
    const item: TextItem = { text: "9000 9000", box: { x0: 0, y0: 0, x1: 10, y1: 40 }, ux: 0, uy: -1 };
    const [first, second] = wordsOf([item]);
    // Read upward, so the first word is the lower one.
    expect(first!.y).toBeGreaterThan(second!.y);
    expect(first!.x).toBe(5);
  });
});
