import { bboxOfRings, pointInPolygon } from "../geometry/point";
import { distancePointToSegment } from "../geometry/segment";
import { live } from "../primitives";
import type { Ring, Vec2 } from "../primitives";
import type { MapModel } from "../schema/model";
import type { Room } from "../schema/structure";

/** Spec: 0.25 m resolution, baked at publish time, stored as a packed bitmask. */
export const NAV_CELL_SIZE_M = 0.25;
/** Half the assumed wall thickness. Cells within this of a boundary are blocked. */
export const WALL_HALF_THICKNESS_M = 0.15;
/** Padding around the level's extent so boundary cells always exist. */
const GRID_PAD_M = 1;

export type NavGrid = {
  levelId: string;
  /** World metres of the (0, 0) cell's lower-left corner. */
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  cellSizeM: number;
  /** Packed row-major bitmask, one bit per cell. 1 = walkable. */
  bits: Uint8Array;
};

export function navGridCellCount(grid: NavGrid): number {
  return grid.cols * grid.rows;
}

function bitIndex(grid: NavGrid, col: number, row: number): number {
  return row * grid.cols + col;
}

export function navGridGet(grid: NavGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  const i = bitIndex(grid, col, row);
  const byte = grid.bits[i >> 3];
  if (byte === undefined) return false;
  return (byte & (1 << (i & 7))) !== 0;
}

export function navGridSet(grid: NavGrid, col: number, row: number, value: boolean): void {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return;
  const i = bitIndex(grid, col, row);
  const byteIdx = i >> 3;
  const mask = 1 << (i & 7);
  const byte = grid.bits[byteIdx];
  if (byte === undefined) return;
  grid.bits[byteIdx] = value ? byte | mask : byte & ~mask;
}

export function cellCentre(grid: NavGrid, col: number, row: number): Vec2 {
  return [
    grid.originX + (col + 0.5) * grid.cellSizeM,
    grid.originY + (row + 0.5) * grid.cellSizeM,
  ];
}

export function worldToCell(grid: NavGrid, p: Vec2): { col: number; row: number } {
  return {
    col: Math.floor((p[0] - grid.originX) / grid.cellSizeM),
    row: Math.floor((p[1] - grid.originY) / grid.cellSizeM),
  };
}

export function navGridWalkableAt(grid: NavGrid, p: Vec2): boolean {
  const { col, row } = worldToCell(grid, p);
  return navGridGet(grid, col, row);
}

function emptyGrid(levelId: string, cellSizeM: number): NavGrid {
  return { levelId, originX: 0, originY: 0, cols: 0, rows: 0, cellSizeM, bits: new Uint8Array(0) };
}

/** Every edge of a ring, as segments. */
function ringSegments(ring: Ring): Array<[Vec2, Vec2]> {
  const out: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a && b) out.push([a, b]);
  }
  return out;
}

function roomSegments(room: Room): Array<[Vec2, Vec2]> {
  return [...ringSegments(room.footprint), ...room.holes.flatMap(ringSegments)];
}

/** Applies `fn` to every cell whose centre lies within `radius` of the segment. */
function forEachCellNearSegment(
  grid: NavGrid,
  a: Vec2,
  b: Vec2,
  radius: number,
  fn: (col: number, row: number, centre: Vec2) => void,
): void {
  const minX = Math.min(a[0], b[0]) - radius;
  const maxX = Math.max(a[0], b[0]) + radius;
  const minY = Math.min(a[1], b[1]) - radius;
  const maxY = Math.max(a[1], b[1]) + radius;
  const c0 = Math.max(0, Math.floor((minX - grid.originX) / grid.cellSizeM));
  const c1 = Math.min(grid.cols - 1, Math.ceil((maxX - grid.originX) / grid.cellSizeM));
  const r0 = Math.max(0, Math.floor((minY - grid.originY) / grid.cellSizeM));
  const r1 = Math.min(grid.rows - 1, Math.ceil((maxY - grid.originY) / grid.cellSizeM));

  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const centre = cellCentre(grid, col, row);
      if (distancePointToSegment(centre, a, b) <= radius) fn(col, row, centre);
    }
  }
}

/**
 * Re-opens the wall band along each doorway. A doorway models any opening, so a
 * 12 m gap between a corridor and an atrium is one wide doorway rather than a
 * wall. Only cells inside one of the two joined rooms are opened, so carving can
 * never punch a hole into unmodelled space.
 */
function carveDoorways(grid: NavGrid, model: MapModel, rooms: readonly Room[]): void {
  const byId = new Map(rooms.map(r => [r.id, r]));
  const doorways = live(model.doorways).filter(d => d.levelId === grid.levelId);

  for (const d of doorways) {
    const a = byId.get(d.roomA);
    const b = byId.get(d.roomB);
    if (!a || !b) continue;
    const [s0, s1] = d.segment;
    forEachCellNearSegment(grid, s0, s1, d.widthM / 2, (col, row, centre) => {
      const insideA = pointInPolygon(centre, a.footprint, a.holes);
      const insideB = pointInPolygon(centre, b.footprint, b.holes);
      if (insideA || insideB) navGridSet(grid, col, row, true);
    });
  }
}

export type BakeOptions = {
  cellSizeM?: number;
  wallHalfThicknessM?: number;
};

/**
 * Rasterises one level's walkable surface.
 *
 * 1. Every cell starts blocked.
 * 2. Cells inside a walkable room (and outside its holes) become walkable.
 * 3. Cells within half a wall thickness of any room boundary are blocked again —
 *    this is what stops two abutting rooms from being freely connected.
 * 4. Doorways re-open their opening.
 */
export function bakeNavGrid(model: MapModel, levelId: string, opts: BakeOptions = {}): NavGrid {
  const cellSizeM = opts.cellSizeM ?? NAV_CELL_SIZE_M;
  const wallHalf = opts.wallHalfThicknessM ?? WALL_HALF_THICKNESS_M;

  const rooms = live(model.rooms).filter(r => r.levelId === levelId && r.walkable);
  if (rooms.length === 0) return emptyGrid(levelId, cellSizeM);

  const bbox = bboxOfRings(rooms.map(r => r.footprint));
  const originX = Math.floor((bbox.minX - GRID_PAD_M) / cellSizeM) * cellSizeM;
  const originY = Math.floor((bbox.minY - GRID_PAD_M) / cellSizeM) * cellSizeM;
  const cols = Math.ceil((bbox.maxX + GRID_PAD_M - originX) / cellSizeM);
  const rows = Math.ceil((bbox.maxY + GRID_PAD_M - originY) / cellSizeM);

  const grid: NavGrid = {
    levelId, originX, originY, cols, rows, cellSizeM,
    bits: new Uint8Array(Math.ceil((cols * rows) / 8)),
  };

  for (const room of rooms) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (navGridGet(grid, col, row)) continue;
        if (pointInPolygon(cellCentre(grid, col, row), room.footprint, room.holes)) {
          navGridSet(grid, col, row, true);
        }
      }
    }
  }

  const blockRadius = wallHalf + cellSizeM / 2;
  for (const room of rooms) {
    for (const [a, b] of roomSegments(room)) {
      forEachCellNearSegment(grid, a, b, blockRadius, (col, row) => {
        navGridSet(grid, col, row, false);
      });
    }
  }

  carveDoorways(grid, model, rooms);

  return grid;
}
