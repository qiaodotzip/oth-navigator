import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../db/client";
import { auditLog, pathways } from "../../db/schema";
import { createEntity } from "../../entities/repository";
import { PresenceTracker } from "../../presence/service";
import { LIMITS, TokenLimits, callKinds } from "../limits";
import { call, mcpFixture, type McpFixture } from "../testing";

let f: McpFixture;
let client: Client;
let presence: PresenceTracker;

beforeEach(async () => {
  presence = new PresenceTracker();
  f = await mcpFixture({ deps: { presence } });
  const by = f.wei.id;
  await createEntity(f.db, "room", {
    id: "L1-corridor", levelId: "oth-L1", kind: "area", walkable: true, heightM: 4, nameEn: "Corridor",
    footprint: [[0, 0], [20, 0], [20, 4], [0, 4]],
  }, by);
  await createEntity(f.db, "doorway", {
    id: "L1-door-shop", levelId: "oth-L1", roomA: "L1-corridor", roomB: "L1-shop", segment: [[9, 4], [11, 4]], widthM: 2,
  }, by);
  await createEntity(f.db, "entrance", { id: "L1-gate-4", levelId: "oth-L1", roomId: "L1-plaza", point: [60, 60], nameEn: "Gate 4" }, by);
  client = await f.connect();
});

describe("suggest_paths", () => {
  it("proposes a floor's lines, joins its doorways, and lists what it could not join", async () => {
    const { text, isError } = await call(client, "suggest_paths", { floor: "L1" });
    expect(isError).toBe(false);
    expect(JSON.parse(text)).toEqual({
      floor: "L1",
      levelId: "oth-L1",
      lines: [{
        polyline: [[2.13, 1.88], [17.88, 1.88]], widthM: 3.8, ends: ["end", "end"], network: 0, drawn: false, reaches: [], crosses: [],
      }],
      links: [{ from: { type: "doorway", id: "L1-door-shop" }, segment: [[10, 4], [10, 1.88]], ontoDrawn: false }],
      unconnected: [{ type: "entrance", id: "L1-gate-4", reason: "It is not on or beside a walkable area." }],
      entranceGuesses: [],
    });
  });

  it("guesses where each gate is, from the place bound to its room (contract v4)", async () => {
    await createEntity(f.db, "place", { id: "pl-gate-2", nameEn: "Gate 2", category: "facility", levelId: "oth-L1", roomId: "L1-corridor" }, f.wei.id);
    const { entranceGuesses } = JSON.parse((await call(client, "suggest_paths", { floor: "L1" })).text) as { entranceGuesses: unknown[] };
    expect(entranceGuesses).toEqual([{ placeId: "pl-gate-2", name: "Gate 2", roomId: "L1-corridor", point: expect.any(Array) }]);
  });

  it("saves nothing, takes the floor's code in any case, and shows Wei's Claude on that floor", async () => {
    const audited = (await f.db.select().from(auditLog)).length;
    expect((await call(client, "suggest_paths", { floor: "l1" })).isError).toBe(false);
    expect(await f.db.select().from(pathways)).toEqual([]);
    expect(await f.db.select().from(auditLog)).toHaveLength(audited);
    expect(presence.list()).toContainEqual(expect.objectContaining({ displayName: "Wei (Claude)", levelId: "oth-L1" }));
  });

  it("marks a line the floor already has a pathway along as drawn, so a second run carries on", async () => {
    await createEntity(f.db, "pathway", { id: "L1-main", levelId: "oth-L1", polyline: [[0, 2], [20, 2]], widthM: 3 }, f.wei.id);
    const { lines } = JSON.parse((await call(client, "suggest_paths", { floor: "L1" })).text) as { lines: { drawn: boolean }[] };
    expect(lines.map(l => l.drawn)).toEqual([true]);
  });

  it("gives a floor with no walkable area no lines", async () => {
    expect(JSON.parse((await call(client, "suggest_paths", { floor: "L2" })).text)).toEqual({
      floor: "L2", levelId: "oth-L2", lines: [], links: [], unconnected: [], entranceGuesses: [],
    });
  });

  it("refuses a floor that does not exist", async () => {
    expect(await call(client, "suggest_paths", { floor: "L9" })).toMatchObject({
      isError: true, text: "There is no floor L9. list_floors gives every floor.",
    });
  });

  it("says why when a room far off makes the floor too big for one pass", async () => {
    await createEntity(f.db, "room", {
      id: "L1-stray", levelId: "oth-L1", kind: "area", walkable: true, heightM: 4,
      footprint: [[2000, 2000], [2010, 2000], [2010, 2004], [2000, 2004]],
    }, f.wei.id);
    const { text, isError } = await call(client, "suggest_paths", { floor: "L1" });
    expect(isError).toBe(true);
    expect(text).toMatch(/^Nothing suggested for L1\. Its walkable areas span 2010 by 2004 m/);
  });

  it("tells Claude how the lines break, what ends and network mean, and what to check before drawing", async () => {
    const { tools } = await client.listTools();
    const description = tools.find(t => t.name === "suggest_paths")?.description ?? "";
    for (const words of [
      "only at a fork", "longest first", "ends", "network", "blocks Publish", "no width", "view_plan", "50 m", "lift, escalator or stair stop", "levelId",
      "drawn is true", "70%", "within 30°", "crosses",
      "reaches lists the rooms", "within 1 m", "less the rooms its midpoint lies in", "crosses lists the rooms of kind room", "more than 2 m",
      "entranceGuesses", "1 m inside", "further in, up to 3 m", "at least 3 m apart", "no room 1 m beyond it", "a person moves in Check",
      "ontoDrawn",
    ]) {
      expect(description).toContain(words);
    }
  });

  it("is a read: marked read-only, and counted against the token's reads", async () => {
    const { tools } = await client.listTools();
    expect(tools.find(t => t.name === "suggest_paths")?.annotations?.readOnlyHint).toBe(true);
    expect(callKinds({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "suggest_paths", arguments: { floor: "L1" } } }))
      .toEqual(["read"]);
  });
});

