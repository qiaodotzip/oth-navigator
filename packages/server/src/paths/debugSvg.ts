import { live, type MapModel, type Ring, type Vec2 } from "@oth/model";
import { linkTargets } from "./connect";
import type { PathSuggestion } from "./suggest";

/** Pixels per metre: L1's 213 × 229 m comes out about 850 × 920 px. */
const SCALE = 4;
const MARGIN_M = 5;

/**
 * A picture of a suggestion over the floor's rooms, for a person to judge by
 * eye: walkable rooms grey, other rooms outlined, voids pink, each line as a
 * band as wide as its width with its centre line in blue, links in green, and
 * each unconnected doorway, stop or entrance as a red ring. North is up.
 */
export function suggestionSvg(model: MapModel, levelId: string, s: PathSuggestion): string {
  const rooms = live(model.rooms).filter(r => r.levelId === levelId);
  const targets = linkTargets(model, levelId);
  const all = [...rooms.flatMap(r => r.footprint), ...s.lines.flatMap(l => l.polyline), ...targets.map(t => t.point)];
  if (all.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="40"><rect width="240" height="40" fill="#ffffff"/>`
      + `<text x="8" y="25" font-family="sans-serif" font-size="14">Nothing on this floor.</text></svg>`;
  }
  const minX = Math.min(...all.map(p => p[0])) - MARGIN_M;
  const maxX = Math.max(...all.map(p => p[0])) + MARGIN_M;
  const minY = Math.min(...all.map(p => p[1])) - MARGIN_M;
  const maxY = Math.max(...all.map(p => p[1])) + MARGIN_M;
  const x = (p: Vec2) => ((p[0] - minX) * SCALE).toFixed(1);
  const y = (p: Vec2) => ((maxY - p[1]) * SCALE).toFixed(1);
  const pts = (ps: readonly Vec2[]) => ps.map(p => `${x(p)},${y(p)}`).join(" ");
  const ring = (r: Ring) => `M${pts(r)}Z`;

  const parts: string[] = [];
  for (const room of rooms) {
    const style = room.kind === "void"
      ? `fill="#fecdd3" stroke="#e11d48"`
      : room.walkable ? `fill="#e5e7eb" stroke="#9ca3af"` : `fill="none" stroke="#9ca3af"`;
    parts.push(`<path d="${[room.footprint, ...room.holes].map(ring).join(" ")}" fill-rule="evenodd" ${style} stroke-width="1"/>`);
  }
  for (const line of s.lines) {
    parts.push(`<polyline points="${pts(line.polyline)}" fill="none" stroke="#2563eb" stroke-opacity="0.25" stroke-width="${(line.widthM * SCALE).toFixed(1)}" stroke-linejoin="round"/>`);
    parts.push(`<polyline points="${pts(line.polyline)}" fill="none" stroke="#1d4ed8" stroke-width="2"/>`);
  }
  for (const link of s.links) {
    parts.push(`<polyline points="${pts(link.segment)}" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="4 3"/>`);
  }
  const where = new Map(targets.map(t => [`${t.type}:${t.id}`, t.point]));
  for (const u of s.unconnected) {
    const p = where.get(`${u.type}:${u.id}`);
    if (p) parts.push(`<circle cx="${x(p)}" cy="${y(p)}" r="6" fill="none" stroke="#dc2626" stroke-width="2"/>`);
  }
  const width = Math.ceil((maxX - minX) * SCALE);
  const height = Math.ceil((maxY - minY) * SCALE);
  const title = `Lines: ${s.lines.length}. Links: ${s.links.length}. Unconnected: ${s.unconnected.length}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 24}" viewBox="0 -24 ${width} ${height + 24}">`
    + `<rect x="0" y="-24" width="${width}" height="${height + 24}" fill="#ffffff"/>`
    + `<text x="8" y="-8" font-family="sans-serif" font-size="14">${title}</text>`
    + parts.join("") + `</svg>`;
}
