import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "../state/store";
import { StepsPanel } from "./StepsPanel";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
  ],
  rooms: [
    { id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10]], heightM: 3, walkable: true },
  ],
});

const image = {
  id: "img_1", levelId: "oth-L1", filename: "L1.png",
  widthPx: 100, heightPx: 100, sizeBytes: 10,
  metresPerPixel: null as number | null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0,
};

beforeEach(() => {
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  useEditorStore.getState().setReport({ issues: [], errorCount: 0, warningCount: 0, ok: true });
});

describe("StepsPanel", () => {
  it("shows every section header", () => {
    render(<StepsPanel sections={{}} />);
    for (const label of ["Floorplan", "Areas & rooms", "Pathways", "Entrances", "Lifts & stairs", "Dressing"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("opens the first unfinished section and leaves the rest closed", () => {
    render(<StepsPanel sections={{}} />);
    expect(screen.getByTestId("section-floorplan").getAttribute("data-open")).toBe("true");
    expect(screen.getByTestId("section-rooms").getAttribute("data-open")).toBe("false");
  });

  it("opens exactly one section", () => {
    render(<StepsPanel sections={{}} />);
    const open = screen.getAllByTestId(/^section-/).filter(n => n.getAttribute("data-open") === "true");
    expect(open).toHaveLength(1);
  });

  it("renders a section's own controls inside it", () => {
    render(<StepsPanel sections={{ floorplan: <div>upload goes here</div> }} />);
    expect(screen.getByText("upload goes here")).toBeTruthy();
  });

  it("keeps a closed section's controls out of the DOM", () => {
    render(<StepsPanel sections={{ rooms: <div>room controls</div> }} />);
    expect(screen.queryByText("room controls")).toBeNull();
  });

  it("opens a section when its header is clicked", () => {
    render(<StepsPanel sections={{ rooms: <div>room controls</div> }} />);
    fireEvent.click(screen.getByText("Areas & rooms"));
    expect(screen.getByText("room controls")).toBeTruthy();
  });

  it("closes an open section when its header is clicked again", () => {
    render(<StepsPanel sections={{ floorplan: <div>upload goes here</div> }} />);
    fireEvent.click(screen.getByText("Floorplan"));
    expect(screen.queryByText("upload goes here")).toBeNull();
  });

  it("keeps a hand-opened section open rather than snapping back to the next one", () => {
    render(<StepsPanel sections={{ rooms: <div>room controls</div> }} />);
    fireEvent.click(screen.getByText("Areas & rooms"));
    // Progress elsewhere must not yank the panel away mid-task.
    useEditorStore.getState().setLevelImages([image]);
    expect(screen.getByText("room controls")).toBeTruthy();
  });

  it("switches tool from a step button inside a section", () => {
    render(<StepsPanel sections={{}} />);
    fireEvent.click(screen.getByText("Areas & rooms"));
    // The step is two gestures, so it offers both tools by their toolbar names.
    fireEvent.click(screen.getByRole("button", { name: "Draw area" }));
    expect(useEditorStore.getState().tool).toBe("draw-area");
    fireEvent.click(screen.getByRole("button", { name: "Draw room" }));
    expect(useEditorStore.getState().tool).toBe("draw-room");
  });

  it("shows a section's summary on its header, so progress reads while closed", () => {
    useEditorStore.getState().setLevelImages([image]);
    render(<StepsPanel sections={{}} />);
    expect(screen.getByText("not set")).toBeTruthy();
  });

  it("shows issues under the section that owns them", () => {
    useEditorStore.getState().setReport({
      issues: [{
        severity: "warning", code: "level.portals.none",
        message: 'Level "L1" has no lift, stair or escalator endpoint.',
        entityType: "level", entityId: "oth-L1", levelId: "oth-L1",
      }],
      errorCount: 0, warningCount: 1, ok: true,
    });
    render(<StepsPanel sections={{}} />);
    fireEvent.click(screen.getByText("Lifts & stairs"));
    expect(screen.getByText(/no lift, stair or escalator/)).toBeTruthy();
  });

  it("selects the room an issue names", () => {
    useEditorStore.getState().setReport({
      issues: [{
        severity: "error", code: "area.unreachable", message: "cut off",
        entityType: "room", entityId: "L1-a", levelId: "oth-L1",
      }],
      errorCount: 1, warningCount: 0, ok: false,
    });
    render(<StepsPanel sections={{}} />);
    fireEvent.click(screen.getByText("Pathways"));
    fireEvent.click(screen.getByText("cut off"));
    expect(useEditorStore.getState().selection).toEqual({ type: "room", id: "L1-a" });
  });

  it("selects the entrance an issue names", () => {
    useEditorStore.getState().setReport({
      issues: [{
        severity: "error", code: "entrance.offFloor", message: "stands on a wall",
        entityType: "entrance", entityId: "en-1", levelId: "oth-L1",
      }],
      errorCount: 1, warningCount: 0, ok: false,
    });
    render(<StepsPanel sections={{}} />);
    fireEvent.click(screen.getByText("Entrances"));
    fireEvent.click(screen.getByText("stands on a wall"));
    expect(useEditorStore.getState().selection).toEqual({ type: "entrance", id: "en-1" });
  });

  it("gives Dressing no status dot, since a level is not incomplete without it", () => {
    render(<StepsPanel sections={{}} />);
    const dressing = screen.getByTestId("section-dressing");
    expect(dressing.textContent).not.toContain("○");
    expect(dressing.textContent).not.toContain("●");
  });
});