/**
 * Contract v5's connect_rooms, on L2, which the fixture leaves empty: a hall
 * 20 m deep with its gate and one pathway, reached from the gate, 2 m in along
 * its south side, and shops standing in it 10 m from that pathway.
 */
async function hallWithShops(db: Database, by: string, shops: number, spacingM = 20): Promise<void> {
  const length = spacingM * shops + 10;
  await createEntity(db, "room", {
    id: "L2-hall", levelId: "oth-L2", kind: "area", walkable: true, heightM: 4, nameEn: "Hall",
    footprint: [[0, 0], [length, 0], [length, 20], [0, 20]],
  }, by);
  await createEntity(db, "entrance", { id: "L2-gate", levelId: "oth-L2", roomId: "L2-hall", point: [1, 2], nameEn: "Gate" }, by);
  await createEntity(db, "pathway", { id: "L2-main", levelId: "oth-L2", polyline: [[1, 2], [length - 1, 2]], widthM: 2 }, by);
  for (let k = 0; k < shops; k++) {
    const x = 5 + spacingM * k;
    await createEntity(db, "room", {
      id: `L2-shop-${k + 1}`, levelId: "oth-L2", kind: "room", walkable: false, heightM: 4, nameEn: `Shop ${k + 1}`,
      // Each shop 5 m or more from the next, so one connector never passes within 3 m of two.
      footprint: [[x, 12], [x + Math.min(6, spacingM - 5), 12], [x + Math.min(6, spacingM - 5), 18], [x, 18]],
    }, by);
  }
}

type Connected = { levelId: string; made: { id: string; roomIds: string[]; lengthM: number }[]; islands: unknown[]; left: number };

