import { describe, expect, it } from "vitest";
import { TenantSchema } from "./semantics";

const tenant = {
  id: "tenant-nlb-library",
  levelId: "oth-L2",
  roomId: "L2-room-library",
  nameEn: "Tampines Regional Library",
  nameZh: "淡滨尼区域图书馆",
  category: "community" as const,
  sourceUrl: "https://www.nlb.gov.sg/",
};

describe("TenantSchema", () => {
  it("accepts a tenant", () => {
    expect(TenantSchema.parse(tenant).nameEn).toBe("Tampines Regional Library");
  });

  it("defaults counters to empty and verification to unverified", () => {
    const parsed = TenantSchema.parse(tenant);
    expect(parsed.counters).toEqual([]);
    expect(parsed.verification.status).toBe("unverified");
  });

  it("accepts a validity window so a closed shop can be expressed", () => {
    const closed = TenantSchema.parse({
      ...tenant,
      validFrom: "2020-01-01",
      validTo: "2026-03-31",
    });
    expect(closed.validTo).toBe("2026-03-31");
  });

  it("rejects an unknown category", () => {
    expect(() => TenantSchema.parse({ ...tenant, category: "vibes" })).toThrow();
  });

  it("rejects a source url that is not a url", () => {
    expect(() => TenantSchema.parse({ ...tenant, sourceUrl: "ask-someone" })).toThrow();
  });
});
