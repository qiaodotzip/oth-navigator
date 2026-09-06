import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { BoxSchema, TenantCategorySchema } from "@oth/model";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import { captures, keyframes, places, sightings } from "../db/schema";

const ProposalSchema = z.object({
  keyframeId: z.string().min(1),
  nameEn: z.string().min(1),
  nameZh: z.string().default(""),
  category: TenantCategorySchema.default("retail"),
  box: BoxSchema.optional(),
  /** Set when the labeller recognised something already named. */
  placeId: z.string().optional(),
  /** A labeller reading a directory board knows the floor; a walkthrough may not. */
  levelId: z.string().optional(),
  note: z.string().default(""),
});

const FileSchema = z.object({
  captureId: z.string().min(1),
  proposals: z.array(ProposalSchema),
});

export type ImportResult = {
  places: number;
  sightings: number;
  linked: number;
  rejected: { index: number; reason: string }[];
};

/**
 * Reads a labelling agent's proposals back into the model, as proposals.
 *
 * Everything lands with status "proposed" and is invisible to the published
 * map until a person confirms it. The import is deliberately strict: a frame id
 * that does not exist, or a name nobody could read, is refused with its index
 * rather than quietly becoming a place that a reviewer then has to hunt down.
 */
export async function importProposals(
  db: Database, file: string, proposedBy = "claude-code",
): Promise<ImportResult> {
  const parsed = FileSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
  if (!parsed.success) throw new Error(`not a proposals file: ${parsed.error.message}`);
  const { captureId, proposals } = parsed.data;

  const [capture] = await db.select().from(captures).where(eq(captures.id, captureId));
  if (!capture) throw new Error(`no capture ${captureId}`);

  const frameIds = new Set(
    (await db.select().from(keyframes).where(eq(keyframes.captureId, captureId)))
      .map(f => f.id),
  );

  const result: ImportResult = { places: 0, sightings: 0, linked: 0, rejected: [] };

  // Existing names, so two proposals for one shop become one place.
  const byName = new Map(
    (await db.select().from(places)).map(p => [p.nameEn.trim().toLowerCase(), p.id]),
  );

  for (const [index, proposal] of proposals.entries()) {
    if (!frameIds.has(proposal.keyframeId)) {
      result.rejected.push({ index, reason: `no frame ${proposal.keyframeId} in this capture` });
      continue;
    }

    let placeId = proposal.placeId;
    if (placeId) {
      const [exists] = await db.select().from(places).where(eq(places.id, placeId));
      if (!exists) {
        result.rejected.push({ index, reason: `no place ${placeId}` });
        continue;
      }
      result.linked++;
    } else {
      const key = proposal.nameEn.trim().toLowerCase();
      const already = byName.get(key);
      if (already) {
        placeId = already;
        result.linked++;
      } else {
        placeId = `pl_${randomUUID()}`;
        await db.insert(places).values({
          id: placeId,
          nameEn: proposal.nameEn.trim(),
          nameZh: proposal.nameZh,
          category: proposal.category,
          levelId: proposal.levelId ?? capture.levelId,
          notes: proposal.note,
          status: "proposed",
          proposedBy,
          updatedBy: `cli:${proposedBy}`,
        });
        byName.set(key, placeId);
        result.places++;
      }
    }

    await db.insert(sightings).values({
      id: `sg_${randomUUID()}`,
      placeId,
      keyframeId: proposal.keyframeId,
      box: proposal.box ?? null,
      status: "proposed",
      proposedBy,
      updatedBy: `cli:${proposedBy}`,
    });
    result.sightings++;
  }

  return result;
}

/** Which ids a proposals file would touch, without writing anything. */
export async function countProposals(file: string): Promise<number> {
  const parsed = FileSchema.parse(JSON.parse(await readFile(file, "utf8")));
  return parsed.proposals.length;
}

export { FileSchema as ProposalsFileSchema };
