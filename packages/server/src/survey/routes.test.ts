import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { readImageSize } from "../images/inspect";
import { createUser } from "../auth/users";
import type { Database } from "../db/client";
import { createTestDb, json } from "../testing/harness";

let db: Database;
let app: ReturnType<typeof createApp>;
let cookie: string;

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

const patch = (path: string, body: unknown) =>
  app.request(path, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });

function grab(bytes: Uint8Array, captureId = "cap_1", timeMs?: string, headers = { cookie }) {
  const form = new FormData();
  form.append("file", new Blob([bytes]), "frame.png");
  form.append("captureId", captureId);
  if (timeMs !== undefined) form.append("timeMs", timeMs);
  return app.request("/api/keyframes", { method: "POST", headers, body: form });
}

beforeEach(async () => {
  db = await createTestDb();
  app = createApp({ db, dataDir: await mkdtemp(join(tmpdir(), "oth-survey-")) });
  await createUser(db, { email: "wei@example.com", password: "passphrase", displayName: "Wei" });
  cookie = (await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "wei@example.com", password: "passphrase" }),
  })).headers.get("set-cookie") ?? "";
  await post("/api/entities/capture", {
    data: { id: "cap_1", kind: "video", filename: "L1 walk.mp4", durationMs: 90000 },
  });
});

describe("keyframe upload", () => {
  it("stores a frame and reads its size out of the image", async () => {
    const res = await grab(png(640, 480), "cap_1", "4200");
    expect(res.status).toBe(201);
    const body = await json<{ keyframe: { widthPx: number; timeMs: number; id: string } }>(res);
    expect(body.keyframe.widthPx).toBe(640);
    expect(body.keyframe.timeMs).toBe(4200);
    expect(body.keyframe.id).toMatch(/^kf_/);
  });

  it("accepts a photo, which has no timestamp", async () => {
    const body = await json<{ keyframe: { timeMs: number | null } }>(await grab(png(100, 100)));
    expect(body.keyframe.timeMs ?? null).toBeNull();
  });

  it("refuses a frame for a capture that does not exist", async () => {
    expect((await grab(png(10, 10), "cap_nope")).status).toBe(422);
  });

  it("refuses a file that is not an image", async () => {
    expect((await grab(new Uint8Array([1, 2, 3, 4]))).status).toBe(422);
  });

  it("refuses a request with no file at all", async () => {
    const form = new FormData();
    form.append("captureId", "cap_1");
    const res = await app.request("/api/keyframes", { method: "POST", headers: { cookie }, body: form });
    expect(res.status).toBe(400);
  });

  it("requires authentication, since the frames are of a real building", async () => {
    expect((await grab(png(10, 10), "cap_1", undefined, {} as { cookie: string })).status).toBe(401);
  });

  it("serves the stored frame back", async () => {
    const body = await json<{ keyframe: { id: string } }>(await grab(png(64, 48)));
    const file = await app.request(`/api/keyframes/${body.keyframe.id}/file`, { headers: { cookie } });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toContain("image");
  });

  it("serves a narrower copy when a width is asked for", async () => {
    const big = new Uint8Array(await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: "#777777" },
    }).jpeg().toBuffer());
    const body = await json<{ keyframe: { id: string } }>(await grab(big));
    const file = await app.request(`/api/keyframes/${body.keyframe.id}/file?w=240`, { headers: { cookie } });
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    expect(readImageSize(new Uint8Array(await file.arrayBuffer())).widthPx).toBe(240);
  });

  it("serves the original when it is already smaller than the width asked for", async () => {
    const body = await json<{ keyframe: { id: string } }>(await grab(png(64, 48)));
    const file = await app.request(`/api/keyframes/${body.keyframe.id}/file?w=240`, { headers: { cookie } });
    expect(file.status).toBe(200);
    expect(readImageSize(new Uint8Array(await file.arrayBuffer())).widthPx).toBe(64);
  });

  it("404s a frame that does not exist rather than serving nothing", async () => {
    const res = await app.request("/api/keyframes/kf_nope/file", { headers: { cookie } });
    expect(res.status).toBe(404);
  });

  it("lists what has been grabbed", async () => {
    await grab(png(10, 10));
    await grab(png(20, 20));
    const res = await app.request("/api/keyframes", { headers: { cookie } });
    expect((await json<{ items: unknown[] }>(res)).items).toHaveLength(2);
  });

  it("restores a binned frame with the tags binned with it, and not ones removed by hand before", async () => {
    const body = await json<{ keyframe: { id: string } }>(await grab(png(10, 10)));
    const kf = body.keyframe.id;
    await post("/api/entities/place", { data: { id: "pl_r", nameEn: "Somewhere", category: "retail" } });
    await post("/api/entities/sighting", { data: { id: "sg_keep", placeId: "pl_r", keyframeId: kf } });
    await post("/api/entities/sighting", { data: { id: "sg_gone", placeId: "pl_r", keyframeId: kf } });
    // Removed by hand first, so it must stay removed.
    await app.request("/api/entities/sighting/sg_gone", {
      method: "DELETE", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ expectedVersion: 0 }),
    });
    await app.request(`/api/keyframes/${kf}`, { method: "DELETE", headers: { cookie } });

    const res = await app.request(`/api/keyframes/${kf}/restore`, { method: "POST", headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ sightings: 1 });

    const frames = await json<{ items: { id: string }[] }>(await app.request("/api/keyframes", { headers: { cookie } }));
    expect(frames.items.map(f => f.id)).toContain(kf);
    const sightings = await json<{ items: { id: string }[] }>(await app.request("/api/entities/sighting", { headers: { cookie } }));
    expect(sightings.items.map(s => s.id)).toEqual(["sg_keep"]);
  });

  it("refuses to restore a frame that is not binned", async () => {
    const body = await json<{ keyframe: { id: string } }>(await grab(png(10, 10)));
    expect((await app.request(`/api/keyframes/${body.keyframe.id}/restore`, { method: "POST", headers: { cookie } })).status).toBe(422);
  });
});

