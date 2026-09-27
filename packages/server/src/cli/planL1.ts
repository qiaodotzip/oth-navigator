import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { RoomKindSchema, RingSchema } from "@oth/model";
import { storeAsset } from "../assets/storage";
import type { Database } from "../db/client";
import { levelImages, rooms } from "../db/schema";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The architect's 1st storey plan, and what it is worth in metres.
 *
 * `A.01.01.01 rev C`, DP Architects, issued for working drawing. Unlike the
 * 2020 hub guide this is a dimensioned CAD drawing, so the scale is not a
 * judgement call: two perpendicular runs of printed grid dimensions — 193.5 m
 * down one and 198.2 m across the other — give 750.518 and 750.490 mm per
 * PDF point, agreeing to 0.004%. The sheet's printed "SCALE 1 : 500" is for
 * the original A0, not for this page, and following it would be wrong by 4.25x.
 *
 * The raster below was rendered from that PDF at 0.07 m/px and registered
 * against the existing 2020 underlay by cross-correlation. The registration
 * doubles as a check on the older sheet: sweeping its assumed scale, the
 * agreement peaks sharply at 0.21 m/px, which is what the model already used.
 */
export const L1_PLAN = {
  levelId: "oth-L1",
  file: "OTH-L1-2015-working-drawing.jpg",
  metresPerPixel: 0.07,
  /** World metres of the raster's top-left pixel. */
  offsetX: -25,
  offsetY: 300,
  provenance:
    "DP Architects A.01.01.01 rev C, 1st storey plan, issued for working " +
    "drawing 10/2015. Scale 0.750504 m per PDF point from the sheet's own " +
    "9 m structural grid dimensions; registered to the 2020 underlay by " +
    "cross-correlation (peak at 0.21 m/px, offset 363,1 px).",
} as const;

/**
 * A placeholder, not a measurement.
 *
 * The storey plan gives finished floor levels (+111.2 to +111.8) but not the
 * floor above, so the storey height is not on this sheet. It affects how the
 * model extrudes, never where the walls are, and the section drawing will
 * settle it.
 */
const HEIGHT_M = 4.5;

const SpaceSchema = z.object({
  id: z.string().min(1),
  nameEn: z.string().min(1),
  kind: RoomKindSchema,
  areaM2: z.number(),
  footprint: RingSchema,
  holes: z.array(RingSchema).default([]),
});

const SpacesFileSchema = z.object({
  levelId: z.string().min(1),
  spaces: z.array(SpaceSchema),
});

export type PlanImportResult = {
  spaces: number;
  skipped: number;
  underlay: "added" | "recalibrated" | "unchanged" | "missing";
};

export async function readSpaces(file = join(here, "data", "l1-spaces.json")) {
  return SpacesFileSchema.parse(JSON.parse(await readFile(file, "utf8")));
}

/**
 * Puts the drawing behind the model, at the scale the drawing itself states.
 *
 * Re-running is safe: the same bytes hash to the same asset, and an underlay
 * already in place is only touched when its calibration disagrees.
 */
async function importUnderlay(
  db: Database, dataDir: string, imagesDir: string,
): Promise<PlanImportResult["underlay"]> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(join(imagesDir, L1_PLAN.file)));
  } catch {
    return "missing";
  }

  const [existing] = await db.select().from(levelImages).where(and(
    eq(levelImages.levelId, L1_PLAN.levelId),
    eq(levelImages.filename, L1_PLAN.file),
    isNull(levelImages.deletedAt),
  ));

  const stored = await storeAsset(dataDir, bytes, "jpg");
  const calibration = {
    metresPerPixel: L1_PLAN.metresPerPixel,
    offsetX: L1_PLAN.offsetX,
    offsetY: L1_PLAN.offsetY,
  };

  if (existing) {
    const agrees =
      existing.metresPerPixel === calibration.metresPerPixel &&
      existing.offsetX === calibration.offsetX &&
      existing.offsetY === calibration.offsetY;
    if (agrees) return "unchanged";
    await db.update(levelImages).set({
      ...calibration,
      updatedBy: "cli:plan:l1",
      updatedAt: new Date(),
      version: existing.version + 1,
    }).where(eq(levelImages.id, existing.id));
    return "recalibrated";
  }

  await db.insert(levelImages).values({
    id: `img_${stored.checksum.slice(0, 16)}`,
    levelId: L1_PLAN.levelId,
    filename: L1_PLAN.file,
    storagePath: stored.storagePath,
    checksum: stored.checksum,
    // Rendered by the extraction, and the calibration is stated in metres, so
    // the pixel dimensions only have to be consistent with it.
    widthPx: Math.round(305 / L1_PLAN.metresPerPixel),
    heightPx: Math.round(280 / L1_PLAN.metresPerPixel),
    sizeBytes: bytes.byteLength,
    ...calibration,
    opacity: 0.6,
    uploadedBy: "cli:plan:l1",
    updatedBy: "cli:plan:l1",
  });
  return "added";
}

/**
 * Seeds the 1st storey from the architect's drawing.
 *
 * Each space was found by flooding outward from a name the architect printed
 * until it met a line the architect drew, so the footprints are the building's
 * own geometry rather than anybody's tracing of it. Idempotent by id and never
 * destructive: a space already in the model is left alone, because a re-run
 * must not undo an edit someone made on top of it.
 */
export async function importL1Plan(
  db: Database,
  dataDir: string,
  { imagesDir = resolve(here, "../../../../images"), file }: {
    imagesDir?: string; file?: string;
  } = {},
): Promise<PlanImportResult> {
  const { levelId, spaces } = await readSpaces(file);
  let created = 0;
  let skipped = 0;

  for (const space of spaces) {
    const [existing] = await db.select().from(rooms).where(eq(rooms.id, space.id));
    if (existing) {
      skipped++;
      continue;
    }
    await db.insert(rooms).values({
      id: space.id,
      levelId,
      kind: space.kind,
      footprint: space.footprint,
      holes: space.holes,
      heightM: HEIGHT_M,
      // An area is floor you cross; a room is somewhere you arrive, and a
      // service space is not yours to walk through at all.
      walkable: space.kind === "area",
      nameEn: space.nameEn,
      nameZh: "",
      // Read off a drawing. Nobody has stood in it and agreed.
      verification: { status: "unverified", evidence: [] },
      updatedBy: "cli:plan:l1",
    });
    created++;
  }

  return {
    spaces: created,
    skipped,
    underlay: await importUnderlay(db, dataDir, imagesDir),
  };
}
