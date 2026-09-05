import { z } from "zod";
import { BuildingSchema, LevelSchema } from "./building";
import { AssetSchema, PlacementSchema } from "./dressing";
import {
  DoorwaySchema,
  EntranceSchema,
  NavHintSchema,
  PathwaySchema,
  PortalEndpointSchema,
  PortalSchema,
} from "./navigation";
import { TenantSchema } from "./semantics";
import { CaptureSchema, KeyframeSchema, PlaceSchema, SightingSchema } from "./survey";
import { RoomSchema } from "./structure";

/** The whole authored model as one plain object. Every later module is a pure function of this. */
export const MapModelSchema = z.object({
  building: BuildingSchema,
  levels: z.array(LevelSchema).default([]),
  rooms: z.array(RoomSchema).default([]),
  doorways: z.array(DoorwaySchema).default([]),
  entrances: z.array(EntranceSchema).default([]),
  portals: z.array(PortalSchema).default([]),
  portalEndpoints: z.array(PortalEndpointSchema).default([]),
  navHints: z.array(NavHintSchema).default([]),
  pathways: z.array(PathwaySchema).default([]),
  assets: z.array(AssetSchema).default([]),
  placements: z.array(PlacementSchema).default([]),
  tenants: z.array(TenantSchema).default([]),

  // The evidence layer. Deliberately absent from the published bundle, which
  // names every entity it writes — photographs of the interior are internal
  // working material.
  captures: z.array(CaptureSchema).default([]),
  keyframes: z.array(KeyframeSchema).default([]),
  places: z.array(PlaceSchema).default([]),
  sightings: z.array(SightingSchema).default([]),
});

export type MapModel = z.infer<typeof MapModelSchema>;

export function parseModel(input: unknown): MapModel {
  return MapModelSchema.parse(input);
}

export function emptyModel(building: z.input<typeof BuildingSchema>): MapModel {
  return parseModel({ building });
}
