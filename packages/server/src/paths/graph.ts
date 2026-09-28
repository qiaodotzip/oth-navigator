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
