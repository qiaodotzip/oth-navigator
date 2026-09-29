import { parseModel, RoomDraftSchema, type Level, type PlanSource, type RoomDraft } from "@oth/model";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { LevelImage } from "../api/client";
import { useDrafts } from "../build/drafts";
import { patchPlan } from "../build/FloorplanTools";
import { findRoomsInDrawing } from "../pdf/findInDrawing";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { FloorplanStep } from "./FloorplanStep";
import { useSetupStore } from "./sync";
import { setupState } from "./testing";

vi.mock("../pdf/findInDrawing", async importOriginal => ({
  ...(await importOriginal<typeof import("../pdf/findInDrawing")>()),
  findRoomsInDrawing: vi.fn(),
}));

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
/** L2 with two rooms on it already, for Find rooms to match. */
const withRooms = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [{ id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 }],
  rooms: [
    { id: "L2-a", levelId: "oth-L2", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 3 },
    { id: "L2-b", levelId: "oth-L2", kind: "room", footprint: [[20, 0], [30, 0], [30, 10], [20, 10]], heightM: 3 },
  ],
});
/** The line once the plan has moved since Find rooms ran. */
const moved = "The plan moved since Find rooms ran. Run Find rooms again to check it lines up.";
/** A draft Find rooms left on L2. */
const found: RoomDraft = RoomDraftSchema.parse({
  id: "rd_a", levelId: "oth-L2", nameEn: "Shop", kind: "room", footprint: [[40, 0], [50, 0], [50, 10], [40, 10]],
  labelPoint: [45, 5], areaM2: 100, source: { checksum: "c".repeat(64), page: 1 },
});
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
  useSetupStore.getState().reset();
  const s = useEditorStore.getState();
  s.reset();
  s.setModel(model);
  s.setActiveLevel("oth-L2");
});

