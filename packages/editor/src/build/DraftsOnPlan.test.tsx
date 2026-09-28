import { RoomDraftSchema, parseModel, type RoomDraft } from "@oth/model";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { fitViewport } from "../plan/viewport";
import { useEditorStore } from "../state/store";
import { useDrafts } from "./drafts";
import { DraftsOnPlan } from "./DraftsOnPlan";

const square = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 }],
  rooms: [{ id: "L2-hall", levelId: "oth-L2", kind: "area", footprint: square(100, 100, 20), heightM: 4 }],
});
const draft = (id: string, nameEn: string, ring: [number, number][] | undefined): RoomDraft => RoomDraftSchema.parse({
  id, levelId: "oth-L2", nameEn, kind: "room", footprint: ring, labelPoint: ring ? [ring[0]![0] + 1, ring[0]![1] + 1] : [60, 60],
  areaM2: 90, source: { checksum: "c".repeat(64), page: 1 },
});

beforeEach(() => {
  useDrafts.getState().reset();
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(model);
  s.setActiveLevel("oth-L2");
  s.setViewport({ originX: 0, originY: 600, scale: 4 });
  useDrafts.getState().setDrafts("oth-L2", [
    draft("rd_shop", "Shop", square(0, 0, 10)),
    draft("rd_hall", "Hall", square(100, 100, 20)),
    draft("rd_plaza", "Plaza", undefined),
  ]);
});

const renderOnPlan = () => render(<svg width={800} height={600}><DraftsOnPlan levelId="oth-L2" /></svg>);
const path = (id: string) => screen.getByTestId(`draft-${id}`).querySelector("path")!;

describe("DraftsOnPlan", () => {
  it("draws the drafts to review, and hides those already on the map until you ask for them", () => {
    renderOnPlan();
    expect(screen.getByTestId("draft-rd_shop")).toBeTruthy();
    expect(screen.queryByTestId("draft-rd_hall")).toBeNull();
    expect(screen.getByTestId("open-rd_plaza")).toBeTruthy();
    act(() => useDrafts.getState().setShowCovered(true));
    expect(screen.getByTestId("draft-rd_hall")).toBeTruthy();
  });

  it("selects a draft you click, and lets go of whatever the map had selected", () => {
    useEditorStore.getState().select({ type: "room", id: "L2-hall" });
    renderOnPlan();
    fireEvent.click(path("rd_shop"));
    expect(useDrafts.getState().selectedId).toBe("rd_shop");
    expect(useEditorStore.getState().selection).toBeNull();
  });

  it("keeps a draft over empty floor clickable all over, and one over a room at its outline only", () => {
    act(() => useDrafts.getState().setShowCovered(true));
    renderOnPlan();
    expect(path("rd_shop").getAttribute("pointer-events")).toBe("visiblePainted");
    // Drawn over the hall it copies: the hall must still take a click inside it.
    expect(path("rd_hall").getAttribute("pointer-events")).toBe("none");
    expect(screen.getByTestId("draft-rd_hall").querySelector("path[data-hit]")!.getAttribute("pointer-events")).toBe("stroke");
  });

  it("takes no clicks while a drawing tool is in use", () => {
    useEditorStore.getState().setTool("draw-area");
    renderOnPlan();
    fireEvent.click(path("rd_shop"));
    expect(useDrafts.getState().selectedId).toBeNull();
  });

  it("frames what it is asked to, at the plan's own size", () => {
    renderOnPlan();
    const box = { minX: -4, minY: -4, maxX: 14, maxY: 14 };
    act(() => useDrafts.getState().frameBox(box));
    expect(useEditorStore.getState().viewport).toEqual(fitViewport(box, 800, 600, 60));
  });
});
