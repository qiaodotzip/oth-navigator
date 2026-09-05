import { parseModel } from "@oth/model";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { PlanCanvas } from "./PlanCanvas";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  assets: [{
    id: "asset_1", filename: "arch.glb", storagePath: "a", checksum: "c",
    sizeBytes: 10, triangleCount: 5,
    bbox: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
  }],
  placements: [{
    id: "pl_1", levelId: "oth-L1", assetId: "asset_1", position: [5, 5, 0],
  }],
  rooms: [
    {
      id: "L1-a", levelId: "oth-L1", kind: "room",
      footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
      heightM: 3, walkable: true, nameEn: "Room A", nameZh: "A",
    },
    {
      id: "L2-a", levelId: "oth-L2", kind: "room",
      footprint: [[50, 50], [70, 50], [70, 70], [50, 70]],
      heightM: 3, walkable: true, nameEn: "Room B", nameZh: "B",
    },
  ],
});

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
});

describe("PlanCanvas", () => {
  it("renders a polygon for each room on the active level", () => {
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("room-L1-a")).toBeTruthy();
  });

  it("selects a room when it is clicked with the select tool", () => {
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.click(screen.getByTestId("room-L1-a"));
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
  });

  it("does not select while a drawing tool is active", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.click(screen.getByTestId("room-L1-a"));
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it("accumulates draft points while drawing a room", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    expect(useEditorStore.getState().draft).toHaveLength(2);
  });

  it("commits a room on double click and clears the draft", () => {
    const onCommitRoom = vi.fn();
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} onCommitRoom={onCommitRoom} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 200 });
    fireEvent.doubleClick(surface);
    expect(onCommitRoom).toHaveBeenCalledTimes(1);
    expect(onCommitRoom.mock.calls[0]![0]).toHaveLength(3);
    expect(useEditorStore.getState().draft).toBeNull();
  });

  it("refuses to commit a ring with fewer than three points", () => {
    const onCommitRoom = vi.fn();
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} onCommitRoom={onCommitRoom} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.doubleClick(surface);
    expect(onCommitRoom).not.toHaveBeenCalled();
  });

  it("zooms on wheel", () => {
    render(<PlanCanvas width={800} height={600} />);
    const before = useEditorStore.getState().viewport.scale;
    fireEvent.wheel(screen.getByTestId("plan-surface"), { deltaY: -100, clientX: 400, clientY: 300 });
    expect(useEditorStore.getState().viewport.scale).not.toBe(before);
  });

  it("commits an entrance point immediately with the place tool", () => {
    const onCommitPoint = vi.fn();
    useEditorStore.getState().setTool("place-entrance");
    render(<PlanCanvas width={800} height={600} onCommitPoint={onCommitPoint} />);
    fireEvent.click(screen.getByTestId("plan-surface"), { clientX: 120, clientY: 140 });
    expect(onCommitPoint).toHaveBeenCalledTimes(1);
  });
});

describe("framing", () => {
  it("puts the level's rooms inside the visible canvas", () => {
    render(<PlanCanvas width={800} height={600} />);
    const vp = useEditorStore.getState().viewport;
    // The room spans 0..10 m. With the default viewport it renders entirely
    // above the canvas, which is what made the editor look empty.
    const [sx, sy] = [vp.originX + 5 * vp.scale, vp.originY - 5 * vp.scale];
    expect(sx).toBeGreaterThan(0);
    expect(sx).toBeLessThan(800);
    expect(sy).toBeGreaterThan(0);
    expect(sy).toBeLessThan(600);
  });

  it("re-frames when the level changes", () => {
    render(<PlanCanvas width={800} height={600} />);
    // act() so React flushes the fitting effect before the assertion.
    act(() => {
      useEditorStore.getState().setViewport({ originX: -9999, originY: -9999, scale: 1 });
      useEditorStore.getState().setActiveLevel("oth-L2");
    });
    expect(useEditorStore.getState().viewport.originX).not.toBe(-9999);
  });

  it("does not fight a manual pan on an unrelated re-render", () => {
    const { rerender } = render(<PlanCanvas width={800} height={600} />);
    useEditorStore.getState().setViewport({ originX: 123, originY: 456, scale: 7 });
    rerender(<PlanCanvas width={800} height={600} />);
    expect(useEditorStore.getState().viewport).toEqual({ originX: 123, originY: 456, scale: 7 });
  });

  it("leaves the viewport alone on a level with nothing to frame", () => {
    useEditorStore.getState().setModel(
      parseModel({
        building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
        levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
      }),
    );
    const before = useEditorStore.getState().viewport;
    render(<PlanCanvas width={800} height={600} />);
    expect(useEditorStore.getState().viewport).toEqual(before);
  });
});

