import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { RoomKindSchema, RingSchema } from "@oth/model";
import { storeAsset } from "../assets/storage";
import type { Database } from "../db/client";
import { keyframes, levelImages, levels, places, rooms, sightings } from "../db/schema";

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
 * Used only if the level has no height of its own.
 *
 * The storey plan gives finished floor levels (+111.2 to +111.8) but not the
 * floor above, so the storey height is not on this sheet. The level knows it,
 * so the level is asked first.
 */
const FALLBACK_HEIGHT_M = 4.5;

/** The whole 1st storey, then the west concourse slice built on top of it. */
export const SPACE_FILES = ["l1-spaces.json", "l1-west-concourse.json"] as const;

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

/**
 * What the walkthrough knows and the drawing does not.
 *
 * The 2015 drawing names no stadium gates — "Gate 5" is operational signage
 * put up long after it was issued, and it is on a roller shutter in the
 * photographs. This is the whole case for labelling footage: geometry comes
 * off the drawing, identity comes off the frames, and neither source has the
 * other's half.
 *
 * Each feature is bound to a concourse segment rather than to a point. The
 * gates are ordered along the walk and anchored at both ends by escalators the
 * drawing does place — ES-09/10 in the north, ES-07/08 in the south — which
 * puts them about 27 m apart, three structural bays. The frame counts between
 * gates agree: 11, 8, 7, 7 frames at roughly 3 m a frame. That is good enough
 * to say which stretch of concourse a gate is on and not good enough to draw
 * it, so it is not drawn.
 */
export type WalkthroughFeature = {
  id: string;
  nameEn: string;
  /** The space it was seen from, or empty when the walk left the slice. */
  roomId: string;
  keyframeIds: string[];
  notes: string;
};

export const WALKTHROUGH_FEATURES: WalkthroughFeature[] = [
  {
    id: "pl-west-escalator-library", nameEn: "Escalator to the 2nd storey (library)",
    roomId: "L1-west-concourse-1",
    keyframeIds: [
      "kf_e2efffdb-ad23-4c90-b7f4-06aaf71ef5a7", "kf_65221e45-e1cb-4a79-9f41-8dc5adc8ba22",
    ],
    notes: "ES-09/10 on the drawing. Signed for the library and Town Square.",
  },
  {
    id: "pl-west-gate-6", nameEn: "Gate 6", roomId: "L1-west-concourse-1",
    keyframeIds: [
      "kf_8cbcc5f1-4750-4277-a30b-3f9b8faad3d8", "kf_e2efffdb-ad23-4c90-b7f4-06aaf71ef5a7",
    ],
    notes: "Northernmost stadium gate off the west concourse.",
  },
  {
    id: "pl-west-gate-5", nameEn: "Gate 5", roomId: "L1-west-concourse-1",
    keyframeIds: ["kf_377f4ba2-8ea3-4306-8b7f-e194b51445aa"],
    notes: "Roller shutter, marked authorised access only.",
  },
  {
    id: "pl-west-gate-4", nameEn: "Gate 4", roomId: "L1-west-concourse-2",
    keyframeIds: ["kf_fee4c7e3-46be-4f69-84f9-ec3bc4ce4461"],
    notes: "",
  },
  {
    id: "pl-west-gate-3", nameEn: "Gate 3", roomId: "L1-west-concourse-2",
    keyframeIds: [
      "kf_3de8d252-b34f-4a8b-8131-b96d354b8d40", "kf_3aee0189-ecc6-42e6-8e5c-4ba18dea80f8",
    ],
    notes: "",
  },
  {
    id: "pl-west-gate-2", nameEn: "Gate 2", roomId: "L1-west-concourse-2",
    keyframeIds: ["kf_bcc2c4dc-3bd7-4894-b05b-ba4116a39ea8"],
    notes: "Beside Community Dance Studio 3; near the south end of the segment.",
  },
  {
    id: "pl-west-gate-1", nameEn: "Gate 1", roomId: "",
    keyframeIds: [
      "kf_d0a88c48-1e97-45d1-967b-5df562386fde", "kf_7e475493-cc06-46a8-9068-c59018a0d21c",
    ],
    notes: "South end of the walk, past where this slice stops. Left unbound.",
  },
];

