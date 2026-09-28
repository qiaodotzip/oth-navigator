import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { buildings, levels, places as placeRows, sightings as sightingRows } from "../db/schema";
import { createEntity, listEntities } from "../entities/repository";
import { createTestDb, json } from "../testing/harness";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

const post = (path: string, body: unknown, headers: Record<string, string> = { cookie }) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const del = (path: string, body: unknown) =>
  app.request(path, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, dataDir: await mkdtemp(join(tmpdir(), "oth-review-")) });
  const wei = await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: wei.id }),
  })).headers.get("set-cookie") ?? "";

  // Floors accept and reopen can file a place under, and validate against.
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values([
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 6 },
  ]);

  // What a labelling agent leaves behind: a proposed place, seen in two frames.
  await createEntity(db, "place", {
    id: "pl_1", nameEn: "Festve Mall", category: "retail", status: "proposed", proposedBy: "claude-code",
  }, null);
  for (const [id, kf] of [["sg_1", "kf_1"], ["sg_2", "kf_2"]]) {
    await createEntity(db, "sighting", { id, placeId: "pl_1", keyframeId: kf, status: "proposed" }, null);
  }
  // Someone else's place, which accepting pl_1 must not touch.
  await createEntity(db, "place", { id: "pl_2", nameEn: "Other", category: "retail", status: "proposed" }, null);
  await createEntity(db, "sighting", { id: "sg_3", placeId: "pl_2", keyframeId: "kf_1", status: "proposed" }, null);
});

const byId = async (type: "place" | "sighting") =>
  new Map((await listEntities(db, type)).map(r => [String(r.id), r]));

describe("accepting a proposal", () => {
  it("confirms the place, with its corrections, and every sighting of it in one call", async () => {
    const res = await post("/api/places/pl_1/accept", {
      expectedVersion: 0, nameEn: "Festive Mall", category: "lifestyle",
    });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ sightings: 2 });

    const places = await byId("place");
    expect(places.get("pl_1")).toMatchObject({ status: "confirmed", nameEn: "Festive Mall", category: "lifestyle" });
    const sightings = await byId("sighting");
    expect(sightings.get("sg_1")?.status).toBe("confirmed");
    expect(sightings.get("sg_2")?.status).toBe("confirmed");
    expect(sightings.get("sg_3")?.status).toBe("proposed");
  });

  it("refuses a stale version and changes nothing, so a teammate's edit is not lost", async () => {
    const res = await post("/api/places/pl_1/accept", { expectedVersion: 7, nameEn: "X", category: "retail" });
    expect(res.status).toBe(409);
    expect((await byId("place")).get("pl_1")?.status).toBe("proposed");
    expect((await byId("sighting")).get("sg_1")?.status).toBe("proposed");
  });

  it("404s a place that does not exist", async () => {
    const res = await post("/api/places/pl_nope/accept", { expectedVersion: 0, nameEn: "X", category: "retail" });
    expect(res.status).toBe(404);
  });

  it("requires a signed-in reviewer", async () => {
    const res = await post("/api/places/pl_1/accept", { expectedVersion: 0, nameEn: "X", category: "retail" }, {});
    expect(res.status).toBe(401);
  });

  it("files a place with no floor under the floor it was accepted on", async () => {
    await post("/api/places/pl_1/accept", { expectedVersion: 0, nameEn: "Festive Mall", category: "retail", levelId: "oth-L1" });
    expect((await byId("place")).get("pl_1")?.levelId).toBe("oth-L1");
  });

  it("never moves a place off the floor it already has, even though the client always sends one", async () => {
    await db.update(placeRows).set({ levelId: "oth-L2" }).where(eq(placeRows.id, "pl_1"));
    await post("/api/places/pl_1/accept", { expectedVersion: 0, nameEn: "Festive Mall", category: "retail", levelId: "oth-L1" });
    expect((await byId("place")).get("pl_1")?.levelId).toBe("oth-L2");
  });

  it("answers 500 when an accept fails for a reason that is not the request, so the client offers Retry", async () => {
    // A dropped connection read as "Couldn't accept Gate 1: invalid." with no way on.
    vi.spyOn(db, "transaction").mockRejectedValue(new Error("Connection terminated unexpectedly"));
    const res = await post("/api/places/pl_1/accept", { expectedVersion: 0, nameEn: "Festive Mall", category: "retail" });
    expect(res.status).toBe(500);
  });

  it("422s an unknown floor and writes nothing", async () => {
    const res = await post("/api/places/pl_1/accept", { expectedVersion: 0, nameEn: "Festive Mall", category: "retail", levelId: "oth-nope" });
    expect(res.status).toBe(422);
    expect(await json(res)).toMatchObject({ error: "There is no floor oth-nope." });
    expect((await byId("place")).get("pl_1")).toMatchObject({ status: "proposed", version: 0 });
    expect((await byId("sighting")).get("sg_1")).toMatchObject({ status: "proposed", version: 0 });
  });

  it("confirms only the tags that were still claims, and says which, for Undo", async () => {
    await createEntity(db, "sighting", { id: "sg_h", placeId: "pl_1", keyframeId: "kf_3", status: "confirmed" }, null);
    const res = await post("/api/places/pl_1/accept", { expectedVersion: 0, nameEn: "Festive Mall", category: "retail" });
    const body = await json<{ sightings: number; confirmed: string[] }>(res);
    expect(body.sightings).toBe(2);
    expect([...body.confirmed].sort()).toEqual(["sg_1", "sg_2"]);
    // Typed by a person, so already theirs: untouched.
    expect((await byId("sighting")).get("sg_h")?.version).toBe(0);
  });
});

