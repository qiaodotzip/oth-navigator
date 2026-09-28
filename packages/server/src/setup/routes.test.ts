import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser, type User } from "../auth/users";
import type { Database } from "../db/client";
import { auditLog, buildings, levels, rooms } from "../db/schema";
import { replaceDrafts } from "../drafts/service";
import { createEntity, updateEntity } from "../entities/repository";
import { createTestDb, json } from "../testing/harness";
import type { SetupState } from "./service";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;
let wei: User;

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, dataDir: await mkdtemp(join(tmpdir(), "oth-setup-")) });
  wei = await createUser(db, { email: "wei@example.com", password: "unused", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: wei.id }),
  })).headers.get("set-cookie") ?? "";
  await db.insert(buildings).values({ id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94, rotationDeg: 0 });
  await db.insert(levels).values({ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 });
});

const send = (method: string, path: string, body?: unknown, withCookie = true) => app.request(path, {
  method,
  headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
  ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
});

describe("a floor's setup", () => {
  it("answers its nine steps as stored, and each step's counts", async () => {
    const res = await send("GET", "/api/levels/oth-L1/setup");
    expect(res.status).toBe(200);
    const state = await json<SetupState>(res);
    expect(Object.keys(state).sort()).toEqual(["counts", "steps"]);
    expect(state.steps).toHaveLength(9);
    expect(state.steps[0]).toEqual({ step: "footage", status: "open", note: "", finishedBy: null, finishedVia: null, finishedAt: null });
    expect(state.counts.label).toEqual({ tagged: 0, binned: 0, left: 0 });
    expect(state.counts.rooms).toEqual({ waiting: 0, setAside: 0, accepted: 0, rejected: 0, stops: 0 });
    expect(state.counts.paths.unreachable).toBe(0);
  });

  it("answers the same shape in light mode, with unreachable left out", async () => {
    const res = await send("GET", "/api/levels/oth-L1/setup?light=1");
    expect(res.status).toBe(200);
    const state = await json<SetupState>(res);
    expect(state.steps).toHaveLength(9);
    expect(state.counts.paths).toEqual({ pathways: 0, entrances: 0, unreachable: null });
  });

  it("marks a step as a person, with no token, and answers the whole setup again", async () => {
    const res = await send("PUT", "/api/levels/oth-L1/setup/review", { status: "skipped" });
    expect(res.status).toBe(200);
    expect((await json<SetupState>(res)).steps[2]).toMatchObject({ step: "review", status: "skipped", finishedBy: wei.id, finishedVia: null });
  });

  it("refuses a step or a status it doesn't know, a floor that doesn't exist, and anyone not signed in", async () => {
    expect((await send("PUT", "/api/levels/oth-L1/setup/lunch", { status: "done" })).status).toBe(400);
    expect((await send("PUT", "/api/levels/oth-L1/setup/review", { status: "finished" })).status).toBe(400);
    expect((await send("GET", "/api/levels/oth-L9/setup")).status).toBe(404);
    expect((await send("PUT", "/api/levels/oth-L9/setup/review", { status: "done" })).status).toBe(404);
    expect((await send("GET", "/api/levels/oth-L1/setup", undefined, false)).status).toBe(401);
  });
});

describe("Claude's changes on a floor", () => {
  it("lists them since a moment, the epoch for all, and refuses what it can't read", async () => {
    const epoch = encodeURIComponent("1970-01-01T00:00:00.000Z");
    expect(await json<{ changes: unknown[] }>(await send("GET", `/api/levels/oth-L1/claude-changes?since=${epoch}`))).toEqual({ changes: [] });
    expect((await send("GET", `/api/levels/oth-L1/claude-changes?since=${epoch}&limit=5`)).status).toBe(200);
    expect((await send("GET", "/api/levels/oth-L1/claude-changes")).status).toBe(400);
    expect((await send("GET", "/api/levels/oth-L1/claude-changes?since=yesterday")).status).toBe(400);
    // "1" parses as a (wrong) date under JS's legacy fallback rather than an invalid one, so since must look like an ISO date-time up front.
    expect((await send("GET", "/api/levels/oth-L1/claude-changes?since=1")).status).toBe(400);
    expect((await send("GET", `/api/levels/oth-L1/claude-changes?since=${epoch}&limit=0`)).status).toBe(400);
    expect((await send("GET", `/api/levels/oth-L9/claude-changes?since=${epoch}`)).status).toBe(404);
    expect((await send("GET", `/api/levels/oth-L1/claude-changes?since=${epoch}`, undefined, false)).status).toBe(401);
  });
});

describe("undoing one of Claude's changes", () => {
  it("answers 404 for an id that isn't one, and only to someone signed in", async () => {
    expect((await send("POST", "/api/changes/audit_missing/undo")).status).toBe(404);
    expect((await send("POST", "/api/changes/audit_missing/undo", undefined, false)).status).toBe(401);
  });

  it("answers a draft's own refusal 409 with its reason, and writes nothing", async () => {
    // An accept whose trail says the draft became L1-x, while the draft in fact still waits:
    // every version matches, so only unacceptDrafts itself can refuse.
    const footprint = [[0, 0], [4, 0], [4, 4], [0, 4]];
    await createEntity(db, "room", { id: "L1-x", levelId: "oth-L1", kind: "room", footprint, heightM: 6, nameEn: "X" }, wei.id);
    const [draft] = await replaceDrafts(db, "oth-L1", { checksum: "a".repeat(64), page: 1 }, [
      { nameEn: "X", kind: "room", footprint, labelPoint: [2, 2], areaM2: 16 },
    ], wei.id);
    const draftId = String(draft!.id);
    await updateEntity(db, "roomDraft", draftId, 0, { nameEn: "X again" }, wei.id);
    const at = new Date();
    const trail = (id: string, entityType: string, entityId: string, action: string, after: Record<string, unknown>) =>
      ({ id, entityType, entityId, action, actorId: wei.id, at, before: null, after, via: "tok_x" });
    await db.insert(auditLog).values([
      trail("audit_room", "room", "L1-x", "create", { id: "L1-x", version: 0, levelId: "oth-L1", nameEn: "X", kind: "room", footprint }),
      trail("audit_rename", "roomDraft", draftId, "update", { acceptedRoomId: "L1-x", version: 1 }),
      trail("audit_retire", "roomDraft", draftId, "delete", { acceptedRoomId: "L1-x", version: 1 }),
    ]);
    const res = await send("POST", "/api/changes/audit_room/undo");
    expect(res.status).toBe(409);
    expect(await json<{ reason: string }>(res)).toEqual({ reason: "X again isn't on the map, so there is nothing to take back." });
    expect((await db.select().from(rooms).where(eq(rooms.id, "L1-x")))[0]?.deletedAt).toBeNull();
  });
});
