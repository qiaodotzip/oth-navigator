import type { Vec2 } from "@oth/model";
import * as THREE from "three";
import { modelToThree } from "./coords";

/**
 * A block standing on the floor: a wall, a rail, a step or a shaft side.
 *
 * Its centre line runs a→b on the plan, it is `thicknessM` across that line,
 * and it stands from `baseM` to `topM` above the level's floor.
 */
export type Block = { a: Vec2; b: Vec2; thicknessM: number; baseM: number; topM: number };

/**
 * All the blocks as one geometry, so a floor's walls are one draw call.
 * The meshes use a double-sided material, so the winding of the faces doesn't matter.
 */
export function blocksGeometry(blocks: readonly Block[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const quad = (
    p: [number, number, number], q: [number, number, number],
    r: [number, number, number], s: [number, number, number],
  ) => {
    positions.push(...p, ...q, ...r, ...p, ...r, ...s);
  };

  for (const block of blocks) {
    const dx = block.b[0] - block.a[0];
    const dy = block.b[1] - block.a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6 || block.topM <= block.baseM) continue;
    const half = block.thicknessM / 2;
    const nx = (-dy / len) * half;
    const ny = (dx / len) * half;
    const corners: Array<[number, number]> = [
      [block.a[0] + nx, block.a[1] + ny], [block.b[0] + nx, block.b[1] + ny],
      [block.b[0] - nx, block.b[1] - ny], [block.a[0] - nx, block.a[1] - ny],
    ];
    const low = corners.map(([x, y]) => modelToThree(x, y, block.baseM));
    const high = corners.map(([x, y]) => modelToThree(x, y, block.topM));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad(low[i]!, low[j]!, high[j]!, high[i]!);
    }
    quad(high[0]!, high[1]!, high[2]!, high[3]!);
    quad(low[3]!, low[2]!, low[1]!, low[0]!);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
