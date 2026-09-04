import { z } from "zod";
import { AuditFieldsSchema, SlugSchema } from "../primitives";

export const BuildingSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  name: z.string().min(1),
  /**
   * Georeference. Unused today; three columns now versus a painful retrofit once
   * geometry exists. This is what makes an outdoor-GPS handoff at the entrances
   * possible later.
   */
  anchorLat: z.number().min(-90).max(90),
  anchorLng: z.number().min(-180).max(180),
  /** Building north relative to true north, degrees clockwise. */
  rotationDeg: z.number().default(0),
});

export const LevelSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  buildingId: SlugSchema,
  /** Human-facing short code, e.g. "L1", "B1". Unique within a building. */
  code: z.string().min(1).max(8),
  /** Sort order; negative for basements. */
  ordinal: z.number().int(),
  nameEn: z.string().min(1),
  nameZh: z.string().min(1),
  /** Metres above the building datum. */
  elevationM: z.number().finite(),
  /** Floor-to-floor height in metres. */
  heightM: z.number().positive(),
});

export type Building = z.infer<typeof BuildingSchema>;
export type Level = z.infer<typeof LevelSchema>;
