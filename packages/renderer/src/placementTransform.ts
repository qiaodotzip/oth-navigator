import type { Placement } from "@oth/model";
import { modelToThree } from "./coords";

/** Where a placed model or box stands, in three.js terms. The preview and the export both use it, so they agree. */
export type PlacementTransform = { position: [number, number, number]; rotationY: number; scale: number };

/**
 * A placement's position is plan metres plus its height above the floor.
 * It turns about the vertical axis only (Plan 5's placement rule).
 */
export function placementTransform(placement: Pick<Placement, "position" | "rotationDeg" | "scale">): PlacementTransform {
  const [x, y, height] = placement.position;
  return {
    position: modelToThree(x, y, height),
    rotationY: (placement.rotationDeg * Math.PI) / 180,
    scale: placement.scale,
  };
}
