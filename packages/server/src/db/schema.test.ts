import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/harness";
import { buildings, levels, rooms } from "./schema";

describe("entity tables", () => {
  it("round-trips a room with a jsonb footprint", async () => {
    const db = await createTestDb();
    await db.insert(buildings).values({
      id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0,
    });
    await db.insert(levels).values({
      id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
      nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
    });
    await db.insert(rooms).values({
      id: "L1-lobby", levelId: "oth-L1", kind: "atrium",
      footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
      holes: [], heightM: 6, walkable: true,
      nameEn: "Lobby", nameZh: "大堂",
      verification: { status: "unverified", evidence: [] },
    });

    const [row] = await db.select().from(rooms).where(eq(rooms.id, "L1-lobby"));
    expect(row?.footprint).toEqual([[0, 0], [10, 0], [10, 10], [0, 10]]);
    expect(row?.version).toBe(0);
    expect(row?.deletedAt).toBeNull();
  });

  it("defaults version to 0 so the first optimistic update expects 0", async () => {
    const db = await createTestDb();
    await db.insert(buildings).values({
      id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0,
    });
    const [row] = await db.select().from(buildings);
    expect(row?.version).toBe(0);
  });
});
