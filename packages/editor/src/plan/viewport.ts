import type { BBox, Vec2 } from "@oth/model";

/** `scale` is pixels per metre; `origin` is where world (0,0) sits on screen. */
export type Viewport = { originX: number; originY: number; scale: number };

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 500;

export const DEFAULT_VIEWPORT: Viewport = { originX: 0, originY: 0, scale: 4 };

/** World y is north; screen y grows downward, so it is negated here and only here. */
export function worldToScreen(vp: Viewport, [x, y]: Vec2): [number, number] {
  return [vp.originX + x * vp.scale, vp.originY - y * vp.scale];
}

export function screenToWorld(vp: Viewport, [sx, sy]: Vec2): [number, number] {
  return [(sx - vp.originX) / vp.scale, (vp.originY - sy) / vp.scale];
}

export function panViewport(vp: Viewport, dxPx: number, dyPx: number): Viewport {
  return { ...vp, originX: vp.originX + dxPx, originY: vp.originY + dyPx };
}

/** Zooms about `anchorPx`, so the world point under the cursor stays put. */
export function zoomViewport(vp: Viewport, factor: number, anchorPx: Vec2): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, vp.scale * factor));
  const applied = scale / vp.scale;
  return {
    scale,
    originX: anchorPx[0] - (anchorPx[0] - vp.originX) * applied,
    originY: anchorPx[1] - (anchorPx[1] - vp.originY) * applied,
  };
}

export function fitViewport(bbox: BBox, widthPx: number, heightPx: number, padPx = 40): Viewport {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { ...DEFAULT_VIEWPORT, originX: widthPx / 2, originY: heightPx / 2 };
  }

  const scale = Math.min(
    MAX_SCALE,
    Math.max(MIN_SCALE, Math.min((widthPx - padPx * 2) / w, (heightPx - padPx * 2) / h)),
  );

  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  return {
    scale,
    originX: widthPx / 2 - cx * scale,
    originY: heightPx / 2 + cy * scale,
  };
}
