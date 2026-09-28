import { z } from "zod";
import { AuditFieldsSchema, RingSchema, SlugSchema, Vec2Schema } from "../primitives";
import { RoomKindSchema } from "./structure";

const finite = z.number().finite();
const positive = z.number().positive().finite();
/** A file's SHA-256, as the server's content-addressed store names it. */
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * Where a floor's plan image came from on its PDF (spec §5.3). It is kept so
 * rooms can be found in the same drawing later, and so the next floor's sheet
 * can be placed the same way. Points are the sheet as shown: the page's turn
 * applied, y down.
 *
 * The spec asks for the origin in points. That is not stored: it would go
 * stale the moment Align or Measure scale moved the plan. The window and the
 * points per pixel are fixed facts about the image, and the origin follows
 * from them and the plan's calibration as it is now.
 */
export const PlanSheetSchema = z.object({
  page: z.number().int().positive(),
  pageCount: z.number().int().positive(),
  /** The sheet as shown, in points. */
  pageSizePt: z.tuple([positive, positive]),
  /** The page's own turn: its /Rotate. */
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  /** The part of the sheet the image shows: x0, y0, x1, y1. */
  clipPt: z.tuple([finite, finite, finite, finite]),
  /** Points per image pixel, fixed when the image was drawn. The plan's metres per pixel over this is its metres per point now. */
  pointsPerPixel: positive,
  /** Read from the drawing's grid dimensions; null when they could not be. */
  metresPerPoint: positive.nullable(),
  runsAgree: z.number().int().nonnegative(),
  runsFound: z.number().int().nonnegative(),
});

export const PlanSourceSchema = PlanSheetSchema.extend({
  pdfId: z.string().min(1),
  checksum: Sha256Schema,
  /** As the file was named when sent, cut to 255 characters. */
  filename: z.string().max(255),
});

export const DraftSourceSchema = z.object({ checksum: Sha256Schema, page: z.number().int().positive() });

/**
 * A space found in a floor's PDF, waiting for a person to make it a room
 * (spec §5.2). As an entity it gets version checks, the audit, soft delete and
 * restore for nothing. It is never part of MapModel: it is not validated with
 * the map, and never published.
 */
export const RoomDraftSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  nameEn: z.string().trim().min(1).max(200),
  kind: RoomKindSchema,
  /** Absent for a space the drawing leaves open: it is drawn by hand at its label. */
  footprint: RingSchema.optional(),
  holes: z.array(RingSchema).default([]),
  /** Where the name is printed on the drawing. */
  labelPoint: Vec2Schema,
  areaM2: z.number().nonnegative().finite(),
  source: DraftSourceSchema,
  /** The room it became. Set as the draft is retired, and cleared by the undo. */
  acceptedRoomId: SlugSchema.optional(),
});

/** What the finder sends. The server gives each draft its id, floor and source. */
export const RoomDraftInputSchema = RoomDraftSchema.pick({
  nameEn: true, kind: true, footprint: true, holes: true, labelPoint: true, areaM2: true,
});

export type PlanSheet = z.infer<typeof PlanSheetSchema>;
export type PlanSource = z.infer<typeof PlanSourceSchema>;
export type DraftSource = z.infer<typeof DraftSourceSchema>;
export type RoomDraft = z.infer<typeof RoomDraftSchema>;
export type RoomDraftInput = z.input<typeof RoomDraftInputSchema>;
