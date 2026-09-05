import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { buildings, levels } from "../db/schema";
import { createTestDb, json } from "../testing/harness";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

const roomData = {
  id: "L1-lobby", levelId: "oth-L1", kind: "area",
  footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  heightM: 6, walkable: true, nameEn: "Lobby", nameZh: "大堂",
};

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db });
  await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "wei@example.com", password: "passphrase" }),
  })).headers.get("set-cookie") ?? "";
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1,
    nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6,
  });
});

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });

const patch = (path: string, body: unknown) =>
  app.request(path, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });

describe("entity routes", () => {
  it("requires authentication", async () => {
    expect((await app.request("/api/entities/room")).status).toBe(401);
  });

  it("creates and lists a room", async () => {
    expect((await post("/api/entities/room", { data: roomData })).status).toBe(201);
    const list = await app.request("/api/entities/room", { headers: { cookie } });
    expect((await json<{ items: unknown[] }>(list)).items).toHaveLength(1);
  });

  it("400s an unknown entity type", async () => {
    expect((await post("/api/entities/wormhole", { data: {} })).status).toBe(400);
  });

  it("422s data the model schema rejects", async () => {
    expect((await post("/api/entities/room", { data: { ...roomData, footprint: [[0, 0]] } })).status).toBe(422);
  });

  it("409s a stale update and returns the current state", async () => {
    await post("/api/entities/room", { data: roomData });
    await patch("/api/entities/room/L1-lobby", { expectedVersion: 0, data: { nameEn: "First" } });
    const res = await patch("/api/entities/room/L1-lobby", { expectedVersion: 0, data: { nameEn: "Second" } });
    expect(res.status).toBe(409);
    expect((await json<{ current: { nameEn: string } }>(res)).current.nameEn).toBe("First");
  });

  it("soft-deletes and drops the room from the list", async () => {
    await post("/api/entities/room", { data: roomData });
    const del = await app.request("/api/entities/room/L1-lobby", {
      method: "DELETE",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ expectedVersion: 0 }),
    });
    expect(del.status).toBe(200);
    const list = await app.request("/api/entities/room", { headers: { cookie } });
    expect((await json<{ items: unknown[] }>(list)).items).toHaveLength(0);
  });

  it("attributes the edit to the logged-in user", async () => {
    await post("/api/entities/room", { data: roomData });
    const res = await patch("/api/entities/room/L1-lobby", { expectedVersion: 0, data: { nameEn: "X" } });
    expect((await json<{ entity: { updatedBy: string } }>(res)).entity.updatedBy).toMatch(/^user_/);
  });
});

describe("pathway routes", () => {
  it("creates a pathway through the generic entity route", async () => {
    const res = await post("/api/entities/pathway", {
      data: { id: "L1-path", levelId: "oth-L1", polyline: [[0, 0], [10, 0], [10, 8]] },
    });
    expect(res.status).toBe(201);
  });

  it("422s a pathway with a single point", async () => {
    const res = await post("/api/entities/pathway", {
      data: { id: "L1-bad", levelId: "oth-L1", polyline: [[0, 0]] },
    });
    expect(res.status).toBe(422);
  });
});
