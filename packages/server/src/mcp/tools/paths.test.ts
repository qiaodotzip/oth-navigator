import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { beforeEach, describe, expect, it } from "vitest";
import { auditLog, pathways } from "../../db/schema";
import { createEntity } from "../../entities/repository";
import { PresenceTracker } from "../../presence/service";
import { callKinds } from "../limits";
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
      lines: [{ polyline: [[2.13, 1.88], [17.88, 1.88]], widthM: 3.8 }],
      links: [{ from: { type: "doorway", id: "L1-door-shop" }, segment: [[10, 4], [10, 1.88]] }],
      unconnected: [{ type: "entrance", id: "L1-gate-4", reason: "It is not on or beside a walkable area." }],
    });
  });

  it("saves nothing, takes the floor's code in any case, and shows Wei's Claude on that floor", async () => {
    const audited = (await f.db.select().from(auditLog)).length;
    expect((await call(client, "suggest_paths", { floor: "l1" })).isError).toBe(false);
    expect(await f.db.select().from(pathways)).toEqual([]);
    expect(await f.db.select().from(auditLog)).toHaveLength(audited);
    expect(presence.list()).toContainEqual(expect.objectContaining({ displayName: "Wei (Claude)", levelId: "oth-L1" }));
  });

  it("gives a floor with no walkable area no lines", async () => {
    expect(JSON.parse((await call(client, "suggest_paths", { floor: "L2" })).text)).toEqual({
      floor: "L2", lines: [], links: [], unconnected: [],
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

  it("is a read: marked read-only, and counted against the token's reads", async () => {
    const { tools } = await client.listTools();
    expect(tools.find(t => t.name === "suggest_paths")?.annotations?.readOnlyHint).toBe(true);
    expect(callKinds({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "suggest_paths", arguments: { floor: "L1" } } }))
      .toEqual(["read"]);
  });
});
