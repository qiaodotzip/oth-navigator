import { z } from "zod";
import { AuditFieldsSchema, SlugSchema } from "../primitives";
import { TenantCategorySchema } from "./semantics";

/**
 * The evidence layer: what was filmed, what was seen in it, and what it was
 * called.
 *
 * Authored before any floorplan exists, so nothing here has coordinates and
 * nothing here is required to reference a room. Position arrives later, from
 * the room a place is bound to.
 */

export const CaptureKindSchema = z.enum(["video", "photos"]);

/**
 * Whether a human has looked at this yet.
 *
 * A labelling agent reads a frame and proposes what is in it; nothing it writes
 * is treated as true until someone confirms it. Rejecting is a soft delete
 * rather than a third state, and the importer never resurrects an id that
 * exists — so a wrong proposal, once thrown away, stays thrown away.
 */
export const ReviewStatusSchema = z.enum(["proposed", "confirmed"]);

export const CaptureSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  kind: CaptureKindSchema,
  /** How a teammate recognises the source file when asked for it again. */
  filename: z.string().min(1),
  durationMs: z.number().nonnegative().optional(),
  /** Best guess at the floor filmed. Optional — a walkthrough can cross floors. */
  levelId: SlugSchema.optional(),
  notes: z.string().default(""),
});

export const KeyframeSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  captureId: SlugSchema,
  /** Absent for an uploaded photo, which came from no timeline. */
  timeMs: z.number().nonnegative().optional(),
  imageId: SlugSchema,
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
});

/** Fractions of the frame, so a box survives any resize or re-encode. */
export const BoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
}).refine(b => b.x + b.w <= 1 && b.y + b.h <= 1, "box extends outside the frame");

export const PlaceSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  nameEn: z.string().min(1),
  nameZh: z.string().default(""),
  category: TenantCategorySchema,
  levelId: SlugSchema.optional(),
  /** Empty until someone binds this to a traced room. */
  roomId: SlugSchema.optional(),
  notes: z.string().default(""),
  // Defaults to confirmed: anything a person typed in the survey tool is theirs
  // already. The importer is the only thing that writes "proposed".
  status: ReviewStatusSchema.default("confirmed"),
  /** What the labeller thought it was reading, when it was not certain. */
  proposedBy: z.string().default(""),
});

export const SightingSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  placeId: SlugSchema,
  keyframeId: SlugSchema,
  /** Absent when the whole frame is the thing; a box says which of two shops. */
  box: BoxSchema.optional(),
  status: ReviewStatusSchema.default("confirmed"),
  proposedBy: z.string().default(""),
});

export type CaptureKind = z.infer<typeof CaptureKindSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
export type Capture = z.infer<typeof CaptureSchema>;
export type Keyframe = z.infer<typeof KeyframeSchema>;
export type Box = z.infer<typeof BoxSchema>;
export type Place = z.infer<typeof PlaceSchema>;
export type Sighting = z.infer<typeof SightingSchema>;
