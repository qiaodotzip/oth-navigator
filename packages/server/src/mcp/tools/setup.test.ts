import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser, type User } from "../../auth/users";
import { auditLog, portalEndpoints, portals, rooms } from "../../db/schema";
import { createEntity, updateEntity } from "../../entities/repository";
import { acquireLock } from "../../locks/service";
import { call, mcpFixture, type McpFixture } from "../testing";

const sq = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const ESC = { id: "L1-esc", levelId: "oth-L1", kind: "room", footprint: sq(4, 2, 6, 12), heightM: 6, nameEn: "Escalator - 07" };
let f: McpFixture;
let client: Client;
let amy: User;

beforeEach(async () => {
  f = await mcpFixture();
  amy = await createUser(f.db, { email: "amy@example.com", password: "unused", displayName: "Amy" });
  await createEntity(f.db, "room", ESC, amy.id);
  client = await f.connect();
});

describe("make_stop", () => {
  it("makes a traced space an escalator stop through the token, and says what comes next", async () => {
    const { text, isError } = await call(client, "make_stop", { floor: "L1", room: "L1-esc", expectedVersion: 0, kind: "escalator" });
    expect(isError).toBe(false);
    expect(text).toMatch(
      /^Made Escalator - 07 an escalator stop \(oth-L1-portal-\d+, on portal-\d+\), with the space's outline, and opened the space so routes reach it\. L2 has no space traced over this spot yet/,
    );
    const [portal] = await f.db.select().from(portals);
    expect(await f.db.select().from(portalEndpoints)).toMatchObject([{ portalId: portal!.id, roomId: "L1-esc", footprint: ESC.footprint }]);
    expect((await f.db.select().from(rooms).where(eq(rooms.id, "L1-esc")))[0]).toMatchObject({ kind: "area", walkable: true, updatedBy: f.wei.id });
    const trail = await f.db.select().from(auditLog).where(eq(auditLog.via, f.tokenId));
    expect(trail.map(r => `${r.entityType} ${r.action}`).sort()).toEqual(["portal create", "portalEndpoint create", "room update"]);
  });

  it("says whose change it met when the space changed since it was read, and writes nothing", async () => {
    await updateEntity(f.db, "room", "L1-esc", 0, { nameEn: "Escalator 7" }, amy.id);
    const { text, isError } = await call(client, "make_stop", { floor: "L1", room: "L1-esc", expectedVersion: 0, kind: "escalator" });
    expect(isError).toBe(true);
    expect(text).toMatch(/^Not saved: room L1-esc is at version 1 and you sent 0\. Amy changed it at /);
    expect(await f.db.select().from(portals)).toEqual([]);
  });

  it("touches only the floor it is given", async () => {
    expect(await call(client, "make_stop", { floor: "L2", room: "L1-esc", expectedVersion: 0, kind: "lift" })).toMatchObject({
      isError: true, text: "Room L1-esc is on another floor, so it is not made a stop from here.",
    });
  });

  it("leaves a space someone has open alone", async () => {
    await acquireLock(f.db, "room", "L1-esc", amy.id, 300);
    expect((await call(client, "make_stop", { floor: "L1", room: "L1-esc", expectedVersion: 0, kind: "lift" })).text)
      .toBe("Not saved: Amy is editing room L1-esc now. Leave it, and try again once they have moved on.");
  });
});
