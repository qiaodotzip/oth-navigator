/**
 * The one place model coordinates become three.js coordinates.
 *
 * The model is a plan: `(x, y)` in metres with x east and y north, plus a
 * per-level `elevation`. three.js is y-up and right-handed, so north maps to
 * -z. Getting this wrong mirrors the whole building, and the hackathon spread
 * an equivalent flip (`depth - y`) through several components and could not
 * keep its floors aligned. Every consumer calls these two functions.
 */
export const MODEL_UP_AXIS = "y" as const;

/**
 * Negating zero yields -0, which compares unequal to 0 under Object.is and
 * serialises as "-0". The model package normalises it in `round3` for the same
 * reason; the mapping stays canonical here so nothing downstream has to care.
 */
function negate(n: number): number {
  return n === 0 ? 0 : -n;
}

export function modelToThree(x: number, y: number, elevation: number): [number, number, number] {
  return [x, elevation, negate(y)];
}

export function threeToModel(
  x: number, y: number, z: number,
): { x: number; y: number; elevation: number } {
  return { x, y: negate(z), elevation: y };
}
