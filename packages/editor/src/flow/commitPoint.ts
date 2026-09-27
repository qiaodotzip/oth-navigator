import type { MapModel, Vec2 } from "@oth/model";
import type { EntityType } from "../api/client";
import type { Tool } from "../state/store";
import { entranceAt, portalEndpointAt } from "./placePoint";

type Creates = { create: (type: EntityType, data: Record<string, unknown>) => Promise<boolean> };

/**
 * What a click with the Entrance or Portal tool saves.
 *
 * A click that lands nowhere says why. Doing nothing silently is how these two
 * tools looked broken for as long as they were not wired up at all.
 */
export async function commitPoint({
  saver, model, tool, levelId, point, say, now = Date.now(),
}: {
  saver: Creates;
  model: MapModel;
  tool: Tool;
  levelId: string;
  point: Vec2;
  say: (message: string) => void;
  now?: number;
}): Promise<void> {
  if (tool === "place-entrance") {
    const placed = entranceAt(model, levelId, point, now);
    if (!placed.ok) return say(placed.reason);
    await saver.create("entrance", placed.entrance);
    return;
  }

  if (tool === "place-portal") {
    const placed = portalEndpointAt(model, levelId, point, now);
    if (!placed.ok) return say(placed.reason);
    // The portal first: a stop that points at a lift not yet saved is refused.
    if (placed.portal && !(await saver.create("portal", placed.portal))) return;
    if (await saver.create("portalEndpoint", placed.endpoint)) {
      say(placed.portal
        ? "New lift placed. Switch level and click the same spot to add its next stop."
        : "Joined the lift or stair already at this spot on another level.");
    }
  }
}