const levelImage = {
  id: "img_1", levelId: "oth-L1", filename: "L1.png",
  widthPx: 1000, heightPx: 500, sizeBytes: 10,
  metresPerPixel: 0.1 as number | null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0,
};

describe("underlay", () => {
  const url = (id: string) => `/api/level-images/${id}/file`;

  it("renders the level's floorplan", () => {
    useEditorStore.getState().setLevelImages([levelImage]);
    render(<PlanCanvas width={800} height={600} imageUrl={url} />);
    expect(screen.getByTestId("underlay")).toBeTruthy();
  });

  it("renders no underlay for a level without one", () => {
    useEditorStore.getState().setLevelImages([{ ...levelImage, levelId: "oth-L2" }]);
    render(<PlanCanvas width={800} height={600} imageUrl={url} />);
    expect(screen.queryByTestId("underlay")).toBeNull();
  });

  it("does not render an uncalibrated image, which has no size in metres", () => {
    useEditorStore.getState().setLevelImages([{ ...levelImage, metresPerPixel: null }]);
    render(<PlanCanvas width={800} height={600} imageUrl={url} />);
    expect(screen.queryByTestId("underlay")).toBeNull();
  });

  it("draws the underlay behind the rooms", () => {
    useEditorStore.getState().setLevelImages([levelImage]);
    const { container } = render(<PlanCanvas width={800} height={600} imageUrl={url} />);
    const ids = Array.from(container.querySelectorAll("[data-testid]"))
      .map(n => n.getAttribute("data-testid"));
    expect(ids.indexOf("underlay")).toBeLessThan(ids.indexOf("room-L1-a"));
  });

  it("frames the underlay, so a level with an image but no rooms is not blank", () => {
    useEditorStore.getState().setModel(
      parseModel({
        building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
        levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
      }),
    );
    useEditorStore.getState().setLevelImages([levelImage]);
    render(<PlanCanvas width={800} height={600} imageUrl={url} />);
    const vp = useEditorStore.getState().viewport;
    // The image spans 0..100 m east and -50..0 north; its centre must be on screen.
    const [sx, sy] = [vp.originX + 50 * vp.scale, vp.originY - -25 * vp.scale];
    expect(sx).toBeGreaterThan(0);
    expect(sx).toBeLessThan(800);
    expect(sy).toBeGreaterThan(0);
    expect(sy).toBeLessThan(600);
  });
});

