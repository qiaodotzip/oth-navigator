import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, ConflictError, createApi, isUnauthorized, wasWrite } from "./client";

/**
 * Declares the fetch parameters explicitly so `mock.calls` is typed and the
 * assertions below can actually read the url and init they were given.
 */
function mockFetch(status: number, body: unknown) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api client", () => {
  it("posts the chosen id to the login route", async () => {
    const fetchImpl = mockFetch(200, { user: { id: "user_1", displayName: "Wei" } });
    const user = await createApi({ fetchImpl }).login("user_1");
    expect(user.displayName).toBe("Wei");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/auth/login");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ userId: "user_1" });
  });

  it("sends cookies, since the session lives in one", async () => {
    const fetchImpl = mockFetch(200, { user: { id: "u", displayName: "W" } });
    await createApi({ fetchImpl }).login("u");
    expect(fetchImpl.mock.calls[0]![1]?.credentials).toBe("same-origin");
  });

  it("lists who can sign in, without needing a session", async () => {
    const fetchImpl = mockFetch(200, { people: [{ id: "u1", displayName: "Ada" }] });
    const people = await createApi({ fetchImpl }).people();
    expect(people).toEqual([{ id: "u1", displayName: "Ada" }]);
    expect(fetchImpl.mock.calls[0]![0]).toBe("/api/auth/people");
  });

  it("throws ApiError carrying the status", async () => {
    const api = createApi({ fetchImpl: mockFetch(401, { error: "unauthenticated" }) });
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
  });

  it("throws ConflictError with the current state on 409", async () => {
    const current = { id: "L1-lobby", version: 3, nameEn: "Theirs" };
    const api = createApi({ fetchImpl: mockFetch(409, { error: "version conflict", current }) });
    await expect(api.updateEntity("room", "L1-lobby", 0, { nameEn: "Mine" }))
      .rejects.toBeInstanceOf(ConflictError);
    await expect(api.updateEntity("room", "L1-lobby", 0, { nameEn: "Mine" }))
      .rejects.toMatchObject({ current });
  });

  it("sends expectedVersion on an update", async () => {
    const fetchImpl = mockFetch(200, { entity: { id: "L1-lobby", version: 1 } });
    await createApi({ fetchImpl }).updateEntity("room", "L1-lobby", 0, { nameEn: "X" });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body));
    expect(body.expectedVersion).toBe(0);
  });

  it("returns the validation report unchanged", async () => {
    const report = { issues: [], errorCount: 0, warningCount: 0, ok: true };
    expect(await createApi({ fetchImpl: mockFetch(200, report) }).validate()).toEqual(report);
  });

  it("surfaces a blocked publish as ApiError with the report", async () => {
    const report = { issues: [{ code: "room.unreachable" }], errorCount: 1, warningCount: 0, ok: false };
    const api = createApi({ fetchImpl: mockFetch(422, { error: "validation failed", report }) });
    await expect(api.publish()).rejects.toMatchObject({ status: 422 });
  });

  it("handles a 204 with no body", async () => {
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => new Response(null, { status: 204 }));
    const api = createApi({ fetchImpl });
    await expect(api.logout()).resolves.toBeUndefined();
  });

  it("calls onUnauthorized for a 401 on an ordinary request", async () => {
    const onUnauthorized = vi.fn();
    const api = createApi({ fetchImpl: mockFetch(401, { error: "unauthenticated" }), onUnauthorized });
    await expect(api.getModel()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not call onUnauthorized for a 401 on login, me, people or logout", async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = mockFetch(401, { error: "unauthenticated" });
    const api = createApi({ fetchImpl, onUnauthorized });
    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    await expect(api.login("u1")).rejects.toBeInstanceOf(ApiError);
    await expect(api.people()).rejects.toBeInstanceOf(ApiError);
    await expect(api.logout()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("tells onUnauthorized which request was refused", async () => {
    const onUnauthorized = vi.fn();
    const api = createApi({ fetchImpl: mockFetch(401, { error: "unauthenticated" }), onUnauthorized });
    await expect(api.deleteKeyframe("kf_1")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledWith({ method: "DELETE", path: "/api/keyframes/kf_1" });
  });
});

describe("isUnauthorized", () => {
  it("is true only for a 401 ApiError", () => {
    expect(isUnauthorized(new ApiError(401, null))).toBe(true);
    expect(isUnauthorized(new ApiError(422, null))).toBe(false);
    expect(isUnauthorized(new Error("boom"))).toBe(false);
  });
});

describe("wasWrite", () => {
  it("counts a request that changes something as a write", () => {
    expect(wasWrite({ method: "POST", path: "/api/entities/room" })).toBe(true);
    expect(wasWrite({ method: "PATCH", path: "/api/entities/room/r1" })).toBe(true);
    expect(wasWrite({ method: "DELETE", path: "/api/keyframes/kf_1" })).toBe(true);
  });

  it("does not count reading, or the presence and lock pings every screen sends", () => {
    expect(wasWrite({ method: "GET", path: "/api/model" })).toBe(false);
    expect(wasWrite({ method: "POST", path: "/api/presence" })).toBe(false);
    expect(wasWrite({ method: "POST", path: "/api/locks/room/r1" })).toBe(false);
    expect(wasWrite({ method: "DELETE", path: "/api/locks/room/r1" })).toBe(false);
  });
});

describe("assets", () => {
  it("lists assets", async () => {
    const fetchImpl = mockFetch(200, { items: [{ id: "asset_1", filename: "arch.glb" }] });
    expect((await createApi({ fetchImpl }).listAssets())[0]?.filename).toBe("arch.glb");
  });

  it("uploads as multipart and does not force a JSON content-type", async () => {
    const fetchImpl = mockFetch(201, { asset: { id: "asset_1", filename: "arch.glb" } });
    await createApi({ fetchImpl }).uploadAsset(new File([new Uint8Array([1, 2, 3])], "arch.glb"));
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init.body).toBeInstanceOf(FormData);
    // Setting content-type by hand strips the multipart boundary and the
    // upload silently fails to parse server-side.
    expect(init.headers).toBeUndefined();
  });

  it("builds a stable file url", () => {
    expect(createApi().assetFileUrl("asset_1")).toBe("/api/assets/asset_1/file");
  });

  it("asks for a frame at a width, or the original without one", () => {
    expect(createApi().keyframeFileUrl("kf_1")).toBe("/api/keyframes/kf_1/file");
    expect(createApi().keyframeFileUrl("kf_1", 240)).toBe("/api/keyframes/kf_1/file?w=240");
  });

  it("adds a teammate by name alone", async () => {
    const fetchImpl = mockFetch(201, { user: { id: "u2", displayName: "A" } });
    const result = await createApi({ fetchImpl }).inviteUser("A");
    expect(result.user.displayName).toBe("A");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/users/invite");
    expect(JSON.parse(String(init?.body))).toEqual({ displayName: "A" });
  });

  it("restores an entity at the version the delete left", async () => {
    const fetchImpl = mockFetch(200, { entity: { id: "p1", version: 2 } });
    await createApi({ fetchImpl }).restoreEntity("pathway", "p1", 1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/entities/pathway/p1/restore");
    expect(JSON.parse(String(init?.body))).toEqual({ expectedVersion: 1 });
  });

  it("reports the server unreachable rather than throwing", async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await createApi({ fetchImpl }).health()).toBe(false);
  });
});