describe("connect_rooms (contract v5)", () => {
  it("makes a pathway for each room it connects, each on the audit log through the token, and says what it made", async () => {
    await hallWithShops(f.db, f.wei.id, 3);
    const { text, isError } = await call(client, "connect_rooms", { floor: "L2" });
    expect(isError, text).toBe(false);
    const reply = JSON.parse(text) as Connected;
    expect(reply).toEqual({
      levelId: "oth-L2",
      made: expect.arrayContaining([
        { id: "L2-to-shop-1", roomIds: ["L2-shop-1"], lengthM: expect.any(Number) },
        { id: "L2-to-shop-2", roomIds: ["L2-shop-2"], lengthM: expect.any(Number) },
        { id: "L2-to-shop-3", roomIds: ["L2-shop-3"], lengthM: expect.any(Number) },
      ]),
      islands: [],
      left: 0,
    });
    expect(reply.made).toHaveLength(3);
    const ids = reply.made.map(m => m.id).sort();
    const made = (await f.db.select().from(pathways)).filter(p => p.id !== "L2-main");
    expect(made.map(p => [p.id, p.levelId, p.version]).sort()).toEqual(ids.map(id => [id, "oth-L2", 0]));
    for (const p of made) {
      expect(p.widthM).toBeGreaterThanOrEqual(1);
      expect(p.widthM).toBeLessThanOrEqual(3);
    }
    const trail = await f.db.select().from(auditLog).where(and(eq(auditLog.entityType, "pathway"), eq(auditLog.action, "create")));
    const through = trail.filter(r => r.via === f.tokenId);
    expect(through.map(r => [r.entityId, r.actorId]).sort()).toEqual(ids.map(id => [id, f.wei.id]));
    expect(presence.list()).toContainEqual(expect.objectContaining({ displayName: "Wei (Claude)", levelId: "oth-L2" }));
    // Run again, nothing is left to connect.
    expect(JSON.parse((await call(client, "connect_rooms", { floor: "L2" })).text)).toEqual({ levelId: "oth-L2", made: [], islands: [], left: 0 });
  });

  it("works it all out in a preview, and makes nothing", async () => {
    await hallWithShops(f.db, f.wei.id, 3);
    const audited = (await f.db.select().from(auditLog)).length;
    const reply = JSON.parse((await call(client, "connect_rooms", { floor: "L2", preview: true })).text) as Connected;
    expect(reply.made.map(m => m.id)).toEqual(["", "", ""]);
    expect(reply.made.map(m => m.roomIds[0]).sort()).toEqual(["L2-shop-1", "L2-shop-2", "L2-shop-3"]);
    expect((await f.db.select().from(pathways)).map(p => p.id)).toEqual(["L2-main"]);
    expect(await f.db.select().from(auditLog)).toHaveLength(audited);
  });

  it("counts as one write against the token's limit, however many pathways it makes", async () => {
    expect(callKinds({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "connect_rooms", arguments: { floor: "L2" } } }))
      .toEqual(["write"]);
    const g = await mcpFixture({ deps: { mcp: { limits: new TokenLimits({ ...LIMITS, writesPerMinute: 1 }) } } });
    await hallWithShops(g.db, g.wei.id, 3);
    const send = (name: string, args: Record<string, unknown>) =>
      g.raw({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
    expect((await send("connect_rooms", { floor: "L2" })).status).toBe(200);
    expect((await g.db.select().from(pathways))).toHaveLength(4);
    expect((await send("delete", { type: "pathway", id: "L2-main", expectedVersion: 0 })).status).toBe(429);
  });

  it("makes at most 150 in a call, and says how many are left for the next", async () => {
    await hallWithShops(f.db, f.wei.id, 151, 8);
    const first = JSON.parse((await call(client, "connect_rooms", { floor: "L2" })).text) as Connected;
    expect(first.made).toHaveLength(150);
    expect(first.left).toBe(1);
    const second = JSON.parse((await call(client, "connect_rooms", { floor: "L2" })).text) as Connected;
    expect(second.made).toHaveLength(1);
    expect(second.left).toBe(0);
    expect(await f.db.select().from(pathways)).toHaveLength(152);
  }, 30_000);

  it("names the rooms it can't reach as islands, with the gap to cross", async () => {
    await hallWithShops(f.db, f.wei.id, 1);
    await createEntity(f.db, "room", {
      id: "L2-annex", levelId: "oth-L2", kind: "area", walkable: true, heightM: 4, nameEn: "Annex",
      footprint: [[0, 23], [30, 23], [30, 30], [0, 30]],
    }, f.wei.id);
    const reply = JSON.parse((await call(client, "connect_rooms", { floor: "L2" })).text) as Connected;
    expect(reply.made.map(m => m.roomIds)).toEqual([["L2-shop-1"]]);
    expect(reply.islands).toEqual([{ roomIds: ["L2-annex"], gapM: expect.any(Number), from: expect.any(Array), to: expect.any(Array) }]);
  });

  it("refuses a floor with no pathway reached from an entrance to start from", async () => {
    await createEntity(f.db, "room", {
      id: "L2-kiosk", levelId: "oth-L2", kind: "room", walkable: false, heightM: 4, nameEn: "Kiosk", footprint: [[0, 0], [2, 0], [2, 2], [0, 2]],
    }, f.wei.id);
    const { text, isError } = await call(client, "connect_rooms", { floor: "L2" });
    expect(isError).toBe(true);
    expect(text).toBe("Nothing connected on L2. No pathway there is reached from an entrance or a stop yet: add the entrances and the main lines first.");
    expect(await f.db.select().from(pathways)).toEqual([]);
  });

  it("is a write that destroys nothing", async () => {
    const { tools } = await client.listTools();
    expect(tools.find(t => t.name === "connect_rooms")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });
});
