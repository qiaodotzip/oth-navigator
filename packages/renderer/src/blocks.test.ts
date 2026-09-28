import { describe, expect, it } from "vitest";
import { blocksGeometry, type Block } from "./blocks";

function bounds(blocks: Block[]) {
  const geometry = blocksGeometry(blocks);
  geometry.computeBoundingBox();
  return geometry.boundingBox!;
}

describe("blocksGeometry", () => {
  it("builds six faces a block", () => {
    const geometry = blocksGeometry([{ a: [0, 0], b: [4, 0], thicknessM: 0.2, baseM: 0, topM: 1.2 }]);
    expect(geometry.getAttribute("position").count).toBe(6 * 6);
  });

  it("stands a block on its line, as thick as asked, from base to top", () => {
    const b = bounds([{ a: [0, 0], b: [4, 0], thicknessM: 0.2, baseM: 0.5, topM: 1.2 }]);
    expect(b.min.x).toBeCloseTo(0);
    expect(b.max.x).toBeCloseTo(4);
    expect(b.min.y).toBeCloseTo(0.5);
    expect(b.max.y).toBeCloseTo(1.2);
    expect(b.min.z).toBeCloseTo(-0.1);
    expect(b.max.z).toBeCloseTo(0.1);
  });

  it("maps north to -z, matching the coordinate mapping", () => {
    const b = bounds([{ a: [0, 0], b: [0, 4], thicknessM: 0.2, baseM: 0, topM: 1 }]);
    expect(b.min.z).toBeCloseTo(-4);
    expect(b.max.z).toBeCloseTo(0);
  });

  it("skips a block of no length or no height", () => {
    const geometry = blocksGeometry([
      { a: [1, 1], b: [1, 1], thicknessM: 0.2, baseM: 0, topM: 1 },
      { a: [0, 0], b: [4, 0], thicknessM: 0.2, baseM: 1, topM: 1 },
    ]);
    expect(geometry.getAttribute("position").count).toBe(0);
  });
});