describe("the rest of the survey layer goes through generic CRUD", () => {
  it("creates a place", async () => {
    const res = await post("/api/entities/place", {
      data: { id: "pl_1", nameEn: "NTUC FairPrice", category: "retail" },
    });
    expect(res.status).toBe(201);
  });

  it("creates a sighting tying a place to a frame", async () => {
    const kf = await json<{ keyframe: { id: string } }>(await grab(png(10, 10)));
    await post("/api/entities/place", { data: { id: "pl_1", nameEn: "NTUC", category: "retail" } });
    const res = await post("/api/entities/sighting", {
      data: { id: "sg_1", placeId: "pl_1", keyframeId: kf.keyframe.id, box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
    });
    expect(res.status).toBe(201);
  });

  it("422s a place with no name, since naming is the point", async () => {
    const res = await post("/api/entities/place", { data: { id: "pl_2", nameEn: "", category: "retail" } });
    expect(res.status).toBe(422);
  });

  it("has no generic create for a keyframe, which would have no image behind it", async () => {
    const res = await post("/api/entities/keyframe", { data: { id: "kf_x" } });
    expect(res.status).toBe(400);
  });
});

describe("removing a frame", () => {
  it("retires the frame and everything said about it", async () => {
    const kf = await json<{ keyframe: { id: string } }>(await grab(png(10, 10)));
    await post("/api/entities/place", { data: { id: "pl_1", nameEn: "X", category: "retail" } });
    await post("/api/entities/sighting", {
      data: { id: "sg_1", placeId: "pl_1", keyframeId: kf.keyframe.id },
    });

    const res = await app.request(`/api/keyframes/${kf.keyframe.id}`, {
      method: "DELETE", headers: { cookie },
    });
    expect(res.status).toBe(204);

    const list = await app.request("/api/keyframes", { headers: { cookie } });
    expect((await json<{ items: unknown[] }>(list)).items).toHaveLength(0);

    // A label pointing at a frame nobody can see still counts toward a place.
    const left = await app.request("/api/entities/sighting", { headers: { cookie } });
    expect((await json<{ items: unknown[] }>(left)).items).toHaveLength(0);
  });

  it("404s a frame that is not there", async () => {
    const res = await app.request("/api/keyframes/kf_nope", { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const kf = await json<{ keyframe: { id: string } }>(await grab(png(10, 10)));
    const res = await app.request(`/api/keyframes/${kf.keyframe.id}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });
});

describe("removing a capture", () => {
  it("takes its frames and their labels with it", async () => {
    // A frame with no capture is reachable from nothing but still counts
    // toward a place, so the cascade is the behaviour rather than a courtesy.
    const kf = await json<{ keyframe: { id: string } }>(await grab(png(10, 10)));
    await post("/api/entities/place", { data: { id: "pl_1", nameEn: "X", category: "retail" } });
    await post("/api/entities/sighting", {
      data: { id: "sg_1", placeId: "pl_1", keyframeId: kf.keyframe.id },
    });

    const res = await app.request("/api/captures/cap_1", { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(200);
    expect((await json<{ frames: number }>(res)).frames).toBe(1);

    const frames = await app.request("/api/keyframes", { headers: { cookie } });
    expect((await json<{ items: unknown[] }>(frames)).items).toHaveLength(0);
    const left = await app.request("/api/entities/sighting", { headers: { cookie } });
    expect((await json<{ items: unknown[] }>(left)).items).toHaveLength(0);
  });

  it("leaves the places themselves alone, since they may be seen elsewhere", async () => {
    await post("/api/entities/place", { data: { id: "pl_1", nameEn: "X", category: "retail" } });
    await app.request("/api/captures/cap_1", { method: "DELETE", headers: { cookie } });
    const places = await app.request("/api/entities/place", { headers: { cookie } });
    expect((await json<{ items: unknown[] }>(places)).items).toHaveLength(1);
  });

  it("404s a capture that is not there", async () => {
    const res = await app.request("/api/captures/cap_nope", { method: "DELETE", headers: { cookie } });
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    expect((await app.request("/api/captures/cap_1", { method: "DELETE" })).status).toBe(401);
  });

  it("renames through the generic entity route", async () => {
    const res = await patch("/api/entities/capture/cap_1", {
      expectedVersion: 0,
      data: { filename: "Level 1 — east wing" },
    });
    expect(res.status).toBe(200);
    expect((await json<{ entity: { filename: string } }>(res)).entity.filename)
      .toBe("Level 1 — east wing");
  });
});
