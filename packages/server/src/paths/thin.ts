import type { Raster } from "./raster";

/**
 * A pixel's eight neighbours as (dx, dy) in grid steps, clockwise from the row
 * before: Zhang and Suen's P2…P9, bit k of `neighbourMask` for position k.
 * Which way the grid's rows run on the plan makes no difference to the result.
 */
const RING: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/**
 * The eight neighbours of pixel `i` as a bit mask, in RING's order. The
 * caller keeps every set pixel off the grid's outer ring (walkableRaster
 * pads it), so no index wraps to the next row.
 */
function neighbourMask(img: Uint8Array, i: number, cols: number): number {
  return (img[i - cols] ? 1 : 0) | (img[i - cols + 1] ? 2 : 0) | (img[i + 1] ? 4 : 0) | (img[i + cols + 1] ? 8 : 0)
    | (img[i + cols] ? 16 : 0) | (img[i + cols - 1] ? 32 : 0) | (img[i - 1] ? 64 : 0) | (img[i - cols - 1] ? 128 : 0);
}

const bit = (mask: number, k: number) => (mask >> k) & 1;

/** The two sub-iterations' rules, looked up by neighbour mask. */
function zhangSuenRules(): [Uint8Array, Uint8Array] {
  const first = new Uint8Array(256);
  const second = new Uint8Array(256);
  for (let m = 0; m < 256; m++) {
    let set = 0;
    let rises = 0;
    for (let k = 0; k < 8; k++) {
      set += bit(m, k);
      if (!bit(m, k) && bit(m, (k + 1) % 8)) rises++;
    }
    if (set < 2 || set > 6 || rises !== 1) continue;
    const [p2, p4, p6, p8] = [bit(m, 0), bit(m, 2), bit(m, 4), bit(m, 6)];
    if (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) first[m] = 1;
    if (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0) second[m] = 1;
  }
  return [first, second];
}

/** The groups of ring positions `ks` in which each touches another of its group. */
function groups(ks: readonly number[], touching: (a: number, b: number) => boolean): number[][] {
  const out: number[][] = [];
  const seen = new Set<number>();
  for (const k of ks) {
    if (seen.has(k)) continue;
    seen.add(k);
    const group = [k];
    for (let g = 0; g < group.length; g++) {
      for (const j of ks) {
        if (!seen.has(j) && touching(group[g]!, j)) {
          seen.add(j);
          group.push(j);
        }
      }
    }
    out.push(group);
  }
  return out;
}

/**
 * Pixels that can go without changing the shape's topology, and that do not
 * end a line: the set neighbours are one 8-connected group, and the unset ones
 * beside the pixel's four sides one 4-connected group. This is what takes the
 * redundant corner off each step of a staircase, which would otherwise read
 * as a fork.
 */
function removableRule(): Uint8Array {
  const apart = (a: number, b: number) => [Math.abs(RING[a]![0] - RING[b]![0]), Math.abs(RING[a]![1] - RING[b]![1])];
  const touches8 = (a: number, b: number) => Math.max(...apart(a, b)) === 1;
  const touches4 = (a: number, b: number) => apart(a, b).reduce((s, d) => s + d, 0) === 1;
  const rule = new Uint8Array(256);
  for (let m = 0; m < 256; m++) {
    const on: number[] = [];
    const off: number[] = [];
    for (let k = 0; k < 8; k++) (bit(m, k) ? on : off).push(k);
    const lines = groups(on, touches8).length;
    // The even positions are the pixel's own sides.
    const gaps = groups(off, touches4).filter(g => g.some(k => k % 2 === 0)).length;
    if (on.length >= 2 && lines === 1 && gaps === 1) rule[m] = 1;
  }
  return rule;
}

const [FIRST, SECOND] = zhangSuenRules();
const REMOVABLE = removableRule();

/**
 * Spec §7.3 step 2: the surface thinned to a line one pixel wide, with its
 * forks, loops and ends where they are.
 *
 * Zhang and Suen's two sub-iterations, but each one only looks at pixels on
 * the rim: a pixel it may delete always has an unset side neighbour, so the
 * rim is all there is to test. The rim moves inward as pixels go, which keeps
 * L1 under a tenth of a second. Then the corners Zhang and Suen leave on
 * diagonal runs come off.
 */
export function thin(r: Raster): Uint8Array {
  const { cols } = r;
  const img = r.cells.slice();
  let rim: number[] = [];
  for (let i = 0; i < img.length; i++) {
    if (img[i] && (!img[i - cols] || !img[i + 1] || !img[i + cols] || !img[i - 1])) rim.push(i);
  }
  const queued = new Int32Array(img.length);
  let pass = 0;
  for (let removed = true; removed; ) {
    removed = false;
    for (const rule of [FIRST, SECOND]) {
      const doomed = rim.filter(i => rule[neighbourMask(img, i, cols)] === 1);
      if (doomed.length === 0) continue;
      removed = true;
      for (const i of doomed) img[i] = 0;
      pass++;
      const next: number[] = [];
      const queue = (i: number) => {
        if (img[i] && queued[i] !== pass) {
          queued[i] = pass;
          next.push(i);
        }
      };
      for (const i of rim) queue(i);
      for (const i of doomed) {
        queue(i - cols);
        queue(i + 1);
        queue(i + cols);
        queue(i - 1);
      }
      rim = next;
    }
  }

  const on: number[] = [];
  for (let i = 0; i < img.length; i++) if (img[i]) on.push(i);
  for (let removed = true; removed; ) {
    removed = false;
    for (const i of on) {
      if (img[i] && REMOVABLE[neighbourMask(img, i, cols)] === 1) {
        img[i] = 0;
        removed = true;
      }
    }
  }
  return img;
}
