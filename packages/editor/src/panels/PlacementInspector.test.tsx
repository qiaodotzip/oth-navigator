import { parseModel } from "@oth/model";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { PlacementInspector } from "./PlacementInspector";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  assets: [{
    id: "asset_1", filename: "arch.glb", storagePath: "a", checksum: "c",
    sizeBytes: 10, triangleCount: 5,
    bbox: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
  }],
  placements: [{
    id: "pl_1", levelId: "oth-L1", assetId: "asset_1",
    position: [5, 7, 0], rotationDeg: 90, scale: 2,
  }],
});

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

const selectPlacement = () => useEditorStore.getState().select({ type: "placement", id: "pl_1" });

describe("PlacementInspector", () => {
  it("shows nothing when no placement is selected", () => {
    const { container } = render(<PlacementInspector onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the current transform", () => {
    selectPlacement();
    render(<PlacementInspector onChange={vi.fn()} />);
    expect((screen.getByLabelText(/east/i) as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText(/rotation/i) as HTMLInputElement).value).toBe("90");
    expect((screen.getByLabelText(/scale/i) as HTMLInputElement).value).toBe("2");
  });

  it("names the asset, so you know what you are moving", () => {
    selectPlacement();
    render(<PlacementInspector onChange={vi.fn()} />);
    expect(screen.getByText("arch.glb")).toBeTruthy();
  });

  it("saves a moved position", () => {
    const onChange = vi.fn();
    selectPlacement();
    render(<PlacementInspector onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/east/i), { target: { value: "12" } });
    fireEvent.blur(screen.getByLabelText(/east/i));
    expect(onChange.mock.calls[0]![1]).toMatchObject({ position: [12, 7, 0] });
  });

  it("saves rotation", () => {
    const onChange = vi.fn();
    selectPlacement();
    render(<PlacementInspector onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/rotation/i), { target: { value: "180" } });
    fireEvent.blur(screen.getByLabelText(/rotation/i));
    expect(onChange.mock.calls[0]![1]).toMatchObject({ rotationDeg: 180 });
  });

  it("ignores a non-numeric entry rather than writing NaN", () => {
    const onChange = vi.fn();
    selectPlacement();
    render(<PlacementInspector onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/scale/i), { target: { value: "big" } });
    fireEvent.blur(screen.getByLabelText(/scale/i));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses a non-positive scale, which the model rejects anyway", () => {
    const onChange = vi.fn();
    selectPlacement();
    render(<PlacementInspector onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/scale/i), { target: { value: "0" } });
    fireEvent.blur(screen.getByLabelText(/scale/i));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the next placement's numbers when the selection moves to it", () => {
    useEditorStore.getState().setModel(parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: model.levels,
      assets: model.assets,
      placements: [
        ...model.placements,
        { id: "pl_2", levelId: "oth-L1", assetId: "asset_1", position: [9, 3, 0] },
      ],
    }));
    selectPlacement();
    render(<PlacementInspector onChange={vi.fn()} />);
    act(() => useEditorStore.getState().select({ type: "placement", id: "pl_2" }));
    // Uncontrolled fields keep what they first showed unless they are keyed by the entity.
    expect((screen.getByLabelText(/east/i) as HTMLInputElement).value).toBe("9");
  });

  it("shows a move made elsewhere, such as a drag on the plan", () => {
    selectPlacement();
    render(<PlacementInspector onChange={vi.fn()} />);
    act(() => useEditorStore.getState().setModel({
      ...model,
      placements: model.placements.map(p => ({ ...p, position: [11, 7, 0] as [number, number, number], rotationDeg: 45, scale: 3, version: 1 })),
    }));
    expect((screen.getByLabelText(/east/i) as HTMLInputElement).value).toBe("11");
    expect((screen.getByLabelText(/rotation/i) as HTMLInputElement).value).toBe("45");
    expect((screen.getByLabelText(/scale/i) as HTMLInputElement).value).toBe("3");
  });

  it("writes nothing for a blur with no edit, so it cannot undo a move made elsewhere", () => {
    const onChange = vi.fn();
    selectPlacement();
    render(<PlacementInspector onChange={onChange} />);
    for (const label of [/east/i, /north/i, /up/i, /rotation/i, /scale/i]) fireEvent.blur(screen.getByLabelText(label));
    expect(onChange).not.toHaveBeenCalled();
  });
});
