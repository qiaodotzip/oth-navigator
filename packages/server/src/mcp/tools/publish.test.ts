import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditLog, levels, publishedVersions } from "../../db/schema";
import { createEntity } from "../../entities/repository";
import { TokenLimits, type CallKind } from "../limits";
import { call, mcpFixture } from "../testing";
import { NOT_ALLOWED } from "./publish";

type Fixture = Awaited<ReturnType<typeof mcpFixture>>;

/** A walkable room on its own is unreachable, which blocks a publish (as in publish/service.test.ts). */
async function lobbyOnly(f: Fixture) {
  await f.db.delete(levels).where(eq(levels.id, "oth-L2"));
  await createEntity(f.db, "room", { id: "L1-lobby", levelId: "oth-L1", kind: "area", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 6, walkable: true, nameEn: "Lobby", nameZh: "大堂" }, f.wei.id);
}

async function addEntrance(f: Fixture) {
  await createEntity(f.db, "entrance", { id: "e-main", levelId: "oth-L1", roomId: "L1-lobby", point: [5, 5] }, f.wei.id);
}

/**
 * Another call through the same token takes the publish slot just after this
 * request passes its own check: the race the tool has to answer itself.
 */
class RacedLimits extends TokenLimits {
  override admit(tokenId: string, kinds: readonly CallKind[], now: number) {
    const refused = super.admit(tokenId, kinds, now);
    if (!refused && kinds.includes("publish")) this.claimPublish(tokenId, now);
    return refused;
  }
}

/** L1 with a lobby and an entrance, the smallest map the publish check passes. */
async function publishable(f: Fixture) {
  await lobbyOnly(f);
  await addEntrance(f);
}

describe("publish", () => {
  it("is refused to a token made without May publish, and publishes nothing", async () => {
    const f = await mcpFixture();
    await publishable(f);
    expect(await call(await f.connect(), "publish", {})).toMatchObject({ isError: true, text: NOT_ALLOWED });
    expect(await f.db.select().from(publishedVersions)).toEqual([]);
  });

  it("publishes under the person, with notes that say via Claude Code", async () => {
    const f = await mcpFixture({ mayPublish: true });
    await publishable(f);
    const { text, isError } = await call(await f.connect(), "publish", { notes: "L1 shops named" });
    expect(isError).toBe(false);
    expect(text).toMatch(/^Published version \S+, with \d+ warnings?\.$/);
    const [row] = await f.db.select().from(publishedVersions);
    expect(row).toMatchObject({ createdBy: f.wei.id, notes: "L1 shops named (via Claude Code)" });
  });

  it("never names the token in the manifest, which visitors read", async () => {
    const f = await mcpFixture({ mayPublish: true });
    await publishable(f);
    expect((await call(await f.connect(), "publish", {})).isError).toBe(false);
    const [row] = await f.db.select().from(publishedVersions);
    const manifest = await readFile(join(f.dataDir, "published", row!.id, "manifest.json"), "utf8");
    expect(JSON.parse(manifest)).toMatchObject({ notes: "via Claude Code" });
    expect(manifest).not.toContain("Wei's laptop");
    expect(manifest).not.toContain(f.tokenId);
  });

  it("puts the token that published on the record, on the server only", async () => {
    const f = await mcpFixture({ mayPublish: true });
    await publishable(f);
    expect((await call(await f.connect(), "publish", { notes: "L1 shops named" })).isError).toBe(false);
    const [row] = await f.db.select().from(publishedVersions);
    const records = await f.db.select().from(auditLog).where(eq(auditLog.action, "publish"));
    expect(records).toEqual([expect.objectContaining({
      entityType: "publishedVersion",
      entityId: row!.id,
      actorId: f.wei.id,
      via: f.tokenId,
      after: { id: row!.id, notes: "L1 shops named (via Claude Code)", warningCount: row!.warningCount },
    })]);
  });

  it("is refused while the map has errors, and that costs no ten-minute wait", async () => {
    const f = await mcpFixture({ mayPublish: true });
    await lobbyOnly(f);
    const client = await f.connect();
    const blocked = await call(client, "publish", {});
    expect(blocked.isError).toBe(true);
    expect(blocked.text).toMatch(/^Not published: the map has \d+ errors?\. The first: /);
    expect(await f.db.select().from(publishedVersions)).toEqual([]);
    expect(await f.db.select().from(auditLog).where(eq(auditLog.action, "publish"))).toEqual([]);
    await addEntrance(f);
    expect((await call(client, "publish", {})).isError).toBe(false);
  });

  it("goes once every ten minutes per token", async () => {
    const f = await mcpFixture({ mayPublish: true, deps: { mcp: { limits: new TokenLimits() } } });
    await publishable(f);
    const client = await f.connect();
    expect((await call(client, "publish", {})).isError).toBe(false);
    await expect(client.callTool({ name: "publish", arguments: {} })).rejects.toMatchObject({ code: 429 });
  });

  it("tells the loser of a race how long to wait, and publishes nothing", async () => {
    const at = Date.now();
    const f = await mcpFixture({ mayPublish: true, deps: { mcp: { limits: new RacedLimits(), now: () => at } } });
    await publishable(f);
    expect(await call(await f.connect(), "publish", {})).toMatchObject({
      isError: true,
      text: "This token published less than ten minutes ago. Wait 600 seconds, then publish again.",
    });
    expect(await f.db.select().from(publishedVersions)).toEqual([]);
  });

  it("is marked destructive, so Claude Code asks first", async () => {
    const f = await mcpFixture();
    const tool = (await (await f.connect()).listTools()).tools.find(t => t.name === "publish");
    expect(tool?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });
});
