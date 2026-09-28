import { calibrate, type Calibration, type Run } from "./calibrate";
import type { PdfPage } from "./pdfjs";
import { readTextItems, wordsOf, type Box, type TextItem } from "./text";
import { isRoomLabel } from "./words";

export const WINDOW_MARGIN_M = 10;
/** How far past its grid's dimensions a building's own names may sit. */
export const LABEL_REACH_M = 30;
export const WIDE_SHEET_M = 400;
/**
 * About 6,000 × 6,000 px. The raster, its ink mask and the pinched copy
 * together stay near the spec's 250 MB (§5.3), and every current browser
 * allocates a canvas this size.
 */
export const PIXEL_BUDGET = 36_000_000;
export const UNSCALED_MAX_SIDE_PX = 8000;
export const UNSCALED_MAX_PX_PER_PT = 4;

export type Rotation = 0 | 90 | 180 | 270;

export function normaliseRotation(degrees: number): Rotation {
  return ((((Math.round(degrees / 90) * 90) % 360) + 360) % 360) as Rotation;
}

/** Spec §5.2: 0.05 m per pixel, or 0.07 for a sheet wider than 400 m. L1's 594 m sheet is 0.07, as plan:l1 made it. */
export function renderMetresPerPixel(sheetWidthM: number): number {
  return sheetWidthM > WIDE_SHEET_M ? 0.07 : 0.05;
}

export function boxUnion(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  return {
    x0: Math.min(...boxes.map(b => b.x0)), y0: Math.min(...boxes.map(b => b.y0)),
    x1: Math.max(...boxes.map(b => b.x1)), y1: Math.max(...boxes.map(b => b.y1)),
  };
}

/**
 * What the window goes round: the agreeing runs' dimensions, and the names of
 * spaces within 30 m of them, never the title block's notes. The runs anchor
 * it because a room word is not always a room: L1's sheet names the building
 * next door "OCBC TAMPINES CENTRE 2", 100 m past the grid. With no runs there
 * is no anchor, and nothing to go round.
 */
export function windowMarks(items: readonly TextItem[], runs: readonly Run[]): Box[] {
  const grid = boxUnion(runs.flatMap(r => r.words.map(w => w.box)));
  if (!grid) return [];
  // The runs' own scale, which is the sheet's: calibrate takes it the same way.
  const metresPerPoint = runs.reduce((s, r) => s + r.mm, 0) / runs.reduce((s, r) => s + r.pt, 0) / 1000;
  const reach = LABEL_REACH_M / metresPerPoint;
  const near = (b: Box) =>
    b.x1 >= grid.x0 - reach && b.x0 <= grid.x1 + reach && b.y1 >= grid.y0 - reach && b.y0 <= grid.y1 + reach;
  return [grid, ...items.filter(i => isRoomLabel(i.text) && near(i.box)).map(i => i.box)];
}

/**
 * The part of the sheet worth rendering. The whole of L1's sheet at 0.07 m
 * per pixel would be 56 Mpx, and most of it roads, title block and margin.
 * The grid's dimensions ring the building and the names sit in it, so 10 m
 * round both holds the drawing. Without a scale there is no telling a metre,
 * so the whole sheet is rendered.
 */
export function drawingWindow(page: { width: number; height: number }, marks: readonly Box[], metresPerPoint: number | null): Box {
  const whole = { x0: 0, y0: 0, x1: page.width, y1: page.height };
  const around = boxUnion(marks);
  if (!metresPerPoint || !around) return whole;
  const pad = WINDOW_MARGIN_M / metresPerPoint;
  return {
    x0: Math.max(0, around.x0 - pad), y0: Math.max(0, around.y0 - pad),
    x1: Math.min(page.width, around.x1 + pad), y1: Math.min(page.height, around.y1 + pad),
  };
}

/** The metres per pixel asked for, or coarser, just enough that the window fits the pixel budget. */
export function fitBudget(window: Box, metresPerPoint: number, metresPerPixel: number, budget = PIXEL_BUDGET): number {
  const areaM2 = (window.x1 - window.x0) * (window.y1 - window.y0) * metresPerPoint ** 2;
  const least = Math.sqrt(areaM2 / budget);
  return least <= metresPerPixel ? metresPerPixel : Math.ceil(least * 1000) / 1000;
}

/**
 * A sheet with no scale: 4 pixels a point, no side longer than 8000 px, and
 * within the pixel budget, which an A0 sheet 8000 px across would pass by 9 Mpx.
 */
export function unscaledPointsPerPixel(window: Box): number {
  const width = window.x1 - window.x0;
  const height = window.y1 - window.y0;
  return Math.max(
    1 / UNSCALED_MAX_PX_PER_PT,
    Math.max(width, height) / UNSCALED_MAX_SIDE_PX,
    Math.sqrt((width * height) / PIXEL_BUDGET),
  );
}

/** Where a plan image came from on its sheet: fixed when it was rendered. */
export type SheetPlacement = { clipPt: readonly [number, number, number, number]; pointsPerPixel: number };
/** Where the plan image sits in the model now: Align and Measure scale change this. */
export type ImagePlace = { metresPerPixel: number; offsetX: number; offsetY: number };

/**
 * A point on the sheet as shown → model metres, through the plan as it is
 * placed now. The image's pixels are the window's points divided by
 * `pointsPerPixel`, and the image's calibration takes pixels to metres. So a
 * plan moved with Align or rescaled by hand still lines up with its drawing.
 */
export function sheetToModel(sheet: SheetPlacement, image: ImagePlace): (x: number, y: number) => [number, number] {
  const metresPerPoint = image.metresPerPixel / sheet.pointsPerPixel;
  const [x0, y0] = sheet.clipPt;
  return (x, y) => [image.offsetX + (x - x0) * metresPerPoint, image.offsetY - (y - y0) * metresPerPoint];
}

export type SheetReading = {
  /** The sheet as shown, in points. */
  width: number;
  height: number;
  rotation: Rotation;
  items: TextItem[];
  calibration: Calibration;
  window: Box;
};

/** Everything the text layer says about a page: its size, its scale, and where the drawing is. */
export async function readSheet(page: PdfPage): Promise<SheetReading> {
  const viewport = page.getViewport({ scale: 1 });
  const items = await readTextItems(page);
  const calibration = calibrate(wordsOf(items));
  const window = drawingWindow(viewport, windowMarks(items, calibration.runs), calibration.metresPerPoint);
  return { width: viewport.width, height: viewport.height, rotation: normaliseRotation(page.rotate), items, calibration, window };
}
