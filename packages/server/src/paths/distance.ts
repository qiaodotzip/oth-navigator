import type { Raster } from "./raster";

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
