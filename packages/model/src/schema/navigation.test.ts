import { describe, expect, it } from "vitest";
import {
  DEFAULT_PATHWAY_WIDTH_M,
  DoorwaySchema,
  PathwayKindSchema,
  EntranceSchema,
  NavHintSchema,
  PortalEndpointSchema,
  PathwaySchema,
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

describe("PathwaySchema", () => {
  const pathway = {
    id: "L1-path-main",
    levelId: "oth-L1",
    polyline: [[0, 0], [20, 0], [20, 15]],
  };

  it("accepts a centre line", () => {
    expect(PathwaySchema.parse(pathway).polyline).toHaveLength(3);
  });

  it("defaults to a two-person corridor width", () => {
    expect(PathwaySchema.parse(pathway).widthM).toBe(DEFAULT_PATHWAY_WIDTH_M);
    expect(DEFAULT_PATHWAY_WIDTH_M).toBe(2.4);
  });

  it("accepts an explicit width", () => {
    expect(PathwaySchema.parse({ ...pathway, widthM: 6 }).widthM).toBe(6);
  });

  it("defaults to step-free, since most of a hub is level", () => {
    expect(PathwaySchema.parse(pathway).stepFree).toBe(true);
  });

  it("rejects a single point, which is not a path", () => {
    expect(() => PathwaySchema.parse({ ...pathway, polyline: [[0, 0]] })).toThrow();
  });

  it("rejects a non-positive width", () => {
    expect(() => PathwaySchema.parse({ ...pathway, widthM: 0 })).toThrow();
  });
});

describe("pathway kinds", () => {
  const kind = { id: "covered-link", nameEn: "Covered link", colorHex: "#38bdf8" };

  it("needs a name and a colour, since both are what make it useful", () => {
    expect(() => PathwayKindSchema.parse(kind)).not.toThrow();
    expect(() => PathwayKindSchema.parse({ ...kind, nameEn: "" })).toThrow();
    expect(() => PathwayKindSchema.parse({ ...kind, colorHex: "blue" })).toThrow();
  });

  it("carries a modelling note, which is why kinds exist at all", () => {
    const withNote = PathwayKindSchema.parse({ ...kind, modellingNote: "Roofed, open sides." });
    expect(withNote.modellingNote).toBe("Roofed, open sides.");
  });

  it("leaves a pathway unkinded rather than guessing", () => {
    // Every pathway drawn before kinds existed has none, and inventing one
    // would put a claim in the model nobody made.
    const p = PathwaySchema.parse({ id: "p1", levelId: "oth-L1", polyline: [[0, 0], [10, 0]] });
    expect(p.kindId).toBeUndefined();
  });

  it("takes a kind when one is chosen", () => {
    const p = PathwaySchema.parse({
      id: "p1", levelId: "oth-L1", polyline: [[0, 0], [10, 0]], kindId: "covered-link",
    });
    expect(p.kindId).toBe("covered-link");
  });
});
