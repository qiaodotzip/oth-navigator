import type { MapModel, Vec2 } from "@oth/model";
import type { EntityType } from "../api/client";
import type { Tool } from "../state/store";
import { entranceAt, portalEndpointAt } from "./placePoint";

type Writes = {
  create: (type: EntityType, data: Record<string, unknown>, options?: { retry?: false }) => Promise<boolean>;
  remove: (type: EntityType, id: string, expectedVersion: number) => Promise<boolean>;
};

/**
 * What a click with the Entrance or Portal tool saves.
 *
 * A click that lands nowhere says why. Doing nothing silently is how these two
 * tools looked broken for as long as they were not wired up at all.
 */
export async function commitPoint({
  saver, model, tool, levelId, point, say, now = Date.now(),
}: {
  saver: Writes;
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
    // The portal first, so its stop never points at nothing. The server would
    // take such a stop anyway; only the validator flags it, as an error.
    if (placed.portal && !(await saver.create("portal", placed.portal))) return;
    // A new lift's stop gets no Retry: by the time you could press it, the lift
    // has been taken back out below, and the stop would land on no lift. A stop
    // joining a lift that is already there keeps its Retry.
    if (await saver.create("portalEndpoint", placed.endpoint, placed.portal ? { retry: false } : undefined)) {
      say(placed.portal
        ? "New lift placed. Switch level and click its dashed outline to add its next stop."
        : "Joined the lift or stair already at this spot on another level.");
      return;
    }
    if (!placed.portal) return;
    // The stop was refused after its lift was saved. A lift with no stops is
    // on no floor, connects nothing and cannot be clicked, so take it back out
    // (a new entity is saved at version 0) rather than leave it orphaned.
    if (!(await saver.remove("portal", placed.portal.id, 0))) {
      say("The lift was saved without its stop. Delete it from the Entrances & lifts to-do list.");
    }
  }
}
