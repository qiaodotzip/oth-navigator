import type { FindInput } from "./findRooms";
import type { ModelLine } from "./labels";
import type { PdfDocument, PdfPage } from "./pdfjs";
import { inkFromRgba, renderWindow, type Rendered } from "./render";
import { fitBudget, sheetToModel, type ImagePlace, type SheetPlacement } from "./sheet";
import { readTextItems, type TextItem } from "./text";

/** The script's finding resolution: a 0.5 m pinch is 10 pixels. */
export const FIND_METRES_PER_PIXEL = 0.05;
/** Rows of the canvas read at a time: a few MB of RGBA, where the whole of L1's window is over 100 MB. */
const INK_BAND_ROWS = 256;

/** The canvas's ink, a band of rows at a time, so the whole window is never held as RGBA twice over. */
function readInk({ context, width, height }: Rendered): Uint8Array {
  const ink = new Uint8Array(width * height);
  for (let y = 0; y < height; y += INK_BAND_ROWS) {
    const rows = Math.min(INK_BAND_ROWS, height - y);
    ink.set(inkFromRgba(context.getImageData(0, y, width, rows).data, width, rows), y * width);
  }
  return ink;
}

export function modelLine(item: TextItem, toModel: (x: number, y: number) => [number, number]): ModelLine {
  const [ax, ay] = toModel(item.box.x0, item.box.y0);
  const [bx, by] = toModel(item.box.x1, item.box.y1);
  const box = { minX: Math.min(ax, bx), minY: Math.min(ay, by), maxX: Math.max(ax, bx), maxY: Math.max(ay, by) };
  return { text: item.text, box, x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

/**
 * PDF user space (points, y up, before the page's /Rotate) → model metres,
 * through the plan as it is placed now: the transform the rooms are traced
 * with, which Part D's finders take for the drawing's paths.
 */
export function userSpaceToModel(page: PdfPage, sheet: SheetPlacement, image: ImagePlace): (pt: [number, number]) => [number, number] {
  const viewport = page.getViewport({ scale: 1 });
  const toModel = sheetToModel(sheet, image);
  return ([x, y]) => {
    const [sx, sy] = viewport.convertToViewportPoint(x, y) as [number, number];
    return toModel(sx, sy);
  };
}

/**
 * A page of the drawing as the finder takes it (spec §5.2 step 5): the plan's
 * window rendered at 0.05 m a pixel, or coarser to fit the pixel budget, and
 * its text, both placed where the plan is now. The raster's top-left corner
 * is the image's, so it sits at the image's offset.
 */
export async function prepareFind(
  doc: PdfDocument, page: PdfPage, sheet: SheetPlacement, image: ImagePlace, metresPerPixel = FIND_METRES_PER_PIXEL,
): Promise<FindInput> {
  const [x0, y0, x1, y1] = sheet.clipPt;
  const window = { x0, y0, x1, y1 };
  const metresPerPoint = image.metresPerPixel / sheet.pointsPerPixel;
  const mpp = fitBudget(window, metresPerPoint, metresPerPixel);
  const rendered = await renderWindow(doc, page, window, metresPerPoint / mpp);
  let ink: Uint8Array;
  try {
    ink = readInk(rendered);
  } finally {
    rendered.release();
  }
  const toModel = sheetToModel(sheet, image);
  const lines = (await readTextItems(page)).map(item => modelLine(item, toModel));
  return { ink, width: rendered.width, height: rendered.height, metresPerPixel: mpp, originX: image.offsetX, originY: image.offsetY, lines };
}
