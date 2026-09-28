import { parseModel } from "@oth/model";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { LevelImage } from "../api/client";
import { useEditorStore } from "../state/store";
import { StepGuide } from "./StepGuide";
import { STEP_GUIDES } from "./steps";

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
});

const plan = (levelId: string): LevelImage => ({
  id: `img_${levelId}`, levelId, filename: `${levelId}.jpg`, widthPx: 3000, heightPx: 2121,
  sizeBytes: 10, metresPerPixel: 0.21, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0,
});

beforeEach(() => useEditorStore.getState().reset());

describe("StepGuide", () => {
  it("names the step and gives its one instruction", () => {
    render(<StepGuide step="pathways" />);
    const guide = screen.getByRole("region", { name: "Pathways guide" });
    expect(guide.textContent).toContain(STEP_GUIDES.pathways.instruction);
  });

  it("offers Select and the step's own tools, each with its key", () => {
    render(<StepGuide step="entrances" />);
    expect(screen.getAllByRole("button").map(b => b.textContent)).toEqual(["SelectV", "EntranceE", "Lift or stairL"]);
  });

  it("arms a tool when it is pressed, and shows it armed", () => {
    render(<StepGuide step="rooms" />);
    fireEvent.click(screen.getByRole("button", { name: /draw room/i }));
    expect(useEditorStore.getState().tool).toBe("draw-room");
    expect(screen.getByRole("button", { name: /draw room/i }).getAttribute("aria-pressed")).toBe("true");
  });

  it("says how to finish while a tool is in use, instead of the step's instruction", () => {
    useEditorStore.getState().setTool("draw-room");
    render(<StepGuide step="rooms" />);
    expect(screen.getByTestId("guide-text").textContent).toMatch(/drawing a room/i);
  });

  it("counts a scale measurement's own points", () => {
    useEditorStore.getState().setTool("calibrate");
    useEditorStore.getState().pushCalibrationPoint([0, 0]);
    render(<StepGuide step="floorplan" />);
    expect(screen.getByTestId("guide-text").textContent).toContain("(1/2)");
  });

  it("shows the step's other tools under its own", () => {
    render(<StepGuide step="rooms" extras={<button type="button">Import DXF</button>} />);
    expect(screen.getByRole("button", { name: "Import DXF" })).toBeTruthy();
  });

  describe("aligning, which depends on the floor", () => {
    beforeEach(() => {
      useEditorStore.getState().setModel(model);
      useEditorStore.getState().setLevelImages([plan("oth-L1"), plan("oth-L2")]);
    });

    it("says nothing of a floor below on the lowest floor, which lines up on nothing", () => {
      useEditorStore.getState().setTool("align-plan");
      render(<StepGuide step="floorplan" />);
      const text = screen.getByTestId("guide-text").textContent;
      expect(text).toMatch(/lowest floor/i);
      expect(text).not.toMatch(/below|dashed outlines/i);
    });

    it("names the floor below on any other floor", () => {
      useEditorStore.getState().setActiveLevel("oth-L2");
      useEditorStore.getState().setTool("align-plan");
      render(<StepGuide step="floorplan" />);
      expect(screen.getByTestId("guide-text").textContent).toMatch(/dashed outlines of L1, the floor below/);
    });

    it("asks for a plan first on a floor that has none", () => {
      useEditorStore.getState().setActiveLevel("oth-L2");
      useEditorStore.getState().setLevelImages([plan("oth-L1")]);
      useEditorStore.getState().setTool("align-plan");
      render(<StepGuide step="floorplan" />);
      expect(screen.getByTestId("guide-text").textContent).toMatch(/no plan on this floor yet/i);
    });
  });

  it("stops short of the 3D preview's room, and scrolls rather than run into it", () => {
    render(<StepGuide step="floorplan" />);
    const guide = screen.getByRole("region", { name: "Floorplan guide" });
    // jsdom lays nothing out, so the classes are the evidence: the preview is
    // bottom-14 and h-64, 19.5rem up from the bottom of the canvas.
    expect(guide.className).toContain("max-h-[calc(100%-20.75rem)]");
    expect(guide.className).toContain("overflow-y-auto");
  });
});
