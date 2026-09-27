import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, ConflictError, createApi } from "./client";

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
  it("posts credentials to the login route", async () => {
    const fetchImpl = mockFetch(200, { user: { id: "user_1", displayName: "Wei" } });
    const user = await createApi({ fetchImpl }).login("wei@example.com", "pw");
    expect(user.displayName).toBe("Wei");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("/api/auth/login");
    expect(init?.method).toBe("POST");
  });

  it("sends cookies, since the session lives in one", async () => {
    const fetchImpl = mockFetch(200, { user: { id: "u", displayName: "W" } });
    await createApi({ fetchImpl }).login("a@b.c", "pw");
    expect(fetchImpl.mock.calls[0]![1]?.credentials).toBe("same-origin");
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
});
