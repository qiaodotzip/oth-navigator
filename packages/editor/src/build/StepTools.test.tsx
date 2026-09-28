import { parseModel } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { DressingTools, PathwaysTools } from "./StepTools";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [{ id: "L1-bench", levelId: "oth-L1", kind: "detail", footprint: [[8, 8], [12, 8], [12, 12], [8, 12]], heightM: 1.2 }],
});

const asset = {
  id: "asset_1", filename: "bench.glb", checksum: "c", sizeBytes: 2048, triangleCount: 500,
  bbox: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
};

beforeEach(() => {
  useEditorStore.getState().reset();
  useToasts.getState().clear();
  useEditorStore.getState().setModel(model);
});

describe("PathwaysTools", () => {
  it("opens the walkway types where the pathways are drawn", async () => {
    render(<PathwaysTools saver={{ create: vi.fn() } as unknown as Saver} />);
    fireEvent.click(screen.getByRole("button", { name: "Walkway types (0)" }));
    expect(await screen.findByLabelText("New walkway type")).toBeTruthy();
  });
});

describe("DressingTools", () => {
  function openModels() {
    const create = vi.fn(async () => true);
    render(<DressingTools api={fakeApi({ listAssets: vi.fn().mockResolvedValue([asset]) })} saver={{ create } as unknown as Saver} />);
    fireEvent.click(screen.getByRole("button", { name: "Models…" }));
    return create;
  }

  it("places the chosen model on the selected detail, at its middle", async () => {
    useEditorStore.getState().select({ type: "room", id: "L1-bench" });
    const create = openModels();
    fireEvent.click(await screen.findByRole("button", { name: /bench\.glb/ }));
    fireEvent.click(screen.getByRole("button", { name: "Place in selected room" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("placement", expect.objectContaining({
      roomId: "L1-bench", assetId: "asset_1", position: [10, 10, 0],
    })));
  });

  it("says what to select first when nothing is", async () => {
    const create = openModels();
    fireEvent.click(await screen.findByRole("button", { name: /bench\.glb/ }));
    fireEvent.click(screen.getByRole("button", { name: "Place in selected room" }));
    expect(useToasts.getState().toasts.at(-1)?.message).toBe("Select a room or detail first.");
    expect(create).not.toHaveBeenCalled();
  });

  it("says so, rather than nothing, when no floor has loaded", async () => {
    useEditorStore.getState().reset();
    const create = openModels();
    fireEvent.click(await screen.findByRole("button", { name: /bench\.glb/ }));
    fireEvent.click(screen.getByRole("button", { name: "Place in selected room" }));
    expect(useToasts.getState().toasts.at(-1)?.message).toBe("Select a room or detail first.");
    expect(create).not.toHaveBeenCalled();
  });

  it("leaves the floor's export to Download 3D model, beside 3D", () => {
    openModels();
    expect(screen.queryByRole("button", { name: /Export context for Blender/ })).toBeNull();
  });

  it("does not title the models Dressing again, inside the step that already is", async () => {
    openModels();
    await screen.findByRole("button", { name: /bench\.glb/ });
    expect(screen.queryByRole("heading", { name: "Dressing" })).toBeNull();
  });
});
