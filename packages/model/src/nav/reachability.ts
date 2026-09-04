import { live } from "../primitives";
import type { Vec2 } from "../primitives";
import type { MapModel } from "../schema/model";
import type { BakeOptions, NavGrid } from "./grid";
import { bakeNavGrid, navGridCellCount, navGridGet, worldToCell } from "./grid";

export type LevelReachability = { grid: NavGrid; mask: Uint8Array };

function maskGet(mask: Uint8Array, i: number): boolean {
  const byte = mask[i >> 3];
  return byte !== undefined && (byte & (1 << (i & 7))) !== 0;
}

function maskSet(mask: Uint8Array, i: number): void {
  const byteIdx = i >> 3;
  const byte = mask[byteIdx];
  if (byte === undefined) return;
  mask[byteIdx] = byte | (1 << (i & 7));
}

/** Four-connected flood fill over walkable cells, starting from world-space seeds. */
export function floodFill(grid: NavGrid, seeds: readonly Vec2[]): Uint8Array {
  const mask = new Uint8Array(Math.ceil(navGridCellCount(grid) / 8));
  if (grid.cols === 0 || grid.rows === 0) return mask;

  const queue: number[] = [];
  for (const seed of seeds) {
    const { col, row } = worldToCell(grid, seed);
    if (!navGridGet(grid, col, row)) continue;
    const i = row * grid.cols + col;
    if (maskGet(mask, i)) continue;
    maskSet(mask, i);
    queue.push(i);
  }

  while (queue.length > 0) {
    const i = queue.pop();
    if (i === undefined) break;
    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);
    const neighbours: Array<[number, number]> = [
      [col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1],
    ];
    for (const [nc, nr] of neighbours) {
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      if (!navGridGet(grid, nc, nr)) continue;
      const ni = nr * grid.cols + nc;
      if (maskGet(mask, ni)) continue;
      maskSet(mask, ni);
      queue.push(ni);
    }
  }
  return mask;
}

export function reachableAt(grid: NavGrid, mask: Uint8Array, p: Vec2): boolean {
  const { col, row } = worldToCell(grid, p);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  return maskGet(mask, row * grid.cols + col);
}

/**
 * Whole-building reachability. Floods every level from its current seeds, then
 * propagates across portals whose endpoint has become reachable, and repeats
 * until nothing new is reached. This is what catches a modelled upper level that
 * no lift or stair actually serves.
 */
export function buildingReachability(
  model: MapModel,
  opts: BakeOptions = {},
): Map<string, LevelReachability> {
  const levels = live(model.levels);
  const grids = new Map<string, NavGrid>();
  for (const level of levels) {
    grids.set(level.id, bakeNavGrid(model, level.id, opts));
  }

  const seeds = new Map<string, Vec2[]>();
  for (const level of levels) seeds.set(level.id, []);
  for (const entrance of live(model.entrances)) {
    seeds.get(entrance.levelId)?.push(entrance.point);
  }

  const endpoints = live(model.portalEndpoints);
  const result = new Map<string, LevelReachability>();

  for (let pass = 0; pass <= levels.length; pass++) {
    let grew = false;

    for (const level of levels) {
      const grid = grids.get(level.id);
      if (!grid) continue;
      result.set(level.id, { grid, mask: floodFill(grid, seeds.get(level.id) ?? []) });
    }

    for (const ep of endpoints) {
      const from = result.get(ep.levelId);
      if (!from || !reachableAt(from.grid, from.mask, ep.point)) continue;
      for (const other of endpoints) {
        if (other.portalId !== ep.portalId || other.id === ep.id) continue;
        const list = seeds.get(other.levelId);
        if (!list) continue;
        const already = list.some(p => p[0] === other.point[0] && p[1] === other.point[1]);
        if (!already) {
          list.push(other.point);
          grew = true;
        }
      }
    }

    if (!grew) break;
  }

  return result;
}
