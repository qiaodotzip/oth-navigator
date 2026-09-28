import { beforeEach, describe, expect, it, vi } from "vitest";
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
  const wei = await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: wei.id }),
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

  it("answers 500 when a create fails for a reason that is not the data, so the client offers Retry", async () => {
    // A dropped connection is the server's trouble; a 422 called it invalid and offered nothing.
    vi.spyOn(db, "insert").mockImplementation(() => { throw new Error("Connection terminated unexpectedly"); });
    expect((await post("/api/entities/room", { data: roomData })).status).toBe(500);
    // A bad body is still the client's, whatever else is going on.
    expect((await post("/api/entities/room", { data: { ...roomData, footprint: [[0, 0]] } })).status).toBe(422);
  });

  it("answers 500 when an update fails for a reason that is not the data", async () => {
    await post("/api/entities/room", { data: roomData });
    vi.spyOn(db, "update").mockImplementation(() => { throw new Error("canceling statement due to statement timeout"); });
    expect((await patch("/api/entities/room/L1-lobby", { expectedVersion: 0, data: { nameEn: "Hall" } })).status).toBe(500);
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

  it("renames a pathway, which is a partial update of a name it did not have", async () => {
    await post("/api/entities/pathway", {
      data: { id: "L1-path", levelId: "oth-L1", polyline: [[0, 0], [10, 0]] },
    });
    const res = await patch("/api/entities/pathway/L1-path", {
      expectedVersion: 0,
      data: { nameEn: "Link Bridge" },
    });
    expect(res.status).toBe(200);
    expect((await json<{ entity: { nameEn: string } }>(res)).entity.nameEn).toBe("Link Bridge");
  });

  it("422s a pathway with a single point", async () => {
    const res = await post("/api/entities/pathway", {
      data: { id: "L1-bad", levelId: "oth-L1", polyline: [[0, 0]] },
    });
    expect(res.status).toBe(422);
  });
});

describe("a lift or stair stop's outline", () => {
  it("stores the outline and which way the flight climbs, and returns them", async () => {
    const footprint = [[4, 0], [6, 0], [6, 10], [4, 10]];
    await post("/api/entities/portal", { data: { id: "esc-1", kind: "escalator" } });
    const created = await post("/api/entities/portalEndpoint", {
      data: { id: "esc-1-1", portalId: "esc-1", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5], footprint },
    });
    expect(created.status).toBe(201);
    expect((await json<{ entity: { footprint: unknown; flipped: boolean } }>(created)).entity)
      .toMatchObject({ footprint, flipped: false });

    const flipped = await patch("/api/entities/portalEndpoint/esc-1-1", { expectedVersion: 0, data: { flipped: true } });
    expect(flipped.status).toBe(200);
    const list = await app.request("/api/entities/portalEndpoint", { headers: { cookie } });
    expect((await json<{ items: unknown[] }>(list)).items).toEqual([expect.objectContaining({ footprint, flipped: true })]);
  });

  it("422s clearing which way the flight climbs, rather than failing on the column", async () => {
    await post("/api/entities/portal", { data: { id: "esc-1", kind: "escalator" } });
    await post("/api/entities/portalEndpoint", {
      data: { id: "esc-1-1", portalId: "esc-1", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5] },
    });
    const res = await patch("/api/entities/portalEndpoint/esc-1-1", { expectedVersion: 0, data: { flipped: null } });
    expect(res.status).toBe(422);
    expect((await json<{ detail: string }>(res)).detail).toMatch(/can't be cleared/);
  });
});

describe("level owners", () => {
  it("saves and returns a floor's owners", async () => {
    await app.request("/api/entities/level", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ data: {
        id: "oth-L9", buildingId: "oth", code: "L9", ordinal: 9,
        nameEn: "L9", nameZh: "九楼", elevationM: 40, heightM: 4,
      } }),
    });
    const res = await app.request("/api/entities/level/oth-L9", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ expectedVersion: 0, data: { ownerIds: ["user_a"] } }),
    });
    expect(res.status).toBe(200);
    const list = await (await app.request("/api/entities/level", { headers: { cookie } })).json() as {
      items: { id: string; ownerIds: string[] }[];
    };
    expect(list.items.find(l => l.id === "oth-L9")?.ownerIds).toEqual(["user_a"]);
  });
});

