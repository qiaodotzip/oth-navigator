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

/**
 * Opens every cell within half a pathway's width, wherever it is.
 *
 * Deliberately unrestricted, unlike `carveDoorways`, which may only open cells
 * inside the two rooms it joins. That restriction is exactly what makes a
 * doorway depend on footprints abutting exactly; a pathway is a human asserting
 * that people walk here, and it is carved last so no wall rule can override it.
 */
function carvePathways(grid: NavGrid, model: MapModel): void {
  for (const p of live(model.pathways).filter(x => x.levelId === grid.levelId)) {
    for (let i = 0; i + 1 < p.polyline.length; i++) {
      const a = p.polyline[i];
      const b = p.polyline[i + 1];
      if (!a || !b) continue;
      forEachCellNearSegment(grid, a, b, p.widthM / 2, (col, row) => {
        navGridSet(grid, col, row, true);
      });
    }
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
 *    this is what stops two abutting areas from being freely connected.
 * 4. Doorways re-open their opening, restricted to the rooms they join.
 * 5. Pathways carve, unrestricted, last.
 */
export function bakeNavGrid(model: MapModel, levelId: string, opts: BakeOptions = {}): NavGrid {
  const cellSizeM = opts.cellSizeM ?? NAV_CELL_SIZE_M;
  const wallHalf = opts.wallHalfThicknessM ?? WALL_HALF_THICKNESS_M;

  const rooms = live(model.rooms).filter(r => r.levelId === levelId && r.walkable);
  const pathways = live(model.pathways).filter(p => p.levelId === levelId);
  // A level being drawn often has a pathway before it has any area.
  if (rooms.length === 0 && pathways.length === 0) return emptyGrid(levelId, cellSizeM);

  const extents: Ring[] = [
    ...rooms.map(r => r.footprint),
    // A polyline is not a ring, but bboxOfRings only reads coordinates, and a
    // pathway's extent still has to fall inside the grid.
    ...pathways.map(p => p.polyline),
  ];
  const bbox = bboxOfRings(extents);
  // Pad by the widest pathway so one running near the edge is not clipped.
  const widestM = pathways.reduce((w, p) => Math.max(w, p.widthM), 0);
  const pad = GRID_PAD_M + widestM / 2;
  const originX = Math.floor((bbox.minX - pad) / cellSizeM) * cellSizeM;
  const originY = Math.floor((bbox.minY - pad) / cellSizeM) * cellSizeM;
  const cols = Math.ceil((bbox.maxX + pad - originX) / cellSizeM);
  const rows = Math.ceil((bbox.maxY + pad - originY) / cellSizeM);

  const grid: NavGrid = {
    levelId, originX, originY, cols, rows, cellSizeM,
    bits: new Uint8Array(Math.ceil((cols * rows) / 8)),
  };

  for (const room of rooms) {
    // Only the cells the room could possibly cover. Scanning the whole grid per
    // room made baking O(rooms x cells) — about half a million point-in-polygon
    // tests per room on a hub-sized floor, on every save.
    const rb = bboxOfRings([room.footprint]);
    const c0 = Math.max(0, Math.floor((rb.minX - originX) / cellSizeM));
    const c1 = Math.min(cols - 1, Math.ceil((rb.maxX - originX) / cellSizeM));
    const r0 = Math.max(0, Math.floor((rb.minY - originY) / cellSizeM));
    const r1 = Math.min(rows - 1, Math.ceil((rb.maxY - originY) / cellSizeM));

    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
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
  // Last, and unconditional: nothing a wall rule did may close a route a human
  // asserted.
  carvePathways(grid, model);

  return grid;
}
