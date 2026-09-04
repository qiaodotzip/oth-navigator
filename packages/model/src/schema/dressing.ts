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

/**
 * Where a dressing asset sits. Deliberately inert: nothing in routing,
 * collision or reachability reads a placement. roomId is an anchor for
 * organisation and culling only.
 */
export const PlacementSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  assetId: SlugSchema,
  roomId: SlugSchema.optional(),
  /** [x, y, z] in model metres. */
  position: Vec3Schema,
  /** Rotation about the vertical axis only — dressing sits upright on a floor. */
  rotationDeg: z.number().default(0),
  scale: z.number().positive().default(1),
});

export type Asset = z.infer<typeof AssetSchema>;
export type Placement = z.infer<typeof PlacementSchema>;
