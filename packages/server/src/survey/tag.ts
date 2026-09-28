import { randomUUID } from "node:crypto";
import type { Box, ReviewStatus, TenantCategory } from "@oth/model";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { captures, keyframes, places, sightings } from "../db/schema";
import { createEntity } from "../entities/repository";

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
};

/** An id the model accepts (a slug) that nothing else has. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
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

    let placeId: string;
    let newPlace = false;
    let placeStatus = claim.status;
    if (input.placeId) {
      const [place] = await tx.select().from(places).where(and(eq(places.id, input.placeId), isNull(places.deletedAt)));
      if (!place) throw new TagRefusal(`There is no place ${input.placeId}.`);
      const [already] = await tx.select().from(sightings).where(and(
        eq(sightings.placeId, place.id), eq(sightings.keyframeId, frame.id), isNull(sightings.deletedAt),
      ));
      if (already) throw new TagRefusal(`Frame ${frame.id} already has a tag for ${place.nameEn} (${already.id}).`);
      placeId = place.id;
      placeStatus = place.status as ReviewStatus;
    } else {
      if (!input.nameEn || !input.category) {
        throw new TagRefusal("Give either placeId, for a place already surveyed, or nameEn and category for a new one.");
      }
      placeId = newId("pl");
      newPlace = true;
      await createEntity(tx, "place", {
        id: placeId, nameEn: input.nameEn, category: input.category,
        ...(levelId ? { levelId } : {}),
        status: claim.status, proposedBy: claim.proposedBy,
      }, actorId);
    }

    const sightingId = newId("sg");
    await createEntity(tx, "sighting", {
      id: sightingId, placeId, keyframeId: frame.id, ...(input.box ? { box: input.box } : {}),
      status: claim.status, proposedBy: claim.proposedBy,
    }, actorId);
    return { placeId, sightingId, newPlace, levelId, placeStatus };
  });
}
