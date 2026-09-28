/**
 * Stretches along a line, in metres from its start.
 *
 * Walls are cut into what stands and what is open by subtracting intervals,
 * never by boolean geometry: a doorway is a gap between two boxes, not a hole
 * cut out of one (spec §7).
 */
export type Interval = readonly [number, number];

/** Anything thinner than this is rounding, not wall. */
const EPSILON_M = 1e-9;

/**
 * What is left of [0, length] once every cut is taken out.
 *
 * Cuts may overlap, run past either end, come in any order, or be given
 * either way round. Pieces shorter than `minKeepM` are dropped, since a
 * sliver of wall between two openings is noise.
 */
export function subtractIntervals(length: number, cuts: readonly Interval[], minKeepM = 0): Interval[] {
  const sorted = cuts
    .map(([p, q]): Interval => [Math.max(0, Math.min(p, q)), Math.min(length, Math.max(p, q))])
    .filter(([from, to]) => to > from)
    .sort((x, y) => x[0] - y[0]);

  const kept: Interval[] = [];
  const keep = (from: number, to: number) => {
    if (to - from > EPSILON_M && to - from >= minKeepM) kept.push([from, to]);
  };

  let at = 0;
  for (const [from, to] of sorted) {
    keep(at, from);
    at = Math.max(at, to);
  }
  keep(at, length);
  return kept;
}