export type PlanImportResult = {
  spaces: number;
  skipped: number;
  features: number;
  sightings: number;
  /** Named in the walkthrough but whose frames are not in this database. */
  featuresWithoutFrames: string[];
  underlay: "added" | "recalibrated" | "unchanged" | "missing";
};

export async function readSpaces(files: readonly string[] = SPACE_FILES) {
  const all = [];
  let levelId = "oth-L1";
  for (const name of files) {
    const path = name.includes("/") || name.includes("\\") ? name : join(here, "data", name);
    const parsed = SpacesFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
    levelId = parsed.levelId;
    all.push(...parsed.spaces);
  }
  return { levelId, spaces: all };
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

  // One live plan per floor, as an upload keeps it (images/routes.ts). Added
  // by the l1-plans fix: without it L1 had two, and the editor showed either.
  await db.update(levelImages)
    .set({ deletedAt: new Date(), updatedBy: "cli:plan:l1", updatedAt: new Date() })
    .where(and(eq(levelImages.levelId, L1_PLAN.levelId), isNull(levelImages.deletedAt)));

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
 * Records what the walkthrough named, with the frames that show it.
 *
 * A feature whose frames are not in this database is reported rather than
 * written: the evidence is the point, and a place with no sighting behind it
 * is the kind of unsupported claim this layer exists to prevent.
 */
async function importFeatures(
  db: Database, roomIds: Set<string>,
): Promise<Pick<PlanImportResult, "features" | "sightings" | "featuresWithoutFrames">> {
  const out = { features: 0, sightings: 0, featuresWithoutFrames: [] as string[] };

  for (const feature of WALKTHROUGH_FEATURES) {
    const present: string[] = [];
    for (const id of feature.keyframeIds) {
      const [frame] = await db.select().from(keyframes).where(eq(keyframes.id, id));
      if (frame) present.push(id);
    }
    if (present.length === 0) {
      out.featuresWithoutFrames.push(feature.nameEn);
      continue;
    }

    const [existing] = await db.select().from(places).where(eq(places.id, feature.id));
    if (!existing) {
      await db.insert(places).values({
        id: feature.id,
        nameEn: feature.nameEn,
        category: "facility",
        levelId: L1_PLAN.levelId,
        // Only bind to a room the import actually put in the model.
        roomId: feature.roomId && roomIds.has(feature.roomId) ? feature.roomId : null,
        notes: feature.notes,
        // Read off signage in the frames, not inferred: this is confirmed.
        status: "confirmed",
        updatedBy: "cli:plan:l1",
      });
      out.features++;
    }

    for (const keyframeId of present) {
      const [seen] = await db.select().from(sightings)
        .where(and(eq(sightings.placeId, feature.id), eq(sightings.keyframeId, keyframeId)));
      if (seen) continue;
      await db.insert(sightings).values({
        id: `sg_${feature.id}_${keyframeId.slice(3, 11)}`,
        placeId: feature.id,
        keyframeId,
        status: "confirmed",
        updatedBy: "cli:plan:l1",
      });
      out.sightings++;
    }
  }

  return out;
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
  { imagesDir = resolve(here, "../../../../images"), files }: {
    imagesDir?: string; files?: readonly string[];
  } = {},
): Promise<PlanImportResult> {
  const { levelId, spaces } = await readSpaces(files);
  // A room is as tall as the storey it stands on. The level knows that; this
  // file should not have an opinion of its own about it.
  const [level] = await db.select().from(levels).where(eq(levels.id, levelId));
  const heightM = level?.heightM ?? FALLBACK_HEIGHT_M;
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
      heightM,
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

  const roomIds = new Set(
    (await db.select({ id: rooms.id }).from(rooms)).map(r => r.id),
  );

  return {
    spaces: created,
    skipped,
    ...await importFeatures(db, roomIds),
    underlay: await importUnderlay(db, dataDir, imagesDir),
  };
}
