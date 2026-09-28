import { parseModel } from "@oth/model";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/store";
import { BELOW_STROKE, SELECTED_FILL } from "./colours";
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
    const onCommitSpace = vi.fn();
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} onCommitSpace={onCommitSpace} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 200 });
    fireEvent.doubleClick(surface);
    expect(onCommitSpace).toHaveBeenCalledTimes(1);
    expect(onCommitSpace.mock.calls[0]![1]).toHaveLength(3);
    expect(useEditorStore.getState().draft).toBeNull();
  });

  it("refuses to commit a ring with fewer than three points", () => {
    const onCommitSpace = vi.fn();
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} onCommitSpace={onCommitSpace} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.doubleClick(surface);
    expect(onCommitSpace).not.toHaveBeenCalled();
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

describe("placing a point", () => {
  it("puts an entrance where it was clicked, not snapped onto the nearest wall", () => {
    // Snapped onto a room's edge, the point is on the boundary — which counts
    // as outside every space, so the click was refused.
    const onCommitPoint = vi.fn();
    useEditorStore.getState().setTool("place-entrance");
    render(<PlanCanvas width={800} height={600} onCommitPoint={onCommitPoint} />);
    act(() => useEditorStore.getState().setViewport({ originX: 0, originY: 600, scale: 10 }));
    // Room L1-a spans x 0..10 m, so screen x 0..100; 97 is 3 px inside its edge.
    fireEvent.click(screen.getByTestId("plan-surface"), { clientX: 97, clientY: 550 });
    const [x, y] = onCommitPoint.mock.calls[0]![0] as [number, number];
    expect(x).toBeCloseTo(9.7);
    expect(y).toBeCloseTo(5);
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

  it("draws an unscaled plan at a metre per pixel, so it can be seen and measured on", () => {
    useEditorStore.getState().setLevelImages([{ ...levelImage, metresPerPixel: null }]);
    render(<PlanCanvas width={800} height={600} imageUrl={url} />);
    const scale = useEditorStore.getState().viewport.scale;
    expect(Number(screen.getByTestId("underlay").getAttribute("width"))).toBeCloseTo(1000 * scale);
  });

  it("frames the plan again once it has been scaled", () => {
    useEditorStore.getState().setLevelImages([{ ...levelImage, metresPerPixel: null }]);
    render(<PlanCanvas width={800} height={600} imageUrl={url} />);
    const before = useEditorStore.getState().viewport.scale;
    act(() => useEditorStore.getState().setLevelImages([{ ...levelImage, metresPerPixel: 0.01 }]));
    expect(useEditorStore.getState().viewport.scale).not.toBe(before);
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
    const onCommitSpace = vi.fn();
    render(<PlanCanvas width={800} height={600} onCommitSpace={onCommitSpace} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 200 });
    fireEvent.click(screen.getByTestId("draft-vertex-0"));
    expect(onCommitSpace).toHaveBeenCalledTimes(1);
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

  it("clears the snap indicator when switching back to Select", () => {
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.mouseMove(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100 });
    expect(screen.getByTestId("snap-indicator")).toBeTruthy();
    // Otherwise it freezes where the pointer last was and follows you into
    // Select, looking like the canvas is still armed.
    act(() => useEditorStore.getState().setTool("select"));
    expect(screen.queryByTestId("snap-indicator")).toBeNull();
  });

  it("clears the snap indicator when the pointer leaves the canvas", () => {
    render(<PlanCanvas width={800} height={600} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.mouseMove(surface, { clientX: 100, clientY: 100 });
    fireEvent.mouseLeave(surface);
    expect(screen.queryByTestId("snap-indicator")).toBeNull();
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

  it("lets go of a selected corner when another room is selected, so Delete never takes a corner of the wrong room", () => {
    useEditorStore.getState().setModel(parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
      rooms: [
        { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3, walkable: true },
        { id: "L1-b", levelId: "oth-L1", kind: "room", footprint: [[20, 0], [30, 0], [30, 10], [20, 10]], heightM: 3, walkable: true },
      ],
    }));
    const onReshapeRoom = vi.fn();
    useEditorStore.getState().setTool("select");
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    render(<PlanCanvas width={800} height={600} onReshapeRoom={onReshapeRoom} />);
    fireEvent.click(screen.getByTestId("vertex-2"));
    act(() => useEditorStore.getState().select({ type: "room", id: "L1-b" }));
    expect(screen.getByTestId("vertex-2").getAttribute("fill")).toBe("#ffffff");
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onReshapeRoom).not.toHaveBeenCalled();
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

describe("pathways", () => {
  it("renders a pathway at its real width", () => {
    useEditorStore.getState().setModel(
      parseModel({
        building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
        levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
        pathways: [{ id: "L1-p", levelId: "oth-L1", polyline: [[0, 0], [20, 0]], widthM: 4 }],
      }),
    );
    render(<PlanCanvas width={800} height={600} />);
    const el = screen.getByTestId("pathway-L1-p");
    // Stroke width is the pathway's real width in screen pixels.
    const scale = useEditorStore.getState().viewport.scale;
    expect(Number(el.getAttribute("stroke-width"))).toBeCloseTo(4 * scale, 1);
  });

  it("commits a pathway as a polyline, not a closed ring", () => {
    const onCommitPathway = vi.fn();
    useEditorStore.getState().setTool("draw-pathway");
    render(<PlanCanvas width={800} height={600} onCommitPathway={onCommitPathway} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.doubleClick(surface);
    expect(onCommitPathway).toHaveBeenCalledTimes(1);
    expect(onCommitPathway.mock.calls[0]![0]).toHaveLength(2);
  });

  it("needs only two points, unlike a room", () => {
    const onCommitPathway = vi.fn();
    const onCommitSpace = vi.fn();
    useEditorStore.getState().setTool("draw-pathway");
    render(<PlanCanvas width={800} height={600} onCommitPathway={onCommitPathway} onCommitSpace={onCommitSpace} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.doubleClick(surface);
    expect(onCommitPathway).toHaveBeenCalled();
    expect(onCommitSpace).not.toHaveBeenCalled();
  });

  it("refuses a pathway of one point", () => {
    const onCommitPathway = vi.fn();
    useEditorStore.getState().setTool("draw-pathway");
    render(<PlanCanvas width={800} height={600} onCommitPathway={onCommitPathway} />);
    fireEvent.click(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100 });
    fireEvent.doubleClick(screen.getByTestId("plan-surface"));
    expect(onCommitPathway).not.toHaveBeenCalled();
  });

  it("draws the pathway draft unfilled, since it is a line and not a ring", () => {
    useEditorStore.getState().setTool("draw-pathway");
    render(<PlanCanvas width={800} height={600} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    expect(screen.getByTestId("draft").getAttribute("fill")).toBe("none");
  });

  it("commits an area with the area kind, not as a room", () => {
    const onCommitSpace = vi.fn();
    useEditorStore.getState().setTool("draw-area");
    render(<PlanCanvas width={800} height={600} onCommitSpace={onCommitSpace} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 200 });
    fireEvent.doubleClick(surface);
    expect(onCommitSpace).toHaveBeenCalledTimes(1);
    expect(onCommitSpace.mock.calls[0]![0]).toBe("area");
  });

  it("explains the pathway tool in the hint", () => {
    useEditorStore.getState().setTool("draw-pathway");
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("drawing-hint").textContent).toMatch(/walk/i);
  });

  it("selects a pathway when it is clicked", () => {
    useEditorStore.getState().setModel(
      parseModel({
        building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
        levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
        pathways: [{ id: "L1-p", levelId: "oth-L1", polyline: [[0, 0], [20, 0]] }],
      }),
    );
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.click(screen.getByTestId("pathway-L1-p"));
    expect(useEditorStore.getState().selection).toEqual({ type: "pathway", id: "L1-p" });
  });
});

describe("what a real double-click commits", () => {
  /** A browser dispatches two clicks before dblclick; fireEvent.doubleClick does not. */
  function realDoubleClick(el: Element, at: { clientX: number; clientY: number }) {
    fireEvent.click(el, at);
    fireEvent.click(el, at);
    fireEvent.doubleClick(el, at);
  }

  it("does not repeat the last point of a pathway", () => {
    const onCommitPathway = vi.fn();
    useEditorStore.getState().setTool("draw-pathway");
    render(<PlanCanvas width={800} height={600} onCommitPathway={onCommitPathway} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    realDoubleClick(surface, { clientX: 300, clientY: 100 });
    // The two clicks that make up the double-click both land on the end point.
    expect(onCommitPathway.mock.calls[0]![0]).toHaveLength(2);
  });

  it("does not give a room a zero-length edge", () => {
    const onCommitSpace = vi.fn();
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} onCommitSpace={onCommitSpace} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 300, clientY: 100 });
    realDoubleClick(surface, { clientX: 300, clientY: 300 });
    expect(onCommitSpace.mock.calls[0]![1]).toHaveLength(3);
  });

  it("still refuses a pathway the user only clicked once", () => {
    const onCommitPathway = vi.fn();
    useEditorStore.getState().setTool("draw-pathway");
    render(<PlanCanvas width={800} height={600} onCommitPathway={onCommitPathway} />);
    // One place, then finishing on the same spot, is one point, not two.
    realDoubleClick(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100 });
    expect(onCommitPathway).not.toHaveBeenCalled();
  });
});

describe("pathways are visible over the floor", () => {
  it("paints a pathway on top of the rooms it crosses", () => {
    // Room fills are opaque, so a pathway painted first is invisible wherever it
    // crosses a room — which is the normal case, since a corridor runs across
    // shop fronts.
    useEditorStore.getState().setModel(
      parseModel({
        building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
        levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
        rooms: [{
          id: "L1-r", levelId: "oth-L1", kind: "area",
          footprint: [[0, 0], [20, 0], [20, 20], [0, 20]],
          heightM: 6, walkable: true,
        }],
        pathways: [{ id: "L1-p", levelId: "oth-L1", polyline: [[2, 10], [18, 10]] }],
      }),
    );
    render(<PlanCanvas width={800} height={600} />);
    const room = screen.getByTestId("room-L1-r");
    const path = screen.getByTestId("pathway-L1-p");
    // eslint-disable-next-line no-bitwise
    expect(room.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("details on the canvas", () => {
  it("commits a detail with the detail kind", () => {
    const onCommitSpace = vi.fn();
    useEditorStore.getState().setTool("draw-detail");
    render(<PlanCanvas width={800} height={600} onCommitSpace={onCommitSpace} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.click(surface, { clientX: 100, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 100 });
    fireEvent.click(surface, { clientX: 200, clientY: 200 });
    fireEvent.doubleClick(surface);
    expect(onCommitSpace.mock.calls[0]![0]).toBe("detail");
  });

  it("paints a detail above the floor and the pathways crossing it", () => {
    useEditorStore.getState().setModel(
      parseModel({
        building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
        levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
        rooms: [
          { id: "L1-sq", levelId: "oth-L1", kind: "area", footprint: [[0, 0], [20, 0], [20, 20], [0, 20]], heightM: 6, walkable: true },
          { id: "L1-vend", levelId: "oth-L1", kind: "detail", footprint: [[8, 8], [12, 8], [12, 12], [8, 12]], heightM: 1.9, walkable: false },
        ],
        pathways: [{ id: "L1-p", levelId: "oth-L1", polyline: [[2, 10], [18, 10]] }],
      }),
    );
    render(<PlanCanvas width={800} height={600} />);
    const area = screen.getByTestId("room-L1-sq");
    const path = screen.getByTestId("pathway-L1-p");
    const detail = screen.getByTestId("room-L1-vend");
    // A detail stands on the floor, so it is painted after both.
    expect(area.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(path.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("still selects a detail by clicking it", () => {
    useEditorStore.getState().setModel(
      parseModel({
        building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
        levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
        rooms: [{ id: "L1-vend", levelId: "oth-L1", kind: "detail", footprint: [[8, 8], [12, 8], [12, 12], [8, 12]], heightM: 1.9, walkable: false }],
      }),
    );
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.click(screen.getByTestId("room-L1-vend"));
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-vend" });
  });
});

describe("walkway types on the canvas", () => {
  it("draws a walkway in its type's colour", () => {
    // A floor of walkways in one colour is a tangle.
    useEditorStore.getState().setModel(
      parseModel({
        building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
        levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
        pathwayKinds: [{ id: "pk-1", nameEn: "Ramp", colorHex: "#f2a33c" }],
        pathways: [{ id: "L1-p", levelId: "oth-L1", polyline: [[0, 0], [20, 0]], kindId: "pk-1" }],
      }),
    );
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("pathway-L1-p").getAttribute("stroke")).toBe("#f2a33c");
  });

  it("falls back to the default colour for a walkway with no type", () => {
    useEditorStore.getState().setModel(
      parseModel({
        building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
        levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
        pathways: [{ id: "L1-p", levelId: "oth-L1", polyline: [[0, 0], [20, 0]] }],
      }),
    );
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("pathway-L1-p").getAttribute("stroke")).toBe("#38bdf8");
  });
});

describe("clicking through shapes while drawing", () => {
  // A browser delivers a click to the topmost shape, and the drawing surface
  // sits under every room. Without this an entrance — which always goes inside
  // an area — could never be placed, and nothing could be drawn over a room.
  it("lets a drawing tool's clicks pass through rooms to the canvas", () => {
    useEditorStore.getState().setTool("place-entrance");
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("room-L1-a").getAttribute("pointer-events")).toBe("none");
  });

  it("keeps rooms clickable for Select", () => {
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("room-L1-a").getAttribute("pointer-events")).not.toBe("none");
  });

  it("lets clicks pass through pathways and dressing too", () => {
    useEditorStore.getState().setModel(parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
      pathways: [{ id: "L1-p", levelId: "oth-L1", polyline: [[0, 0], [20, 0]] }],
      assets: [{
        id: "asset_1", filename: "arch.glb", storagePath: "a", checksum: "c", sizeBytes: 10, triangleCount: 5,
        bbox: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
      }],
      placements: [{ id: "pl_1", levelId: "oth-L1", assetId: "asset_1", position: [5, 5, 0] }],
    }));
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("pathway-L1-p").getAttribute("pointer-events")).toBe("none");
    expect(screen.getByTestId("placement-pl_1").getAttribute("pointer-events")).toBe("none");
  });
});

describe("panning", () => {
  // Relative to wherever the canvas framed itself on mount.
  const originX = () => useEditorStore.getState().viewport.originX;

  function drag(from: [number, number], to: [number, number], button = 0) {
    const surface = screen.getByTestId("plan-surface");
    fireEvent.mouseDown(surface, { clientX: from[0], clientY: from[1], button });
    fireEvent.mouseMove(window, { clientX: to[0], clientY: to[1], button });
    fireEvent.mouseUp(window, { clientX: to[0], clientY: to[1], button });
    // A browser follows a left-button drag with a click on the same element.
    if (button === 0) fireEvent.click(surface, { clientX: to[0], clientY: to[1] });
  }

  it("pans when empty canvas is dragged with the select tool", () => {
    render(<PlanCanvas width={800} height={600} />);
    const before = useEditorStore.getState().viewport;
    drag([300, 300], [350, 320]);
    const after = useEditorStore.getState().viewport;
    expect(after.originX - before.originX).toBe(50);
    expect(after.originY - before.originY).toBe(20);
  });

  it("pans with the middle button while drawing, without placing a corner", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} />);
    const before = originX();
    drag([300, 300], [340, 300], 1);
    expect(originX() - before).toBe(40);
    expect(useEditorStore.getState().draft).toBeNull();
  });

  it("pans with Space held while drawing, and the drag is not a click", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} />);
    const before = originX();
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    drag([300, 300], [330, 300]);
    fireEvent.keyUp(window, { key: " ", code: "Space" });
    expect(originX() - before).toBe(30);
    expect(useEditorStore.getState().draft).toBeNull();
  });

  it("still places a corner on a plain click while drawing", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} />);
    const surface = screen.getByTestId("plan-surface");
    fireEvent.mouseDown(surface, { clientX: 300, clientY: 300, button: 0 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 300, button: 0 });
    fireEvent.click(surface, { clientX: 300, clientY: 300 });
    expect(useEditorStore.getState().draft).toHaveLength(1);
  });

  // M10: Alt-Tabbing away while Space is held never fires keyup, and every
  // later click would be swallowed as a pan until Space is pressed again.
  it("stops treating clicks as a pan once the window loses focus while Space is held", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    fireEvent(window, new Event("blur"));
    const surface = screen.getByTestId("plan-surface");
    fireEvent.mouseDown(surface, { clientX: 300, clientY: 300, button: 0 });
    fireEvent.mouseUp(window, { clientX: 300, clientY: 300, button: 0 });
    fireEvent.click(surface, { clientX: 300, clientY: 300 });
    expect(useEditorStore.getState().draft).toHaveLength(1);
  });

  it("frames the level again from the Fit button", () => {
    render(<PlanCanvas width={800} height={600} />);
    act(() => useEditorStore.getState().setViewport({ originX: -9999, originY: -9999, scale: 1 }));
    fireEvent.click(screen.getByRole("button", { name: /fit/i }));
    expect(useEditorStore.getState().viewport.originX).not.toBe(-9999);
  });
});

