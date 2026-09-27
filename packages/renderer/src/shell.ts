import type { Ring, Room } from "@oth/model";
import * as THREE from "three";
import { modelToThree } from "./coords";

/**
 * Walls with thickness, standing on a room's boundary.
 *
 * `wallGeometry` makes a zero-thickness strip per edge, which is right for the
 * Blender context export and wrong for a scene: a single-sided plane vanishes
 * when you orbit past it and has no edge to catch the light. Each edge here is
 * a box centred on the boundary line instead. Corners overlap rather than
 * mitre, which costs a few triangles and nothing that shows.
 */
export function shellWalls(
  room: Room, opts: { heightM?: number; thicknessM?: number } = {},
): THREE.BufferGeometry {
  const h = opts.heightM ?? room.heightM;
  const t = (opts.thicknessM ?? 0.15) / 2;
  const positions: number[] = [];

  const quad = (
    a: [number, number, number], b: [number, number, number],
    c: [number, number, number], d: [number, number, number],
  ) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  };

  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    // Outward-facing normal is irrelevant — the box is symmetric about the
    // line, so a ring wound either way builds the same wall.
    const nx = (-dy / len) * t;
    const ny = (dx / len) * t;

    const corners = [
      [ax + nx, ay + ny], [bx + nx, by + ny],
      [bx - nx, by - ny], [ax - nx, ay - ny],
    ] as const;
    const low = corners.map(([x, y]) => modelToThree(x, y, 0));
    const high = corners.map(([x, y]) => modelToThree(x, y, h));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad(low[i]!, low[j]!, high[j]!, high[i]!);
    }
    quad(high[0]!, high[1]!, high[2]!, high[3]!);
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
