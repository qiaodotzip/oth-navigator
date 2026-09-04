import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createTestDb } from "./testing/harness";

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
});
