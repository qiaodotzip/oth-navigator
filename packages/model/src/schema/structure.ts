import { z } from "zod";
import { AuditFieldsSchema, RingSchema, SlugSchema, VerificationSchema } from "../primitives";

/**
 * The spatial character of a space, not what it is used for.
 *
 * A shop is a `room` with a retail tenant — occupancy belongs to the semantics
 * layer, and making it a kind here would invite `kiosk`, `restaurant` and no
 * principle for stopping. `corridor` is gone because a corridor is a pathway.
 */
export const RoomKindSchema = z.enum([
  /** Enclosed, entered from outside itself: meeting room, studio, shop unit. */
  "room",
  /** Open space you cross freely: town square, event space, stadium floor. */
  "area",
  /**
   * Furniture, not architecture: a bounded thing standing on a floor — seating,
   * planters, a bank of vending machines, a charging point. Drawn to brief a
   * modeller with real dimensions and to anchor the mesh they build.
   */
  "detail",
  /** Back of house, not public. */
  "service",
  /** A hole — lightwell, atrium opening. */
  "void",
]);

export const RoomSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  kind: RoomKindSchema,
  /** Outer boundary, metres, in building coordinates. */
  footprint: RingSchema,
  /** Interior voids — atria and lightwells. */
  holes: z.array(RingSchema).default([]),
  heightM: z.number().positive(),
  /** Part of the walkable surface. Defaults false: routability is opt-in. */
  walkable: z.boolean().default(false),
  nameEn: z.string().default(""),
  nameZh: z.string().default(""),
  verification: VerificationSchema.default({ status: "unverified", evidence: [] }),
});

export type RoomKind = z.infer<typeof RoomKindSchema>;
export type Room = z.infer<typeof RoomSchema>;
