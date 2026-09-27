import { live, type MapModel } from "@oth/model";
import type { EntityType } from "../api/client";
import { layerEntityType, type LayerItem } from "./layers";

export type Removal = { type: EntityType; id: string; version: number };

/**
 * What deleting one item in the layers list actually removes.
 *
 * Usually just the item. A lift's last stop is the exception: without it the
 * lift connects nothing, which the validator reports as an error that nobody
 * could fix from the canvas, since there is no stop left to select.
 */
export function removalsFor(model: MapModel, item: LayerItem): Removal[] {
  const own: Removal = { type: layerEntityType(item.type), id: item.id, version: item.version };
  if (item.type !== "portalEndpoint") return [own];

  const endpoint = model.portalEndpoints.find(e => e.id === item.id);
  if (!endpoint) return [own];
  const others = live(model.portalEndpoints)
    .filter(e => e.portalId === endpoint.portalId && e.id !== endpoint.id);
  const portal = model.portals.find(p => p.id === endpoint.portalId);
  if (others.length > 0 || !portal) return [own];

  return [own, { type: "portal", id: portal.id, version: portal.version }];
}
