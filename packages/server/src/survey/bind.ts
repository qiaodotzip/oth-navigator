import { placeLevels } from "@oth/model";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { places, rooms, sightings } from "../db/schema";
import { updateEntity } from "../entities/repository";
import { assembleModel } from "../model/assemble";

export class BindRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BindRefusal";
  }
}

export type BindInput = { placeId: string; placeVersion: number; roomId: string; roomVersion: number };
export type Bound = { verified: boolean; evidence: string[]; levelId: string };

/**
 * Binds a surveyed place to a traced room, as Build's Bind places does
 * (editor/src/build/BindPlaces.tsx), but in one transaction. The place takes
 * the room and its floor, and the room is marked seen in a photo, with the
 * place's confirmed frames as evidence. With no confirmed frame the room is
 * left as it was, because "seen in a photo" needs a photo. A stale room
 * rolls the place back too.
 *
 * Which places may be bound, and where, is the editor's rule (`floorUnits`
 * in editor/src/flow/buildSteps.ts), so the two cannot disagree: a confirmed
 * place that is not a walkway, bound only while its room is on the map (one
 * whose room was deleted is waiting for a room again), and only to a room on
 * its own floor (`placeLevels`), or any floor when none claims it.
 */
export async function bindPlace(db: Database, input: BindInput, actorId: string, now: Date = new Date()): Promise<Bound> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const [place] = await tx.select().from(places).where(and(eq(places.id, input.placeId), isNull(places.deletedAt)));
    if (!place) throw new BindRefusal(`There is no place ${input.placeId}.`);
    // Locked until this commits: two binds racing for one room queue here, so
    // the second sees the first's place in the "taken" check below. Without
    // it both could pass, and an unverified bind never writes the room, so
    // no version check would catch the second.
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, input.roomId)).for("update");
    if (!room) throw new BindRefusal(`There is no room ${input.roomId}.`);
    if (place.status !== "confirmed") throw new BindRefusal(`${place.nameEn} is still a proposal. Accept it with review_place first.`);
    if (place.pathwayKindId) throw new BindRefusal(`${place.nameEn} is a walkway, which is built as a path, not bound to a room.`);
    if (room.deletedAt) {
      throw new BindRefusal(`Room ${room.id} is deleted. Bind ${place.nameEn} to a room on the map, or restore this one first.`);
    }
    if (place.roomId === room.id) throw new BindRefusal(`${place.nameEn} is already bound to room ${room.id}.`);
    if (place.roomId) {
      // A room deleted since leaves the place naming it; the place is
      // waiting for a room again, so this bind simply replaces the name.
      const [current] = await tx.select().from(rooms).where(and(eq(rooms.id, place.roomId), isNull(rooms.deletedAt)));
      if (current) {
        throw new BindRefusal(`${place.nameEn} is bound to room ${place.roomId}. Unbind it first: update the place with roomId null.`);
      }
    }
    const [taken] = await tx.select().from(places).where(and(eq(places.roomId, room.id), isNull(places.deletedAt)));
    if (taken) throw new BindRefusal(`Room ${room.id} is already bound to ${taken.nameEn}.`);
    // The editor's own rule over the model its screens read, so a place
    // Claude is shown on a floor is always one it may bind there.
    const floor = placeLevels(await assembleModel(tx)).get(place.id);
    if (floor !== undefined && floor !== room.levelId) {
      // With no floor of its own, a place is on the one it was filmed on.
      const filmed = !place.levelId;
      throw new BindRefusal(
        `${place.nameEn} ${filmed ? "was filmed on" : "is on"} floor ${floor}, and room ${room.id} is on floor ${room.levelId}. ` +
        `Bind it to a room on ${floor}. If its floor is wrong, update the place with levelId ${room.levelId} first.`,
      );
    }

    await updateEntity(tx, "place", place.id, input.placeVersion, { roomId: room.id, levelId: room.levelId }, actorId);
    // Confirmed tags only: a proposed one is a guess, and vouches for nothing.
    const evidence = (await tx.select().from(sightings).where(and(
      eq(sightings.placeId, place.id), eq(sightings.status, "confirmed"), isNull(sightings.deletedAt),
    ))).map(s => s.keyframeId);
    if (evidence.length === 0) return { verified: false, evidence, levelId: room.levelId };
    await updateEntity(tx, "room", room.id, input.roomVersion, {
      verification: { status: "photo", evidence, verifiedAt: now.toISOString() },
    }, actorId);
    return { verified: true, evidence, levelId: room.levelId };
  });
}
