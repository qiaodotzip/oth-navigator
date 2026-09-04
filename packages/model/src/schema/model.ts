import { z } from "zod";
import { BuildingSchema, LevelSchema } from "./building";
import { AssetSchema, PlacementSchema } from "./dressing";
import {
  DoorwaySchema,
  EntranceSchema,
  NavHintSchema,
  PortalEndpointSchema,
  PortalSchema,
} from "./navigation";
import { TenantSchema } from "./semantics";
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
  assets: z.array(AssetSchema).default([]),
  placements: z.array(PlacementSchema).default([]),
  tenants: z.array(TenantSchema).default([]),
});

export type MapModel = z.infer<typeof MapModelSchema>;

export function parseModel(input: unknown): MapModel {
  return MapModelSchema.parse(input);
}

export function emptyModel(building: z.input<typeof BuildingSchema>): MapModel {
  return parseModel({ building });
}
