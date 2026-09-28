import { distancePointToSegment, type Vec2 } from "@oth/model";

/**
 * Douglas–Peucker: keeps the ends, and every point further than `toleranceM`
 * from the line between the points kept either side of it. A loop, whose
 * ends are the same point, keeps its farthest point first and works out
 * from there.
 */
export function simplify(points: readonly Vec2[], toleranceM: number): Vec2[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    let far = -1;
    let farthest = toleranceM;
    for (let i = from + 1; i < to; i++) {
      const d = distancePointToSegment(points[i]!, points[from]!, points[to]!);
      if (d > farthest) {
        farthest = d;
        far = i;
      }
    }
    if (far !== -1) {
      keep[far] = 1;
      stack.push([from, far], [far, to]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}
