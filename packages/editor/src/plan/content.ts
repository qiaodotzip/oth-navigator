import type { BBox, Ring } from "@oth/model";
import { bboxOfRings, EMPTY_BBOX } from "@oth/model";

/**
 * What the canvas should frame: every footprint on the level, plus the underlay
 * if there is one. Without the underlay a level that has an image but no rooms
 * yet would frame nothing — and that is exactly the state a teammate starts in.
 */
export function contentBBox(rings: readonly Ring[], extra: BBox | null = null): BBox {
  const rooms = rings.length > 0 ? bboxOfRings(rings) : EMPTY_BBOX;
  if (!extra) return rooms;
  return {
    minX: Math.min(rooms.minX, extra.minX),
    minY: Math.min(rooms.minY, extra.minY),
    maxX: Math.max(rooms.maxX, extra.maxX),
    maxY: Math.max(rooms.maxY, extra.maxY),
  };
}

export function hasArea(b: BBox): boolean {
  return Number.isFinite(b.minX) && Number.isFinite(b.minY) && b.maxX > b.minX && b.maxY > b.minY;
}
