import { live, type MapModel, type Pathway, type PathwayKind, type Vec2 } from "@oth/model";

/** The plan's colour for a pathway with no kind (PathwayShape's default). */
export const DEFAULT_PATHWAY_COLOUR = "#38bdf8";

export type Quad = readonly [Vec2, Vec2, Vec2, Vec2];

/** One flat quad per stretch of the pathway, as wide as it. */
export function stripQuads(polyline: readonly Vec2[], widthM: number): Quad[] {
  const half = widthM / 2;
  const quads: Quad[] = [];
  for (let i = 0; i + 1 < polyline.length; i++) {
    const p = polyline[i]!;
    const q = polyline[i + 1]!;
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1e-6) continue;
    const nx = (-(q[1] - p[1]) / len) * half;
    const ny = ((q[0] - p[0]) / len) * half;
    quads.push([[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny]]);
  }
  return quads;
}

function colourOf(pathway: Pathway, kinds: readonly PathwayKind[]): string {
  return kinds.find(k => k.id === pathway.kindId)?.colorHex ?? DEFAULT_PATHWAY_COLOUR;
}

/** Spec §7: pathways as flat strips in their kind's colour, one group per colour so each is one mesh. */
export function pathwayStrips(model: MapModel, levelId: string): Array<{ colour: string; quads: Quad[] }> {
  const kinds = live(model.pathwayKinds);
  const byColour = new Map<string, Quad[]>();
  for (const pathway of live(model.pathways)) {
    if (pathway.levelId !== levelId) continue;
    const colour = colourOf(pathway, kinds);
    const quads = byColour.get(colour) ?? [];
    quads.push(...stripQuads(pathway.polyline, pathway.widthM));
    byColour.set(colour, quads);
  }
  return [...byColour].map(([colour, quads]) => ({ colour, quads }));
}