describe("restore", () => {
  const send = (method: string, path: string, body?: unknown) => app.request(path, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  async function binnedPathway() {
    await send("POST", "/api/entities/pathway", { data: { id: "p_undo", levelId: "oth-L1", polyline: [[0, 0], [5, 0]] } });
    await send("DELETE", "/api/entities/pathway/p_undo", { expectedVersion: 0 });
  }

  it("brings a deleted entity back, one version on", async () => {
    await binnedPathway();
    const res = await send("POST", "/api/entities/pathway/p_undo/restore", { expectedVersion: 1 });
    expect(res.status).toBe(200);
    const list = await (await send("GET", "/api/entities/pathway")).json() as { items: { id: string; version: number }[] };
    expect(list.items.find(p => p.id === "p_undo")?.version).toBe(2);
  });

  it("refuses when someone has touched it since, and says so", async () => {
    await binnedPathway();
    const res = await send("POST", "/api/entities/pathway/p_undo/restore", { expectedVersion: 0 });
    expect(res.status).toBe(409);
  });

  it("refuses to restore something that was never deleted", async () => {
    await send("POST", "/api/entities/pathway", { data: { id: "p_live", levelId: "oth-L1", polyline: [[0, 0], [5, 0]] } });
    expect((await send("POST", "/api/entities/pathway/p_live/restore", { expectedVersion: 0 })).status).toBe(422);
  });

  it("404s something that never existed", async () => {
    expect((await send("POST", "/api/entities/pathway/p_nope/restore", { expectedVersion: 0 })).status).toBe(404);
  });

  it("refuses to restore a capture, since that would half-restore its frames", async () => {
    await send("POST", "/api/entities/capture", { data: { id: "cap_r", kind: "video", filename: "walk.mp4" } });
    await send("DELETE", "/api/captures/cap_r");
    const res = await send("POST", "/api/entities/capture/cap_r/restore", { expectedVersion: 1 });
    expect(res.status).toBe(422);
    const list = await (await send("GET", "/api/entities/capture")).json() as { items: { id: string }[] };
    expect(list.items.find(c => c.id === "cap_r")).toBeUndefined();
  });
});

describe("objects", () => {
  const bin = { id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } };
  const object = { id: "L1-bin-1", levelId: "oth-L1", objectKindId: "ok_bin", position: [3, 4, 0] };

  it("makes a kind and an object of it through the same routes as anything else", async () => {
    expect((await post("/api/entities/objectKind", { data: bin })).status).toBe(201);
    expect((await post("/api/entities/placement", { data: object })).status).toBe(201);
  });

  it("422s a placement with neither its own model nor a kind, before the database's check can 500 it", async () => {
    const res = await post("/api/entities/placement", { data: { id: "L1-x", levelId: "oth-L1", position: [3, 4, 0] } });
    expect(res.status).toBe(422);
    expect((await json<{ detail: string }>(res)).detail).toContain("a placement needs its own model or an object kind");
  });

  it("422s clearing an object's kind while it has no model of its own", async () => {
    await post("/api/entities/objectKind", { data: bin });
    await post("/api/entities/placement", { data: object });
    expect((await patch("/api/entities/placement/L1-bin-1", { expectedVersion: 0, data: { objectKindId: null } })).status)
      .toBe(422);
  });

  it("lets an object take a model of its own, and then let go of its kind", async () => {
    await post("/api/entities/objectKind", { data: bin });
    await post("/api/entities/placement", { data: object });
    expect((await patch("/api/entities/placement/L1-bin-1", { expectedVersion: 0, data: { assetId: "asset_own" } })).status)
      .toBe(200);
    expect((await patch("/api/entities/placement/L1-bin-1", { expectedVersion: 1, data: { objectKindId: null } })).status)
      .toBe(200);
  });
});