function open(images: LevelImage[] = [], api = fakeApi()) {
  useEditorStore.getState().setLevelImages(images);
  const view = render(<FloorplanStep api={api} level={L2} />);
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

  it("loads the floor's drafts afresh each time it opens, as Back and Next bring you here", async () => {
    const api = fakeApi();
    const { unmount } = open([plan()], api);
    expect(api.listRoomDrafts).toHaveBeenCalledWith("oth-L2");
    unmount();
    open([plan()], api);
    expect(api.listRoomDrafts).toHaveBeenCalledTimes(2);
    await act(async () => {});
  });

  it("says Claude makes the stops Find rooms leaves out, in step 5", async () => {
    useToasts.getState().clear();
    (findRoomsInDrawing as unknown as Mock).mockResolvedValue({ drafts: [], rooms: 199, open: 0, skipped: ["Escalator 7", "Escalator 8"] });
    open([plan()]);
    fireEvent.click(guide().getByRole("button", { name: "Find rooms in the drawing" }));
    await waitFor(() => expect(useToasts.getState().toasts.at(-1)?.message).toBe(
      "Found 199 rooms in the drawing. 2 escalators and stairs left out: Claude makes lifts, escalators and stairs into stops in step 5.",
    ));
  });

  it("puts Select back in hand when you move on", () => {
    const { unmount } = open([plan()]);
    fireEvent.click(guide().getByRole("button", { name: /^Measure scale/ }));
    expect(useEditorStore.getState().tool).toBe("calibrate");
    unmount();
    expect(useEditorStore.getState().tool).toBe("select");
  });

  it("warns to line the plan up first, before Find rooms, when the floor already has rooms", () => {
    useEditorStore.getState().setModel(withRooms);
    open([plan()]);
    expect(guide().getByText(
      "L2 already has 2 rooms: line the plan up with them first (Align), so Find rooms can match them.",
    )).toBeTruthy();
  });

  it("says plainly that the drawing lines up, once its drafts show it does (contract v4)", () => {
    useEditorStore.getState().setModel(withRooms);
    open([plan()]);
    act(() => useDrafts.getState().setDrafts("oth-L2", [found], undefined, { pairs: 162 }));
    // Plain: no warning mark before it.
    expect(guide().getByText("The drawing lines up with L2's rooms.").textContent).toBe("The drawing lines up with L2's rooms.");
    expect(screen.queryByText(/already has/)).toBeNull();
    expect(screen.queryByText(/Couldn't check/)).toBeNull();
  });

  it("says to run Find rooms again once the plan moves, in place of the lines-up line, as the step reloads too, until it does", async () => {
    useEditorStore.getState().setModel(withRooms);
    const lines = "The drawing lines up with L2's rooms.";
    const api = fakeApi({
      listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [found], linedUp: { pairs: 162 } }),
      patchLevelImage: vi.fn(async (_id: string, version: number, patch: Record<string, unknown>) => ({ ...plan(), ...patch, version: version + 1 })),
    });
    const { unmount } = open([plan()], api);
    expect(await guide().findByText(lines)).toBeTruthy();
    await act(async () => {
      await patchPlan(api, plan(), { offsetX: 3, offsetY: 0 }, { doing: "move the plan" });
    });
    expect(screen.queryByText(lines)).toBeNull();
    // Amber, as the line-up warning is: there is something to do.
    expect(guide().getByText(moved).textContent).toBe(`! ${moved}`);
    expect(screen.queryByText(/Couldn't check/)).toBeNull();
    // Back, then Next: the step loads the floor's drafts afresh, and the server still says they line up.
    unmount();
    open(useEditorStore.getState().levelImages, api);
    await waitFor(() => expect(api.listRoomDrafts).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(screen.queryByText(lines)).toBeNull();
    expect(guide().getByText(moved)).toBeTruthy();
    // Find rooms on the plan where it sits now: the answer counts again.
    (findRoomsInDrawing as unknown as Mock).mockResolvedValue({ drafts: [found], rooms: 1, open: 0, skipped: [] });
    fireEvent.click(guide().getByRole("button", { name: "Find rooms in the drawing" }));
    fireEvent.click(await guide().findByRole("button", { name: "Find again" }));
    expect(await guide().findByText(lines)).toBeTruthy();
    expect(screen.queryByText(moved)).toBeNull();
  });

  it("knows the plan moved after a reload, with no mark, from the plan saved after the drafts were found; a new Find rooms clears it", async () => {
    useEditorStore.getState().setModel(withRooms);
    const lines = "The drawing lines up with L2's rooms.";
    const foundAt = (updatedAt: string): RoomDraft => ({ ...found, updatedAt });
    // The server still pairs the old drafts with the rooms: it never looks at the plan.
    const api = fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [foundAt("2026-09-29T10:00:00.000Z")], linedUp: { pairs: 162 } }) });
    open([plan({ updatedAt: "2026-09-29T10:05:00.000Z" })], api);
    expect(await guide().findByText(moved)).toBeTruthy();
    expect(screen.queryByText(lines)).toBeNull();
    // Find rooms on the plan as it sits: its drafts are newer than the plan.
    (api.listRoomDrafts as unknown as Mock).mockResolvedValue({ drafts: [foundAt("2026-09-29T10:10:00.000Z")], linedUp: { pairs: 162 } });
    (findRoomsInDrawing as unknown as Mock).mockResolvedValue({ drafts: [foundAt("2026-09-29T10:10:00.000Z")], rooms: 1, open: 0, skipped: [] });
    fireEvent.click(guide().getByRole("button", { name: "Find rooms in the drawing" }));
    fireEvent.click(await guide().findByRole("button", { name: "Find again" }));
    expect(await guide().findByText(lines)).toBeTruthy();
    expect(screen.queryByText(moved)).toBeNull();
  });

  it("takes an opacity change after Find rooms for a move too: the plan's updatedAt can't tell them apart, and asking again is the safe side", () => {
    useEditorStore.getState().setModel(withRooms);
    // The plan's only change since the search was its opacity; the image row says only when it was saved.
    open([plan({ opacity: 0.8, updatedAt: "2026-09-29T10:05:00.000Z" })]);
    act(() => useDrafts.getState().setDrafts("oth-L2", [{ ...found, updatedAt: "2026-09-29T10:00:00.000Z" }], undefined, { pairs: 162 }));
    expect(guide().getByText(moved)).toBeTruthy();
  });

  it("says nothing of a move with no earlier search: the floor's rooms are what to line up with", () => {
    useEditorStore.getState().setModel(withRooms);
    open([plan()]);
    act(() => useDrafts.getState().planChanged("oth-L2"));
    expect(screen.queryByText(moved)).toBeNull();
    expect(guide().getByText(/L2 already has 2 rooms/)).toBeTruthy();
  });

  it("says plainly it couldn't check the drawing, once Find rooms has run and neither answer came", () => {
    useEditorStore.getState().setModel(withRooms);
    open([plan()]);
    act(() => useDrafts.getState().setDrafts("oth-L2", [found]));
    const line = guide().getByText("Couldn't check the drawing against L2's 2 rooms: look before step 5.");
    expect(line.textContent).toBe("Couldn't check the drawing against L2's 2 rooms: look before step 5.");
    expect(screen.queryByText(/already has/)).toBeNull();
  });

  it("says no 'Couldn't check' line once the rooms step (5) is done: nothing there is left to decide", () => {
    useEditorStore.getState().setModel(withRooms);
    useSetupStore.getState().put("oth-L2", setupState({ rooms: { status: "done" } }));
    open([plan()]);
    act(() => useDrafts.getState().setDrafts("oth-L2", [found]));
    expect(screen.queryByText(/Couldn't check/)).toBeNull();
    expect(screen.queryByText(/already has/)).toBeNull();
  });

  it("still says the plan moved once the rooms step (5) is done: a moved plan matters even after it", () => {
    useEditorStore.getState().setModel(withRooms);
    useSetupStore.getState().put("oth-L2", setupState({ rooms: { status: "done" } }));
    open([plan()]);
    act(() => useDrafts.getState().setDrafts("oth-L2", [found], undefined, { pairs: 162 }));
    act(() => useDrafts.getState().planChanged("oth-L2"));
    expect(guide().getByText(moved)).toBeTruthy();
    expect(screen.queryByText(/Couldn't check/)).toBeNull();
  });

  it("warns with the drawing's own offset once its drafts show one, in place of the generic warning", () => {
    open([plan()]);
    act(() => useDrafts.getState().setDrafts("oth-L2", [], { dx: 11.5, dy: -4.6, pairs: 7 }));
    expect(guide().getByText(
      "The drawing sits about 11.5 m east and 4.6 m south of the rooms already on L2. "
      + "Line it up with Align on this step, then run Find rooms again.",
    )).toBeTruthy();
    expect(screen.queryByText(/already has/)).toBeNull();
  });

  it("warns nothing about lining up on a floor with no rooms yet, and no offset known", () => {
    open([plan()]);
    expect(screen.queryByText(/already has/)).toBeNull();
    expect(screen.queryByText(/The drawing sits about/)).toBeNull();
  });
});
