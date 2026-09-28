import { parseModel, type Level, type PlanSource } from "@oth/model";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LevelImage } from "../api/client";
import { useDrafts } from "../build/drafts";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { FloorplanStep } from "./FloorplanStep";

type Measure = (entries: { contentRect: { width: number; height: number } }[]) => void;
let measure: Measure | null = null;

class FakeResizeObserver {
  // The step's own box is the first thing observed.
  constructor(cb: Measure) {
    measure ??= cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L1", buildingId: "oth", code: "L1", ordinal: 1, nameEn: "L1", nameZh: "一楼", elevationM: 0, heightM: 6 },
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
  ],
  rooms: [{ id: "L1-a", levelId: "oth-L1", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3 }],
});
const L2 = model.levels[1] as Level;
const source: PlanSource = {
  page: 1, pageCount: 1, pageSizePt: [400, 300], rotation: 0, clipPt: [36, 78, 246, 292], pointsPerPixel: 0.1,
  metresPerPoint: 0.5, runsAgree: 2, runsFound: 2, pdfId: "pdf_1", checksum: "d".repeat(64), filename: "L2.pdf",
};
const plan = (over: Partial<LevelImage> = {}): LevelImage => ({
  id: "img_2", levelId: "oth-L2", filename: "L2.png", widthPx: 2092, heightPx: 2132, sizeBytes: 1,
  metresPerPixel: 0.05, offsetX: 0, offsetY: 0, opacity: 0.6, version: 2, source, ...over,
});

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  measure = null;
  useDrafts.getState().reset();
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(model);
  s.setActiveLevel("oth-L2");
});

function open(images: LevelImage[] = []) {
  useEditorStore.getState().setLevelImages(images);
  const view = render(<FloorplanStep api={fakeApi()} level={L2} />);
  act(() => measure?.([{ contentRect: { width: 900, height: 600 } }]));
  return view;
}

const guide = () => within(screen.getByRole("region", { name: "Floorplan guide" }));

describe("FloorplanStep", () => {
  it("asks for the plan first, with Build's drop box and guide", () => {
    open();
    expect(screen.getByTestId("plan-drop-zone")).toBeTruthy();
    expect(guide().getByText("Start with the plan: drop it in the box on the canvas.")).toBeTruthy();
    expect(guide().getByRole("button", { name: "Find rooms in the drawing" })).toBeDisabled();
  });

  it("draws the plan, and offers Find rooms under Build's own tools once the PDF is scaled", () => {
    open([plan()]);
    expect(screen.queryByTestId("plan-drop-zone")).toBeNull();
    expect(document.querySelector("svg")).not.toBeNull();
    expect(guide().getByRole("button", { name: /^Measure scale/ })).toBeTruthy();
    expect(guide().getByRole("button", { name: /^Align/ })).toBeTruthy();
    expect(guide().getByRole("button", { name: "Find rooms in the drawing" })).toBeEnabled();
  });

  it("says what Find rooms is waiting for", () => {
    open([plan({ metresPerPixel: null })]);
    expect(guide().getByText("Set the plan's scale on the Floorplan step first.")).toBeTruthy();
    expect(guide().getByRole("button", { name: "Find rooms in the drawing" })).toBeDisabled();
  });

  it("puts Select back in hand when you move on", () => {
    const { unmount } = open([plan()]);
    fireEvent.click(guide().getByRole("button", { name: /^Measure scale/ }));
    expect(useEditorStore.getState().tool).toBe("calibrate");
    unmount();
    expect(useEditorStore.getState().tool).toBe("select");
  });
});
