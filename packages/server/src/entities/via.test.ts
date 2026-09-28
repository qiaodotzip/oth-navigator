import { describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { auditLog } from "../db/schema";
import { createTestDb } from "../testing/harness";
import { createEntity } from "./repository";
import { currentVia, withVia } from "./via";

const place = (id: string) => ({ id, nameEn: id, category: "retail" });

describe("withVia", () => {
  it("marks every audit row written inside it, a transaction's too, and nothing outside", async () => {
    const db = await createTestDb();
    await withVia("tok_1", async () => {
      await createEntity(db, "place", place("pl_1"), "u1");
      await db.transaction(async t => {
        await createEntity(t as unknown as Database, "place", place("pl_2"), "u1");
      });
    });
    await createEntity(db, "place", place("pl_3"), "u1");
    const rows = await db.select().from(auditLog);
    expect(Object.fromEntries(rows.map(r => [r.entityId, r.via]))).toEqual({ pl_1: "tok_1", pl_2: "tok_1", pl_3: null });
  });

  it("keeps two overlapping calls' marks apart", async () => {
    const db = await createTestDb();
    await Promise.all([
      withVia("tok_a", async () => {
        await createEntity(db, "place", place("pl_a1"), "u1");
        await db.transaction(async t => { await createEntity(t as unknown as Database, "place", place("pl_a2"), "u1"); });
      }),
      withVia("tok_b", async () => {
        await createEntity(db, "place", place("pl_b1"), "u2");
        await db.transaction(async t => { await createEntity(t as unknown as Database, "place", place("pl_b2"), "u2"); });
      }),
    ]);
    const rows = await db.select().from(auditLog);
    expect(Object.fromEntries(rows.map(r => [r.entityId, r.via]))).toEqual({
      pl_a1: "tok_a", pl_a2: "tok_a", pl_b1: "tok_b", pl_b2: "tok_b",
    });
  });

  it("is null outside any call", () => {
    expect(currentVia()).toBeNull();
  });
});
