import type { BBox, Ring } from "@oth/model";
import sharp from "sharp";

/** The longest side of a plan picture: legible, and small enough for a model's context. */
export const PLAN_MAX_SIDE = 1600;

/** How much of the plan shows round a room asked for by `around`. */
export const PLAN_MARGIN_M = 10;

export type PlanImage = { widthPx: number; heightPx: number; metresPerPixel: number; offsetX: number; offsetY: number };
export type PlanRoom = { id: string; nameEn: string; kind: string; footprint: Ring };

export type PlanView = {
  /** The part of the stored image to cut out, in its own pixels. */
  crop: { left: number; top: number; width: number; height: number };
  width: number;
  height: number;
  metresPerPixel: number;
  /** The world box the picture shows, in metres. */
  shows: BBox;
  svg: string;
  /** Each room in the picture, with its box as [x, y, w, h] in the picture's pixels. */
  rooms: { id: string; name: string; kind: string; box: [number, number, number, number] }[];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The pixel of the stored plan a world point falls on. Image y runs down while
 * world y runs north, so (x, y) is at ((x − offsetX) / m, (offsetY − y) / m),
 * as in the editor's plan/calibration.ts. Every reader of a plan's pixels goes
 * through this, so the mapping is written once: `planView` for the picture
 * view_plan sends, `paths/ink.ts` for the ink along a run.
 */
export function planPixel(image: PlanImage, [x, y]: readonly [number, number]): [number, number] {
  return [(x - image.offsetX) / image.metresPerPixel, (image.offsetY - y) / image.metresPerPixel];
}

export function padded(box: BBox, by: number): BBox {
  return { minX: box.minX - by, minY: box.minY - by, maxX: box.maxX + by, maxY: box.maxY + by };
}

/**
 * What part of a floor's plan to show, at what size, and the room outlines
 * to draw over it. Image y runs down while world y runs north, so the world
 * point (x, y) is at pixel ((x − offsetX) / m, (offsetY − y) / m), as in the
 * editor's plan/calibration.ts. Null when `focus` misses the plan.
 *
 * Only numbers go into the SVG. A name travels in the legend, so no name can
 * write markup, and the server needs no fonts.
 */
export function planView(
  image: PlanImage, rooms: readonly PlanRoom[], focus: BBox | null, highlight: string | null, maxSide = PLAN_MAX_SIDE,
): PlanView | null {
  const m = image.metresPerPixel;
  let left = 0;
  let top = 0;
  let right = image.widthPx;
  let bottom = image.heightPx;
  if (focus) {
    const [x0, y1] = planPixel(image, [focus.minX, focus.maxY]);
    const [x1, y0] = planPixel(image, [focus.maxX, focus.minY]);
    left = clamp(Math.floor(x0), 0, image.widthPx);
    right = clamp(Math.ceil(x1), 0, image.widthPx);
    top = clamp(Math.floor(y1), 0, image.heightPx);
    bottom = clamp(Math.ceil(y0), 0, image.heightPx);
  }
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  if (cropWidth < 1 || cropHeight < 1) return null;

  const scale = Math.min(1, maxSide / Math.max(cropWidth, cropHeight));
  const width = Math.max(1, Math.round(cropWidth * scale));
  const height = Math.max(1, Math.round(cropHeight * scale));
  const toPicture = (p: readonly [number, number]): [number, number] => {
    const [px, py] = planPixel(image, p);
    return [(px - left) * scale, (py - top) * scale];
  };

  const shown: PlanView["rooms"] = [];
  const outlines: string[] = [];
  for (const room of rooms) {
    const points = room.footprint.map(toPicture);
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (maxX < 0 || maxY < 0 || minX > width || minY > height) continue;
    shown.push({
      id: room.id, name: room.nameEn, kind: room.kind,
      box: [Math.round(minX), Math.round(minY), Math.round(maxX - minX), Math.round(maxY - minY)],
    });
    const picked = room.id === highlight;
    outlines.push(
      `<polygon points="${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" ` +
      `fill="none" stroke="${picked ? "#dc2626" : "#0f766e"}" stroke-width="${picked ? 4 : 2}"/>`,
    );
  }

  return {
    crop: { left, top, width: cropWidth, height: cropHeight },
    width,
    height,
    metresPerPixel: m / scale,
    shows: {
      minX: image.offsetX + left * m, maxX: image.offsetX + right * m,
      minY: image.offsetY - bottom * m, maxY: image.offsetY - top * m,
    },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${outlines.join("")}</svg>`,
    rooms: shown,
  };
}

/** The picture: the crop, scaled, with the outlines drawn over it, as JPEG on white. */
export async function renderPlan(plan: Uint8Array, view: PlanView): Promise<Uint8Array> {
  const bytes = await sharp(plan)
    .extract(view.crop)
    .resize(view.width, view.height, { fit: "fill" })
    .composite([{ input: Buffer.from(view.svg), left: 0, top: 0 }])
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80 })
    .toBuffer();
  return new Uint8Array(bytes);
}
