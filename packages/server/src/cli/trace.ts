import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { levelImages, rooms } from "../db/schema";
import { PLAN_SHEETS, TRACED_ZONES, zoneFootprint, zoneLevelId } from "./tracedPlans";

/**
 * Makes the underlay agree with the trace it came from.
 *
 * These two disagreeing is not a hypothetical: a floorplan calibrated by
 * measuring the sheet's own printed scale bar lands at 0.07 m/px, a third of
 * the truth, and the plan then renders at a third the size of the rooms drawn
 * on top of it. Since the trace knows exactly what scale it used, it says so.
 */
async function calibrateUnderlays(db: Database): Promise<number> {
  let fixed = 0;

  for (const sheet of PLAN_SHEETS) {
    const [image] = await db.select().from(levelImages).where(and(
      eq(levelImages.levelId, sheet.levelId),
      eq(levelImages.filename, sheet.file),
      isNull(levelImages.deletedAt),
    ));
    if (!image) continue;

    // The image's top-left corner in world metres; world y is north, so the
    // image hangs below its offset.
    const offsetX = (0 - sheet.originPx.x) * sheet.metresPerPixel;
    const offsetY = (sheet.originPx.y - 0) * sheet.metresPerPixel;

    const agrees =
      image.metresPerPixel === sheet.metresPerPixel &&
      image.offsetX === offsetX &&
      image.offsetY === offsetY;
    if (agrees) continue;

    await db.update(levelImages)
      .set({
        metresPerPixel: sheet.metresPerPixel,
        offsetX,
        offsetY,
        updatedBy: "cli:trace",
        updatedAt: new Date(),
        version: image.version + 1,
      })
      .where(eq(levelImages.id, image.id));
    fixed++;
  }

  return fixed;
}

/**
 * Seeds the zones traced from the 2020 storey plans.
 *
 * Idempotent by id and never destructive: a zone someone has already edited is
 * left exactly as it is, because the whole point is that the trace is a draft
 * for humans to correct and a re-run must not undo their work.
 */
export async function tracePlansIntoModel(db: Database): Promise<{
  created: number; skipped: number; recalibrated: number;
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
      levelId: zoneLevelId(zone),
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

  return { created, skipped, recalibrated: await calibrateUnderlays(db) };
}
