import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { levelImages } from "../db/schema";
import { recordAudit } from "../entities/repository";

type Plan = typeof levelImages.$inferSelect;

export class KeepRefused extends Error {
  override name = "KeepRefused";
}

/** Enough of a plan to say which one it was. */
export type PlanNote = {
  id: string;
  filename: string;
  metresPerPixel: number | null;
  updatedAt: Date;
};

export type FloorFix = {
  levelId: string;
  kept: PlanNote;
  /** Named with `keep`, or the newest because nothing was named for this floor. */
  chosenBy: "keep" | "newest";
  retired: PlanNote[];
};

export type OnePlanResult = {
  /** Floors that had more than one live plan, in level id order. */
  fixed: FloorFix[];
  /** Floors that already had exactly one. Not news, but said, so a quiet run reads as done. */
  floorsWithOne: number;
};

/**
 * Last saved, then the greater id: the rule the editor's `imageForLevel`
 * uses to pick the plan it shows, so by default this keeps the one on screen.
 */
function newest(plans: Plan[]): Plan {
  return plans.reduce((best, p) => {
    const d = p.updatedAt.getTime() - best.updatedAt.getTime();
    return d > 0 || (d === 0 && p.id > best.id) ? p : best;
  });
}

const note = (p: Plan): PlanNote => ({
  id: p.id, filename: p.filename, metresPerPixel: p.metresPerPixel, updatedAt: p.updatedAt,
});

/**
 * Leaves every floor with one live plan, as an upload does.
 *
 * `plan:l1` used to add its drawing beside the floor's plan instead of in
 * place of it, which left L1 with two and the editor showing either. This
 * keeps the plan named by `keep` on its floor, and the newest on every other,
 * and retires the rest: a soft delete, a version on, and an audit entry, so
 * a wrong call is one `deletedAt` from undone.
 *
 * `keep` must be a live plan, or nothing is written. `dryRun` reports the
 * same without writing. A second run finds nothing to do.
 */
export async function onePlanPerFloor(
  db: Database,
  { keep, dryRun = false, actorId = "cli:plans" }: { keep?: string; dryRun?: boolean; actorId?: string } = {},
): Promise<OnePlanResult> {
  if (keep) {
    const [named] = await db.select().from(levelImages).where(eq(levelImages.id, keep));
    if (!named) throw new KeepRefused(`There is no floor plan ${keep}. Nothing was changed.`);
    if (named.deletedAt) {
      throw new KeepRefused(
        `${keep} (${named.filename}) was retired at ${named.deletedAt.toISOString()}. Nothing was changed.`,
      );
    }
  }

  const byFloor = new Map<string, Plan[]>();
  for (const p of await db.select().from(levelImages).where(isNull(levelImages.deletedAt))) {
    byFloor.set(p.levelId, [...(byFloor.get(p.levelId) ?? []), p]);
  }

  const result: OnePlanResult = { fixed: [], floorsWithOne: 0 };
  for (const levelId of [...byFloor.keys()].sort()) {
    const plans = byFloor.get(levelId)!;
    if (plans.length === 1) {
      result.floorsWithOne++;
      continue;
    }
    const named = plans.find(p => p.id === keep);
    const kept = named ?? newest(plans);
    const retired = plans.filter(p => p !== kept).sort((a, b) => a.id.localeCompare(b.id));
    result.fixed.push({ levelId, kept: note(kept), chosenBy: named ? "keep" : "newest", retired: retired.map(note) });
  }

  if (dryRun || result.fixed.length === 0) return result;

  // All of it or none: a conflict part-way leaves every floor as it was.
  await db.transaction(async t => {
    const tx = t as unknown as Database;
    const at = new Date();
    for (const fix of result.fixed) {
      for (const { id } of fix.retired) {
        const before = byFloor.get(fix.levelId)!.find(p => p.id === id)!;
        const [after] = await tx.update(levelImages)
          .set({ deletedAt: at, updatedAt: at, updatedBy: actorId, version: before.version + 1 })
          .where(and(eq(levelImages.id, id), eq(levelImages.version, before.version), isNull(levelImages.deletedAt)))
          .returning();
        if (!after) throw new Error(`${id} changed while this ran. Nothing was changed; run it again.`);
        await recordAudit(tx, "levelImage", id, "delete", actorId, before as Row, after as Row);
      }
    }
  });

  return result;
}
