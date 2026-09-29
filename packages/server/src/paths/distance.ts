import type { Vec2 } from "@oth/model";
import { cellIndex, type Raster } from "./raster";

/** Spec §7.3 step 5. */
export const MIN_WIDTH_M = 1.2;
export const MAX_WIDTH_M = 6;
/** Which of the distances to the edge along a line sets its width: see lineWidth. */
export const WIDTH_PERCENTILE = 0.25;

/** Far enough to stand for "no edge yet", and still exact in doubles when two are subtracted. */
const FAR = 1e20;

/**
 * Felzenszwalb and Huttenlocher's squared distance transform along one line
 * of the grid, in place: the lower envelope of a parabola rooted at each cell.
 * `f`, `v` and `z` are scratch, as long as the line (`z` one longer).
 */
function transformLine(
  grid: Float64Array, offset: number, stride: number, length: number,
  f: Float64Array, v: Int32Array, z: Float64Array,
): void {
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  f[0] = grid[offset]!;
  for (let q = 1, k = 0; q < length; q++) {
    f[q] = grid[offset + q * stride]!;
    let s: number;
    do {
      const r = v[k]!;
      // f[q] - f[r] first: two FARs cancel exactly instead of losing q² to rounding.
      s = (f[q]! - f[r]! + q * q - r * r) / (q - r) / 2;
    } while (s <= z[k]! && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1]! < q) k++;
    const r = v[k]!;
    grid[offset + q * stride] = f[r]! + (q - r) * (q - r);
  }
}

/**
 * Spec §7.3 step 2: for every cell, metres from its centre to the edge of the
 * walkable surface, and 0 off it.
 *
 * Exact Euclidean distance to the nearest cell off the surface, less half a
 * cell, since the edge runs midway between the two centres. A cell on the
 * surface's rim is therefore 0.125 m from its edge.
 */
export function distanceToEdge(r: Raster): Float32Array {
  const n = r.cols * r.rows;
  const grid = new Float64Array(n);
  for (let i = 0; i < n; i++) grid[i] = r.cells[i] ? FAR : 0;
  const longest = Math.max(r.cols, r.rows);
  const f = new Float64Array(longest);
  const v = new Int32Array(longest);
  const z = new Float64Array(longest + 1);
  for (let col = 0; col < r.cols; col++) transformLine(grid, col, r.cols, r.rows, f, v, z);
  for (let row = 0; row < r.rows; row++) transformLine(grid, row * r.cols, 1, r.cols, f, v, z);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) if (r.cells[i]) out[i] = (Math.sqrt(grid[i]!) - 0.5) * r.cellM;
  return out;
}

/**
 * Spec §7.3 step 5, but at the 25th percentile where the spec says the median:
 * twice the distance to the edge that a quarter of the line's run is closer
 * than, clamped. A pathway opens its full width all along, so a line from a
 * hall on into a 3 m gap between shops takes the gap's width, not the hall's.
 * suggest_paths' lines clamp it to MIN_WIDTH_M–MAX_WIDTH_M; connect_rooms'
 * connectors to 1–3 m (contract v5).
 */
export function lineWidth(
  points: readonly Vec2[], r: Raster, toEdge: Float32Array, min = MIN_WIDTH_M, max = MAX_WIDTH_M,
): number {
  const d = points.map(p => {
    const i = cellIndex(r, p);
    return i < 0 ? 0 : toEdge[i]!;
  }).sort((x, y) => x - y);
  const rank = (d.length - 1) * WIDTH_PERCENTILE;
  const below = Math.floor(rank);
  const quarter = d[below]! + (d[Math.min(below + 1, d.length - 1)]! - d[below]!) * (rank - below);
  return Math.min(max, Math.max(min, 2 * quarter));
}
