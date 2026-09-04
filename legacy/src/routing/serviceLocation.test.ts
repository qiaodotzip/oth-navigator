import { describe, expect, it } from "vitest";
import type { Floor, Service } from "@/data/types";
import { serviceLocation } from "./buildRoute";

const floor: Floor = {
  id: "L1",
  bounds: { width: 200, depth: 200 },
  polygons: [
    {
      id: "L1-room-test",
      type: "room",
      heightMeters: 3,
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    },
  ],
};

function svc(overrides: Partial<Service>): Service {
  return {
    id: "x",
    nameEn: "X",
    nameZh: "X",
    providerName: "P",
    category: "government",
    routable: true,
    displayFloor: "L1",
    floorId: "L1",
    roomId: "L1-room-test",
    accessibility: { liftAccess: true, stepFreeRoute: true },
    sourceUrl: "https://example.com",
    iconKey: "info",
    ...overrides,
  };
}

describe("serviceLocation", () => {
  it("returns the polygon center for a routable service", () => {
    const loc = serviceLocation(svc({}), [floor]);
    expect(loc).toEqual({ floorId: "L1", point: [5, 5] });
  });

  it("returns null when service has no floorId (non-routable)", () => {
    expect(serviceLocation(svc({ floorId: undefined, roomId: undefined }), [floor])).toBeNull();
  });

  it("returns null when the room polygon does not exist", () => {
    expect(serviceLocation(svc({ roomId: "nope" }), [floor])).toBeNull();
  });
});
