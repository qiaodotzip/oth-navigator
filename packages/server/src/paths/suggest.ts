import type { MapModel, Vec2 } from "@oth/model";
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
 * The shared interface contract's type, verbatim. A line's `ends` are what its
 * first and last points meet; `network` numbers the lines that join up, 0 for
 * the network with the most length.
 */
export type PathSuggestion = {
  lines: { polyline: Vec2[]; widthM: number; ends: ["fork" | "end" | "loop", "fork" | "end" | "loop"]; network: number }[];
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
  let lines: PathSuggestion["lines"] = [];
  if (raster.cols > 0) {
    const toEdge = distanceToEdge(raster);
    const width = (points: readonly Vec2[]) => lineWidth(points, raster, toEdge);
    lines = linesThroughForks(pruneSpurs(skeletonGraph(thin(raster), raster), SPUR_M), width)
      .sort((p, q) => q.lengthM - p.lengthM)
      .map(l => ({
        polyline: simplify(l.points, SIMPLIFY_M).map(at),
        widthM: Math.round(width(l.points) * 10) / 10,
        ends: l.ends,
        network: l.network,
      }));
  }
  const { links, unconnected } = connect(raster, lines.map(l => l.polyline), targets);
  return {
    lines,
    links: links.map(l => ({ from: l.from, segment: [at(l.segment[0]), at(l.segment[1])] })),
    unconnected,
  };
}
