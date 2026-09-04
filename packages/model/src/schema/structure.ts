import { z } from "zod";
import { AuditFieldsSchema, RingSchema, SlugSchema, VerificationSchema } from "../primitives";

export const RoomKindSchema = z.enum([
  "room",
  "corridor",
  "atrium",
  "service",
  "outdoor",
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
