import { describe, it, expect } from "vitest";
import { selectRoute } from "./selectRoute";
import type { RouteVariant } from "@/data/types";

const routes: RouteVariant[] = [
  {
    serviceId: "x",
    profile: "default",
    counterId: "x-1",
    steps: [
      { floorId: "L1", point: [0, 0], decisionPoint: false, segmentKey: "a" },
      { floorId: "L1", point: [1, 1], decisionPoint: false, segmentKey: "b" },
    ],
  },
  {
    serviceId: "x",
    profile: "default",
    counterId: "x-2",
    steps: [
      { floorId: "L1", point: [0, 0], decisionPoint: false, segmentKey: "a" },
      { floorId: "L1", point: [1, 1], decisionPoint: false, segmentKey: "b" },
    ],
  },
  {
    serviceId: "x",
    profile: "stepFree",
    counterId: "x-1",
    steps: [
      { floorId: "L1", point: [0, 0], decisionPoint: false, segmentKey: "a" },
      { floorId: "L1", point: [1, 1], decisionPoint: false, segmentKey: "b" },
    ],
  },
];

describe("selectRoute", () => {
  it("returns null when nothing matches", () => {
    expect(selectRoute("y", "default", {}, routes)).toBeNull();
  });

  it("filters by profile", () => {
    const r = selectRoute("x", "stepFree", {}, routes);
    expect(r?.counterId).toBe("x-1");
    expect(r?.profile).toBe("stepFree");
  });

  it("picks the lowest-loaded counter among matching variants", () => {
    const r = selectRoute("x", "default", { "x-1": 0.9, "x-2": 0.1 }, routes);
    expect(r?.counterId).toBe("x-2");
  });

  it("falls back to default profile when stepFree variant missing", () => {
    const noStepFree: RouteVariant[] = [routes[0], routes[1]];
    const r = selectRoute("x", "stepFree", {}, noStepFree);
    expect(r?.profile).toBe("default");
  });
});
