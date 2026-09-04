import { describe, expect, it } from "vitest";
import { live, RingSchema, SlugSchema, VerificationSchema, Vec2Schema } from "./primitives";

describe("Vec2Schema", () => {
  it("accepts a finite pair of metres", () => {
    expect(Vec2Schema.parse([1.5, -2.25])).toEqual([1.5, -2.25]);
  });

  it("rejects NaN, which would silently poison every geometry predicate", () => {
    expect(() => Vec2Schema.parse([Number.NaN, 0])).toThrow();
  });

  it("rejects a third coordinate — plan coordinates are 2D by definition", () => {
    expect(() => Vec2Schema.parse([0, 0, 0])).toThrow();
  });
});

describe("RingSchema", () => {
  it("accepts a triangle", () => {
    expect(RingSchema.parse([[0, 0], [1, 0], [0, 1]])).toHaveLength(3);
  });

  it("rejects fewer than three points", () => {
    expect(() => RingSchema.parse([[0, 0], [1, 0]])).toThrow();
  });
});

describe("SlugSchema", () => {
  it("accepts a stable human-readable id", () => {
    expect(SlugSchema.parse("L2-room-library")).toBe("L2-room-library");
  });

  it("rejects whitespace and slashes so ids are safe in bundle file paths", () => {
    expect(() => SlugSchema.parse("L2 room library")).toThrow();
    expect(() => SlugSchema.parse("L2/library")).toThrow();
  });
});

describe("VerificationSchema", () => {
  it("defaults to unverified with no evidence", () => {
    expect(VerificationSchema.parse({})).toEqual({ status: "unverified", evidence: [] });
  });

  it("accepts an on-site verification with evidence", () => {
    const v = VerificationSchema.parse({
      status: "onsite",
      evidence: ["photo:IMG_4821"],
      verifiedAt: "2026-09-04T10:00:00.000Z",
      verifiedBy: "user_1",
    });
    expect(v.status).toBe("onsite");
    expect(v.evidence).toEqual(["photo:IMG_4821"]);
  });

  it("rejects an unknown status", () => {
    expect(() => VerificationSchema.parse({ status: "probably-fine" })).toThrow();
  });
});

type Entity = { id: string; deletedAt?: string | null };

describe("live", () => {
  it("keeps entities with no deletedAt", () => {
    const items: Entity[] = [{ id: "a" }, { id: "b" }];
    expect(live(items)).toHaveLength(2);
  });

  it("drops soft-deleted entities", () => {
    const items: Entity[] = [{ id: "a" }, { id: "b", deletedAt: "2026-09-01T00:00:00.000Z" }];
    expect(live(items).map(e => e.id)).toEqual(["a"]);
  });

  it("treats an explicit null deletedAt as live", () => {
    const items: Entity[] = [{ id: "a", deletedAt: null }];
    expect(live(items)).toHaveLength(1);
  });
});
