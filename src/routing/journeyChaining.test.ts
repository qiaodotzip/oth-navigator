import { describe, expect, it } from "vitest";
import type { Floor, Service } from "@/data/types";
import { buildRoute, routeArrivalLocation, DEFAULT_START } from "./buildRoute";
import { nextJourneyStopId } from "@/routing/journeyNav";

// L2 with two rooms (library + theatre) in open, walkable space.
const L2: Floor = {
  id: "L2",
  bounds: { width: 100, depth: 100 },
  polygons: [
    {
      id: "L2-room-library",
      type: "room",
      heightMeters: 3,
      points: [
        [18, 18],
        [26, 18],
        [26, 26],
        [18, 26],
      ],
    },
    {
      id: "L2-room-theatre",
      type: "room",
      heightMeters: 3,
      points: [
        [74, 74],
        [82, 74],
        [82, 82],
        [74, 82],
      ],
    },
  ],
};

const L1: Floor = {
  id: "L1",
  bounds: { width: 100, depth: 100 },
  polygons: [],
};

function theatre(): Service {
  return {
    id: "theatre",
    nameEn: "Theatre",
    nameZh: "剧院",
    providerName: "P",
    category: "lifestyle",
    routable: true,
    displayFloor: "L2",
    floorId: "L2",
    roomId: "L2-room-theatre",
    accessibility: { liftAccess: true, stepFreeRoute: true },
    sourceUrl: "https://example.com",
    iconKey: "info",
  };
}

function crossesFloors(steps: { floorId: string }[]): boolean {
  return steps.some(s => s.floorId !== steps[0].floorId);
}

describe("journey chaining start location", () => {
  it("routeArrivalLocation returns the route's final waypoint", () => {
    const variant = buildRoute(
      { floorId: "L2", point: [22, 22] },
      theatre(),
      "default",
      [L1, L2],
    )!;
    const last = variant.steps[variant.steps.length - 1];
    expect(routeArrivalLocation(variant)).toEqual({
      floorId: last.floorId,
      point: last.point,
    });
  });

  it("a leg started from the previous (L2) stop stays on L2 — no re-crossing", () => {
    // Simulate having just arrived at the library on L2.
    const fromLibrary = buildRoute(
      { floorId: "L2", point: [22, 22] },
      theatre(),
      "default",
      [L1, L2],
    )!;
    expect(crossesFloors(fromLibrary.steps)).toBe(false);
  });

  it("the same leg from the default L1 location wrongly re-crosses floors", () => {
    // This is the buggy behaviour: starting every leg from DEFAULT_START forces
    // a fresh L1->L2 transition instead of a short same-floor hop.
    const fromDefault = buildRoute(DEFAULT_START, theatre(), "default", [L1, L2])!;
    expect(crossesFloors(fromDefault.steps)).toBe(true);
  });
});

describe("journey chaining guard (snap-back fix)", () => {
  const journey = {
    id: "j",
    stops: [
      { serviceId: "servicesg", order: 0 },
      { serviceId: "library", order: 1 },
    ],
  };

  it("returns the next stop when the finished service is a member", () => {
    expect(nextJourneyStopId(journey, "servicesg")).toBe("library");
  });

  it("returns null when the finished service is NOT a journey member", () => {
    // Was the bug: a non-member defaulted to order -1 and chained to stop 0.
    expect(nextJourneyStopId(journey, "hawker")).toBeNull();
  });

  it("returns null after the last stop", () => {
    expect(nextJourneyStopId(journey, "library")).toBeNull();
  });
});
