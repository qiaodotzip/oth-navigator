import { describe, expect, it } from "vitest";
import type { Floor, PopularTimesEntry, Service } from "@/data/types";
import { connectorCrowdPenalty, CROWD_WEIGHT_M } from "./crowdPenalty";

const L1: Floor = {
  id: "L1",
  bounds: { width: 100, depth: 100 },
  polygons: [
    {
      id: "L1-room-hawker",
      type: "room",
      heightMeters: 3,
      points: [[20, 20], [24, 20], [24, 24], [20, 24]], // center [22,22]
    },
  ],
};

function hawker(): Service {
  return {
    id: "hawker",
    nameEn: "Hawker",
    nameZh: "小贩",
    providerName: "P",
    category: "lifestyle",
    routable: true,
    displayFloor: "L1",
    floorId: "L1",
    roomId: "L1-room-hawker",
    accessibility: { liftAccess: true, stepFreeRoute: true },
    sourceUrl: "https://example.com",
    iconKey: "info",
  };
}

// Busyness 1.0 at hour 18, 0.0 elsewhere.
function busyAt18(): PopularTimesEntry {
  const weekday = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, (_, h) => ({ hour: h, busyness: h === 18 ? 1 : 0 })),
  );
  return { serviceId: "hawker", placeId: "p1", weekday, source: "modeled" };
}

const fri18 = new Date(2026, 4, 22, 18, 0, 0);
const fri10 = new Date(2026, 4, 22, 10, 0, 0);

describe("connectorCrowdPenalty", () => {
  it("is high for a connector next to a busy venue at peak hour", () => {
    const p = connectorCrowdPenalty([22, 23], "L1", [hawker()], [L1], [busyAt18()], fri18);
    expect(p).toBeCloseTo(CROWD_WEIGHT_M); // busyness 1.0 * weight
  });

  it("is ~0 when the venue is far away", () => {
    const p = connectorCrowdPenalty([90, 90], "L1", [hawker()], [L1], [busyAt18()], fri18);
    expect(p).toBe(0);
  });

  it("is ~0 off-peak even when adjacent", () => {
    const p = connectorCrowdPenalty([22, 23], "L1", [hawker()], [L1], [busyAt18()], fri10);
    expect(p).toBe(0);
  });

  it("ignores venues on a different floor", () => {
    const p = connectorCrowdPenalty([22, 23], "L2", [hawker()], [L1], [busyAt18()], fri18);
    expect(p).toBe(0);
  });
});
