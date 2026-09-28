import { describe, expect, it } from "vitest";
import { openPdf } from "./pdfjs";
import { readTextItems, wordsOf, type TextItem } from "./text";
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

describe("readTextItems", () => {
  it("places text on the sheet as shown: y down, and turned with the page", async () => {
    const flat = await itemsOf(0, centred(112, 159, 2, "SHOP"));
    expect(flat.map(i => i.text)).toEqual(["SHOP"]);
    const [x, y] = centre(flat[0]!);
    expect(x).toBeCloseTo(112, 1);
    expect(y).toBeCloseTo(300 - 160, 1);

    // Turned a quarter clockwise, a point (x, y) on the page is shown at (y, x).
    const [tx, ty] = centre((await itemsOf(90, centred(112, 159, 2, "SHOP")))[0]!);
    expect(tx).toBeCloseTo(160, 1);
    expect(ty).toBeCloseTo(112, 1);
  });

  it("places text printed up the sheet, reading upward", async () => {
    const [item] = await itemsOf(0, textUp(58, 30, 1.5, "9000"));
    expect(item!.uy).toBeCloseTo(-1, 6);
    expect(item!.box.x0).toBeCloseTo(56.5, 1);
    expect(item!.box.x1).toBeCloseTo(58, 1);
    expect(item!.box.y1).toBeCloseTo(270, 1);
    expect(item!.box.y0).toBeCloseTo(270 - 3.336, 1);
  });

  it("leaves out runs of text that are only spaces", async () => {
    expect(await itemsOf(0, text(10, 10, 5, "   "))).toEqual([]);
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
