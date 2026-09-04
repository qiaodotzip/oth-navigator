import { describe, expect, it } from "vitest";
import type { Floor, Pt, Service } from "@/data/types";
import { buildRoute } from "./buildRoute";

// L1 with two lifts: "near" (close to start) and "far".
const L1: Floor = {
  id: "L1",
  bounds: { width: 100, depth: 100 },
  polygons: [
    { id: "lift-near", type: "room", heightMeters: 3, points: [[18, 8], [22, 8], [22, 12], [18, 12]] }, // center [20,10]
    { id: "lift-far",  type: "room", heightMeters: 3, points: [[58, 8], [62, 8], [62, 12], [58, 12]] }, // center [60,10]
  ],
};
const L2: Floor = {
  id: "L2",
  bounds: { width: 100, depth: 100 },
  polygons: [
    { id: "lift-near", type: "room", heightMeters: 3, points: [[18, 8], [22, 8], [22, 12], [18, 12]] },
    { id: "lift-far",  type: "room", heightMeters: 3, points: [[58, 8], [62, 8], [62, 12], [58, 12]] },
    { id: "L2-room-dest", type: "room", heightMeters: 3, points: [[38, 78], [42, 78], [42, 82], [38, 82]] }, // center [40,80]
  ],
};

function dest(): Service {
  return {
    id: "dest", nameEn: "Dest", nameZh: "目的地", providerName: "P",
    category: "government", routable: true, displayFloor: "L2",
    floorId: "L2", roomId: "L2-room-dest",
    accessibility: { liftAccess: true, stepFreeRoute: true },
    sourceUrl: "https://example.com", iconKey: "info",
  };
}

const start = { floorId: "L1" as const, point: [20, 14] as Pt }; // hard by lift-near

function liftUsed(steps: { point: Pt }[]): "near" | "far" {
  // The transition waypoint is step index 1 (start, transition, ...).
  const t = steps[1].point;
  return Math.hypot(t[0] - 20, t[1] - 10) < Math.hypot(t[0] - 60, t[1] - 10) ? "near" : "far";
}

describe("buildRoute connector penalty", () => {
  it("with no penalty, picks the nearer lift", () => {
    const v = buildRoute(start, dest(), "stepFree", [L1, L2])!;
    expect(liftUsed(v.steps)).toBe("near");
  });

  it("a heavy penalty on the near lift flips the choice to the far one", () => {
    // Penalty: +500m to any connector within 5m of lift-near's center [20,10].
    const penalty = (p: Pt) => (Math.hypot(p[0] - 20, p[1] - 10) < 5 ? 500 : 0);
    const v = buildRoute(start, dest(), "stepFree", [L1, L2], {}, {}, penalty)!;
    expect(liftUsed(v.steps)).toBe("far");
  });
});
