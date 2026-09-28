import { live, type Vec2 } from "./primitives";
import type { ObjectKind, Placement } from "./schema/dressing";

/**
 * The size a kind starts at when nobody has measured it: about a wastebin's,
 * in metres. Survey's Object tag makes kinds at this size, and it can be
 * changed in Places.
 */
export const OBJECT_SIZE_GUESS: Readonly<ObjectKind["size"]> = { w: 0.5, d: 0.5, h: 1 };

/**
 * The model a placement shows (spec §5.3): its own, else its kind's. None
 * while neither has one, and an object is then drawn as a box of its kind's
 * size. A deleted kind lends nothing.
 */
export function placementModelAsset(
  model: { readonly objectKinds: readonly ObjectKind[] },
  placement: Pick<Placement, "assetId" | "objectKindId">,
): string | undefined {
  if (placement.assetId) return placement.assetId;
  if (!placement.objectKindId) return undefined;
  return live(model.objectKinds).find(k => k.id === placement.objectKindId)?.assetId;
}

/**
 * Which way an object faces on the plan, as a unit vector (x east, y north).
 *
 * The one convention every part shares:
 * - at rotation 0 an object faces south, which is glTF's front: +Z, since
 *   north is -Z;
 * - rotationDeg turns it anticlockwise seen from above, as the 3D preview
 *   turns a placed model about its vertical axis.
 *
 * So a modeller builds the front facing +Z, the plan marker draws its tick
 * this way, and Claude's spots turn objects to face into the walkway with
 * `facingRotation`.
 */
export function objectFront(rotationDeg: number): Vec2 {
  const r = (rotationDeg * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
}

/** The rotation, in [0, 360), that turns an object's front to face `direction`. A direction of no length faces south. */
export function facingRotation(direction: Vec2): number {
  const [x, y] = direction;
  if (x === 0 && y === 0) return 0;
  const deg = (Math.atan2(x, -y) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}
