import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { AssetLibrary } from "./AssetLibrary";

const asset = {
  id: "asset_1", filename: "library-arch.glb", checksum: "abc",
  sizeBytes: 1024, triangleCount: 4200,
  bbox: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 3 },
};

function api(overrides: Record<string, unknown> = {}) {
  return {
    listAssets: vi.fn(async () => [asset]),
    uploadAsset: vi.fn(async () => asset),
    ...overrides,
  } as never;
}

beforeEach(() => useEditorStore.getState().reset());

describe("AssetLibrary", () => {
  it("lists assets with their triangle count", async () => {
    render(<AssetLibrary api={api()} onPlace={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("library-arch.glb")).toBeTruthy());
    expect(screen.getByText(/4,?200/)).toBeTruthy();
  });

  it("selects an asset when clicked", async () => {
    render(<AssetLibrary api={api()} onPlace={vi.fn()} />);
    await waitFor(() => screen.getByText("library-arch.glb"));
    fireEvent.click(screen.getByText("library-arch.glb"));
    expect(useEditorStore.getState().selectedAssetId).toBe("asset_1");
  });

  it("cannot place until an asset is chosen", async () => {
    render(<AssetLibrary api={api()} onPlace={vi.fn()} />);
    await waitFor(() => screen.getByText("library-arch.glb"));
    expect(screen.getByRole("button", { name: /place in selected room/i })).toHaveProperty("disabled", true);
  });

  it("reports an upload rejected for a budget breach in the server's own words", async () => {
    const failing = api({
      uploadAsset: vi.fn(async () => { throw new Error("asset exceeds the 150000 triangle budget"); }),
    });
    render(<AssetLibrary api={failing} onPlace={vi.fn()} />);
    await waitFor(() => screen.getByText("library-arch.glb"));
    fireEvent.change(screen.getByLabelText(/upload a \.glb/i), {
      target: { files: [new File([new Uint8Array([1])], "big.glb")] },
    });
    await waitFor(() => expect(useEditorStore.getState().status).toMatch(/triangle budget/));
  });

  it("survives the asset list failing to load", async () => {
    const broken = api({ listAssets: vi.fn(async () => { throw new Error("offline"); }) });
    render(<AssetLibrary api={broken} onPlace={vi.fn()} />);
    await waitFor(() => expect(useEditorStore.getState().assets).toEqual([]));
  });
});
