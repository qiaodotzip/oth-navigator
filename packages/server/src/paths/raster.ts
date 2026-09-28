import { live, type MapModel, type Ring, type Room, type Vec2 } from "@oth/model";

/** Spec §7.3: the surface is rasterised at 0.25 m, the nav grid's own cell. */
export const CELL_M = 0.25;

/**
 * Walkable rooms whose outlines stand apart by less than two cells (0.5 m) are
 * one surface: the gap is the drawing's wall line, traced from both sides.
 * Plan 5D merges walls across 0.4 m for the same reason. A closing by one cell
 * bridges a gap of up to two cells.
 */
export const BRIDGE_CELLS = 1;

/**
 * Once the rooms standing on the surface are cut out, the gaps between
 * neighbouring shops are left as slivers no one walks. An opening by one cell
 * drops every strip under three cells (0.75 m) wide; a pathway is at least
 * 1.2 m.
 */
export const SLIVER_CELLS = 1;

/** Background all round, wider than the closing, so no surface cell is on the raster's edge. */
const PAD_CELLS = 4;

/**
 * A kilometre square at 0.25 m. L1 is 213 × 229 m. A surface bigger than this
 * is a room drawn at the wrong scale or a stray point far from the rest, and
 * rasterising it would take the server's memory.
 */
export const MAX_CELLS = 16_000_000;

export class SurfaceTooLarge extends Error {
  constructor(widthM: number, heightM: number) {
    super(`Its walkable areas span ${Math.round(widthM)} by ${Math.round(heightM)} m, more than one pass can take. ` +
      "A room is probably drawn at the wrong scale, or far from the rest.");
    this.name = "SurfaceTooLarge";
  }
}

/**
 * A floor's walkable surface on a grid. Cell (col, row) covers the square
 * from (originX + col·cellM, originY + row·cellM), and it is walkable when its
 * centre is: the rule `pointInPolygon` and the nav grid use.
 */
export type Raster = {
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  cellM: number;
  /** Row-major, 1 where walkable. */
  cells: Uint8Array;
};

/** A floor with no walkable room. */
function emptyRaster(cellM = CELL_M): Raster {
  return { originX: 0, originY: 0, cols: 0, rows: 0, cellM, cells: new Uint8Array(0) };
}

export function cellCentre(r: Raster, index: number): Vec2 {
  const col = index % r.cols;
  const row = (index - col) / r.cols;
  return [r.originX + (col + 0.5) * r.cellM, r.originY + (row + 0.5) * r.cellM];
}

/** The cell holding `p`, or -1 off the raster. */
export function cellIndex(r: Raster, p: Vec2): number {
  const col = Math.floor((p[0] - r.originX) / r.cellM);
  const row = Math.floor((p[1] - r.originY) / r.cellM);
  if (col < 0 || row < 0 || col >= r.cols || row >= r.rows) return -1;
  return row * r.cols + col;
}

export function walkableAt(r: Raster, p: Vec2): boolean {
  const i = cellIndex(r, p);
  return i >= 0 && r.cells[i] === 1;
}

/** Where the horizontal line at `y` crosses the ring, west to east. */
function crossings(ring: Ring, y: number): number[] {
  const xs: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  return xs.sort((p, q) => p - q);
}

/** Sets `row[col]` to `value` for every column whose centre is between a pair of crossings. */
function spans(r: Raster, xs: readonly number[], row: Uint8Array, value: 0 | 1): void {
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const from = Math.max(0, Math.ceil((xs[k]! - r.originX) / r.cellM - 0.5));
    const to = Math.min(r.cols - 1, Math.ceil((xs[k + 1]! - r.originX) / r.cellM - 0.5) - 1);
    for (let col = from; col <= to; col++) row[col] = value;
  }
}

/**
 * Writes `value` into every cell whose centre is inside `outline` and outside
 * each of `holes`, one row at a time.
 */
function paint(r: Raster, outline: Ring, holes: readonly Ring[], value: 0 | 1): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of outline) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const first = Math.max(0, Math.floor((minY - r.originY) / r.cellM));
  const last = Math.min(r.rows - 1, Math.ceil((maxY - r.originY) / r.cellM));
  const inside = new Uint8Array(r.cols);
  for (let row = first; row <= last; row++) {
    const y = r.originY + (row + 0.5) * r.cellM;
    inside.fill(0);
    spans(r, crossings(outline, y), inside, 1);
    for (const hole of holes) spans(r, crossings(hole, y), inside, 0);
    const base = row * r.cols;
    for (let col = 0; col < r.cols; col++) if (inside[col]) r.cells[base + col] = value;
  }
}

