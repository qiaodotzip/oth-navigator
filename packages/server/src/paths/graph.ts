import type { Vec2 } from "@oth/model";
import { cellCentre, type Raster } from "./raster";

/**
 * One run of the skeleton between two nodes (a fork or an end), or from a
 * node round a loop back to itself. `points` run from node `a`'s point to
 * node `b`'s, through the centre of every pixel between.
 */
export type SkeletonEdge = { a: number; b: number; points: Vec2[]; lengthM: number };
export type SkeletonGraph = { nodes: Vec2[]; edges: SkeletonEdge[] };

export function polylineLength(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    sum += Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
  }
  return sum;
}

/**
 * Spec §7.3 step 3, vectorising: the one-pixel skeleton as a graph.
 *
 * A pixel with one neighbour ends a line and one with three or more is a
 * fork. Forks come as small clusters of touching pixels, and each cluster is
 * one node at its middle, so the lines that meet there meet at one point.
 * A loop with no fork on it gets a node where it is first found.
 */
export function skeletonGraph(skeleton: Uint8Array, r: Raster): SkeletonGraph {
  const { cols } = r;
  // No bounds checks: walkableRaster's padding keeps every skeleton pixel off the grid's outer ring.
  const around = [-cols, -cols + 1, 1, cols + 1, cols, cols - 1, -1, -cols - 1];
  const on: number[] = [];
  for (let i = 0; i < skeleton.length; i++) if (skeleton[i]) on.push(i);
  const degree = new Uint8Array(skeleton.length);
  for (const i of on) {
    let d = 0;
    for (const o of around) if (skeleton[i + o]) d++;
    degree[i] = d;
  }

  const nodeOf = new Int32Array(skeleton.length).fill(-1);
  const nodes: Vec2[] = [];
  const members: number[][] = [];
  const addNode = (pixels: number[]): number => {
    const id = nodes.length;
    let x = 0;
    let y = 0;
    for (const p of pixels) {
      nodeOf[p] = id;
      const [cx, cy] = cellCentre(r, p);
      x += cx;
      y += cy;
    }
    nodes.push([x / pixels.length, y / pixels.length]);
    members.push(pixels);
    return id;
  };

  for (const i of on) {
    if (degree[i] === 2 || nodeOf[i] !== -1) continue;
    if (degree[i]! < 3) {
      addNode([i]);
      continue;
    }
    const cluster = [i];
    for (let k = 0; k < cluster.length; k++) {
      for (const o of around) {
        const j = cluster[k]! + o;
        if (skeleton[j] && degree[j]! >= 3 && nodeOf[j] === -1 && !cluster.includes(j)) cluster.push(j);
      }
    }
    addNode(cluster);
  }

  const used = new Uint8Array(skeleton.length);
  const edges: SkeletonEdge[] = [];
  const walk = (from: number, start: number, first: number): void => {
    const points: Vec2[] = [nodes[from]!];
    let prev = start;
    let cur = first;
    while (nodeOf[cur] === -1) {
      used[cur] = 1;
      points.push(cellCentre(r, cur));
      // A pixel between nodes has exactly two neighbours: where the walk came from, and on.
      const next = around.map(o => cur + o).find(j => j !== prev && skeleton[j] === 1);
      if (next === undefined) break;
      prev = cur;
      cur = next;
    }
    const to = nodeOf[cur]!;
    points.push(nodes[to]!);
    edges.push({ a: from, b: to, points, lengthM: polylineLength(points) });
  };

  const joined = new Set<string>();
  const forks = nodes.length;
  for (let id = 0; id < forks; id++) {
    for (const s of members[id]!) {
      for (const o of around) {
        const j = s + o;
        if (!skeleton[j]) continue;
        const other = nodeOf[j]!;
        if (other === id) continue;
        if (other !== -1) {
          // Two nodes side by side: one short edge, however many pixel pairs touch.
          const key = id < other ? `${id}:${other}` : `${other}:${id}`;
          if (joined.has(key)) continue;
          joined.add(key);
          const points = [nodes[id]!, nodes[other]!];
          edges.push({ a: id, b: other, points, lengthM: polylineLength(points) });
        } else if (!used[j]) {
          walk(id, s, j);
        }
      }
    }
  }

  for (const i of on) {
    if (nodeOf[i] !== -1 || used[i]) continue;
    const id = addNode([i]);
    const first = around.map(o => i + o).find(j => skeleton[j] === 1);
    if (first !== undefined) walk(id, i, first);
  }
  return { nodes, edges };
}

