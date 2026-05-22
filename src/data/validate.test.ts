import { describe, it, expect } from "vitest";
import { validateBundle } from "./validate";
import type { Floor, Service, RouteVariant } from "./types";

const validFloor: Floor = {
  id: "L1",
  bounds: { width: 210, depth: 130 },
  polygons: [
    { id: "L1-room-x", points: [[0, 0], [1, 0], [1, 1]], heightMeters: 3.5, type: "room" },
  ],
};
const validService: Service = {
  id: "svc-x",
  nameEn: "X",
  nameZh: "X",
  providerName: "Y",
  floorId: "L1",
  roomId: "L1-room-x",
  accessibility: { liftAccess: true, stepFreeRoute: true },
  sourceUrl: "https://example.com",
  iconKey: "info",
};
const validRoute: RouteVariant = {
  serviceId: "svc-x",
  profile: "default",
  steps: [
    { floorId: "L1", point: [0, 0], decisionPoint: false, segmentKey: "a" },
    { floorId: "L1", point: [0.5, 0.5], decisionPoint: false, segmentKey: "end" },
  ],
};

describe("validateBundle", () => {
  it("passes valid bundle", () => {
    const result = validateBundle([validFloor], [validService], [validRoute]);
    expect(result.errors).toHaveLength(0);
  });

  it("flags service with unknown roomId", () => {
    const bad = { ...validService, roomId: "L1-room-missing" };
    const result = validateBundle([validFloor], [bad], []);
    expect(result.errors.some(e => e.includes("L1-room-missing"))).toBe(true);
  });

  it("flags route whose serviceId is not in catalog", () => {
    const orphan: RouteVariant = { ...validRoute, serviceId: "ghost" };
    const result = validateBundle([validFloor], [validService], [orphan]);
    expect(result.errors.some(e => e.includes("ghost"))).toBe(true);
  });
});
