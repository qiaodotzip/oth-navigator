import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
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
});