describe("entrances and lifts", () => {
  const withPoints = parseModel({
    building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
    levels: [
      { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
      { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
    ],
    rooms: [{
      id: "L1-a", levelId: "oth-L1", kind: "area",
      footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 5, walkable: true,
    }],
    entrances: [{ id: "en-1", levelId: "oth-L1", roomId: "L1-a", point: [1, 1] }],
    portals: [{ id: "lift-a", kind: "lift" }],
    portalEndpoints: [
      { id: "ep-1", portalId: "lift-a", levelId: "oth-L1", roomId: "L1-a", point: [5, 5] },
      { id: "ep-2", portalId: "lift-a", levelId: "oth-L2", roomId: "L1-a", point: [5, 5] },
    ],
  });

  beforeEach(() => {
    useEditorStore.getState().reset();
    useEditorStore.getState().setModel(withPoints);
  });

  it("draws the level's entrances and lift stops, and only this level's", () => {
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("entrance-en-1")).toBeTruthy();
    expect(screen.getByTestId("portal-endpoint-ep-1")).toBeTruthy();
    expect(screen.queryByTestId("portal-endpoint-ep-2")).toBeNull();
  });

  it("selects an entrance clicked with the select tool", () => {
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.click(screen.getByTestId("entrance-en-1"));
    expect(useEditorStore.getState().selection).toEqual({ type: "entrance", id: "en-1" });
  });

  it("shows faintly where a lift stops on other levels, so its next stop can be placed on it", () => {
    // Each level frames itself, so "the same spot" is nowhere near the same
    // place on screen. The ghost is the target.
    useEditorStore.getState().setModel(parseModel({
      building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
      levels: withPoints.levels,
      rooms: withPoints.rooms,
      portals: [{ id: "lift-b", kind: "lift" }],
      portalEndpoints: [{ id: "b-2", portalId: "lift-b", levelId: "oth-L2", roomId: "L1-a", point: [3, 3] }],
    }));
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("portal-ghost-b-2")).toBeTruthy();
  });

  it("does not ghost a lift that already stops on this level", () => {
    render(<PlanCanvas width={800} height={600} />);
    // lift-a stops on L1 (ep-1) and L2 (ep-2); L1 needs no ghost of ep-2.
    expect(screen.queryByTestId("portal-ghost-ep-2")).toBeNull();
  });

  it("selects a lift stop clicked with the select tool", () => {
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.click(screen.getByTestId("portal-endpoint-ep-1"));
    expect(useEditorStore.getState().selection).toEqual({ type: "portalEndpoint", id: "ep-1" });
  });
});

