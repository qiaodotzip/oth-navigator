import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { buildings, levels, roomDrafts, rooms } from "../db/schema";
import { createTestDb, json } from "../testing/harness";
import { roomIdFor } from "./service";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const found = (nameEn: string, over: Record<string, unknown> = {}) => ({
  nameEn, kind: "room", footprint: square(0, 0, 10), holes: [], labelPoint: [5, 5], areaM2: 100, ...over,
});
const source = { checksum: "a".repeat(64), page: 1 };
type Draft = { id: string; version: number; nameEn: string; levelId: string; footprint?: unknown; acceptedRoomId?: string; source: unknown };
type Accepted = { draftId: string; draftVersion: number; roomId: string; roomVersion: number };

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, dataDir: await mkdtemp(join(tmpdir(), "oth-drafts-")) });
  const wei = await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: wei.id }),
  })).headers.get("set-cookie") ?? "";
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({
    id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4.5,
  });
  // Already on the map: a new "Shop" must not take its id.
  await db.insert(rooms).values({ id: "L2-shop", levelId: "oth-L2", kind: "room", footprint: square(50, 50, 5), heightM: 4.5 });
});

const send = (method: string, path: string, body: unknown) =>
  app.request(path, { method, headers: { "content-type": "application/json", cookie }, body: typeof body === "string" ? body : JSON.stringify(body) });
const replace = (drafts: unknown[], levelId = "oth-L2") => send("PUT", `/api/levels/${levelId}/drafts`, { source, drafts });
const listed = async () =>
  (await json<{ drafts: Draft[] }>(await app.request("/api/levels/oth-L2/drafts", { headers: { cookie } }))).drafts;
const named = async (name: string) => (await listed()).find(d => d.nameEn === name)!;
const accept = (items: unknown[]) => send("POST", "/api/room-drafts/accept", { items });
const unaccept = (items: unknown[]) => send("POST", "/api/room-drafts/unaccept", { items });

describe("a floor's drafts", () => {
  it("replaces the floor's live drafts in one go, each with an id, the floor and the PDF it came from", async () => {
    expect((await replace([found("Shop"), found("Store Room")])).status).toBe(200);
    const res = await replace([found("Changing Room")]);
    expect(res.status).toBe(200);
    const { drafts } = await json<{ drafts: Draft[] }>(res);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ nameEn: "Changing Room", levelId: "oth-L2", source });
    expect(drafts[0]!.id).toMatch(/^rd_/);
    expect((await listed()).map(d => d.nameEn)).toEqual(["Changing Room"]);
    // The first search's drafts are retired, not gone: soft, like every removal.
    expect(await db.select().from(roomDrafts)).toHaveLength(3);
  });

  it("keeps a space the drawing leaves open, with no shape", async () => {
    await replace([found("Plaza", { kind: "area", footprint: undefined, areaM2: 0 })]);
    expect((await named("Plaza")).footprint).toBeUndefined();
  });

  it("refuses a floor that isn't there", async () => {
    expect((await replace([found("Shop")], "oth-L9")).status).toBe(422);
  });

  it("refuses a floor that was deleted, and keeps the drafts there were", async () => {
    await replace([found("Shop")]);
    await db.update(levels).set({ deletedAt: new Date() }).where(eq(levels.id, "oth-L2"));
    const res = await replace([found("Store")]);
    expect(res.status).toBe(422);
    expect((await json<{ error: string }>(res)).error).toMatch(/Restore it first/);
    expect((await listed()).map(d => d.nameEn)).toEqual(["Shop"]);
  });

  it("refuses a source that isn't a PDF's SHA-256", async () => {
    const res = await send("PUT", "/api/levels/oth-L2/drafts", { source: { checksum: "abc", page: 1 }, drafts: [found("Shop")] });
    expect(res.status).toBe(400);
    expect(await listed()).toEqual([]);
  });

  it("refuses more than 1,000 drafts at once", async () => {
    const many = Array.from({ length: 1001 }, (_, i) => found(`Store ${i}`, { footprint: square(0, 0, 1), areaM2: 1 }));
    expect((await replace(many)).status).toBe(422);
  });

  it("refuses a body over 2 MB", async () => {
    const long = Array.from({ length: 200_000 }, (_, i) => [i, i]);
    expect((await replace([found("Hall", { footprint: long })])).status).toBe(413);
  });

  it("refuses a draft the model would reject, and keeps the drafts there were", async () => {
    await replace([found("Shop")]);
    expect((await replace([found("Bad", { footprint: [[0, 0], [1, 1]] })])).status).toBe(422);
    expect((await listed()).map(d => d.nameEn)).toEqual(["Shop"]);
  });

  it("never puts drafts in the map", async () => {
    await replace([found("Shop")]);
    const model = await json<Record<string, unknown>>(await app.request("/api/model", { headers: { cookie } }));
    expect(Object.keys(model)).not.toContain("roomDrafts");
    expect(JSON.stringify(model)).not.toContain("rd_");
  });
});

