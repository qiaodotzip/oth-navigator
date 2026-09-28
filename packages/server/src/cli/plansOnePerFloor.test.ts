import { eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { auditLog, levelImages } from "../db/schema";
import { createTestDb } from "../testing/harness";
import { KeepRefused, onePlanPerFloor } from "./plansOnePerFloor";

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

async function plan(id: string, levelId: string, updatedAt: string, extra: Record<string, unknown> = {}) {
  await db.insert(levelImages).values({
    id, levelId, filename: `${id}.jpg`, storagePath: `assets/${id}.jpg`, checksum: id,
    widthPx: 3000, heightPx: 2121, sizeBytes: 1, metresPerPixel: 0.21,
    updatedAt: new Date(updatedAt), ...extra,
  });
}

async function row(id: string) {
  const [r] = await db.select().from(levelImages).where(eq(levelImages.id, id));
  return r;
}

const live = async () =>
  (await db.select().from(levelImages).where(isNull(levelImages.deletedAt))).map(i => i.id).sort();

describe("plans:one-per-floor", () => {
  it("keeps the newest of a floor's plans and retires the rest", async () => {
    await plan("img_old", "oth-L1", "2026-09-01T00:00:00Z");
    await plan("img_new", "oth-L1", "2026-09-02T00:00:00Z");
    const r = await onePlanPerFloor(db);
    expect(r.fixed).toHaveLength(1);
    expect(r.fixed[0]?.kept.id).toBe("img_new");
    expect(r.fixed[0]?.chosenBy).toBe("newest");
    expect(r.fixed[0]?.retired.map(p => p.id)).toEqual(["img_old"]);
    expect(await live()).toEqual(["img_new"]);
    const old = await row("img_old");
    expect(old?.updatedBy).toBe("cli:plans");
    expect(old?.version).toBe(1);
    expect((await row("img_new"))?.version).toBe(0);
  });

  it("keeps the plan it is told to, even when it is not the newest", async () => {
    await plan("img_traced", "oth-L1", "2026-09-01T00:00:00Z", { metresPerPixel: 0.07 });
    await plan("img_edited", "oth-L1", "2026-09-02T00:00:00Z");
    const r = await onePlanPerFloor(db, { keep: "img_traced" });
    expect(r.fixed[0]?.kept.id).toBe("img_traced");
    expect(r.fixed[0]?.chosenBy).toBe("keep");
    expect(await live()).toEqual(["img_traced"]);
  });

  it("breaks a tie by id, as the editor does", async () => {
    await plan("img_a", "oth-L1", "2026-09-01T00:00:00Z");
    await plan("img_b", "oth-L1", "2026-09-01T00:00:00Z");
    await onePlanPerFloor(db);
    expect(await live()).toEqual(["img_b"]);
  });

  it("puts each retirement on the record, so it can be undone", async () => {
    await plan("img_old", "oth-L1", "2026-09-01T00:00:00Z");
    await plan("img_new", "oth-L1", "2026-09-02T00:00:00Z");
    await onePlanPerFloor(db);
    const trail = await db.select().from(auditLog).where(eq(auditLog.entityId, "img_old"));
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({ entityType: "levelImage", action: "delete", actorId: "cli:plans" });
    expect((trail[0]?.before as { deletedAt: unknown }).deletedAt).toBeNull();
    expect((trail[0]?.after as { deletedAt: unknown }).deletedAt).toEqual(expect.any(String));
    expect(await db.select().from(auditLog).where(eq(auditLog.entityId, "img_new"))).toEqual([]);
  });

  it("leaves a floor with one plan alone, and counts only live plans", async () => {
    await plan("img_l1", "oth-L1", "2026-09-01T00:00:00Z");
    await plan("img_l1_gone", "oth-L1", "2026-09-03T00:00:00Z", { deletedAt: new Date("2026-09-04T00:00:00Z") });
    await plan("img_l2", "oth-L2", "2026-09-01T00:00:00Z");
    const r = await onePlanPerFloor(db);
    expect(r.fixed).toEqual([]);
    expect(r.floorsWithOne).toBe(2);
    expect(await live()).toEqual(["img_l1", "img_l2"]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("fixes each floor on its own", async () => {
    await plan("img_l1_old", "oth-L1", "2026-09-01T00:00:00Z");
    await plan("img_l1_new", "oth-L1", "2026-09-02T00:00:00Z");
    await plan("img_l2_old", "oth-L2", "2026-09-05T00:00:00Z");
    await plan("img_l2_new", "oth-L2", "2026-09-06T00:00:00Z");
    // Named for L1; L2 still goes by the default.
    const r = await onePlanPerFloor(db, { keep: "img_l1_old" });
    expect(r.fixed.map(f => [f.levelId, f.kept.id, f.chosenBy])).toEqual([
      ["oth-L1", "img_l1_old", "keep"],
      ["oth-L2", "img_l2_new", "newest"],
    ]);
    expect(await live()).toEqual(["img_l1_old", "img_l2_new"]);
  });

  it("writes nothing on a dry run, and says what it would have done", async () => {
    await plan("img_old", "oth-L1", "2026-09-01T00:00:00Z");
    await plan("img_new", "oth-L1", "2026-09-02T00:00:00Z");
    const r = await onePlanPerFloor(db, { dryRun: true });
    expect(r.fixed[0]?.retired.map(p => p.id)).toEqual(["img_old"]);
    expect(await live()).toEqual(["img_new", "img_old"]);
    expect((await row("img_old"))?.version).toBe(0);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("does nothing on a second run", async () => {
    await plan("img_old", "oth-L1", "2026-09-01T00:00:00Z", { metresPerPixel: 0.07 });
    await plan("img_new", "oth-L1", "2026-09-02T00:00:00Z");
    await onePlanPerFloor(db, { keep: "img_old" });
    const again = await onePlanPerFloor(db, { keep: "img_old" });
    expect(again.fixed).toEqual([]);
    expect(again.floorsWithOne).toBe(1);
    expect(await db.select().from(auditLog)).toHaveLength(1);
    expect((await row("img_old"))?.version).toBe(0);
  });

  it("refuses a plan to keep that is not a live one, and writes nothing", async () => {
    await plan("img_old", "oth-L1", "2026-09-01T00:00:00Z");
    await plan("img_new", "oth-L1", "2026-09-02T00:00:00Z");
    await plan("img_gone", "oth-L1", "2026-09-03T00:00:00Z", { deletedAt: new Date("2026-09-04T00:00:00Z") });
    await expect(onePlanPerFloor(db, { keep: "img_typo" })).rejects.toBeInstanceOf(KeepRefused);
    await expect(onePlanPerFloor(db, { keep: "img_gone" })).rejects.toThrow(/retired/);
    expect(await live()).toEqual(["img_new", "img_old"]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });
});
