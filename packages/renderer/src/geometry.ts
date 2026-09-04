import type { Room } from "@oth/model";
import * as THREE from "three";

/** Rooms render as thin slabs; walls and volume come from the dressing layer. */
export const SLAB_HEIGHT_M = 0.12;

/**
 * Builds a three.js Shape in the XY plane. Extrusion happens along +Z and the
 * result is rotated so model north becomes -z and the extrusion depth becomes
 * +y, which matches `modelToThree` without converting per vertex.
 */
export function roomShape(room: Room): THREE.Shape {
  const shape = new THREE.Shape();
  const [first, ...rest] = room.footprint;
  if (!first) return shape;
  shape.moveTo(first[0], first[1]);
  for (const [x, y] of rest) shape.lineTo(x, y);
  shape.closePath();

  for (const hole of room.holes) {
    const path = new THREE.Path();
    const [h0, ...hRest] = hole;
    if (!h0) continue;
    path.moveTo(h0[0], h0[1]);
    for (const [x, y] of hRest) path.lineTo(x, y);
    path.closePath();
    shape.holes.push(path);
  }

  return shape;
}

export function roomGeometry(
  room: Room,
  opts: { slabHeightM?: number } = {},
): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(roomShape(room), {
    depth: opts.slabHeightM ?? SLAB_HEIGHT_M,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
