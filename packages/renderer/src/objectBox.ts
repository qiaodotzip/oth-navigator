import { live, placementModelAsset, type ObjectKind, type Placement } from "@oth/model";
import * as THREE from "three";

export type ObjectSize = ObjectKind["size"];

/** stone-400: a kind with no model yet reads as a stand-in beside the category tints. */
export const OBJECT_BOX_COLOUR = "#a8a29e";

/**
 * A kind's box, w across, h up and d deep, standing on the origin at its base
 * centre, the way a modeller's model stands. The preview draws it for a kind
 * with no model yet, and the floor export (Plan 6B) writes the same one.
 */
export function objectBoxGeometry(size: ObjectSize): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(size.w, size.h, size.d);
  geometry.translate(0, size.h / 2, 0);
  return geometry;
}

export type PlacementLook =
  /** A model to load; an object's box to show while it loads, and in place of one that will not. */
  | { as: "model"; assetId: string; box: { size: ObjectSize; name: string } | null }
  | { as: "box"; size: ObjectSize; name: string }
  | { as: "nothing" };

/**
 * What the preview draws for a placement (spec §5.3): its model, which is its
 * own or its kind's, or while it has none, its kind's box. A placement with
 * neither is a validation error and draws nothing.
 */
export function placementLook(placement: Placement, kinds: readonly ObjectKind[]): PlacementLook {
  const kind = placement.objectKindId ? live(kinds).find(k => k.id === placement.objectKindId) : undefined;
  const box = kind ? { size: kind.size, name: kind.nameEn } : null;
  const assetId = placementModelAsset({ objectKinds: kinds }, placement);
  if (assetId) return { as: "model", assetId, box };
  return box ? { as: "box", ...box } : { as: "nothing" };
}
