import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { assembleModel } from "../model/assemble";
import type { Database } from "../db/client";
import { levelImages } from "../db/schema";
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

describe("keeping the underlay honest", () => {
  async function addImage(metresPerPixel: number | null) {
    await db.insert(levelImages).values({
      id: "img_1",
      levelId: "oth-L1",
      filename: "1st-Storey_Updated_300DPI-3000x2121.jpg",
      storagePath: "a/b.jpg",
      checksum: "c",
      widthPx: 3000,
      heightPx: 2121,
      sizeBytes: 1,
      metresPerPixel,
      uploadedBy: "test",
    });
  }

  const image = async () =>
    (await db.select().from(levelImages).where(eq(levelImages.id, "img_1")))[0]!;

  it("corrects a floorplan calibrated from the sheet's own wrong scale bar", async () => {
    // 0.07 is what measuring the printed bar gives, and it is a third of the truth.
    await addImage(0.07);
    const { recalibrated } = await tracePlansIntoModel(db);
    expect(recalibrated).toBe(1);
    expect((await image()).metresPerPixel).toBeCloseTo(0.21, 5);
  });

  it("places the image so the trace lands on top of it", async () => {
    await addImage(0.07);
    await tracePlansIntoModel(db);
    const img = await image();
    // The origin is sheet pixel (950, 1750), so the image's top-left corner is
    // west of and above the model origin.
    expect(img.offsetX).toBeCloseTo(-199.5, 3);
    expect(img.offsetY).toBeCloseTo(367.5, 3);
  });

  it("calibrates a floorplan nobody has measured yet", async () => {
    await addImage(null);
    await tracePlansIntoModel(db);
    expect((await image()).metresPerPixel).toBeCloseTo(0.21, 5);
  });

  it("leaves an already-correct underlay alone", async () => {
    await addImage(0.07);
    await tracePlansIntoModel(db);
    const again = await tracePlansIntoModel(db);
    expect(again.recalibrated).toBe(0);
  });

  it("ignores a floorplan that is not the sheet the trace came from", async () => {
    await db.insert(levelImages).values({
      id: "img_2", levelId: "oth-L1", filename: "someone-elses-plan.png",
      storagePath: "a/c.png", checksum: "d", widthPx: 100, heightPx: 100,
      sizeBytes: 1, metresPerPixel: 0.5, uploadedBy: "test",
    });
    const { recalibrated } = await tracePlansIntoModel(db);
    expect(recalibrated).toBe(0);
    const [other] = await db.select().from(levelImages).where(eq(levelImages.id, "img_2"));
    expect(other!.metresPerPixel).toBe(0.5);
  });
});