/** Every cell within `radius` cells (a square) of a set one, set. */
function dilate(cells: Uint8Array, cols: number, rows: number, radius: number): Uint8Array {
  const across = new Uint8Array(cells.length);
  for (let row = 0; row < rows; row++) {
    const base = row * cols;
    for (let col = 0; col < cols; col++) {
      if (!cells[base + col]) continue;
      const to = Math.min(cols - 1, col + radius);
      for (let c = Math.max(0, col - radius); c <= to; c++) across[base + c] = 1;
    }
  }
  const out = new Uint8Array(cells.length);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!across[row * cols + col]) continue;
      const to = Math.min(rows - 1, row + radius);
      for (let r = Math.max(0, row - radius); r <= to; r++) out[r * cols + col] = 1;
    }
  }
  return out;
}

const invert = (cells: Uint8Array): Uint8Array => cells.map(v => 1 - v);

/**
 * A morphological closing: grow the surface by `radius` cells, then shrink
 * it back. Gaps and notches up to twice `radius` wide fill; nothing else moves.
 */
function closeGaps(r: Raster, radius: number): Raster {
  if (radius <= 0 || r.cells.length === 0) return r;
  const grown = dilate(r.cells, r.cols, r.rows, radius);
  return { ...r, cells: invert(dilate(invert(grown), r.cols, r.rows, radius)) };
}

/**
 * A morphological opening: shrink the surface by `radius` cells, then grow it
 * back. Strips narrower than 2·radius + 1 cells go; the rest is unchanged
 * but for its sharpest corners.
 */
function openSlivers(r: Raster, radius: number): Raster {
  if (radius <= 0 || r.cells.length === 0) return r;
  const shrunk = invert(dilate(invert(r.cells), r.cols, r.rows, radius));
  return { ...r, cells: dilate(shrunk, r.cols, r.rows, radius) };
}

/**
 * What stands on the surface and is not walked on: a void, and any room or
 * back-of-house space not marked walkable. L1's Stadium and Hawker Centre are
 * walkable zones with 73 rooms drawn inside them; without this, paths would
 * run through toilets and stalls. Details are furniture and do not block:
 * as holes, each would put a loop in the network.
 */
function blocks(room: Room): boolean {
  return room.kind === "void" || (!room.walkable && room.kind !== "detail");
}

/**
 * Spec §7.3 step 1: one floor's walkable surface. That is the union of its
 * walkable rooms (areas, and the spaces opened for lift and stair stops, which
 * become walkable areas), with gaps under 0.5 m between them bridged, less
 * every room standing on it that is not walked on, less the slivers that
 * leaves.
 *
 * There is no polygon union in the codebase and none is needed: each room is
 * painted into the same grid, so rooms that overlap or abut are one surface by
 * construction.
 */
export function walkableRaster(model: MapModel, levelId: string, cellM = CELL_M): Raster {
  const rooms = live(model.rooms).filter(room => room.levelId === levelId);
  const walkable = rooms.filter(room => room.walkable && room.kind !== "void");
  if (walkable.length === 0) return emptyRaster(cellM);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const room of walkable) {
    for (const [x, y] of room.footprint) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const col0 = Math.floor(minX / cellM) - PAD_CELLS;
  const row0 = Math.floor(minY / cellM) - PAD_CELLS;
  const cols = Math.ceil(maxX / cellM) + PAD_CELLS - col0;
  const rows = Math.ceil(maxY / cellM) + PAD_CELLS - row0;
  if (cols * rows > MAX_CELLS) throw new SurfaceTooLarge(maxX - minX, maxY - minY);
  const raster: Raster = {
    originX: col0 * cellM, originY: row0 * cellM, cols, rows, cellM, cells: new Uint8Array(cols * rows),
  };

  for (const room of walkable) paint(raster, room.footprint, room.holes, 1);
  const surface = closeGaps(raster, BRIDGE_CELLS);
  for (const room of rooms) if (blocks(room)) paint(surface, room.footprint, room.holes, 0);
  return openSlivers(surface, SLIVER_CELLS);
}
