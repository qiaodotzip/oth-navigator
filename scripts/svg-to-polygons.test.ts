import { describe, it, expect } from "vitest";
import { extractPolygons } from "./svg-to-polygons";

const fakeSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <path id="L1-room-test" d="M 10 10 L 30 10 L 30 30 L 10 30 Z" />
    <path id="L1-corridor-east" d="M 40 10 L 60 10 L 60 30 L 40 30 Z" />
  </svg>
`;

describe("extractPolygons", () => {
  it("extracts polygons keyed by id with type derived from id prefix", async () => {
    const result = await extractPolygons(fakeSvg, "L1", 100, 100);

    expect(result.polygons).toHaveLength(2);
    expect(result.polygons[0].id).toBe("L1-room-test");
    expect(result.polygons[0].type).toBe("room");
    expect(result.polygons[1].type).toBe("corridor");
    expect(result.polygons[0].points.length).toBeGreaterThanOrEqual(3);
  });
});
