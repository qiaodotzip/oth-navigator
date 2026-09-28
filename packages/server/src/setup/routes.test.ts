import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { createUser, type User } from "../auth/users";
import type { Database } from "../db/client";
import { buildings, levels } from "../db/schema";
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
