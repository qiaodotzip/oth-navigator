import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
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

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, dataDir: await mkdtemp(join(tmpdir(), "oth-review-")) });
  await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "wei@example.com", password: "passphrase" }),
  })).headers.get("set-cookie") ?? "";

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
