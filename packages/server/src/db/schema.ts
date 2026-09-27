import {
  boolean, doublePrecision, index, integer, jsonb,
  pgTable, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  invitedBy: text("invited_by"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  /** Set when an invite or reset issues a one-time password; cleared when its owner sets one. */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
}, t => ({
  emailIdx: uniqueIndex("users_email_idx").on(t.email),
}));

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => ({
  userIdx: index("sessions_user_idx").on(t.userId),
}));

/** Columns every authored entity carries. Spread into each table. */
const auditColumns = {
  version: integer("version").notNull().default(0),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const buildings = pgTable("buildings", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  anchorLat: doublePrecision("anchor_lat").notNull(),
  anchorLng: doublePrecision("anchor_lng").notNull(),
  rotationDeg: doublePrecision("rotation_deg").notNull().default(0),
  ...auditColumns,
});

export const levels = pgTable("levels", {
  id: text("id").primaryKey(),
  buildingId: text("building_id").notNull(),
  code: text("code").notNull(),
  ordinal: integer("ordinal").notNull(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull(),
  elevationM: doublePrecision("elevation_m").notNull(),
  heightM: doublePrecision("height_m").notNull(),
  ownerIds: jsonb("owner_ids").$type<string[]>().notNull().default([]),
  ...auditColumns,
});

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  kind: text("kind").notNull(),
  footprint: jsonb("footprint").$type<[number, number][]>().notNull(),
  holes: jsonb("holes").$type<[number, number][][]>().notNull().default([]),
  heightM: doublePrecision("height_m").notNull(),
  walkable: boolean("walkable").notNull().default(false),
  nameEn: text("name_en").notNull().default(""),
  nameZh: text("name_zh").notNull().default(""),
  verification: jsonb("verification").$type<Record<string, unknown>>().notNull()
    .default({ status: "unverified", evidence: [] }),
  ...auditColumns,
}, t => ({ levelIdx: index("rooms_level_idx").on(t.levelId) }));

export const doorways = pgTable("doorways", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  roomA: text("room_a").notNull(),
  roomB: text("room_b").notNull(),
  segment: jsonb("segment").$type<[[number, number], [number, number]]>().notNull(),
  widthM: doublePrecision("width_m").notNull(),
  stepFree: boolean("step_free").notNull().default(true),
  ...auditColumns,
}, t => ({ levelIdx: index("doorways_level_idx").on(t.levelId) }));

export const entrances = pgTable("entrances", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  roomId: text("room_id").notNull(),
  point: jsonb("point").$type<[number, number]>().notNull(),
  nameEn: text("name_en").notNull().default(""),
  nameZh: text("name_zh").notNull().default(""),
  stepFree: boolean("step_free").notNull().default(true),
  isPrimary: boolean("is_primary").notNull().default(false),
  hours: text("hours"),
  ...auditColumns,
});

export const portals = pgTable("portals", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  stepFree: boolean("step_free"),
  nameEn: text("name_en").notNull().default(""),
  nameZh: text("name_zh").notNull().default(""),
  ...auditColumns,
});

export const portalEndpoints = pgTable("portal_endpoints", {
  id: text("id").primaryKey(),
  portalId: text("portal_id").notNull(),
  levelId: text("level_id").notNull(),
  roomId: text("room_id").notNull(),
  point: jsonb("point").$type<[number, number]>().notNull(),
  ...auditColumns,
});

export const navHints = pgTable("nav_hints", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  polyline: jsonb("polyline").$type<[number, number][]>().notNull(),
  ...auditColumns,
});

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  checksum: text("checksum").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  triangleCount: integer("triangle_count").notNull(),
  bbox: jsonb("bbox").$type<Record<string, number>>().notNull(),
  uploadedBy: text("uploaded_by"),
  ...auditColumns,
});

export const placements = pgTable("placements", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  assetId: text("asset_id").notNull(),
  roomId: text("room_id"),
  position: jsonb("position").$type<[number, number, number]>().notNull(),
  rotationDeg: doublePrecision("rotation_deg").notNull().default(0),
  scale: doublePrecision("scale").notNull().default(1),
  ...auditColumns,
});

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  roomId: text("room_id").notNull(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull(),
  category: text("category").notNull(),
  unitNo: text("unit_no"),
  counters: jsonb("counters").$type<string[]>().notNull().default([]),
  accessibility: jsonb("accessibility").$type<Record<string, unknown>>().notNull()
    .default({ liftAccess: true, stepFreeRoute: true }),
  hours: text("hours"),
  sourceUrl: text("source_url").notNull(),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
  verification: jsonb("verification").$type<Record<string, unknown>>().notNull()
    .default({ status: "unverified", evidence: [] }),
  ...auditColumns,
});

