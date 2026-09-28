import { parseModel } from "@oth/model";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { DressingTools, PathwaysTools } from "./StepTools";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [
    { id: "L1-bench", levelId: "oth-L1", kind: "detail", footprint: [[8, 8], [12, 8], [12, 12], [8, 12]], heightM: 1.2 },
    { id: "L1-hall", levelId: "oth-L1", kind: "area", footprint: [[0, 0], [40, 0], [40, 20], [0, 20]], heightM: 5, walkable: true, nameEn: "Hall" },
  ],
  objectKinds: [{ id: "ok_bin", nameEn: "wastebin", size: { w: 0.5, d: 0.5, h: 1 } }],
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

  function openObjects(create = vi.fn(async () => true)) {
    render(<DressingTools api={fakeApi()} saver={{ create } as unknown as Saver} />);
    fireEvent.click(screen.getByRole("button", { name: "Objects…" }));
    return create;
  }

  it("lists each live kind of object, with its size and a Place button", () => {
    openObjects();
    expect(screen.getByText("wastebin")).toBeTruthy();
    expect(screen.getByText("0.5 × 0.5 × 1 m")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Place wastebin" })).toBeTruthy();
  });

  it("places the chosen kind on the selected room, at its centroid, then selects it", async () => {
    useEditorStore.getState().select({ type: "room", id: "L1-hall" });
    const create = openObjects();
    fireEvent.click(screen.getByRole("button", { name: "Place wastebin" }));
    await waitFor(() => expect(create).toHaveBeenCalledWith("placement", expect.objectContaining({
      roomId: "L1-hall", objectKindId: "ok_bin", position: [20, 10, 0], rotationDeg: 0, scale: 1, sightingIds: [],
    })));
    await waitFor(() => expect(useEditorStore.getState().selection).toEqual({
      type: "placement", id: expect.stringContaining("oth-L1-object-"),
    }));
  });

  it("places one, not two, when Place is clicked again while the first is saving", async () => {
    useEditorStore.getState().select({ type: "room", id: "L1-hall" });
    let land!: (saved: boolean) => void;
    const create = openObjects(vi.fn(() => new Promise<boolean>(resolve => { land = resolve; })));
    const place = screen.getByRole("button", { name: "Place wastebin" }) as HTMLButtonElement;
    fireEvent.click(place);
    fireEvent.click(place);
    expect(create).toHaveBeenCalledTimes(1);
    expect(place.disabled).toBe(true);
    await act(async () => land(true));
    // Once it has landed, another can be placed (the new one is selected now, so the room again).
    await waitFor(() => expect(place.disabled).toBe(false));
    act(() => useEditorStore.getState().select({ type: "room", id: "L1-hall" }));
    fireEvent.click(place);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("says what to select first when nothing is, and creates nothing", () => {
    const create = openObjects();
    fireEvent.click(screen.getByRole("button", { name: "Place wastebin" }));
    expect(useToasts.getState().toasts.at(-1)?.message).toBe("Select a room or area first.");
    expect(create).not.toHaveBeenCalled();
  });

  it("says there are none yet when no kind has been tagged", () => {
    useEditorStore.getState().setModel(parseModel({ ...model, objectKinds: [] }));
    openObjects();
    expect(screen.getByText("No objects yet. Tag one in Survey as an Object.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Place/ })).toBeNull();
  });
});
