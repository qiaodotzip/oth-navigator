import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { captures, keyframes, levels, places, rooms, sightings } from "../db/schema";
import { updateEntity } from "../entities/repository";

export class BindRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BindRefusal";
  }
}

export type BindInput = { placeId: string; placeVersion: number; roomId: string; roomVersion: number };
export type Bound = { verified: boolean; evidence: string[]; levelId: string };

type Place = typeof places.$inferSelect;

/**
 * The floor a place is on, by the rule Bind places reads (`placeLevels` in
 * @oth/model): its own, or else the floor of the footage it was tagged in,
 * the one it was seen on most, a tie going to the lower floor. `filmed` says
 * which it was, so a refusal can say why. Null when no floor claims it.
 */
async function floorOf(tx: Database, place: Place): Promise<{ levelId: string; filmed: boolean } | null> {
  if (place.levelId) return { levelId: place.levelId, filmed: false };
  const seen = await tx.select({ levelId: captures.levelId, ordinal: levels.ordinal })
    .from(sightings)
    .innerJoin(keyframes, and(eq(keyframes.id, sightings.keyframeId), isNull(keyframes.deletedAt)))
    .innerJoin(captures, and(eq(captures.id, keyframes.captureId), isNull(captures.deletedAt)))
    .leftJoin(levels, and(eq(levels.id, captures.levelId), isNull(levels.deletedAt)))
    .where(and(eq(sightings.placeId, place.id), isNull(sightings.deletedAt)));
  const counts = new Map<string, { n: number; ordinal: number }>();
  for (const s of seen) {
    if (!s.levelId) continue;
    const tally = counts.get(s.levelId) ?? { n: 0, ordinal: s.ordinal ?? 0 };
    tally.n += 1;
    counts.set(s.levelId, tally);
  }
  const best = [...counts].sort((a, b) => b[1].n - a[1].n || a[1].ordinal - b[1].ordinal)[0];
  return best ? { levelId: best[0], filmed: true } : null;
}

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
 * its own floor, or any floor when none claims it.
 */
export async function bindPlace(db: Database, input: BindInput, actorId: string, now: Date = new Date()): Promise<Bound> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const [place] = await tx.select().from(places).where(and(eq(places.id, input.placeId), isNull(places.deletedAt)));
    if (!place) throw new BindRefusal(`There is no place ${input.placeId}.`);
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, input.roomId));
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
    const floor = await floorOf(tx, place);
    if (floor && floor.levelId !== room.levelId) {
      throw new BindRefusal(
        `${place.nameEn} ${floor.filmed ? "was filmed on" : "is on"} floor ${floor.levelId}, and room ${room.id} is on floor ${room.levelId}. ` +
        `Bind it to a room on ${floor.levelId}. If its floor is wrong, update the place with levelId ${room.levelId} first.`,
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