describe("rejecting a proposal", () => {
  it("retires the place and its sightings together, recoverably", async () => {
    const res = await post("/api/places/pl_1/reject", { expectedVersion: 0 });
    expect(res.status).toBe(200);
    const places = await byId("place");
    expect(places.has("pl_1")).toBe(false);
    expect(places.has("pl_2")).toBe(true);
    const sightings = await byId("sighting");
    expect([...sightings.keys()]).toEqual(["sg_3"]);
  });

  it("refuses a stale version", async () => {
    expect((await post("/api/places/pl_1/reject", { expectedVersion: 3 })).status).toBe(409);
    expect((await byId("place")).has("pl_1")).toBe(true);
  });
});

describe("undoing a reject", () => {
  it("stamps the place and its tags with one moment", async () => {
    await post("/api/places/pl_1/reject", { expectedVersion: 0 });
    const [place] = await db.select().from(placeRows).where(eq(placeRows.id, "pl_1"));
    const tags = await db.select().from(sightingRows).where(eq(sightingRows.placeId, "pl_1"));
    expect(tags).toHaveLength(2);
    for (const tag of tags) expect(tag.deletedAt?.getTime()).toBe(place!.deletedAt?.getTime());
  });

  it("brings the tags back with the place", async () => {
    await post("/api/places/pl_1/reject", { expectedVersion: 0 });
    const res = await post("/api/entities/place/pl_1/restore", { expectedVersion: 1 });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ sightings: 2 });
    expect((await byId("place")).get("pl_1")?.status).toBe("proposed");
    expect([...(await byId("sighting")).keys()].sort()).toEqual(["sg_1", "sg_2", "sg_3"]);
  });

  it("leaves a tag removed by hand before the reject removed", async () => {
    await del("/api/entities/sighting/sg_2", { expectedVersion: 0 });
    // Stamps are to the millisecond; make sure the reject's is a later one.
    await new Promise(resolve => setTimeout(resolve, 5));
    await post("/api/places/pl_1/reject", { expectedVersion: 0 });
    await post("/api/entities/place/pl_1/restore", { expectedVersion: 1 });
    expect([...(await byId("sighting")).keys()].sort()).toEqual(["sg_1", "sg_3"]);
  });

  it("refuses when someone has touched the place since, and brings nothing back", async () => {
    await post("/api/places/pl_1/reject", { expectedVersion: 0 });
    expect((await post("/api/entities/place/pl_1/restore", { expectedVersion: 0 })).status).toBe(409);
    expect((await byId("sighting")).has("sg_1")).toBe(false);
  });
});

