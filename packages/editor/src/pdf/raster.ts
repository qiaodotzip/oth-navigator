/**
 * The raster half of `scripts/extract-storey-plan.py`, on typed arrays. A grid
 * is row-major, one byte a pixel, 1 set and 0 clear. Each function matches its
 * Python counterpart, including where the script is odd, because L1's 193
 * rooms came out of the Python and a port that disagrees would move walls.
 */
export type Grid = { data: Uint8Array; width: number; height: number };
export type Pt = [number, number];
export type Region = { pixels: Int32Array; minX: number; minY: number; maxX: number; maxY: number };
export type Window = Grid & { x0: number; y0: number };

/**
 * Set every pixel within r of a set one along its row or its column: the
 * script's `shift_or`, a cross and not a square. Rows and columns each read
 * the original, so this is the union of the two, as the script's four shifts
 * are. Nothing outside the grid is set.
 */
export function dilate(g: Grid, r: number): Grid {
  const { width: W, height: H, data } = g;
  const out = data.slice();
  if (r <= 0) return { width: W, height: H, data: out };
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let last = -Infinity;
    for (let x = 0; x < W; x++) {
      if (data[row + x]) last = x;
      else if (x - last <= r) out[row + x] = 1;
    }
    last = Infinity;
    for (let x = W - 1; x >= 0; x--) {
      if (data[row + x]) last = x;
      else if (last - x <= r) out[row + x] = 1;
    }
  }
  for (let x = 0; x < W; x++) {
    let last = -Infinity;
    for (let y = 0; y < H; y++) {
      if (data[y * W + x]) last = y;
      else if (y - last <= r) out[y * W + x] = 1;
    }
    last = Infinity;
    for (let y = H - 1; y >= 0; y--) {
      if (data[y * W + x]) last = y;
      else if (last - y <= r) out[y * W + x] = 1;
    }
  }
  return { width: W, height: H, data: out };
}

/** A plain loop, not `data.map`: a callback a pixel took a third of a second on L1's 31 Mpx sheet. */
export function invert(g: Grid): Grid {
  const data = new Uint8Array(g.data.length);
  for (let i = 0; i < data.length; i++) data[i] = g.data[i] ? 0 : 1;
  return { width: g.width, height: g.height, data };
}

/** `~shift_or(~a, r)`: outside the grid counts as set, so nothing wears away at its edge. */
export function erode(g: Grid, r: number): Grid {
  return invert(dilate(invert(g), r));
}

export function and(a: Grid, b: Grid): Grid {
  const data = new Uint8Array(a.data.length);
  for (let i = 0; i < data.length; i++) data[i] = a.data[i]! & b.data[i]!;
  return { width: a.width, height: a.height, data };
}

export function countSet(g: Grid): number {
  let n = 0;
  for (let i = 0; i < g.data.length; i++) n += g.data[i]!;
  return n;
}

/** The first set pixel in reading order, as `np.nonzero` finds it; −1 for none. */
export function firstSet(g: Grid): number {
  return g.data.indexOf(1);
}

/**
 * The set pixel nearest (sx, sy): the seed itself if it is set, otherwise the
 * closest in the first growing square that holds any, first in reading order
 * on a tie. That is the script's `nearest`, reach 40.
 */