/** Joins the two edges at every node that has exactly two, so a line runs on through it. */
function joinThrough(edges: SkeletonEdge[]): SkeletonEdge[] {
  let out = edges;
  for (;;) {
    const ends = new Map<number, SkeletonEdge[]>();
    for (const e of out) {
      ends.set(e.a, [...(ends.get(e.a) ?? []), e]);
      ends.set(e.b, [...(ends.get(e.b) ?? []), e]);
    }
    let joinedOne = false;
    for (const [node, at] of ends) {
      const [e, f] = at;
      // A loop's own node has its one edge twice: nothing to join.
      if (at.length !== 2 || !e || !f || e === f) continue;
      const into = e.b === node ? e.points : [...e.points].reverse();
      const onward = f.a === node ? f.points : [...f.points].reverse();
      const joined: SkeletonEdge = {
        a: e.b === node ? e.a : e.b,
        b: f.a === node ? f.b : f.a,
        points: [...into, ...onward.slice(1)],
        lengthM: e.lengthM + f.lengthM,
      };
      out = [...out.filter(x => x !== e && x !== f), joined];
      joinedOne = true;
      break;
    }
    if (!joinedOne) return out;
  }
}

/**
 * Spec §7.3 step 3: spurs shorter than `minM` come off, shortest first.
 *
 * A spur runs from a fork to an end. Once one comes off, a fork left with two
 * edges joins them into one line, so of two short prongs at a corridor's end
 * the longer stays as the line's end, and the corridor keeps its length.
 * A small loop hanging off a fork counts as a spur too. A piece standing on
 * its own is never pruned, however short: it is all there is of that area.
 */
export function pruneSpurs(graph: SkeletonGraph, minM: number): SkeletonGraph {
  let edges = joinThrough(graph.edges);
  for (;;) {
    const degree = new Map<number, number>();
    for (const e of edges) {
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    }
    const deg = (n: number) => degree.get(n) ?? 0;
    let shortest: SkeletonEdge | null = null;
    for (const e of edges) {
      if (e.lengthM >= minM) continue;
      const spur = e.a === e.b
        ? deg(e.a) > 2
        : (deg(e.a) === 1 && deg(e.b) >= 3) || (deg(e.b) === 1 && deg(e.a) >= 3);
      if (spur && (!shortest || e.lengthM < shortest.lengthM)) shortest = e;
    }
    if (!shortest) return { nodes: graph.nodes, edges };
    const gone = shortest;
    edges = joinThrough(edges.filter(e => e !== gone));
  }
}

/** What one end of a line meets: other lines at a fork, nothing (a dead end), or its own start round a loop. */
export type LineEnd = "fork" | "end" | "loop";
/**
 * One or more edges run on through the forks between them. `ends` are what
 * `points`' first and last points meet. `network` numbers the lines that join
 * up, 0 for the network with the most length in all.
 */
export type SkeletonLine = { points: Vec2[]; lengthM: number; ends: [LineEnd, LineEnd]; network: number };

/** A line runs on through a fork only where it bends less than this. */
export const THROUGH_BEND_DEG = 30;
/** …and only into one no more than this many times as wide or narrow. */
export const THROUGH_WIDTH_RATIO = 1.5;
/** How far out along an edge its heading from a fork is taken, past the skeleton's wobble at the fork. */
export const HEADING_M = 3;

/**
 * The unit heading from an edge's end at `end` (0 for `a`, 1 for `b`) to its
 * point HEADING_M along it, or its far end if it is shorter. Null when that
 * is the same point, as on a small loop.
 */