describe("accepting drafts", () => {
  it("makes rooms: the id from the name, the height from the floor, walkable if an area, and from the drawing", async () => {
    await replace([found("Shop"), found("Main Lobby", { kind: "area", labelPoint: [20, 20] })]);
    const shop = await named("Shop");
    const lobby = await named("Main Lobby");
    const res = await accept([{ id: shop.id, expectedVersion: 0 }, { id: lobby.id, expectedVersion: 0 }]);
    expect(res.status).toBe(200);
    const { accepted } = await json<{ accepted: Accepted[] }>(res);
    expect(accepted.map(a => a.roomId)).toEqual(["L2-shop-2", "L2-main-lobby"]);
    expect(accepted[0]).toMatchObject({ draftId: shop.id, draftVersion: 2, roomVersion: 0 });
    const [room] = await db.select().from(rooms).where(eq(rooms.id, "L2-shop-2"));
    expect(room).toMatchObject({
      levelId: "oth-L2", kind: "room", heightM: 4.5, walkable: false, nameEn: "Shop",
      verification: { status: "cad", evidence: [`pdf:${"a".repeat(64)}`] },
    });
    expect((await db.select().from(rooms).where(eq(rooms.id, "L2-main-lobby")))[0]?.walkable).toBe(true);
    const [retired] = await db.select().from(roomDrafts).where(eq(roomDrafts.id, shop.id));
    expect(retired?.acceptedRoomId).toBe("L2-shop-2");
    expect(retired?.deletedAt).not.toBeNull();
    expect(await listed()).toEqual([]);
  });

  it("takes the name and kind the reviewer corrected", async () => {
    await replace([found("Shop")]);
    const shop = await named("Shop");
    const res = await send("POST", `/api/room-drafts/${shop.id}/accept`, { expectedVersion: 0, nameEn: "Kiosk 3", kind: "service" });
    expect(res.status).toBe(200);
    expect((await json<{ accepted: Accepted }>(res)).accepted.roomId).toBe("L2-kiosk-3");
    expect((await db.select().from(rooms).where(eq(rooms.id, "L2-kiosk-3")))[0]?.kind).toBe("service");
  });

  it("refuses a space the drawing leaves open: it has no shape to add", async () => {
    await replace([found("Plaza", { kind: "area", footprint: undefined, areaM2: 0 })]);
    const res = await accept([{ id: (await named("Plaza")).id, expectedVersion: 0 }]);
    expect(res.status).toBe(422);
    expect((await json<{ error: string }>(res)).error).toMatch(/Draw it by hand/);
  });

  it("409s a stale draft, and adds no room for any of them", async () => {
    await replace([found("Shop"), found("Store")]);
    const before = (await db.select().from(rooms)).length;
    const res = await accept([
      { id: (await named("Shop")).id, expectedVersion: 0 },
      { id: (await named("Store")).id, expectedVersion: 5 },
    ]);
    expect(res.status).toBe(409);
    expect((await db.select().from(rooms)).length).toBe(before);
    expect(await listed()).toHaveLength(2);
  });

  it("refuses to add rooms to a floor that was deleted", async () => {
    await replace([found("Shop")]);
    const shop = await named("Shop");
    await db.update(levels).set({ deletedAt: new Date() }).where(eq(levels.id, "oth-L2"));
    const before = (await db.select().from(rooms)).length;
    const res = await accept([{ id: shop.id, expectedVersion: 0 }]);
    expect(res.status).toBe(422);
    expect((await json<{ error: string }>(res)).error).toMatch(/L2 was deleted/);
    expect((await db.select().from(rooms)).length).toBe(before);
    expect((await listed()).map(d => d.id)).toEqual([shop.id]);
  });

  it("409s when a teammate's accept took the same new id at the same moment, and a second try numbers past it", async () => {
    await replace([found("Shop")]);
    const shop = await named("Shop");
    // Stands in for a teammate's accept committing L2-shop-2 between this
    // one's read of the ids and its insert, which a pool of connections
    // allows: the room is put in just ahead, so the real primary key refuses.
    await db.execute(sql.raw(`
      create function teammate_first() returns trigger language plpgsql as $$
      begin
        if pg_trigger_depth() = 1 then
          insert into rooms (id, level_id, kind, footprint, height_m) values (new.id, new.level_id, 'room', new.footprint, new.height_m);
        end if;
        return new;
      end $$`));
    await db.execute(sql.raw(`
      create trigger teammate_first before insert on rooms
      for each row when (new.id = 'L2-shop-2') execute function teammate_first()`));

    const res = await accept([{ id: shop.id, expectedVersion: 0 }]);
    expect(res.status).toBe(409);
    expect((await json<{ error: string; current: unknown }>(res))).toMatchObject({ error: expect.stringMatching(/Accept again/), current: null });
    // All or none: the draft still waits, at the version the reviewer holds.
    expect(await named("Shop")).toMatchObject({ id: shop.id, version: 0 });

    // The teammate's room is really there now, so the retry numbers past it.
    await db.execute(sql.raw("drop trigger teammate_first on rooms"));
    await db.insert(rooms).values({ id: "L2-shop-2", levelId: "oth-L2", kind: "room", footprint: square(60, 60, 5), heightM: 4.5 });
    const again = await accept([{ id: shop.id, expectedVersion: 0 }]);
    expect(again.status).toBe(200);
    expect((await json<{ accepted: Accepted[] }>(again)).accepted[0]?.roomId).toBe("L2-shop-3");
  });

  it("tells a reviewer whose draft a new search replaced, rather than adding it", async () => {
    await replace([found("Shop")]);
    const old = await named("Shop");
    await replace([found("Shop")]);
    const res = await accept([{ id: old.id, expectedVersion: 0 }]);
    expect(res.status).toBe(422);
    expect((await json<{ error: string }>(res)).error).toMatch(/searched again/);
  });
});