export function nearest(ok: Grid, sx: number, sy: number, reach = 40): Pt | null {
  const { width: W, height: H, data } = ok;
  if (data[sy * W + sx]) return [sx, sy];
  for (let r = 1; r < reach; r++) {
    const y0 = Math.max(sy - r, 0);
    const y1 = Math.min(sy + r + 1, H);
    const x0 = Math.max(sx - r, 0);
    const x1 = Math.min(sx + r + 1, W);
    let best: Pt | null = null;
    let bestD = Infinity;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!data[y * W + x]) continue;
        const d = (x - sx) ** 2 + (y - sy) ** 2;
        if (d < bestD) {
          bestD = d;
          best = [x, y];
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Four-way floods over one grid size, as PIL's floodfill. A stamp per pixel
 * says which flood saw it last, so the hundreds of floods on one sheet never
 * copy or clear the whole grid. The script copied the image for every label.
 */
export class Flooder {
  private readonly seen: Int32Array;
  private stamp = 0;
  private stack = new Int32Array(4096);

  constructor(readonly width: number, readonly height: number) {
    this.seen = new Int32Array(width * height);
  }

  /** The pixels joined to `seed`, or null once there are more than `limit`: bigger than any room. */
  fill(passable: Uint8Array, [sx, sy]: Pt, limit = Infinity): Region | null {
    const { width: W, height: H, seen } = this;
    const stamp = ++this.stamp;
    const seed = sy * W + sx;
    let minX = sx;
    let maxX = sx;
    let minY = sy;
    let maxY = sy;
    if (!passable[seed]) return { pixels: new Int32Array(0), minX, minY, maxX, maxY };
    const pixels: number[] = [];
    let top = 0;
    const push = (q: number) => {
      if (!passable[q] || seen[q] === stamp) return;
      seen[q] = stamp;
      if (top === this.stack.length) {
        const grown = new Int32Array(this.stack.length * 2);
        grown.set(this.stack);
        this.stack = grown;
      }
      this.stack[top++] = q;
    };
    push(seed);
    while (top > 0) {
      const p = this.stack[--top]!;
      pixels.push(p);
      if (pixels.length > limit) return null;
      const x = p % W;
      const y = (p - x) / W;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0) push(p - 1);
      if (x < W - 1) push(p + 1);
      if (y > 0) push(p - W);
      if (y < H - 1) push(p + W);
    }
    return { pixels: Int32Array.from(pixels), minX, minY, maxX, maxY };
  }
}

/** A region as its own small grid, with `pad` clear pixels round it (fewer where the whole ends). */
export function regionWindow(region: Region, whole: { width: number; height: number }, pad: number): Window {
  const x0 = Math.max(region.minX - pad, 0);
  const y0 = Math.max(region.minY - pad, 0);
  const x1 = Math.min(region.maxX + pad + 1, whole.width);
  const y1 = Math.min(region.maxY + pad + 1, whole.height);
  const width = x1 - x0;
  const height = y1 - y0;
  const data = new Uint8Array(width * height);
  for (const p of region.pixels) {
    const x = p % whole.width;
    const y = (p - x) / whole.width;
    data[(y - y0) * width + (x - x0)] = 1;
  }
  return { data, width, height, x0, y0 };
}

/** The same part of another whole grid. */
export function cropLike(whole: Grid, win: Window): Grid {
  const data = new Uint8Array(win.width * win.height);
  for (let y = 0; y < win.height; y++) {
    const from = (win.y0 + y) * whole.width + win.x0;
    data.set(whole.data.subarray(from, from + win.width), y * win.width);
  }
  return { data, width: win.width, height: win.height };
}

/** How much room `clean` needs round a mask: the script's pad. */
export function cleanPad(metresPerPixel: number, spurM = 0.3, notchM = 0.3): number {
  return Math.floor(Math.max(spurM, notchM) / metresPerPixel) + 4;
}

/**
 * Drops what is not the room: door swings, fixtures, the gap a cleared label
 * left in a wall. Opening takes off thin spurs, and closing fills notches.
 * Floor division as Python's int(): 0.3 / 0.05 is 5.999… in floating point,
 * so the radius is 5, as it was for L1.
 */
export function clean(g: Grid, metresPerPixel: number, spurM = 0.3, notchM = 0.3): Grid {
  const rs = Math.floor(spurM / metresPerPixel);
  const rn = Math.floor(notchM / metresPerPixel);
  return erode(dilate(dilate(erode(g, rs), rs), rn), rn);
}

/**
 * Every closed boundary of the set pixels, walked along the cracks between
 * pixels, so a vertex lands on the wall line itself rather than half a pixel
 * off it. The edges are gathered and walked in the script's order, so the
 * rings come out as its did.
 */
export function loops(g: Grid): Pt[][] {
  const { width: W, height: H, data } = g;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && data[y * W + x] === 1;
  const CW = W + 1;
  const edges = new Map<number, number[]>();
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const key = ay * CW + ax;
    const next = by * CW + bx;
    const list = edges.get(key);
    if (list) list.push(next);
    else edges.set(key, [next]);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) && !at(x, y - 1)) add(x, y, x + 1, y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) && !at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) && !at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) && !at(x - 1, y)) add(x, y + 1, x, y);

  const out: Pt[][] = [];
  while (edges.size > 0) {
    const start = edges.keys().next().value as number;
    let cur = start;
    const ring = [start];
    for (;;) {
      const nexts = edges.get(cur);
      if (!nexts || nexts.length === 0) break;
      const next = nexts.pop()!;
      if (nexts.length === 0) edges.delete(cur);
      cur = next;
      if (cur === start) break;
      ring.push(cur);
    }
    if (ring.length >= 4) out.push(ring.map(k => [k % CW, Math.floor(k / CW)] as Pt));
  }
  return out;
}

/** Drops the corners of a straight run, which the crack walk leaves at every pixel. */
export function dropCollinear(ring: readonly Pt[]): Pt[] {
  const n = ring.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n]!;
    const p = ring[i]!;
    const b = ring[(i + 1) % n]!;
    if ((p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0])) out.push(p);
  }
  return out.length > 0 ? out : [...ring];
}

/**
 * Ramer–Douglas–Peucker. A closed ring starts and ends on the same point, so
 * its chord has no length and the perpendicular distance is undefined: the
 * distance from that point stands in, or the ring collapses to two points.
 */
export function rdp(pts: readonly Pt[], eps: number): Pt[] {
  if (pts.length < 3) return [...pts];
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const den = Math.hypot(dx, dy);
  let best = -1;
  let bi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const d = den ? Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / den : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (d > best) {
      best = d;
      bi = i;
    }
  }
  if (best <= eps) return [a, b];
  return [...rdp(pts.slice(0, bi + 1), eps).slice(0, -1), ...rdp(pts.slice(bi), eps)];
}
