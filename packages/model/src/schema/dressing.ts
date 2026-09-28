import { z } from "zod";
import { AuditFieldsSchema, SlugSchema, Vec3Schema } from "../primitives";

/** Spec budgets. Enforced here so editor, server and publish share one definition. */
export const ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const ASSET_MAX_TRIANGLES = 150_000;
export const LEVEL_DRESSING_MAX_BYTES = 25 * 1024 * 1024;

export const Bbox3Schema = z.object({
  minX: z.number().finite(),
  minY: z.number().finite(),
  minZ: z.number().finite(),
  maxX: z.number().finite(),
  maxY: z.number().finite(),
  maxZ: z.number().finite(),
});

export const AssetSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  filename: z.string().min(1),
  storagePath: z.string().min(1),
  checksum: z.string().min(1),
  sizeBytes: z.number().int().positive().max(ASSET_MAX_BYTES),
  triangleCount: z.number().int().nonnegative().max(ASSET_MAX_TRIANGLES),
  bbox: Bbox3Schema,
  uploadedBy: z.string().optional(),
});

/** A side of an object's box, in metres: a real length, never zero. */
const posFinite = z.number().positive().finite();

/**
 * A kind of thing the survey sees again and again: a wastebin, a water cooler
 * (spec §5.2). Made once, with one size and one model, and shown by every
 * object of the kind on the map. Its place in the survey carries
 * `objectKindId`, the way a walkway's place carries `pathwayKindId`.
 */
export const ObjectKindSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  nameEn: z.string().min(1),
  nameZh: z.string().default(""),
  /** Metres: w across, d front to back, h up. Estimated from the frames; anyone can change it. */
  size: z.object({ w: posFinite, d: posFinite, h: posFinite }),
  /** Its model, once someone has made one. Until then its objects are drawn as boxes of `size`. */
  assetId: SlugSchema.optional(),
  notes: z.string().default(""),
});

/**
 * Where a dressing model or an object sits. Deliberately inert: nothing in
 * routing, collision or reachability reads a placement, objects included
 * (spec §5.3). roomId is an anchor for organisation and culling only.
 *
 * An object shows its kind's model unless it names its own
 * (`placementModelAsset`). That it needs one of the two is a validation rule
 * and a database check, not a refine here: the entity registry and partial
 * updates need a plain object schema.
 */
export const PlacementSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  /** Its own model. An object may leave it out and show its kind's. */
  assetId: SlugSchema.optional(),
  roomId: SlugSchema.optional(),
  /** [x, y, z] in model metres. */
  position: Vec3Schema,
  /** Rotation about the vertical axis only — dressing sits upright on a floor. */
  rotationDeg: z.number().default(0),
  scale: z.number().positive().default(1),
  /** Set when this is an object on the map: one of this kind. */
  objectKindId: SlugSchema.optional(),
  /** The survey tags it was placed from, so a check can show its photos. Never published. */
  sightingIds: z.array(SlugSchema).default([]),
});

export type Asset = z.infer<typeof AssetSchema>;
export type Placement = z.infer<typeof PlacementSchema>;
export type ObjectKind = z.infer<typeof ObjectKindSchema>;