describe("the plan under the spaces", () => {
  it("draws spaces see-through, so the floorplan shows under them", () => {
    render(<PlanCanvas width={800} height={600} />);
    const opacity = Number(screen.getByTestId("room-L1-a").getAttribute("fill-opacity"));
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });

  it("draws the selected space in the accent colour", () => {
    useEditorStore.getState().select({ type: "room", id: "L1-a" });
    render(<PlanCanvas width={800} height={600} />);
    expect(screen.getByTestId("room-L1-a").getAttribute("fill")).toBe(SELECTED_FILL);
  });

  it("draws the floor below faintly, and never in the way of a click", () => {
    render(<PlanCanvas width={800} height={600} belowRings={[[[50, 50], [70, 50], [70, 70]]]} />);
    const ring = screen.getByTestId("below-ring");
    expect(ring.getAttribute("fill")).toBe("none");
    expect(ring.getAttribute("stroke")).toBe(BELOW_STROKE);
    expect(ring.getAttribute("pointer-events")).toBe("none");
  });

  it("leaves its hint to the page when told to", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} showHint={false} />);
    expect(screen.queryByTestId("drawing-hint")).toBeNull();
  });

  it("claims Escape when it cancels a shape, so nothing else acts on the same press", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.click(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100 });
    expect(fireEvent.keyDown(window, { key: "Escape" })).toBe(false);
  });

  it("leaves Backspace in a text field to the field, even mid-shape", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<PlanCanvas width={800} height={600} />);
    fireEvent.click(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100 });
    const field = document.body.appendChild(document.createElement("input"));
    fireEvent.keyDown(field, { key: "Backspace" });
    expect(useEditorStore.getState().draft).toHaveLength(1);
    field.remove();
  });
});

