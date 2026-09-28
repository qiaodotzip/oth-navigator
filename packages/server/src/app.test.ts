import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createTestDb } from "./testing/harness";
import type { Database } from "./db/client";

describe("app", () => {
  it("serves a health check", async () => {
    const db = await createTestDb();
    const res = await createApp({ db }).request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("404s an unknown route as JSON, not HTML", async () => {
    const db = await createTestDb();
    const res = await createApp({ db }).request("/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("says only that something went wrong when errors are not exposed, as in production", async () => {
    const broken = {
      select: () => { throw new Error("connect ECONNREFUSED postgres://oth:hunter2@db.internal:5432/oth"); },
    } as unknown as Database;
    const res = await createApp({ db: broken, exposeErrors: false }).request("/api/auth/people");
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain("hunter2");
    expect(JSON.parse(body)).toEqual({ error: "Something went wrong on the server." });
  });

  it("keeps the message where it helps, locally", async () => {
    const broken = { select: () => { throw new Error("relation \"users\" does not exist"); } } as unknown as Database;
    const res = await createApp({ db: broken, exposeErrors: true }).request("/api/auth/people");
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toContain("does not exist");
  });
});