describe("undoing an accept", () => {
  async function accepted(): Promise<string[]> {
    await createEntity(db, "sighting", { id: "sg_h", placeId: "pl_1", keyframeId: "kf_3", status: "confirmed" }, null);
    const res = await post("/api/places/pl_1/accept", {
      expectedVersion: 0, nameEn: "Festive Mall", category: "lifestyle", levelId: "oth-L1",
    });
    return (await json<{ confirmed: string[] }>(res)).confirmed;
  }

  it("puts the proposal back as it was, and the tags it confirmed back to claims", async () => {
    const confirmed = await accepted();
    const res = await post("/api/places/pl_1/reopen", {
      expectedVersion: 1, nameEn: "Festve Mall", category: "retail", levelId: null, sightingIds: confirmed,
    });
    expect(res.status).toBe(200);
    expect((await byId("place")).get("pl_1")).toMatchObject({
      status: "proposed", nameEn: "Festve Mall", category: "retail", levelId: null,
    });
    const tags = await byId("sighting");
    expect(tags.get("sg_1")?.status).toBe("proposed");
    expect(tags.get("sg_2")?.status).toBe("proposed");
    expect(tags.get("sg_h")?.status).toBe("confirmed");
  });

  it("refuses when someone has changed the place since, and changes nothing", async () => {
    const confirmed = await accepted();
    const res = await post("/api/places/pl_1/reopen", {
      expectedVersion: 0, nameEn: "Festve Mall", category: "retail", levelId: null, sightingIds: confirmed,
    });
    expect(res.status).toBe(409);
    expect((await byId("place")).get("pl_1")?.status).toBe("confirmed");
    expect((await byId("sighting")).get("sg_1")?.status).toBe("confirmed");
  });

  it("400s a body without what it puts back", async () => {
    expect((await post("/api/places/pl_1/reopen", { expectedVersion: 1 })).status).toBe(400);
  });
});

describe("Same as…", () => {
  // The place already on the map that the proposal turns out to be.
  beforeEach(async () => {
    await createEntity(db, "place", {
      id: "pl_c", nameEn: "Festive Mall", category: "retail", status: "confirmed", levelId: "oth-L1",
    }, null);
  });

  type Moved = { id: string; status: string };
  const byIdOrder = (a: Moved, b: Moved) => a.id.localeCompare(b.id);

  it("moves the proposal's tags to that place, confirmed, and retires the proposal", async () => {
    const res = await post("/api/places/pl_1/merge", { expectedVersion: 0, into: "pl_c" });
    expect(res.status).toBe(200);
    const body = await json<{ moved: Moved[] }>(res);
    expect([...body.moved].sort(byIdOrder)).toEqual([
      { id: "sg_1", status: "proposed" }, { id: "sg_2", status: "proposed" },
    ]);
    expect((await byId("place")).has("pl_1")).toBe(false);
    const tags = await byId("sighting");
    expect(tags.get("sg_1")).toMatchObject({ placeId: "pl_c", status: "confirmed" });
    expect(tags.get("sg_2")).toMatchObject({ placeId: "pl_c", status: "confirmed" });
    expect(tags.get("sg_3")?.placeId).toBe("pl_2");
  });

  it("refuses to merge a place into itself", async () => {
    expect((await post("/api/places/pl_1/merge", { expectedVersion: 0, into: "pl_1" })).status).toBe(422);
  });

  it("404s a place to merge into that is gone, and changes nothing", async () => {
    await post("/api/places/pl_2/reject", { expectedVersion: 0 });
    expect((await post("/api/places/pl_1/merge", { expectedVersion: 0, into: "pl_2" })).status).toBe(404);
    expect((await byId("place")).has("pl_1")).toBe(true);
  });

  it("refuses a stale version and moves nothing", async () => {
    expect((await post("/api/places/pl_1/merge", { expectedVersion: 5, into: "pl_c" })).status).toBe(409);
    expect((await byId("sighting")).get("sg_1")?.placeId).toBe("pl_1");
  });

  it("is undone exactly: the proposal back, each tag back to it as it stood", async () => {
    await createEntity(db, "sighting", { id: "sg_h", placeId: "pl_1", keyframeId: "kf_3", status: "confirmed" }, null);
    const merged = await json<{ moved: Moved[] }>(await post("/api/places/pl_1/merge", { expectedVersion: 0, into: "pl_c" }));
    const res = await post("/api/places/pl_1/unmerge", { expectedVersion: 1, moved: merged.moved });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ sightings: 3 });
    expect((await byId("place")).get("pl_1")?.status).toBe("proposed");
    const tags = await byId("sighting");
    expect(tags.get("sg_1")).toMatchObject({ placeId: "pl_1", status: "proposed" });
    expect(tags.get("sg_h")).toMatchObject({ placeId: "pl_1", status: "confirmed" });
  });

  it("refuses to unmerge a place that was never merged away", async () => {
    expect((await post("/api/places/pl_1/unmerge", { expectedVersion: 0, moved: [] })).status).toBe(422);
  });
});
