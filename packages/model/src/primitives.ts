import { z } from "zod";

/** Plan coordinate in metres: x east, y north, from the single building origin. */
export type Vec2 = readonly [number, number];
/** Model-space point in metres: x east, y north, z up. */
export type Vec3 = readonly [number, number, number];
/** A closed polygon ring. The closing point is implicit — never repeat the first point. */
export type Ring = readonly Vec2[];
export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

const finite = z.number().finite();

export const Vec2Schema = z.tuple([finite, finite]);
export const Vec3Schema = z.tuple([finite, finite, finite]);

export const RingSchema = z
  .array(Vec2Schema)
  .min(3, "a ring needs at least three points");

/** Ids appear in bundle file paths and URLs, so they are restricted to safe characters. */
export const SlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "id must be a slug: letters, digits, hyphen, underscore");

export const VerificationStatusSchema = z.enum(["unverified", "photo", "onsite", "cad"]);

/**
 * Provenance. The hackathon shipped data traced from outdated plans with nothing
 * recording that fact; this makes staleness visible instead of silent.
 */
export const VerificationSchema = z.object({
  status: VerificationStatusSchema.default("unverified"),
  /** Opaque references — the labelling tool defines their shape in a later spec. */
  evidence: z.array(z.string()).default([]),
  verifiedAt: z.string().datetime().optional(),
  verifiedBy: z.string().optional(),
});

/** Present on every authored entity: optimistic locking, attribution, soft delete. */
export const AuditFieldsSchema = z.object({
  version: z.number().int().nonnegative().default(0),
  updatedBy: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
  deletedAt: z.string().datetime().nullish(),
});

export type Verification = z.infer<typeof VerificationSchema>;
export type AuditFields = z.infer<typeof AuditFieldsSchema>;

/**
 * Drops soft-deleted entities. Every consumer — validation, nav baking, the
 * bundle builder — filters through this, so a mis-delete stays recoverable
 * without any of them having to remember the `deletedAt` convention.
 */
export function live<T extends { deletedAt?: string | null }>(items: readonly T[]): T[] {
  return items.filter(i => i.deletedAt == null);
}
