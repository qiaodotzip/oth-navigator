import { parseModel } from "@oth/model";
import { describe, expect, it } from "vitest";
import { DEFAULT_PATHWAY_COLOUR, pathwayStrips, stripQuads } from "./pathwayStrips";

describe("stripQuads", () => {
  it("lays a strip as wide as the pathway along each stretch", () => {
    const [quad] = stripQuads([[0, 0], [10, 0]], 2);
    expect(quad!.flat()).toEqual([0, 1, 10, 1, 10, -1, 0, -1]);
  });

  it("gives each stretch of a bent pathway its own strip, skipping a repeated point", () => {
    expect(stripQuads([[0, 0], [10, 0], [10, 0], [10, 5]], 2)).toHaveLength(2);
  });
});

describe("pathwayStrips", () => {
  const model = parseModel({
    building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
    levels: [
      { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
      { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 5 },
    ],
    pathwayKinds: [{ id: "pk-covered", nameEn: "Covered link", colorHex: "#a78bfa" }],
    pathways: [
      { id: "p1", levelId: "oth-L1", polyline: [[0, 0], [10, 0]], widthM: 2, kindId: "pk-covered" },
      { id: "p2", levelId: "oth-L1", polyline: [[0, 5], [10, 5]], widthM: 2, kindId: "pk-covered" },
      { id: "p3", levelId: "oth-L1", polyline: [[0, 9], [10, 9]], widthM: 2 },
      { id: "p4", levelId: "oth-L1", polyline: [[0, 12], [10, 12]], deletedAt: "2026-09-28T00:00:00.000Z" },
      { id: "p5", levelId: "oth-L2", polyline: [[0, 0], [10, 0]] },
    ],
  });

  it("colours each pathway by its kind, one strip set per colour, the default blue without a kind", () => {
    const strips = pathwayStrips(model, "oth-L1");
    expect(strips.map(s => [s.colour, s.quads.length]).sort()).toEqual([[DEFAULT_PATHWAY_COLOUR, 1], ["#a78bfa", 2]]);
  });

  it("draws nothing for a deleted pathway or another floor's", () => {
    expect(pathwayStrips(model, "oth-L1").flatMap(s => s.quads)).toHaveLength(3);
  });
});
