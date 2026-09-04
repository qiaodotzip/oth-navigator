import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { buildings, levels } from "../db/schema";

/**
 * The model needs a building row and at least one level before anything can be
 * authored — `assembleModel` refuses without one. This creates OTH's eight
 * storeys with placeholder elevations so the editor has somewhere to draw.
 *
 * Elevations are estimates until OTH supplies drawings; the editor can correct
 * them per level.
 */
export async function seedBuilding(db: Database): Promise<{ created: boolean }> {
  const existing = await db.select().from(buildings).where(eq(buildings.id, "oth"));
  if (existing[0]) return { created: false };

  await db.insert(buildings).values({
    id: "oth",
    name: "Our Tampines Hub",
    // OTH's approximate centroid. Refine when we have a survey point.
    anchorLat: 1.3531,
    anchorLng: 103.9447,
    rotationDeg: 0,
  });

  const FLOOR_TO_FLOOR_M = 5;
  const names: Record<number, [string, string]> = {
    1: ["Level 1", "一楼"], 2: ["Level 2", "二楼"], 3: ["Level 3", "三楼"],
    4: ["Level 4", "四楼"], 5: ["Level 5", "五楼"], 6: ["Level 6", "六楼"],
    7: ["Level 7", "七楼"], 8: ["Level 8", "八楼"],
  };

  for (let ordinal = 1; ordinal <= 8; ordinal++) {
    const [nameEn, nameZh] = names[ordinal]!;
    await db.insert(levels).values({
      id: `oth-L${ordinal}`,
      buildingId: "oth",
      code: `L${ordinal}`,
      ordinal,
      nameEn,
      nameZh,
      elevationM: (ordinal - 1) * FLOOR_TO_FLOOR_M,
      heightM: FLOOR_TO_FLOOR_M,
    });
  }

  return { created: true };
}
