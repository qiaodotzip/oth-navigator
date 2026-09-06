import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { rooms } from "../db/schema";
import { TRACED_ZONES, zoneFootprint } from "./tracedPlans";

/**
 * Seeds the zones traced from the 2020 storey plans.
 *
 * Idempotent by id and never destructive: a zone someone has already edited is
 * left exactly as it is, because the whole point is that the trace is a draft
 * for humans to correct and a re-run must not undo their work.
 */
export async function tracePlansIntoModel(db: Database): Promise<{
  created: number; skipped: number;
}> {
  let created = 0;
  let skipped = 0;

  for (const zone of TRACED_ZONES) {
    const existing = await db.select().from(rooms).where(eq(rooms.id, zone.id));
    if (existing[0]) {
      skipped++;
      continue;
    }
    await db.insert(rooms).values({
      id: zone.id,
      levelId: zone.levelId,
      kind: zone.kind,
      footprint: zoneFootprint(zone),
      holes: [],
      heightM: zone.heightM,
      // An area is floor you cross; everything else is somewhere you arrive.
      walkable: zone.kind === "area",
      nameEn: zone.nameEn,
      nameZh: zone.nameZh,
      // Traced from a drawing, not confirmed on site or against CAD.
      verification: { status: "unverified", evidence: [] },
      updatedBy: "cli:trace",
    });
    created++;
  }

  return { created, skipped };
}