function heading(e: SkeletonEdge, end: 0 | 1): Vec2 | null {
  const n = e.points.length;
  const at = (k: number) => e.points[end === 0 ? k : n - 1 - k]!;
  const from = at(0);
  let to = at(n - 1);
  let run = 0;
  for (let k = 1; k < n; k++) {
    run += Math.hypot(at(k)[0] - at(k - 1)[0], at(k)[1] - at(k - 1)[1]);
    if (run >= HEADING_M) {
      to = at(k);
      break;
    }
  }
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return length === 0 ? null : [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
}

/**
 * The skeleton's edges as lines, each breaking only at a fork. At each fork,
 * the pair of edges that bends least is joined into one line, then the next,
 * while the bend is under THROUGH_BEND_DEG and their widths (by `widthOf`)
 * are within THROUGH_WIDTH_RATIO. So a straight aisle or spine is one line
 * however many side ways leave it. A loop's own node always joins its ends.
 * A line of no length (two nodes on one point) is left out.
 */
export function linesThroughForks(graph: SkeletonGraph, widthOf: (points: readonly Vec2[]) => number): SkeletonLine[] {
  const { edges } = graph;
  // Edge i's end at a is 2i, its end at b 2i + 1.
  const nodeOf = (end: number) => (end & 1 ? edges[end >> 1]!.b : edges[end >> 1]!.a);
  const endsAt = new Map<number, number[]>();
  for (let end = 0; end < edges.length * 2; end++) {
    const at = endsAt.get(nodeOf(end));
    if (at) at.push(end);
    else endsAt.set(nodeOf(end), [end]);
  }

  const partner = new Int32Array(edges.length * 2).fill(-1);
  const pair = (u: number, v: number) => {
    partner[u] = v;
    partner[v] = u;
  };
  const widths = edges.map(e => widthOf(e.points));
  const minStraight = Math.cos((THROUGH_BEND_DEG * Math.PI) / 180);
  for (const at of endsAt.values()) {
    if (at.length === 2) pair(at[0]!, at[1]!);
    if (at.length < 3) continue;
    const pairs: Array<{ u: number; v: number; straight: number }> = [];
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const u = at[i]!;
        const v = at[j]!;
        const hu = heading(edges[u >> 1]!, (u & 1) as 0 | 1);
        const hv = heading(edges[v >> 1]!, (v & 1) as 0 | 1);
        if (!hu || !hv) continue;
        // In along u, out along v: straight on is hv = −hu, and the cosine of the bend is −hu·hv.
        const straight = -(hu[0] * hv[0] + hu[1] * hv[1]);
        const [wu, wv] = [widths[u >> 1]!, widths[v >> 1]!];
        if (straight > minStraight && Math.max(wu, wv) <= THROUGH_WIDTH_RATIO * Math.min(wu, wv)) pairs.push({ u, v, straight });
      }
    }
    pairs.sort((p, q) => q.straight - p.straight);
    for (const { u, v } of pairs) if (partner[u] === -1 && partner[v] === -1) pair(u, v);
  }

  const root = graph.nodes.map((_, i) => i);
  const find = (n: number): number => {
    while (root[n] !== n) n = root[n] = root[root[n]!]!;
    return n;
  };
  for (const e of edges) root[find(e.a)] = find(e.b);

  const done = new Uint8Array(edges.length);
  const lines: Array<Omit<SkeletonLine, "network"> & { component: number }> = [];
  const follow = (start: number) => {
    const points: Vec2[] = [];
    let lengthM = 0;
    for (let end = start; ;) {
      const e = edges[end >> 1]!;
      done[end >> 1] = 1;
      lengthM += e.lengthM;
      const n = e.points.length;
      for (let k = points.length === 0 ? 0 : 1; k < n; k++) points.push(e.points[end & 1 ? n - 1 - k : k]!);
      const next = partner[end ^ 1]!;
      if (next === start) {
        lines.push({ points, lengthM, ends: ["loop", "loop"], component: find(e.a) });
        return;
      }
      if (next === -1) {
        const meets = (lineEnd: number): LineEnd => (endsAt.get(nodeOf(lineEnd))!.length === 1 ? "end" : "fork");
        lines.push({ points, lengthM, ends: [meets(start), meets(end ^ 1)], component: find(e.a) });
        return;
      }
      end = next;
    }
  };
  for (let end = 0; end < edges.length * 2; end++) if (partner[end] === -1 && !done[end >> 1]) follow(end);
  for (let i = 0; i < edges.length; i++) if (!done[i]) follow(2 * i);

  const kept = lines.filter(l => l.lengthM > 0);
  const total = new Map<number, number>();
  for (const l of kept) total.set(l.component, (total.get(l.component) ?? 0) + l.lengthM);
  const order = [...total.keys()].sort((p, q) => total.get(q)! - total.get(p)!);
  return kept.map(({ component, ...l }) => ({ ...l, network: order.indexOf(component) }));
}
