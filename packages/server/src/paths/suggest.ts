import { distancePointToSegment, live, type MapModel, type Pathway, type Vec2 } from "@oth/model";
import { connect, linkTargets } from "./connect";
import { distanceToEdge } from "./distance";
import { linesThroughForks, pruneSpurs, skeletonGraph } from "./graph";
import { cellIndex, walkableRaster, type Raster } from "./raster";
import { simplify } from "./simplify";
import { thin } from "./thin";

/** Spec §7.3 step 3. */
export const SPUR_M = 2;
export const SIMPLIFY_M = 0.3;
/** Spec §7.3 step 5. */
export const MIN_WIDTH_M = 1.2;
export const MAX_WIDTH_M = 6;
/** Which of the distances to the edge along a line sets its width: see lineWidth. */
export const WIDTH_PERCENTILE = 0.25;

/**
 * A line runs along a pathway already drawn when this much of it lies within
 * the pathway's half width and DRAWN_MARGIN_M more (contract v2), measured at
 * a point every DRAWN_STEP_M along it, and runs there within DRAWN_ANGLE_DEG
 * of the pathway's nearest segment: a line that only crosses a pathway, or
 * branches off it, is not drawn.
 */
export const DRAWN_SHARE = 0.7;
export const DRAWN_MARGIN_M = 1;
export const DRAWN_ANGLE_DEG = 30;
const DRAWN_STEP_M = 1;

/**
 * The shared interface contract's type, verbatim. A line's `ends` are what its
 * first and last points meet; `network` numbers the lines that join up, 0 for
 * the network with the most length; `drawn` says the floor has a pathway along
 * it already.
 */
export type PathSuggestion = {
  lines: {
    polyline: Vec2[]; widthM: number; ends: ["fork" | "end" | "loop", "fork" | "end" | "loop"]; network: number; drawn: boolean;
  }[];
  links: { from: { type: "doorway" | "stop" | "entrance"; id: string }; segment: [Vec2, Vec2] }[];
  unconnected: { type: "doorway" | "stop" | "entrance"; id: string; reason: string }[];
};

/**
 * Spec §7.3 step 5, but at the 25th percentile where the spec says the median:
 * twice the distance to the edge that a quarter of the line's run is closer
 * than, clamped. A pathway opens its full width all along, so a line from a
 * hall on into a 3 m gap between shops takes the gap's width, not the hall's.
 */
export function lineWidth(points: readonly Vec2[], r: Raster, toEdge: Float32Array): number {
  const d = points.map(p => {
    const i = cellIndex(r, p);
    return i < 0 ? 0 : toEdge[i]!;
  }).sort((x, y) => x - y);
  const rank = (d.length - 1) * WIDTH_PERCENTILE;
  const below = Math.floor(rank);
  const quarter = d[below]! + (d[Math.min(below + 1, d.length - 1)]! - d[below]!) * (rank - below);
  return Math.min(MAX_WIDTH_M, Math.max(MIN_WIDTH_M, 2 * quarter));
}

const cm = (v: number) => Math.round(v * 100) / 100;
const at = (p: Vec2): Vec2 => [cm(p[0]), cm(p[1])];

/** A point on a line, and the way the line runs there, as a unit vector. */
type Sample = { at: Vec2; dir: Vec2 };

/** A point every `step` metres along a line, both ends included, each with its segment's direction. */
function samplesAlong(line: readonly Vec2[], step: number): Sample[] {
  const out: Sample[] = [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    const dir: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    if (out.length === 0) out.push({ at: a, dir });
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) out.push({ at: [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n], dir });
  }
  return out;
}

/** The segment of these pathways nearest a point: how far it is, the pathway's reach, and the way it runs. */
function nearestSegment(p: Vec2, pathways: readonly Pathway[], reach: (p: Pathway) => number) {
  let best: { d: number; reach: number; dir: Vec2 } | null = null;
  for (const pathway of pathways) {
    const line = pathway.polyline;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!;
      const b = line[i]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len === 0) continue;
      const d = distancePointToSegment(p, a, b);
      if (!best || d < best.d) best = { d, reach: reach(pathway), dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
    }
  }
  return best;
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };
function boxOf(line: readonly Vec2[], pad: number): Box {
  const xs = line.map(p => p[0]);
  const ys = line.map(p => p[1]);
  return { minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad, maxX: Math.max(...xs) + pad, maxY: Math.max(...ys) + pad };
}
const meet = (a: Box, b: Box) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/**
 * Whether a suggested line runs along a pathway already drawn (contract v2):
 * at least DRAWN_SHARE of its points lie within a pathway's half width and a
 * metre of the nearest pathway segment, and run within DRAWN_ANGLE_DEG of it,
 * either way along. suggest_paths works from the walkable surface alone, so
 * this is how a second run of draw_paths knows what the first one drew.
 */
export function drawnAlready(line: readonly Vec2[], pathways: readonly Pathway[]): boolean {
  if (line.length < 2) return false;
  const reach = (p: Pathway) => p.widthM / 2 + DRAWN_MARGIN_M;
  const box = boxOf(line, 0);
  const near = pathways.filter(p => p.polyline.length >= 2 && meet(box, boxOf(p.polyline, reach(p))));
  if (near.length === 0) return false;
  const samples = samplesAlong(line, DRAWN_STEP_M);
  if (samples.length === 0) return false;
  // Within the angle either way along: |cos| of the angle between the two directions at least this.
  const minCos = Math.cos((DRAWN_ANGLE_DEG * Math.PI) / 180);
  const along = samples.filter(s => {
    const seg = nearestSegment(s.at, near, reach);
    return seg !== null && seg.d <= seg.reach && Math.abs(s.dir[0] * seg.dir[0] + s.dir[1] * seg.dir[1]) >= minCos;
  }).length;
  return along / samples.length >= DRAWN_SHARE;
}

/**
 * Spec §7.3: a first pass of one floor's pathways, from its walkable surface.
 * Read-only and pure: the floor is rasterised, thinned to its skeleton, pruned,
 * vectorised, run on through the forks where it bends gently, and simplified,
 * and every doorway, stop and entrance is joined to the result or listed with
 * why not. Longest line first; coordinates to the centimetre and widths to
 * 0.1 m, since the plan is traced no finer.
 *
 * Throws SurfaceTooLarge when the floor's walkable areas span more than a
 * 500 m square.
 */
export function suggestPaths(model: MapModel, levelId: string): PathSuggestion {
  const raster = walkableRaster(model, levelId);
  const targets = linkTargets(model, levelId);
  const drawn = live(model.pathways).filter(p => p.levelId === levelId);
  let lines: PathSuggestion["lines"] = [];
  if (raster.cols > 0) {
    const toEdge = distanceToEdge(raster);
    const width = (points: readonly Vec2[]) => lineWidth(points, raster, toEdge);
    lines = linesThroughForks(pruneSpurs(skeletonGraph(thin(raster), raster), SPUR_M), width)
      .sort((p, q) => q.lengthM - p.lengthM)
      .map(l => {
        const polyline = simplify(l.points, SIMPLIFY_M).map(at);
        return {
          polyline,
          widthM: Math.round(width(l.points) * 10) / 10,
          ends: l.ends,
          network: l.network,
          drawn: drawnAlready(polyline, drawn),
        };
      });
  }
  const { links, unconnected } = connect(raster, lines.map(l => l.polyline), targets);
  return {
    lines,
    links: links.map(l => ({ from: l.from, segment: [at(l.segment[0]), at(l.segment[1])] })),
    unconnected,
  };
}
