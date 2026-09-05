import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { Database } from "./db/client";
import { createTestDb, json } from "./testing/harness";

let db: Database;
beforeEach(async () => { db = await createTestDb(); });

async function distWithBuild() {
  const dir = await mkdtemp(join(tmpdir(), "oth-dist-"));
  await writeFile(join(dir, "index.html"), "<!doctype html><title>OTH Map Editor</title>");
  await mkdir(join(dir, "assets"), { recursive: true });
  await writeFile(join(dir, "assets", "index-abc123.js"), "console.log(1)");
  return dir;
}

describe("serving the built editor", () => {
  it("serves index.html at the root", async () => {
    const app = createApp({ db, editorDist: await distWithBuild() });
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("OTH Map Editor");
  });

  it("serves fingerprinted assets with a long immutable cache", async () => {
    const app = createApp({ db, editorDist: await distWithBuild() });
    const res = await app.request("/assets/index-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  it("does not cache index.html, so a deploy is picked up", async () => {
    const app = createApp({ db, editorDist: await distWithBuild() });
    expect((await app.request("/")).headers.get("cache-control")).toBe("no-cache");
  });

  it("falls back to index.html for a client-side route", async () => {
    const app = createApp({ db, editorDist: await distWithBuild() });
    const res = await app.request("/levels/L2");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("OTH Map Editor");
  });

  it("404s a missing asset rather than handing back index.html", async () => {
    const app = createApp({ db, editorDist: await distWithBuild() });
    expect((await app.request("/assets/missing.js")).status).toBe(404);
  });

  it("never shadows the API", async () => {
    const app = createApp({ db, editorDist: await distWithBuild() });
    expect(await json(await app.request("/api/health"))).toEqual({ ok: true });
  });

  it("still 401s a protected API route rather than serving the app shell", async () => {
    const app = createApp({ db, editorDist: await distWithBuild() });
    expect((await app.request("/api/model")).status).toBe(401);
  });

  it("rejects traversal hidden behind encoded slashes", async () => {
    // Hono collapses ".." when the separators are real slashes, but %2f
    // survives normalisation and arrives at the handler intact. This is the
    // vector the guard exists for.
    const app = createApp({ db, editorDist: await distWithBuild() });
    expect((await app.request("/assets/..%2f..%2fpackage.json")).status).toBe(400);
  });

  it("safely 404s a traversal that normalisation already collapsed", async () => {
    const app = createApp({ db, editorDist: await distWithBuild() });
    const res = await app.request("/%2e%2e/%2e%2e/package.json");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("oth-navigation");
  });
});

describe("when the editor has not been built", () => {
  it("explains where the editor is instead of a bare not-found", async () => {
    const app = createApp({ db, editorDist: join(tmpdir(), "oth-no-such-dist") });
    const res = await app.request("/");
    expect(res.status).toBe(404);
    const body = await json<{ detail: string }>(res);
    expect(body.detail).toMatch(/5180/);
    expect(body.detail).toMatch(/build/i);
  });

  it("still serves the API", async () => {
    const app = createApp({ db, editorDist: join(tmpdir(), "oth-no-such-dist") });
    expect((await app.request("/api/health")).status).toBe(200);
  });
});