describe("aligning the plan", () => {
  const url = (id: string) => `/api/level-images/${id}/file`;

  beforeEach(() => {
    useEditorStore.getState().setLevelImages([levelImage]);
    useEditorStore.getState().setTool("align-plan");
  });

  function startDrag(onMoveUnderlay = vi.fn()) {
    render(<PlanCanvas width={800} height={600} imageUrl={url} onMoveUnderlay={onMoveUnderlay} />);
    act(() => useEditorStore.getState().setViewport({ originX: 0, originY: 600, scale: 10 }));
    fireEvent.mouseDown(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseMove(window, { clientX: 150, clientY: 80 });
    return onMoveUnderlay;
  }

  it("moves the plan under the pointer while dragging", () => {
    startDrag();
    // 50 px right at 10 px per metre: the plan's left edge is now 5 m east of 0.
    expect(Number(screen.getByTestId("underlay").getAttribute("x"))).toBe(50);
  });

  it("saves once, on release, where the plan's corner now is", () => {
    const onMoveUnderlay = startDrag();
    expect(onMoveUnderlay).not.toHaveBeenCalled();
    fireEvent.mouseUp(window, { clientX: 150, clientY: 80 });
    expect(onMoveUnderlay).toHaveBeenCalledTimes(1);
    expect(onMoveUnderlay).toHaveBeenCalledWith({ offsetX: 5, offsetY: 2 });
  });

  it("moves the plan, not the view", () => {
    startDrag();
    expect(useEditorStore.getState().viewport).toMatchObject({ originX: 0, originY: 600 });
  });

  it("saves nothing for a press that did not move", () => {
    const onMoveUnderlay = vi.fn();
    render(<PlanCanvas width={800} height={600} imageUrl={url} onMoveUnderlay={onMoveUnderlay} />);
    fireEvent.mouseDown(screen.getByTestId("plan-surface"), { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseUp(window, { clientX: 100, clientY: 100 });
    expect(onMoveUnderlay).not.toHaveBeenCalled();
  });
});