describe("undoing an accept", () => {
  async function accepted(): Promise<Accepted> {
    await replace([found("Shop")]);
    const res = await accept([{ id: (await named("Shop")).id, expectedVersion: 0 }]);
    return (await json<{ accepted: Accepted[] }>(res)).accepted[0]!;
  }

  it("takes the room off the map and puts the draft back", async () => {
    const a = await accepted();
    const res = await unaccept([{ id: a.draftId, expectedVersion: a.draftVersion, roomVersion: a.roomVersion }]);
    expect(res.status).toBe(200);
    expect((await db.select().from(rooms).where(eq(rooms.id, a.roomId)))[0]?.deletedAt).not.toBeNull();
    const back = await listed();
    expect(back.map(d => d.id)).toEqual([a.draftId]);
    expect(back[0]!.acceptedRoomId).toBeUndefined();
  });

  it("won't take back a room someone has changed since", async () => {
    const a = await accepted();
    expect((await send("PATCH", `/api/entities/room/${a.roomId}`, { expectedVersion: 0, data: { nameEn: "Shop 12" } })).status).toBe(200);
    const res = await send("POST", `/api/room-drafts/${a.draftId}/unaccept`, { expectedVersion: a.draftVersion, roomVersion: a.roomVersion });
    expect(res.status).toBe(409);
    expect((await db.select().from(rooms).where(eq(rooms.id, a.roomId)))[0]?.deletedAt).toBeNull();
  });
});

describe("rejecting a draft", () => {
  it("is the generic soft delete, and the generic restore undoes it", async () => {
    await replace([found("Shop")]);
    const shop = await named("Shop");
    expect((await send("DELETE", `/api/entities/roomDraft/${shop.id}`, { expectedVersion: 0 })).status).toBe(200);
    expect(await listed()).toEqual([]);
    expect((await send("POST", `/api/entities/roomDraft/${shop.id}/restore`, { expectedVersion: 1 })).status).toBe(200);
    expect((await listed()).map(d => d.id)).toEqual([shop.id]);
  });
});

describe("roomIdFor", () => {
  it("is the floor's code and the name, numbered past what is taken, as plan:l1 named L1's rooms", () => {
    const taken = new Set(["L2-shop", "L2-shop-2"]);
    expect(roomIdFor("L2", "Shop", taken)).toBe("L2-shop-3");
    expect(taken.has("L2-shop-3")).toBe(true);
    expect(roomIdFor("L2", "Cleaner's Room", taken)).toBe("L2-cleaner-s-room");
    expect(roomIdFor("L2", "!!!", taken)).toBe("L2-space");
    expect(roomIdFor("L2", "A".repeat(80), new Set()).length).toBeLessThanOrEqual(3 + 48);
  });
});
