import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../db/client";
import { pathwayKinds, places, sightings } from "../db/schema";
import { createTestDb } from "../testing/harness";
import { TIDY_DECISIONS, tidySurvey, withNote } from "./surveyTidy";

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(pathwayKinds).values({ id: "pk-1", nameEn: "Covered link", colorHex: "#38bdf8" });
});

async function place(id: string, nameEn: string, extra: Record<string, unknown> = {}) {
  await db.insert(places).values({ id, nameEn, category: "facility", ...extra } as never);
  return id;
}

async function row(id: string) {
  const [r] = await db.select().from(places).where(eq(places.id, id));
  return r;
}

describe("survey:tidy", () => {
  it("removes a carnival, which will not be there next month", async () => {
    await place("pl_1", "Carnival (event)", { category: "community" });
    const r = await tidySurvey(db);
    expect(r.removed.map(p => p.name)).toContain("Carnival (event)");
    expect((await row("pl_1"))?.deletedAt).not.toBeNull();
  });

  it("keeps the sightings of something it removed, as evidence it was there", async () => {
    await place("pl_1", "Double Storey Carousel", { category: "lifestyle" });
    await db.insert(sightings).values({ id: "sg_1", placeId: "pl_1", keyframeId: "kf_a" });
    const r = await tidySurvey(db);
    expect(r.removed.find(p => p.name === "Double Storey Carousel")?.sightings).toBe(1);
    const [s] = await db.select().from(sightings).where(eq(sightings.id, "sg_1"));
    expect(s?.deletedAt ?? null).toBeNull();
  });

  it("leaves a permanent playground alone, however much it looks like a ride", async () => {
    await place("pl_1", "Children's playground (Festive Walk)", { category: "lifestyle" });
    await tidySurvey(db);
    expect((await row("pl_1"))?.deletedAt ?? null).toBeNull();
  });

  it("leaves the arcade tenants alone", async () => {
    await place("pl_1", "Timezone", { category: "lifestyle" });
    await place("pl_2", "J'Kids Amusement", { category: "lifestyle" });
    await tidySurvey(db);
    expect((await row("pl_1"))?.deletedAt ?? null).toBeNull();
    expect((await row("pl_2"))?.deletedAt ?? null).toBeNull();
  });

  it("takes the walkway kind off an escalator, and says it was one", async () => {
    await place("pl_1", "Escalator (Gate 1 forecourt)", { pathwayKindId: "pk-1" });
    const r = await tidySurvey(db);
    expect(r.portals).toContainEqual({ name: "Escalator (Gate 1 forecourt)", wasWalkway: true });
    const after = await row("pl_1");
    expect(after?.pathwayKindId).toBeNull();
    expect(after?.category).toBe("facility");
    expect(after?.notes).toMatch(/portal: escalator/);
  });

  it("notes an escalator that was never tagged a walkway, without claiming it was", async () => {
    await place("pl_1", "Escalator (hawker centre)");
    const r = await tidySurvey(db);
    expect(r.portals).toContainEqual({ name: "Escalator (hawker centre)", wasWalkway: false });
  });

  it("flags an escalator labelled after this list was written", async () => {
    await place("pl_1", "Escalator (Gate 9, added later)", { pathwayKindId: "pk-1" });
    const r = await tidySurvey(db);
    expect(r.suspects).toEqual(["Escalator (Gate 9, added later)"]);
  });

  it("does not flag a walkway that merely sounds like one", async () => {
    await place("pl_1", "Rainbow walkway", { pathwayKindId: "pk-1", category: "community" });
    const r = await tidySurvey(db);
    expect(r.suspects).toEqual([]);
  });

  it("says which names it could not find, rather than reporting success", async () => {
    const r = await tidySurvey(db);
    expect(r.missing).toContain("Carnival (event)");
    expect(r.removed).toEqual([]);
  });

  it("calls a name it already removed done, not missing", async () => {
    await place("pl_1", "Carnival (event)", { category: "community" });
    await tidySurvey(db);
    const again = await tidySurvey(db);
    expect(again.alreadyDone).toContain("Carnival (event)");
    expect(again.missing).not.toContain("Carnival (event)");
  });

  it("runs twice without changing anything the second time", async () => {
    await place("pl_1", "Escalator (Festive Mall)", { pathwayKindId: "pk-1" });
    await place("pl_2", "National Day event stage", { category: "community" });
    await tidySurvey(db);
    const first = await row("pl_1");
    const again = await tidySurvey(db);
    expect(again.removed).toEqual([]);
    expect(again.portals).toEqual([]);
    expect((await row("pl_1"))?.version).toBe(first?.version);
    expect((await row("pl_1"))?.notes).toBe(first?.notes);
  });

  it("decides every escalator and staircase it knows about", () => {
    const climbs = TIDY_DECISIONS.filter(d => /escalator|stair/i.test(d.name));
    expect(climbs.length).toBeGreaterThan(0);
    for (const d of climbs) expect(d.action).toBe("portal");
  });

  it("reports without writing when asked to look only", async () => {
    await place("pl_1", "National Day event stage", { category: "community" });
    await place("pl_2", "Escalator (Festive Mall)", { pathwayKindId: "pk-1" });
    const r = await tidySurvey(db, { dryRun: true });
    expect(r.removed.map(p => p.name)).toEqual(["National Day event stage"]);
    expect(r.portals.map(p => p.name)).toEqual(["Escalator (Festive Mall)"]);
    expect((await row("pl_1"))?.deletedAt ?? null).toBeNull();
    expect((await row("pl_2"))?.pathwayKindId).toBe("pk-1");
  });

  it("decides each name once", () => {
    const names = TIDY_DECISIONS.map(d => d.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives a reason for every decision, so the list can be argued with", () => {
    for (const d of TIDY_DECISIONS) expect(d.reason.length).toBeGreaterThan(3);
  });
});

describe("withNote", () => {
  it("appends to an existing note", () => {
    expect(withNote("seen on L1", "portal: escalator")).toBe("seen on L1 — portal: escalator");
  });

  it("does not repeat itself", () => {
    expect(withNote("portal: escalator", "portal: escalator")).toBe("portal: escalator");
  });
});
