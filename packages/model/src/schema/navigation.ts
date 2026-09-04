import { z } from "zod";
import { AuditFieldsSchema, SlugSchema, Vec2Schema } from "../primitives";

const SegmentSchema = z.tuple([Vec2Schema, Vec2Schema]);

/**
 * An opening between two rooms. Room footprints are closed rings, so without
 * doorways adjacent rooms are either mutually impassable or freely passable
 * through walls. "Doorway" means any opening — a 12 m gap between a corridor and
 * an atrium is one doorway, not a wall.
 */
export const DoorwaySchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  roomA: SlugSchema,
  roomB: SlugSchema,
  /** The opening's line, on the shared boundary. */
  segment: SegmentSchema,
  widthM: z.number().positive(),
  stepFree: z.boolean().default(true),
});

/**
 * Where the building is entered from outside. First-class rather than a flag
 * because these are the roots of the reachability check and the future handoff
 * point from outdoor GPS navigation.
 */
export const EntranceSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  roomId: SlugSchema,
  point: Vec2Schema,
  nameEn: z.string().default(""),
  nameZh: z.string().default(""),
  stepFree: z.boolean().default(true),
  isPrimary: z.boolean().default(false),
  /** Free-text opening hours; structured hours live on tenants. */
  hours: z.string().optional(),
});

export const PortalKindSchema = z.enum(["lift", "escalator", "stair", "ramp"]);

/** Connects two or more levels. Carries the accessibility step-free routing needs. */
export const PortalSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  kind: PortalKindSchema,
  stepFree: z.boolean().optional(),
  nameEn: z.string().default(""),
  nameZh: z.string().default(""),
}).transform(p => ({
  ...p,
  stepFree: p.stepFree ?? (p.kind === "lift" || p.kind === "ramp"),
}));

export const PortalEndpointSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  portalId: SlugSchema,
  levelId: SlugSchema,
  roomId: SlugSchema,
  point: Vec2Schema,
});

/** Optional hand-authored polyline forcing a route through a specific path. */
export const NavHintSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  polyline: z.array(Vec2Schema).min(2),
});

export type Doorway = z.infer<typeof DoorwaySchema>;
export type Entrance = z.infer<typeof EntranceSchema>;
export type PortalKind = z.infer<typeof PortalKindSchema>;
export type Portal = z.infer<typeof PortalSchema>;
export type PortalEndpoint = z.infer<typeof PortalEndpointSchema>;
export type NavHint = z.infer<typeof NavHintSchema>;
