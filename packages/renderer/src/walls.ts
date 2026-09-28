import type { Ring, Room } from "@oth/model";
import * as THREE from "three";
import { modelToThree } from "./coords";

/**
 * Vertical strips along every boundary edge, floor to ceiling.
 *
 * These exist for the Blender detail export (buildDetailGlb), not for the visitor app — a
 * teammate modelling a shopfront needs to see where the walls are. They are
 * reference geometry and are never part of the structural model.
 */
export function wallGeometry(room: Room, heightM?: number): THREE.BufferGeometry {
  const h = heightM ?? room.heightM;
  const positions: number[] = [];

  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const [x0, , z0] = modelToThree(ax, ay, 0);
    const [x1, , z1] = modelToThree(bx, by, 0);
    // Two triangles forming the quad (a-low, b-low, b-high, a-high).
    positions.push(
      x0, 0, z0, x1, 0, z1, x1, h, z1,
      x0, 0, z0, x1, h, z1, x0, h, z0,
    );
  };

  const addRing = (ring: Ring) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (a && b) addEdge(a[0], a[1], b[0], b[1]);
    }
  };

  addRing(room.footprint);
  for (const hole of room.holes) addRing(hole);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
