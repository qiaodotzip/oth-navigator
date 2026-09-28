import type { MapModel, Vec2 } from "@oth/model";
import { connect, linkTargets } from "./connect";
import { distanceToEdge } from "./distance";
import { pruneSpurs, skeletonGraph } from "./graph";
import { cellIndex, walkableRaster, type Raster } from "./raster";
import { simplify } from "./simplify";
import { thin } from "./thin";

/** Spec §7.3 step 3. */
export const SPUR_M = 2;
export const SIMPLIFY_M = 0.3;
/** Spec §7.3 step 5. */
export const MIN_WIDTH_M = 1.2;
export const MAX_WIDTH_M = 6;

/** The shared interface contract's type, verbatim. */
export type PathSuggestion = {
  lines: { polyline: Vec2[]; widthM: number }[];
  links: { from: { type: "doorway" | "stop" | "entrance"; id: string }; segment: [Vec2, Vec2] }[];
  unconnected: { type: "doorway" | "stop" | "entrance"; id: string; reason: string }[];
};

/** Spec §7.3 step 5: twice the median distance to the edge along the line, clamped. */
export function lineWidth(points: readonly Vec2[], r: Raster, toEdge: Float32Array): number {
  const d = points.map(p => {
    const i = cellIndex(r, p);
    return i < 0 ? 0 : toEdge[i]!;
  }).sort((x, y) => x - y);
  const mid = d.length >> 1;
  const median = d.length % 2 === 1 ? d[mid]! : (d[mid - 1]! + d[mid]!) / 2;
  return Math.min(MAX_WIDTH_M, Math.max(MIN_WIDTH_M, 2 * median));
}

const cm = (v: number) => Math.round(v * 100) / 100;
const at = (p: Vec2): Vec2 => [cm(p[0]), cm(p[1])];

/**
 * Spec §7.3: a first pass of one floor's pathways, from its walkable surface.
 * Read-only and pure: the floor is rasterised, thinned to its skeleton, pruned,
 * vectorised and simplified, and every doorway, stop and entrance is joined to
 * the result or listed with why not. Longest line first; coordinates to the
 * centimetre and widths to 0.1 m, since the plan is traced no finer.
 *
 * Throws SurfaceTooLarge when the floor's walkable areas span more than a
 * kilometre square.
 */
export function suggestPaths(model: MapModel, levelId: string): PathSuggestion {
  const raster = walkableRaster(model, levelId);
  const targets = linkTargets(model, levelId);
  let lines: PathSuggestion["lines"] = [];
  if (raster.cols > 0) {
    const toEdge = distanceToEdge(raster);
    const { edges } = pruneSpurs(skeletonGraph(thin(raster), raster), SPUR_M);
    lines = edges
      .filter(e => e.lengthM > 0)
      .sort((p, q) => q.lengthM - p.lengthM)
      .map(e => ({ polyline: simplify(e.points, SIMPLIFY_M).map(at), widthM: Math.round(lineWidth(e.points, raster, toEdge) * 10) / 10 }));
  }
  const { links, unconnected } = connect(raster, lines.map(l => l.polyline), targets);
  return {
    lines,
    links: links.map(l => ({ from: l.from, segment: [at(l.segment[0]), at(l.segment[1])] })),
    unconnected,
  };
}
