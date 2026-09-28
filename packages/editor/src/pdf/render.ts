import type { PdfDocument, PdfPage } from "./pdfjs";
import type { Box } from "./text";

type Made = { canvas: unknown; context: CanvasRenderingContext2D | null };
type CanvasFactory = { create(width: number, height: number): Made; destroy(made: Made): void };

export class CanvasTooLargeError extends Error {
  constructor(width: number, height: number) {
    super(`a ${width} × ${height} px canvas is more than this browser will hold`);
    this.name = "CanvasTooLargeError";
  }
}

export type Rendered = {
  canvas: unknown;
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Frees the canvas's memory: a 6,000 px square is 144 MB. */
  release: () => void;
};

/**
 * One window of the sheet as pixels, `pxPerPt` to the point, on white: the
 * script's `get_pixmap` with a clip. It uses pdf.js's own canvas factory: a
 * <canvas> in a browser, and @napi-rs/canvas under Node, so the tests draw
 * what the app draws.
 */
export async function renderWindow(doc: PdfDocument, page: PdfPage, window: Box, pxPerPt: number): Promise<Rendered> {
  const width = Math.max(1, Math.ceil((window.x1 - window.x0) * pxPerPt));
  const height = Math.max(1, Math.ceil((window.y1 - window.y0) * pxPerPt));
  const factory = doc.canvasFactory as CanvasFactory;
  let made: Made;
  try {
    made = factory.create(width, height);
  } catch {
    throw new CanvasTooLargeError(width, height);
  }
  const context = made.context;
  if (!context) throw new CanvasTooLargeError(width, height);
  const release = () => factory.destroy(made);
  try {
    const viewport = page.getViewport({ scale: pxPerPt, offsetX: -window.x0 * pxPerPt, offsetY: -window.y0 * pxPerPt });
    await page.render({ canvas: made.canvas as HTMLCanvasElement, canvasContext: context, viewport, background: "#ffffff" }).promise;
  } catch (err) {
    release();
    throw err;
  }
  return { canvas: made.canvas, context, width, height, release };
}

/**
 * Ink as the script reads it: the red channel darker than 170. It reads the
 * red channel only, so a red line never counts as a wall. That is kept for
 * parity with the rooms already on L1.
 */
export function inkFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, threshold = 170): Uint8Array {
  const ink = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < ink.length; p++, i += 4) ink[p] = rgba[i]! < threshold ? 1 : 0;
  return ink;
}

type Encodable = {
  toBlob?: (done: (blob: Blob | null) => void, type: string, quality: number) => void;
  encode?: (format: "jpeg", quality: number) => Promise<Uint8Array>;
};

/** The canvas as a JPEG, at the script's quality. */
export async function encodeJpeg(canvas: unknown, quality = 0.88): Promise<Blob> {
  const c = canvas as Encodable;
  if (typeof c.toBlob === "function") {
    return new Promise((resolve, reject) =>
      c.toBlob!(blob => (blob ? resolve(blob) : reject(new Error("the plan could not be saved as an image"))), "image/jpeg", quality));
  }
  // @napi-rs/canvas, which is what the tests draw on.
  if (typeof c.encode === "function") {
    return new Blob([new Uint8Array(await c.encode("jpeg", Math.round(quality * 100)))], { type: "image/jpeg" });
  }
  throw new Error("the plan could not be saved as an image");
}