/** Who changed what, when. With soft deletes, this is what makes human error recoverable. */
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  actorId: text("actor_id"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  before: jsonb("before"),
  after: jsonb("after"),
}, t => ({ entityIdx: index("audit_entity_idx").on(t.entityType, t.entityId) }));

export const publishedVersions = pgTable("published_versions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by"),
  notes: text("notes").notNull().default(""),
  warningCount: integer("warning_count").notNull().default(0),
  manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
});

/** Soft locks. Short TTL, refreshed while editing — advisory only; `version` is the real guarantee. */
export const entityLocks = pgTable("entity_locks", {
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  lockedBy: text("locked_by").notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => ({ pk: uniqueIndex("entity_locks_pk").on(t.entityType, t.entityId) }));

/**
 * The floorplan a level is traced over, with its calibration on the same row.
 *
 * Server-side rather than local because teammates must trace the same picture;
 * a local-only underlay would let two people draw against different images and
 * disagree silently. At most one live row per level — uploading a replacement
 * soft-deletes the previous one.
 */
export const levelImages = pgTable("level_images", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  checksum: text("checksum").notNull(),
  widthPx: integer("width_px").notNull(),
  heightPx: integer("height_px").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  /** Null until someone measures a known dimension. */
  metresPerPixel: doublePrecision("metres_per_pixel"),
  /** World metres of the image's top-left pixel. */
  offsetX: doublePrecision("offset_x").notNull().default(0),
  offsetY: doublePrecision("offset_y").notNull().default(0),
  opacity: doublePrecision("opacity").notNull().default(0.6),
  uploadedBy: text("uploaded_by"),
  ...auditColumns,
}, t => ({ levelIdx: index("level_images_level_idx").on(t.levelId) }));

/**
 * Walkable surface drawn by hand. See navigation.ts in @oth/model for why this
 * exists rather than deriving walkability from room adjacency.
 */
export const pathways = pgTable("pathways", {
  id: text("id").primaryKey(),
  levelId: text("level_id").notNull(),
  polyline: jsonb("polyline").$type<[number, number][]>().notNull(),
  widthM: doublePrecision("width_m").notNull().default(2.4),
  stepFree: boolean("step_free").notNull().default(true),
  kindId: text("kind_id"),
  nameEn: text("name_en").notNull().default(""),
  nameZh: text("name_zh").notNull().default(""),
  ...auditColumns,
}, t => ({ levelIdx: index("pathways_level_idx").on(t.levelId) }));

/**
 * The survey layer: the evidence behind what the map claims.
 *
 * A capture's bytes are never stored — the browser extracts frames locally and
 * uploads only those, so what is kept here is enough to recognise the source
 * file when a teammate is asked for it again.
 */
/** Walkway types the team defines for itself. See PathwayKindSchema. */
export const pathwayKinds = pgTable("pathway_kinds", {
  id: text("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull().default(""),
  colorHex: text("color_hex").notNull(),
  modellingNote: text("modelling_note").notNull().default(""),
  ...auditColumns,
});

export const captures = pgTable("captures", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  filename: text("filename").notNull(),
  durationMs: integer("duration_ms"),
  levelId: text("level_id"),
  notes: text("notes").notNull().default(""),
  ...auditColumns,
});

export const keyframes = pgTable("keyframes", {
  id: text("id").primaryKey(),
  captureId: text("capture_id").notNull(),
  timeMs: integer("time_ms"),
  imageId: text("image_id").notNull(),
  storagePath: text("storage_path").notNull(),
  checksum: text("checksum").notNull(),
  widthPx: integer("width_px").notNull(),
  heightPx: integer("height_px").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  ...auditColumns,
}, t => ({ captureIdx: index("keyframes_capture_idx").on(t.captureId) }));

export const places = pgTable("places", {
  id: text("id").primaryKey(),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh").notNull().default(""),
  category: text("category").notNull(),
  levelId: text("level_id"),
  roomId: text("room_id"),
  pathwayKindId: text("pathway_kind_id"),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("confirmed"),
  proposedBy: text("proposed_by").notNull().default(""),
  ...auditColumns,
});

export const sightings = pgTable("sightings", {
  id: text("id").primaryKey(),
  placeId: text("place_id").notNull(),
  keyframeId: text("keyframe_id").notNull(),
  box: jsonb("box").$type<{ x: number; y: number; w: number; h: number }>(),
  status: text("status").notNull().default("confirmed"),
  proposedBy: text("proposed_by").notNull().default(""),
  ...auditColumns,
}, t => ({ placeIdx: index("sightings_place_idx").on(t.placeId) }));
