import { parseModel, type MapModel } from "@oth/model";
import { floorExportNote } from "@oth/renderer";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { DownloadModelButton, assetFetcher } from "./DownloadModel";

/** The export itself is the renderer's, tested there; here it answers at once. */
const build = vi.hoisted(() => ({
  fn: vi.fn(async (
    _model: MapModel,
    _levelIds: string[],
    _assetBytes: (id: string) => Promise<Uint8Array | null>,
    _onMissing?: (missing: { placementId: string; assetId: string }) => void,
  ) => new Uint8Array([1, 2, 3])),
}));
vi.mock("@oth/renderer", async importOriginal => ({
  ...(await importOriginal<typeof import("@oth/renderer")>()),
  buildFloorGlb: build.fn,
}));
const saved = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("../ui/download", () => ({ downloadBytes: saved.fn }));

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "Level 2", nameZh: "二楼", elevationM: 6, heightM: 4 },
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "Level 1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L9", buildingId: "oth", code: "L9", ordinal: 9, nameEn: "Level 9", nameZh: "九楼", elevationM: 40, heightM: 4, deletedAt: "2026-09-28T00:00:00.000Z" },
  ],
});

beforeEach(() => {
  build.fn.mockClear();
  saved.fn.mockClear();
  useToasts.getState().clear();
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(model);
  s.setActiveLevel("oth-L1");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function choose(name: string, props: { levelId?: string } = {}) {
  render(<DownloadModelButton api={fakeApi()} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Download 3D model" }));
  fireEvent.click(await screen.findByRole("button", { name }));
}

const lastToast = () => useToasts.getState().toasts.at(-1);

describe("DownloadModelButton", () => {
  it("downloads the floor you're on as oth-L1.glb, and says where its origin is", async () => {
    await choose("This floor (L1)");
    await waitFor(() => expect(saved.fn).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), "oth-L1.glb", "model/gltf-binary"));
    expect(build.fn.mock.calls[0]![1]).toEqual(["oth-L1"]);
    expect(lastToast()).toMatchObject({ tone: "success", message: `Downloaded oth-L1.glb. ${floorExportNote(false)}` });
  });

  it("downloads every floor still on the map as oth-all-floors.glb, and says they're stacked", async () => {
    await choose("All floors");
    await waitFor(() => expect(saved.fn).toHaveBeenCalledWith(expect.any(Uint8Array), "oth-all-floors.glb", "model/gltf-binary"));
    expect([...build.fn.mock.calls[0]![1]].sort()).toEqual(["oth-L1", "oth-L2"]);
    expect(lastToast()?.message).toBe(`Downloaded oth-all-floors.glb. ${floorExportNote(true)}`);
  });

  it("downloads the floor it is given, for the setup wizard", async () => {
    await choose("This floor (L2)", { levelId: "oth-L2" });
    await waitFor(() => expect(saved.fn).toHaveBeenCalledWith(expect.any(Uint8Array), "oth-L2.glb", "model/gltf-binary"));
  });

  it("counts the models it couldn't fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    build.fn.mockImplementationOnce(async (_model, _levelIds, assetBytes, onMissing) => {
      const bytes = await assetBytes("asset_1");
      // Mirrors what the real export does: a fetch that came back empty is
      // reported missing through the callback, exactly as buildFloorGlb does.
      if (!bytes) onMissing?.({ placementId: "pm-1", assetId: "asset_1" });
      return new Uint8Array([1]);
    });
    await choose("This floor (L1)");
    await waitFor(() => expect(lastToast()?.message)
      .toBe("Downloaded oth-L1.glb. 1 model could not be fetched, so its objects are boxes or left out."));
  });

  it("counts a model that arrived but couldn't be read (M2), same as one whose fetch failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([9]).buffer })));
    build.fn.mockImplementationOnce(async (_model, _levelIds, assetBytes, onMissing) => {
      await assetBytes("asset_1"); // arrives fine — not a fetch failure
      onMissing?.({ placementId: "pm-1", assetId: "asset_1" }); // but the export couldn't read it
      return new Uint8Array([1]);
    });
    await choose("This floor (L1)");
    await waitFor(() => expect(lastToast()?.message)
      .toBe("Downloaded oth-L1.glb. 1 model could not be fetched, so its objects are boxes or left out."));
  });

  it("paints \"Building 3D model…\" before doing the heavy build work (M1)", async () => {
    const timeout = vi.spyOn(globalThis, "setTimeout");
    await choose("This floor (L1)");
    await waitFor(() => expect(timeout).toHaveBeenCalledWith(expect.any(Function), 0));
    timeout.mockRestore();
  });

  it("says so when the model can't be built, and saves nothing", async () => {
    build.fn.mockRejectedValueOnce(new Error("bad ring"));
    await choose("This floor (L1)");
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: "error", message: "The 3D model could not be built: bad ring" }));
    expect(saved.fn).not.toHaveBeenCalled();
  });

  it("builds once, however soon it is pressed again", async () => {
    let finish: (bytes: Uint8Array<ArrayBuffer>) => void = () => {};
    build.fn.mockImplementationOnce(() => new Promise(resolve => {
      finish = resolve;
    }));
    await choose("This floor (L1)");
    expect((await screen.findByRole("button", { name: "Building 3D model…" })).hasAttribute("disabled")).toBe(true);
    finish(new Uint8Array([1]));
    await screen.findByRole("button", { name: "Download 3D model" });
    expect(build.fn).toHaveBeenCalledTimes(1);
  });

  it("waits for the map before it offers anything", () => {
    useEditorStore.getState().reset();
    render(<DownloadModelButton api={fakeApi()} />);
    expect(screen.getByRole("button", { name: "Download 3D model" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("assetFetcher", () => {
  it("fetches a model through its asset URL, with the session", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([7, 8]).buffer }));
    const { bytes, missing } = assetFetcher(id => `/api/assets/${id}/file`, fetchImpl as unknown as typeof fetch);
    expect(await bytes("asset_1")).toEqual(new Uint8Array([7, 8]));
    expect(fetchImpl).toHaveBeenCalledWith("/api/assets/asset_1/file", {
      credentials: "same-origin", signal: expect.any(AbortSignal),
    });
    expect(missing.size).toBe(0);
  });

  it("counts a model that isn't there, and a request that fails, as missing", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { bytes, missing } = assetFetcher(id => `/api/assets/${id}/file`, fetchImpl as unknown as typeof fetch);
    expect(await bytes("gone")).toBeNull();
    expect(await bytes("offline")).toBeNull();
    expect([...missing]).toEqual(["gone", "offline"]);
  });

  it("gives each fetch a 30 s timeout (M3), so a stalled request can't hang the export", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchImpl = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([7]).buffer }));
    const { bytes } = assetFetcher(id => `/api/assets/${id}/file`, fetchImpl as unknown as typeof fetch);
    await bytes("asset_1");
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(fetchImpl).toHaveBeenCalledWith("/api/assets/asset_1/file", {
      credentials: "same-origin", signal: expect.any(AbortSignal),
    });
    timeout.mockRestore();
  });

  it("counts a stalled fetch as missing, the same as one that fails outright", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"));
    const { bytes, missing } = assetFetcher(id => `/api/assets/${id}/file`, fetchImpl as unknown as typeof fetch);
    expect(await bytes("stalled")).toBeNull();
    expect([...missing]).toEqual(["stalled"]);
  });
});
