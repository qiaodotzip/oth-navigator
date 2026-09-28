import { z } from "zod";
import { AuditFieldsSchema, RingSchema, SlugSchema, Vec2Schema } from "../primitives";

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
  /**
   * The drawing's outline of the lift shaft or the flight at this stop, in
   * metres. Optional: a lift without one is built as a standard shaft at
   * `point`, and a flight without one only as a marker.
   */
  footprint: RingSchema.optional(),
  /**
   * The flight rising from this stop climbs toward the end nearer the next
   * stop up. When that guess is wrong, a person flips it.
   */
  flipped: z.boolean().default(false),
});

/** Optional hand-authored polyline forcing a route through a specific path. */
export const NavHintSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  polyline: z.array(Vec2Schema).min(2),
});

/** Roughly a two-person corridor. */
export const DEFAULT_PATHWAY_WIDTH_M = 2.4;

/**
 * Walkable surface asserted directly: the centre line of somewhere people walk,
 * with a width.
 *
 * Unlike a doorway, which only connects two rooms whose footprints abut, a
 * pathway is correct by construction — a line down the middle of a corridor is
 * right no matter how wrong the traced footprints around it are. That is the
 * whole point on an approximate floorplan.
 */
/**
 * A kind of walkway, defined by the team rather than by this file.
 *
 * OTH has concourse, covered link, ramp, service corridor and more, and which
 * distinctions matter is a judgement the people drawing the map make — so the
 * types are rows, not an enum. Each carries a note saying how it should be
 * built in 3D, which is the whole reason for naming them separately.
 */
export const PathwayKindSchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  nameEn: z.string().min(1),
  nameZh: z.string().default(""),
  /** So a floor of walkways reads at a glance rather than as one blue tangle. */
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected a hex colour like #38bdf8"),
  /** What a modeller should do with it: covered or open, ramp or steps, surface. */
  modellingNote: z.string().default(""),
});

export const PathwaySchema = AuditFieldsSchema.extend({
  id: SlugSchema,
  levelId: SlugSchema,
  /** Which kind of walkway. Optional: the ones drawn before kinds existed have none. */
  kindId: SlugSchema.optional(),
  polyline: z.array(Vec2Schema).min(2),
  widthM: z.number().positive().default(DEFAULT_PATHWAY_WIDTH_M),
  stepFree: z.boolean().default(true),
  /**
   * Optional, unlike a room's. Most pathways are anonymous stretches of floor,
   * but the ones people actually say out loud — "the link bridge", "the
   * concourse" — need to be nameable.
   */
  nameEn: z.string().default(""),
  nameZh: z.string().default(""),
});

export type Doorway = z.infer<typeof DoorwaySchema>;
export type PathwayKind = z.infer<typeof PathwayKindSchema>;
export type Pathway = z.infer<typeof PathwaySchema>;
export type Entrance = z.infer<typeof EntranceSchema>;
export type PortalKind = z.infer<typeof PortalKindSchema>;
export type Portal = z.infer<typeof PortalSchema>;
export type PortalEndpoint = z.infer<typeof PortalEndpointSchema>;
export type NavHint = z.infer<typeof NavHintSchema>;
