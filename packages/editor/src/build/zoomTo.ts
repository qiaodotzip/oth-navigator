import { live, type BBox, type MapModel, type Vec2 } from "@oth/model";
import { fitViewport, type Viewport } from "../plan/viewport";
import type { Selection } from "../state/store";

/** Floor shown around a shape, so it is seen where it is. */
const MARGIN_M = 4;
/** Floor shown around a point: a lift stop filling the screen says nothing about where it is. */
const POINT_MARGIN_M = 12;
/** Room around the framed box on screen, in pixels. */
const PAD_PX = 60;

function around(points: readonly Vec2[], margin: number): BBox {
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  return {
    minX: Math.min(...xs) - margin,
    minY: Math.min(...ys) - margin,
    maxX: Math.max(...xs) + margin,
    maxY: Math.max(...ys) + margin,
  };
}

/** The part of the floor to show for a selection, or null when it is not there. */
export function selectionBBox(model: MapModel | null, selection: Selection): BBox | null {
  if (!model || !selection) return null;
  const { type, id } = selection;
  const find = <T extends { id: string; deletedAt?: string | null }>(items: readonly T[]) =>
    live(items).find(x => x.id === id);
  switch (type) {
    case "room": {
      const r = find(model.rooms);
      return r ? around(r.footprint, MARGIN_M) : null;
    }
    case "pathway": {
      const p = find(model.pathways);
      return p ? around(p.polyline, MARGIN_M + p.widthM / 2) : null;
    }
    case "doorway": {
      const d = find(model.doorways);
      return d ? around(d.segment, POINT_MARGIN_M) : null;
    }
    case "entrance": {
      const e = find(model.entrances);
      return e ? around([e.point], POINT_MARGIN_M) : null;
    }
    case "portalEndpoint": {
      const e = find(model.portalEndpoints);
      return e ? around([e.point], POINT_MARGIN_M) : null;
    }
    case "placement": {
      const p = find(model.placements);
      return p ? around([[p.position[0], p.position[1]]], POINT_MARGIN_M) : null;
    }
  }
}

/** The view that frames a selection in the middle of the canvas, or null when there is nothing to frame. */
export function zoomViewportTo(
  model: MapModel | null, selection: Selection, widthPx: number, heightPx: number,
): Viewport | null {
  const box = selectionBBox(model, selection);
  return box ? fitViewport(box, widthPx, heightPx, PAD_PX) : null;
}
