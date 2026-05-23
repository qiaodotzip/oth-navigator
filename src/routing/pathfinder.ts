import type { Floor } from "@/data/types";
import { checkSegment, isPointWalkable, type Pt } from "./pathChecks";

const CELL_SIZE = 1.2;

function cellWalkable(cx: number, cy: number, floor: Floor, destRoom?: string): boolean {
  const x = cx * CELL_SIZE + CELL_SIZE / 2;
  const y = cy * CELL_SIZE + CELL_SIZE / 2;
  return isPointWalkable([x, y], floor, destRoom);
}

function snapToWalkableCell(
  point: Pt,
  floor: Floor,
  destRoom?: string,
): [number, number] | null {
  const start: [number, number] = [
    Math.floor(point[0] / CELL_SIZE),
    Math.floor(point[1] / CELL_SIZE),
  ];
  if (cellWalkable(start[0], start[1], floor, destRoom)) return start;
  // BFS outward up to ~30 cells (~36m)
  const MAX = 30;
  const visited = new Set<string>();
  visited.add(`${start[0]},${start[1]}`);
  let queue: Array<[number, number, number]> = [[start[0], start[1], 0]];
  while (queue.length > 0) {
    const [cx, cy, d] = queue.shift()!;
    if (d > MAX) break;
    if (cellWalkable(cx, cy, floor, destRoom)) return [cx, cy];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push([nx, ny, d + 1]);
    }
  }
  return null;
}

const DIRS: Array<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export function findPath(
  start: Pt,
  end: Pt,
  floor: Floor,
  destRoom?: string,
): Pt[] | null {
  const startCell = snapToWalkableCell(start, floor, destRoom);
  const endCell = snapToWalkableCell(end, floor, destRoom);
  if (!startCell || !endCell) return null;
  const [sx, sy] = startCell;
  const [ex, ey] = endCell;

  if (sx === ex && sy === ey) return [start, end];

  const gScore = new Map<string, number>();
  const parent = new Map<string, string>();
  const open = new Map<string, number>();
  const closed = new Set<string>();

  const key = (x: number, y: number) => `${x},${y}`;
  const heuristic = (x: number, y: number) => Math.hypot(x - ex, y - ey);

  const startK = key(sx, sy);
  gScore.set(startK, 0);
  open.set(startK, heuristic(sx, sy));

  let iter = 0;
  const MAX_ITER = 80000;

  while (open.size > 0 && iter++ < MAX_ITER) {
    let bestKey = "";
    let bestF = Infinity;
    for (const [k, f] of open) {
      if (f < bestF) {
        bestF = f;
        bestKey = k;
      }
    }
    open.delete(bestKey);
    closed.add(bestKey);

    const [cx, cy] = bestKey.split(",").map(Number);

    if (cx === ex && cy === ey) {
      const path: Pt[] = [];
      let cur = bestKey;
      while (cur) {
        const [x, y] = cur.split(",").map(Number);
        path.unshift([x * CELL_SIZE + CELL_SIZE / 2, y * CELL_SIZE + CELL_SIZE / 2]);
        const p = parent.get(cur);
        if (!p) break;
        cur = p;
      }
      if (path.length > 0) {
        path[0] = start;
        path[path.length - 1] = end;
      }
      return path;
    }

    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      if (!cellWalkable(nx, ny, floor, destRoom)) continue;
      const tentative = (gScore.get(bestKey) ?? 0) + cost;
      const existing = gScore.get(nk);
      if (existing === undefined || tentative < existing) {
        gScore.set(nk, tentative);
        parent.set(nk, bestKey);
        open.set(nk, tentative + heuristic(nx, ny));
      }
    }
  }

  return null;
}

export function smoothPath(path: Pt[], floor: Floor, destRoom?: string): Pt[] {
  if (path.length < 3) return path;
  const result: Pt[] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1) {
      if (!checkSegment(path[i], path[j], floor, destRoom).blocked) break;
      j--;
    }
    result.push(path[j]);
    i = j;
  }
  return result;
}
