import { randomUUID } from "node:crypto";
import { OBJECT_SIZE_GUESS, type Box, type ObjectKind, type ReviewStatus, type TenantCategory } from "@oth/model";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { captures, keyframes, objectKinds, places, sightings } from "../db/schema";
import { createEntity, updateEntity } from "../entities/repository";

export class TagRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TagRefusal";
  }
}

export type TagInput = {
  frameId: string;
  /** A place already surveyed. Otherwise nameEn and category make a new one. */
  placeId?: string;
  nameEn?: string;
  category?: TenantCategory;
  box?: Box;
  /** Set when what the frame shows is an object (spec §5.1): the tag goes on its kind's place. */
  object?: boolean;
  /** A new kind's size in metres; OBJECT_SIZE_GUESS when left out. Unused when the kind exists. */
  size?: ObjectKind["size"];
};

export type Tagged = {
  placeId: string;
  sightingId: string;
  newPlace: boolean;
  levelId: string | null;
  /**
   * How the tagged place stands. Review lists proposed places only, so a
   * proposed tag on a confirmed place waits for an accept run on that place.
   */
  placeStatus: ReviewStatus;
  /** The kind, when the tagged place is an object's. */
  objectKindId: string | null;
  /** A kind was made for this tag. */
  newKind: boolean;
  /** A proposal became its kind's place: "This is an object". */
  madeObject: boolean;
};

/** An id the model accepts (a slug) that nothing else has. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/** Names match as Survey matches them (editor/src/survey/suggest.ts normalName): case, inner spacing and the ends ignored. */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) !== "" && norm(a) === norm(b);
}

/** The kind a name means, or a new one at `size`: 6A's kindNamed and tagWrites, on the server. */
async function kindFor(tx: Database, name: string, size: ObjectKind["size"] | undefined, actorId: string): Promise<{ id: string; made: boolean }> {
  const kinds = await tx.select({ id: objectKinds.id, nameEn: objectKinds.nameEn }).from(objectKinds).where(isNull(objectKinds.deletedAt));
  const same = kinds.find(k => sameName(k.nameEn, name));
  if (same) return { id: same.id, made: false };
  const id = newId("ok");
  await createEntity(tx, "objectKind", { id, nameEn: name.trim(), size: size ?? { ...OBJECT_SIZE_GUESS } }, actorId);
  return { id, made: true };
}

/**
 * A place is tagged once a frame. An object's place may be tagged again, each
 * tag with its own box, since two bins in one frame are two bins (spec §5.4
 * places each).
 */
async function refuseTwice(tx: Database, frameId: string, place: { id: string; nameEn: string }, object: boolean, box: Box | undefined): Promise<void> {
  const [already] = await tx.select().from(sightings).where(and(
    eq(sightings.placeId, place.id), eq(sightings.keyframeId, frameId), isNull(sightings.deletedAt),
  ));
  if (!already) return;
  if (!object) throw new TagRefusal(`Frame ${frameId} already has a tag for ${place.nameEn} (${already.id}).`);
  if (!box || !already.box) {
    throw new TagRefusal(`Frame ${frameId} already has a tag for ${place.nameEn} (${already.id}). Two of an object in one frame are two tags, each with its own box.`);
  }
}

/**
 * What Survey's Tag writes (editor/src/survey/tagging.ts), as one
 * transaction: a new place when the name is new, filed under the floor its
 * frame was filmed on, and the sighting that ties it to the frame. `claim`
 * says whose it is. Claude Code's is a proposal Review decides (spec §11.3).
 */
export async function tagFrame(
  db: Database, input: TagInput, actorId: string, claim: { status: ReviewStatus; proposedBy: string },
): Promise<Tagged> {
  return db.transaction(async t => {
    const tx = t as unknown as Database;
    const [frame] = await tx.select().from(keyframes).where(and(eq(keyframes.id, input.frameId), isNull(keyframes.deletedAt)));
    if (!frame) throw new TagRefusal(`There is no frame ${input.frameId}.`);
    const [capture] = await tx.select().from(captures).where(eq(captures.id, frame.captureId));
    // Deleting footage is final, and Survey no longer shows its frames: a tag
    // there would be evidence nobody can look at.
    if (capture?.deletedAt) {
      throw new TagRefusal(`Frame ${frame.id} is from the footage ${capture.filename}, which was deleted. Tag a frame from footage still in Survey.`);
    }
    const levelId = capture?.levelId ?? null;

    if (input.size && !input.object) throw new TagRefusal("size goes with object only: it is a new kind's size.");
    let placeId: string;
    let newPlace = false;
    let placeStatus = claim.status;
    let objectKindId: string | null = null;
    let newKind = false;
    let madeObject = false;
    if (input.placeId) {
      const [place] = await tx.select().from(places).where(and(eq(places.id, input.placeId), isNull(places.deletedAt)));
      if (!place) throw new TagRefusal(`There is no place ${input.placeId}.`);
      await refuseTwice(tx, frame.id, place, Boolean(input.object || place.objectKindId), input.box);
      if (input.object && !place.objectKindId) {
        // Turning a confirmed place into an object is a person's call (spec §5.1: Claude proposes it).
        if (place.status !== "proposed") {
          throw new TagRefusal(
            `${place.nameEn} is a confirmed place, not an object yet. A person makes it one with This is an object in Places: ` +
            "tag it with its placeId as a place, and name it in your report.",
          );
        }
        const kind = await kindFor(tx, place.nameEn, input.size, actorId);
        await updateEntity(tx, "place", place.id, place.version, { objectKindId: kind.id }, actorId);
        objectKindId = kind.id;
        newKind = kind.made;
        madeObject = true;
      } else {
        objectKindId = place.objectKindId ?? null;
      }
      placeId = place.id;
      placeStatus = place.status as ReviewStatus;
    } else {
      if (!input.nameEn || !input.category) {
        throw new TagRefusal("Give either placeId, for a place already surveyed, or nameEn and category for a new one.");
      }
      const kind = input.object ? await kindFor(tx, input.nameEn, input.size, actorId) : null;
      const [kindPlace] = kind
        ? await tx.select().from(places).where(and(eq(places.objectKindId, kind.id), isNull(places.deletedAt))).orderBy(asc(places.id)).limit(1)
        : [];
      if (kind && kindPlace) {
        await refuseTwice(tx, frame.id, kindPlace, true, input.box);
        placeId = kindPlace.id;
        placeStatus = kindPlace.status as ReviewStatus;
      } else {
        placeId = newId("pl");
        newPlace = true;
        await createEntity(tx, "place", {
          id: placeId, nameEn: input.nameEn, category: input.category,
          // A kind is the same on every floor (Plan 6A), so its place is filed under none.
          ...(kind ? { objectKindId: kind.id } : levelId ? { levelId } : {}),
          status: claim.status, proposedBy: claim.proposedBy,
        }, actorId);
      }
      objectKindId = kind?.id ?? null;
      newKind = kind?.made ?? false;
    }

    const sightingId = newId("sg");
    await createEntity(tx, "sighting", {
      id: sightingId, placeId, keyframeId: frame.id, ...(input.box ? { box: input.box } : {}),
      status: claim.status, proposedBy: claim.proposedBy,
    }, actorId);
    return { placeId, sightingId, newPlace, levelId, placeStatus, objectKindId, newKind, madeObject };
  });
}
