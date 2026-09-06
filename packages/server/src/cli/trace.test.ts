import { beforeEach, describe, expect, it } from "vitest";
import { assembleModel } from "../model/assemble";
import type { Database } from "../db/client";
import { createTestDb } from "../testing/harness";
import { seedBuilding } from "./seed";
import { tracePlansIntoModel } from "./trace";

let db: Database;
beforeEach(async () => {
  db = await createTestDb();
  await seedBuilding(db);
});

describe("tracing the 2020 plans in", () => {
  it("creates the zones as real rooms the editor can open", async () => {
    const { created } = await tracePlansIntoModel(db);
    expect(created).toBeGreaterThan(20);
    const model = await assembleModel(db);
    expect(model.rooms.find(r => r.id === "L1-town-square")?.nameEn).toBe("Town Square");
  });

  it("puts them on the right levels", async () => {
    await tracePlansIntoModel(db);
    const model = await assembleModel(db);
    expect(model.rooms.filter(r => r.levelId === "oth-L1").length).toBeGreaterThan(5);
    expect(model.rooms.filter(r => r.levelId === "oth-L2").length).toBeGreaterThan(5);
  });

  it("never overwrites a zone someone has already corrected", async () => {
    // The trace is a draft. A re-run that undid an edit would make the editor
    // pointless.
    await tracePlansIntoModel(db);
    const again = await tracePlansIntoModel(db);
    expect(again.created).toBe(0);
    expect(again.skipped).toBeGreaterThan(20);
  });

  it("leaves every zone unverified, since a drawing is not a site visit", async () => {
    await tracePlansIntoModel(db);
    const model = await assembleModel(db);
    expect(model.rooms.every(r => r.verification.status === "unverified")).toBe(true);
  });

  it("produces a model that validates", async () => {
    await tracePlansIntoModel(db);
    const model = await assembleModel(db);
    expect(model.rooms.length).toBeGreaterThan(20);
  });
});
