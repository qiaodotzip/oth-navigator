import { OPENED, floorAbove, isOpen, live, portalFromRoom, type StopKind } from "@oth/model";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { portalEndpoints, portals } from "../db/schema";
import { VersionConflictError, createEntity, updateEntity } from "../entities/repository";
import { assembleModel } from "../model/assemble";

/** A space that can't be made a stop, in words the model can act on. */
export class StopRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StopRefusal";
  }
}

export type MakeStopInput = { levelId: string; roomId: string; expectedVersion: number; kind: StopKind };

export type MadeStop = {
  /**
   * made: a new lift or stair. joined: a stop on one already at this spot on
   * another floor. outlined: a stop placed by hand gained the outline.
   * opened: the stop was saved already, and only the space's opening was left.
   */
  outcome: "made" | "joined" | "outlined" | "opened";
  roomName: string;
  portalId: string;
  endpointId: string;
  /** The floor above the stop, and whether a space is traced there for the next stop. Null on the top floor. */
  above: { code: string; landing: boolean } | null;
};

/**
 * portalFromRoom names a new lift `portal-<now>` and its stop
 * `<floor>-portal-<now>`, as the editor does. Two calls in one millisecond, or
 * a deleted row with that id (an id is a primary key), would meet a duplicate
 * key, so the stamp moves on until both are free.
 */
async function freeStamp(tx: Database, levelId: string, now: number): Promise<number> {
  for (let stamp = now; ; stamp++) {
    const [portal] = await tx.select({ id: portals.id }).from(portals).where(eq(portals.id, `portal-${stamp}`));
    const [stop] = await tx.select({ id: portalEndpoints.id }).from(portalEndpoints)
      .where(eq(portalEndpoints.id, `${levelId}-portal-${stamp}`));
    if (!portal && !stop) return stamp;
  }
}

/**
 * The MakeStop button's writes (editor/src/build/MakeStop.tsx), made on the
 * server in one transaction for Claude's make_stop: a stop that keeps the
 * space's outline, so 3D builds a shaft or a flight from it, and the space
 * opened so routes reach it. The button saves step by step with an Undo for
 * each; here a refusal anywhere leaves nothing half made.
 */
export async function makeStop(db: Database, input: MakeStopInput, actorId: string, now: number = Date.now()): Promise<MadeStop> {
  return db.transaction(async (t): Promise<MadeStop> => {
    const tx = t as unknown as Database;
    const model = await assembleModel(tx);
    const room = live(model.rooms).find(r => r.id === input.roomId);
    if (!room) throw new StopRefusal(`There is no room ${input.roomId}.`);
    if (room.levelId !== input.levelId) {
      throw new StopRefusal(`Room ${room.id} is on another floor, so it is not made a stop from here.`);
    }
    const roomName = room.nameEn.trim() || room.id;

    const outlined = live(model.portalEndpoints).find(e => e.levelId === room.levelId && e.roomId === room.id && e.footprint);
    if (outlined) {
      if (isOpen(room)) throw new StopRefusal(`${roomName} is already a lift or stair stop.`);
      // MakeStop's "Finish opening it": the stop is saved, but the space still has walls.
      await updateEntity(tx, "room", room.id, input.expectedVersion, { ...OPENED }, actorId);
      return {
        outcome: "opened", roomName, portalId: outlined.portalId, endpointId: outlined.id,
        above: floorAbove(model, room.levelId, outlined.point),
      };
    }

    const plan = portalFromRoom(model, room, input.kind, await freeStamp(tx, room.levelId, now));
    if (!plan.ok) throw new StopRefusal(plan.reason);
    // With nothing to open, no write below checks the room's version, so it is checked here.
    if (!plan.roomPatch && room.version !== input.expectedVersion) throw new VersionConflictError(room as unknown as Row);

    // MakeStop's order, so a stop never points at a lift that isn't there.
    if (plan.portal) await createEntity(tx, "portal", plan.portal, actorId);
    if (plan.kindPatch) {
      await updateEntity(tx, "portal", plan.kindPatch.portalId, plan.kindPatch.version, { ...plan.kindPatch.to }, actorId);
    }
    if (plan.placedByHand) {
      await updateEntity(tx, "portalEndpoint", plan.endpoint.id, plan.placedByHand.version, { footprint: plan.endpoint.footprint }, actorId);
    } else {
      await createEntity(tx, "portalEndpoint", plan.endpoint, actorId);
    }
    // Last, and with the version sent: a room changed since it was read takes every write above back with it.
    if (plan.roomPatch) await updateEntity(tx, "room", room.id, input.expectedVersion, { ...plan.roomPatch }, actorId);

    return {
      outcome: plan.placedByHand ? "outlined" : plan.portal ? "made" : "joined",
      roomName,
      portalId: plan.endpoint.portalId,
      endpointId: plan.endpoint.id,
      above: floorAbove(model, room.levelId, plan.endpoint.point),
    };
  });
}
