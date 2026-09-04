import { describe, expect, it } from "vitest";
import {
  DoorwaySchema,
  EntranceSchema,
  NavHintSchema,
  PortalEndpointSchema,
  PortalSchema,
} from "./navigation";

describe("DoorwaySchema", () => {
  const doorway = {
    id: "L2-door-library-corridor",
    levelId: "oth-L2",
    roomA: "L2-room-library",
    roomB: "L2-corridor-north",
    segment: [[10, 3], [10, 5]],
    widthM: 2,
  };

  it("accepts a doorway between two rooms", () => {
    expect(DoorwaySchema.parse(doorway).widthM).toBe(2);
  });

  it("accepts a wide opening — a doorway models any opening, not just a door", () => {
    expect(DoorwaySchema.parse({ ...doorway, widthM: 12 }).widthM).toBe(12);
  });

  it("defaults stepFree to true — most openings are level", () => {
    expect(DoorwaySchema.parse(doorway).stepFree).toBe(true);
  });

  it("rejects a segment that is not exactly two points", () => {
    expect(() => DoorwaySchema.parse({ ...doorway, segment: [[0, 0]] })).toThrow();
  });

  it("rejects a non-positive width", () => {
    expect(() => DoorwaySchema.parse({ ...doorway, widthM: 0 })).toThrow();
  });
});

describe("EntranceSchema", () => {
  const entrance = {
    id: "L1-entrance-main",
    levelId: "oth-L1",
    roomId: "L1-atrium-town-square",
    point: [42, 3],
    nameEn: "Main Entrance",
    nameZh: "正门",
  };

  it("accepts an entrance", () => {
    expect(EntranceSchema.parse(entrance).nameEn).toBe("Main Entrance");
  });

  it("defaults isPrimary to false and stepFree to true", () => {
    const parsed = EntranceSchema.parse(entrance);
    expect(parsed.isPrimary).toBe(false);
    expect(parsed.stepFree).toBe(true);
  });
});

describe("PortalSchema", () => {
  it("accepts a lift and preserves stepFree", () => {
    const lift = PortalSchema.parse({
      id: "portal-lift-a",
      kind: "lift",
      stepFree: true,
      nameEn: "Lift A",
      nameZh: "A电梯",
    });
    expect(lift.stepFree).toBe(true);
  });

  it("defaults an escalator to not step-free", () => {
    const esc = PortalSchema.parse({
      id: "portal-esc-1",
      kind: "escalator",
      nameEn: "Escalator 1",
      nameZh: "1号扶梯",
    });
    expect(esc.stepFree).toBe(false);
  });

  it("defaults a lift to step-free", () => {
    const lift = PortalSchema.parse({
      id: "portal-lift-b",
      kind: "lift",
      nameEn: "Lift B",
      nameZh: "B电梯",
    });
    expect(lift.stepFree).toBe(true);
  });

  it("rejects an unknown portal kind", () => {
    expect(() =>
      PortalSchema.parse({ id: "p", kind: "teleporter", nameEn: "x", nameZh: "x" }),
    ).toThrow();
  });
});

describe("PortalEndpointSchema", () => {
  it("accepts an endpoint bound to a level and room", () => {
    const ep = PortalEndpointSchema.parse({
      id: "portal-lift-a-L2",
      portalId: "portal-lift-a",
      levelId: "oth-L2",
      roomId: "L2-service-lift-lobby",
      point: [12, 40],
    });
    expect(ep.portalId).toBe("portal-lift-a");
  });
});

describe("NavHintSchema", () => {
  it("accepts a forced polyline", () => {
    const hint = NavHintSchema.parse({
      id: "L2-hint-past-bakery",
      levelId: "oth-L2",
      polyline: [[0, 0], [4, 0], [4, 6]],
    });
    expect(hint.polyline).toHaveLength(3);
  });

  it("rejects a polyline with a single point", () => {
    expect(() =>
      NavHintSchema.parse({ id: "h", levelId: "oth-L2", polyline: [[0, 0]] }),
    ).toThrow();
  });
});
