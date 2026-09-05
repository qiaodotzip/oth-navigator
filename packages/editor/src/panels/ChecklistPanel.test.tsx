import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { ChecklistPanel } from "./ChecklistPanel";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 }],
  rooms: [{ id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10]], heightM: 3, walkable: true }],
});

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  useEditorStore.getState().setReport({ issues: [], errorCount: 0, warningCount: 0, ok: true });
});

describe("ChecklistPanel", () => {
  it("lists every step", () => {
    render(<ChecklistPanel />);
    for (const label of [
      "Add floorplan", "Set the scale", "Trace rooms",
      "Connect them", "Mark entrances", "Lifts and stairs",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("names the level it is describing", () => {
    render(<ChecklistPanel />);
    expect(screen.getByText(/Steps for L1/)).toBeTruthy();
  });

  it("shows a step's detail", () => {
    render(<ChecklistPanel />);
    expect(screen.getByText("1 room")).toBeTruthy();
  });

  it("switches tool when a step is chosen", () => {
    render(<ChecklistPanel />);
    fireEvent.click(screen.getByText("Trace rooms"));
    expect(useEditorStore.getState().tool).toBe("draw-room");
  });

  it("marks the next unfinished step, so there is always an obvious next action", () => {
    render(<ChecklistPanel />);
    expect(screen.getByTestId("step-floorplan").getAttribute("data-next")).toBe("true");
    expect(screen.getByTestId("step-rooms").getAttribute("data-next")).toBe("false");
  });

  it("marks exactly one step as next", () => {
    render(<ChecklistPanel />);
    const next = screen.getAllByTestId(/^step-/).filter(n => n.getAttribute("data-next") === "true");
    expect(next).toHaveLength(1);
  });

  it("shows a step's own issues under it", () => {
    useEditorStore.getState().setReport({
      issues: [{
        severity: "warning", code: "level.portals.none",
        message: 'Level "L1" has no lift, stair or escalator endpoint.',
        entityType: "level", entityId: "oth-L1", levelId: "oth-L1",
      }],
      errorCount: 0, warningCount: 1, ok: true,
    });
    render(<ChecklistPanel />);
    expect(screen.getByText(/no lift, stair or escalator/)).toBeTruthy();
  });

  it("selects the room an issue names, so it can be found on the canvas", () => {
    useEditorStore.getState().setReport({
      issues: [{
        severity: "error", code: "room.unreachable", message: "cut off",
        entityType: "room", entityId: "L1-a", levelId: "oth-L1",
      }],
      errorCount: 1, warningCount: 0, ok: false,
    });
    render(<ChecklistPanel />);
    fireEvent.click(screen.getByText("cut off"));
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
  });
});
