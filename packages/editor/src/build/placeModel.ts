import { live, ringCentroid, type MapModel } from "@oth/model";
import type { Selection } from "../state/store";

export type NewPlacement =
  | {
      ok: true;
      data: { id: string; levelId: string; assetId: string; roomId: string; position: [number, number, number] };
    }
  | { ok: false; reason: string };

/**
 * Where a model goes when it is placed on the selected room or detail. The
 * position is the offset its export used: zero for a level context mesh,
 * authored in building coordinates, and the centroid for a detail mesh,
 * authored about its own middle.
 */
export function newPlacement(
  model: MapModel, levelId: string, selection: Selection, assetId: string, now = Date.now(),
): NewPlacement {
  const anchor = selection?.type === "room" ? live(model.rooms).find(r => r.id === selection.id) : undefined;
  if (!anchor) return { ok: false, reason: "Select a room or detail first." };
  const position: [number, number, number] =
    anchor.kind === "detail" ? [...ringCentroid(anchor.footprint), 0] : [0, 0, 0];
  return { ok: true, data: { id: `${levelId}-place-${now}`, levelId, assetId, roomId: anchor.id, position } };
}
