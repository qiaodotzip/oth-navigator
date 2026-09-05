import {
  CaptureSchema, DoorwaySchema, EntranceSchema, LevelSchema, NavHintSchema,
  PathwaySchema, PlaceSchema, PlacementSchema, PortalEndpointSchema, PortalSchema,
  RoomSchema, SightingSchema, TenantSchema,
} from "@oth/model";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { ZodType } from "zod";
import * as schema from "../db/schema";

export const ENTITY_TYPES = [
  "level", "room", "doorway", "entrance",
  "portal", "portalEndpoint", "navHint", "pathway", "placement", "tenant",
  // A keyframe is deliberately absent: it arrives as multipart bytes, and
  // generic CRUD would be a way to create one with no image behind it.
  "capture", "place", "sighting",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/** Every entity table shares these columns, which is what makes generic CRUD possible. */
export type EntityTable = PgTable & {
  id: PgColumn;
  version: PgColumn;
  deletedAt: PgColumn;
  updatedBy: PgColumn;
  updatedAt: PgColumn;
};

/**
 * One place mapping a URL type name to its table and its validating schema.
 * The schema comes from @oth/model, so the API cannot accept a shape the model
 * would reject.
 */
export const entityRegistry: Record<EntityType, { table: EntityTable; schema: ZodType }> = {
  level: { table: schema.levels as EntityTable, schema: LevelSchema },
  room: { table: schema.rooms as EntityTable, schema: RoomSchema },
  doorway: { table: schema.doorways as EntityTable, schema: DoorwaySchema },
  entrance: { table: schema.entrances as EntityTable, schema: EntranceSchema },
  portal: { table: schema.portals as EntityTable, schema: PortalSchema },
  portalEndpoint: { table: schema.portalEndpoints as EntityTable, schema: PortalEndpointSchema },
  navHint: { table: schema.navHints as EntityTable, schema: NavHintSchema },
  pathway: { table: schema.pathways as EntityTable, schema: PathwaySchema },
  placement: { table: schema.placements as EntityTable, schema: PlacementSchema },
  tenant: { table: schema.tenants as EntityTable, schema: TenantSchema },
  capture: { table: schema.captures as EntityTable, schema: CaptureSchema },
  place: { table: schema.places as EntityTable, schema: PlaceSchema },
  sighting: { table: schema.sightings as EntityTable, schema: SightingSchema },
};

export function isEntityType(v: string): v is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(v);
}