describe("drawing feedback", () => {
  beforeEach(() => useEditorStore.getState().setTool("draw-room"));

  it("explains what to do while drawing", () => {
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("drawing-hint").textContent).toMatch(/click/i);
  });

  it("shows a dot for each placed point", () => {
    render(<PlanCanvas width={800} height={600} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    expect(screen.getAllByTestId(/^draft-vertex-/)).toHaveLength(2);
  });

  it("rubber-bands from the last point to the cursor", () => {
    render(<PlanCanvas width={800} height={600} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(surface, { clientX: 300, clientY: 220 });
    expect(screen.getByTestId("rubber-band")).toBeTruthy();
  });

  it("highlights what the cursor will snap to", () => {
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.mouseMove(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100 });
    expect(screen.getByTestId("snap-indicator")).toBeTruthy();
  });

  it("shows no snap indicator before the pointer has moved", () => {
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.queryByTestId("snap-indicator")).toBeNull();
  });

  it("closes the shape when the first corner is clicked", () => {
    const onCommitRoom = vi.fn();
    render(<PlanCanvas width={800} height={600} onCommitRoom={onCommitRoom} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 200 });
    fireEvent.click(screen.getByTestId("draft-vertex-0"));
    expect(onCommitRoom).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().draft).toBeNull();
  });

  it("removes the last point on Backspace", () => {
    render(<PlanCanvas width={800} height={600} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(useEditorStore.getState().draft).toHaveLength(1);
  });

  it("cancels the whole shape on Escape", () => {
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.click(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100 });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useEditorStore.getState().draft).toBeNull();
  });

  it("shows no hint with the select tool", () => {
    useEditorStore.getState().setTool("select");
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.queryByTestId("drawing-hint")).toBeNull();
  });
});

describe("vertex handles on the canvas", () => {
  it("appear for the selected room with the select tool", () => {
    useEditorStore.getState().setTool("select");
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getAllByTestId(/^vertex-/)).toHaveLength(4);
  });

  it("stay hidden while a drawing tool is active", () => {
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.queryByTestId("vertex-0")).toBeNull();
  });

  it("saves a reshaped footprint", () => {
    const onReshapeRoom = vi.fn();
    useEditorStore.getState().setTool("select");
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    render(<PlanCanvas width={800} height={600} onReshapeRoom={onReshapeRoom} />);
    fireEvent.mouseDown(screen.getByTestId("vertex-0"), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 150, clientY: 130 });
    fireEvent.mouseUp(window, { clientX: 150, clientY: 130 });
    expect(onReshapeRoom).toHaveBeenCalledTimes(1);
    expect(onReshapeRoom.mock.calls[0]![0].id).toBe("L1-a");
  });
});

describe("placements on the canvas", () => {
  beforeEach(() => useEditorStore.getState().setTool("select"));

  it("renders a marker for each placement on the level", () => {
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("placement-pl_1")).toBeTruthy();
  });

  it("selects a placement when pressed", () => {
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.mouseDown(screen.getByTestId("placement-pl_1"), { clientX: 100, clientY: 100 });
    expect(useEditorStore.getState().selection).toEqual({ type: "placement", id: "pl_1" });
  });

  it("drags a placement and saves once on release", () => {
    const onMovePlacement = vi.fn();
    render(<PlanCanvas width={800} height={600} onMovePlacement={onMovePlacement} />);
    fireEvent.mouseDown(screen.getByTestId("placement-pl_1"), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 130 });
    expect(onMovePlacement).not.toHaveBeenCalled();
    fireEvent.mouseUp(window, { clientX: 140, clientY: 130 });
    expect(onMovePlacement).toHaveBeenCalledTimes(1);
  });

  it("keeps the placement's height when dragged in plan view", () => {
    const onMovePlacement = vi.fn();
    render(<PlanCanvas width={800} height={600} onMovePlacement={onMovePlacement} />);
    fireEvent.mouseDown(screen.getByTestId("placement-pl_1"), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 130 });
    fireEvent.mouseUp(window, { clientX: 140, clientY: 130 });
    expect(onMovePlacement.mock.calls[0]![1][2]).toBe(0);
  });

  it("does not drag with a drawing tool active", () => {
    const onMovePlacement = vi.fn();
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} onMovePlacement={onMovePlacement} />);
    fireEvent.mouseDown(screen.getByTestId("placement-pl_1"), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 130 });
    fireEvent.mouseUp(window, { clientX: 140, clientY: 130 });
    expect(onMovePlacement).not.toHaveBeenCalled();
  });
});
