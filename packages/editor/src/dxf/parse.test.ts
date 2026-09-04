import { describe, expect, it } from "vitest";
import { parseDxfPolylines } from "./parse";

/** DXF is pairs of lines: a group code, then its value. */
function dxf(...pairs: [number | string, string | number][]): string {
  return pairs.map(([code, value]) => `${code}\n${value}`).join("\n") + "\n";
}

const oneSquare = dxf(
  [0, "SECTION"], [2, "ENTITIES"],
  [0, "LWPOLYLINE"], [8, "A-WALL"], [70, 1],
  [10, 0], [20, 0],
  [10, 10], [20, 0],
  [10, 10], [20, 8],
  [10, 0], [20, 8],
  [0, "ENDSEC"], [0, "EOF"],
);

describe("parseDxfPolylines", () => {
  it("reads a closed LWPOLYLINE", () => {
    const polys = parseDxfPolylines(oneSquare);
    expect(polys).toHaveLength(1);
    expect(polys[0]?.points).toEqual([[0, 0], [10, 0], [10, 8], [0, 8]]);
    expect(polys[0]?.closed).toBe(true);
  });

  it("records the layer, which is how CAD separates walls from furniture", () => {
    expect(parseDxfPolylines(oneSquare)[0]?.layer).toBe("A-WALL");
  });

  it("marks an unflagged polyline as open", () => {
    const open = dxf(
      [0, "LWPOLYLINE"], [8, "L"], [10, 0], [20, 0], [10, 5], [20, 0], [10, 5], [20, 5], [0, "EOF"],
    );
    expect(parseDxfPolylines(open)[0]?.closed).toBe(false);
  });

  it("reads several polylines", () => {
    const two = dxf(
      [0, "LWPOLYLINE"], [8, "A"], [70, 1], [10, 0], [20, 0], [10, 1], [20, 0], [10, 1], [20, 1],
      [0, "LWPOLYLINE"], [8, "B"], [70, 1], [10, 5], [20, 5], [10, 6], [20, 5], [10, 6], [20, 6],
      [0, "EOF"],
    );
    expect(parseDxfPolylines(two).map(p => p.layer)).toEqual(["A", "B"]);
  });

  it("reads legacy POLYLINE/VERTEX pairs too", () => {
    const legacy = dxf(
      [0, "POLYLINE"], [8, "OLD"], [70, 1],
      [0, "VERTEX"], [10, 1], [20, 2],
      [0, "VERTEX"], [10, 3], [20, 4],
      [0, "VERTEX"], [10, 5], [20, 6],
      [0, "SEQEND"], [0, "EOF"],
    );
    expect(parseDxfPolylines(legacy)[0]?.points).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it("ignores entities that are not polylines", () => {
    const mixed = dxf(
      [0, "LINE"], [8, "X"], [10, 0], [20, 0],
      [0, "CIRCLE"], [8, "Y"], [10, 5], [20, 5],
      [0, "EOF"],
    );
    expect(parseDxfPolylines(mixed)).toEqual([]);
  });

  it("drops polylines with fewer than three points, which cannot be rooms", () => {
    const tooShort = dxf([0, "LWPOLYLINE"], [8, "A"], [10, 0], [20, 0], [10, 1], [20, 1], [0, "EOF"]);
    expect(parseDxfPolylines(tooShort)).toEqual([]);
  });

  it("tolerates CRLF line endings, which AutoCAD writes", () => {
    expect(parseDxfPolylines(oneSquare.replace(/\n/g, "\r\n"))).toHaveLength(1);
  });

  it("returns nothing for an empty file rather than throwing", () => {
    expect(parseDxfPolylines("")).toEqual([]);
  });
});
