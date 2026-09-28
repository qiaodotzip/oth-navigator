import { live, ringCentroid, type MapModel } from "@oth/model";
import type { Selection } from "../state/store";

export type NewPlacement =
  | {
      ok: true;
      data: { id: string; levelId: string; assetId: string; roomId: string; position: [number, number, number] };
    }
  | { ok: false; reason: string };

export type NewObjectPlacement =
  | {
      ok: true;
      data: {
        id: string;
        levelId: string;
        objectKindId: string;
        roomId: string;
        position: [number, number, number];
        rotationDeg: number;
        scale: number;
        sightingIds: string[];
      };
    }
  | { ok: false; reason: string };

/**
 * Where a model goes when it is placed on the selected room or detail. The
 * position is the offset its export used: zero for a level context mesh,
 * authored in building coordinates, and the centroid for a detail mesh,
 * authored about its own middle. Its floor is the room's, so a model can
 * never be filed on one floor and anchored to a room on another. With no
 * floor loaded yet there is nothing to select, and the answer is the same.
 */
export function newPlacement(
  model: MapModel | null, selection: Selection, assetId: string, now = Date.now(),
): NewPlacement {
  const anchor = model && selection?.type === "room" ? live(model.rooms).find(r => r.id === selection.id) : undefined;
  if (!anchor) return { ok: false, reason: "Select a room or detail first." };
  const position: [number, number, number] =
    anchor.kind === "detail" ? [...ringCentroid(anchor.footprint), 0] : [0, 0, 0];
  return {
    ok: true,
    data: { id: `${anchor.levelId}-place-${now}`, levelId: anchor.levelId, assetId, roomId: anchor.id, position },
  };
}

/**
 * Where an object goes when placed by hand, from Build's Dressing step: the
 * centroid of the selected room, of any kind — area, room, detail or service.
 * Unlike an asset placement, an object always sits there and never at
 * `[0, 0, 0]`, because it is authored about its own base centre (spec §5.5).
 * To the centimetre: the inspector shows the position as typed numbers.
 */
export function newObjectPlacement(
  model: MapModel | null, selection: Selection, objectKindId: string, now = Date.now(),
): NewObjectPlacement {
  const anchor = model && selection?.type === "room" ? live(model.rooms).find(r => r.id === selection.id) : undefined;
  if (!anchor) return { ok: false, reason: "Select a room or area first." };
  const kind = model ? live(model.objectKinds).find(k => k.id === objectKindId) : undefined;
  if (!kind) return { ok: false, reason: "That kind of object is gone." };
  const cm = (v: number) => Math.round(v * 100) / 100;
  const [cx, cy] = ringCentroid(anchor.footprint).map(cm) as [number, number];
  return {
    ok: true,
    data: {
      id: `${anchor.levelId}-object-${now}`,
      levelId: anchor.levelId,
      objectKindId,
      roomId: anchor.id,
      position: [cx, cy, 0],
      rotationDeg: 0,
      scale: 1,
      sightingIds: [],
    },
  };
}
