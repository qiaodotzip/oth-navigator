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
