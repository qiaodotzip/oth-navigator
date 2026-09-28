import { describe, expect, it } from "vitest";
import { openPdf, readBytes } from "./pdfjs";
import { encodeJpeg, inkFromRgba, renderWindow } from "./render";
import { fillRect, syntheticPdf } from "./testing/syntheticPdf";

describe("renderWindow", () => {
  it.each([
    // A 10 pt black square at (100, 100) on the page. Upright, it is shown at x 100–110, y 190–200; turned, at 100–110 both ways.
    [0, { x0: 90, y0: 180, x1: 130, y1: 220 }],
    [90, { x0: 90, y0: 90, x1: 130, y1: 130 }],
  ] as const)("draws the window asked for, at its resolution, on a sheet turned %i°", async (rotate, window) => {
    const { doc, close } = await openPdf(syntheticPdf([{ width: 400, height: 300, rotate, content: fillRect(100, 100, 10, 10) }]));
    try {
      const r = await renderWindow(doc, await doc.getPage(1), window, 2);
      try {
        expect([r.width, r.height]).toEqual([80, 80]);
        const ink = inkFromRgba(r.context.getImageData(0, 0, 80, 80).data, 80, 80);
        expect(ink[30 * 80 + 30]).toBe(1);
        expect(ink[5 * 80 + 5]).toBe(0);
        expect(ink.reduce((n, v) => n + v, 0)).toBeGreaterThan(20 * 20 - 80);
      } finally {
        r.release();
      }
    } finally {
      await close();
    }
  });

  it("saves the drawing as a JPEG", async () => {
    const { doc, close } = await openPdf(syntheticPdf([{ width: 100, height: 100, content: fillRect(10, 10, 10, 10) }]));
    try {
      const r = await renderWindow(doc, await doc.getPage(1), { x0: 0, y0: 0, x1: 100, y1: 100 }, 1);
      const jpeg = await readBytes(await encodeJpeg(r.canvas));
      r.release();
      expect([jpeg[0], jpeg[1]]).toEqual([0xff, 0xd8]);
    } finally {
      await close();
    }
  });
});

describe("inkFromRgba", () => {
  it("reads ink as the script does, from the red channel darker than 170, so a red line is not a wall", () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 255, 169, 169, 169, 255, 170, 170, 170, 255]);
    expect(Array.from(inkFromRgba(rgba, 4, 1))).toEqual([1, 0, 1, 0]);
  });
});
