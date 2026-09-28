import { RoomDraftSchema, parseModel, type PlanSource } from "@oth/model";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError, type LevelImage } from "../api/client";
import {
  DraftsNotSavedError, PlanMovedError, RoomFinderStoppedError, findRoomsInDrawing, type FindSummary,
} from "../pdf/findInDrawing";
import { PdfUnreadableError } from "../pdf/pdfjs";
import { CanvasTooLargeError } from "../pdf/render";
import { useEditorStore } from "../state/store";
import { fakeApi } from "../testing/fakeApi";
import { useToasts } from "../ui/toast";
import { useDrafts } from "./drafts";
import { DraftsFind } from "./DraftsFind";

vi.mock("../pdf/findInDrawing", async importOriginal => ({
  ...(await importOriginal<typeof import("../pdf/findInDrawing")>()),
  findRoomsInDrawing: vi.fn(),
}));
const find = findRoomsInDrawing as unknown as Mock;

const model = parseModel({
  building: { id: "oth", name: "OTH", anchorLat: 1.35, anchorLng: 103.94 },
  levels: [
    { id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 },
    { id: "oth-L3", buildingId: "oth", code: "L3", ordinal: 3, nameEn: "L3", nameZh: "三楼", elevationM: 10, heightM: 4 },
  ],
});
const source: PlanSource = {
  page: 1, pageCount: 1, pageSizePt: [400, 300], rotation: 0, clipPt: [36, 78, 246, 292], pointsPerPixel: 0.1,
  metresPerPoint: 0.5, runsAgree: 2, runsFound: 2, pdfId: "pdf_1", checksum: "d".repeat(64), filename: "L2.pdf",
};
const plan = (over: Partial<LevelImage> = {}): LevelImage => ({
  id: "img_2", levelId: "oth-L2", filename: "L2.jpg", widthPx: 2092, heightPx: 2132, sizeBytes: 1,
  metresPerPixel: 0.05, offsetX: 0, offsetY: 0, opacity: 0.6, version: 2, source, ...over,
});
const shop = RoomDraftSchema.parse({
  id: "rd_shop", levelId: "oth-L2", nameEn: "Shop", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
  labelPoint: [5, 5], areaM2: 96, source: { checksum: "d".repeat(64), page: 1 },
});
const foundShop: FindSummary = { drafts: [shop], rooms: 1, open: 0, skipped: [] };
const button = () => screen.getByRole("button", { name: "Find rooms in the drawing" });
const cancel = () => screen.queryByRole("button", { name: "Cancel" });
const lastToast = () => useToasts.getState().toasts.at(-1);
const setPlans = (images: LevelImage[]) => act(() => useEditorStore.getState().setLevelImages(images));
type FindArgs = { image: LevelImage; stage: (s: string) => void; signal: AbortSignal; planMoved: () => boolean };

beforeEach(() => {
  find.mockReset();
  useDrafts.getState().reset();
  useToasts.getState().clear();
  useEditorStore.getState().reset();
  useEditorStore.getState().setModel(model);
  useEditorStore.getState().setActiveLevel("oth-L2");
});

describe("DraftsFind", () => {
  it.each([
    ["no plan", [], "Add this floor's plan as a PDF on the Floorplan step first."],
    ["a plan from an image", [plan({ source: null })], "This plan came from an image. Add the floor's PDF on the Floorplan step to find rooms in it."],
    ["an unscaled plan", [plan({ metresPerPixel: null })], "Set the plan's scale on the Floorplan step first."],
  ])("can't find rooms on a floor with %s, and says what to do", (_what, images, words) => {
    useEditorStore.getState().setLevelImages(images);
    render(<DraftsFind api={fakeApi()} />);
    expect(button()).toBeDisabled();
    expect(screen.getByText(words)).toBeTruthy();
  });

  it("finds the rooms, keeps them as the floor's drafts, and says what it found", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    find.mockResolvedValue({ drafts: [shop], rooms: 1, open: 0, skipped: ["Escalator"] });
    const api = fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [shop] }) });
    render(<DraftsFind api={api} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.message)
      .toBe("Found 1 room in the drawing. 1 escalator or stair left out: mark it on Entrances & lifts."));
    await waitFor(() => expect(useDrafts.getState().byLevel["oth-L2"]).toEqual([shop]));
    expect(find.mock.calls[0]![0]).toMatchObject({ levelId: "oth-L2", image: { id: "img_2" } });
  });

  it("fetches the drafts again once the save lands, so a line-up warning shows at once, with no other reload", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    find.mockResolvedValue({ drafts: [shop], rooms: 1, open: 0, skipped: [] });
    const api = fakeApi({
      listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [shop], lineUp: { dx: 11.5, dy: -4.6, pairs: 7 } }),
    });
    render(<DraftsFind api={api} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.message).toBe("Found 1 room in the drawing."));
    await waitFor(() => expect(useDrafts.getState().lineUpByLevel["oth-L2"]).toEqual({ dx: 11.5, dy: -4.6, pairs: 7 }));
    expect(api.listRoomDrafts).toHaveBeenCalledWith("oth-L2");
  });

  it("in the setup wizard, says Claude makes the stops left out, rather than sending you to do them", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    find.mockResolvedValue({ drafts: [shop], rooms: 1, open: 0, skipped: ["Escalator 7", "Escalator 8"] });
    render(<DraftsFind api={fakeApi()} inSetup />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.message).toBe(
      "Found 1 room in the drawing. 2 escalators and stairs left out: Claude makes lifts, escalators and stairs into stops in step 5.",
    ));
  });

  describe("on a floor searched before", () => {
    const question = () => screen.queryByText(/Find rooms again\?/);
    /** L2's model with one room on it: accepted from the drawing, or traced by hand. */
    const withRoom = (evidence: string[]) => parseModel({
      ...model,
      rooms: [{ id: "shop", levelId: "oth-L2", kind: "room", footprint: [[0, 0], [10, 0], [10, 10], [0, 10]], heightM: 4, verification: { status: "cad", evidence } }],
    });

    it("asks first when drafts are waiting, and keeps them when you say so", async () => {
      useEditorStore.getState().setLevelImages([plan()]);
      useDrafts.getState().setDrafts("oth-L2", [shop, { ...shop, id: "rd_two" }]);
      find.mockResolvedValue(foundShop);
      render(<DraftsFind api={fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [shop] }) })} />);

      fireEvent.click(button());
      expect(question()!.textContent)
        .toBe("! Find rooms again? The 2 drafts waiting are replaced, and drafts you rejected or marked Done come back.");
      expect(find).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Keep these" }));
      expect(question()).toBeNull();
      expect(find).not.toHaveBeenCalled();

      fireEvent.click(button());
      fireEvent.click(screen.getByRole("button", { name: "Find again" }));
      expect(question()).toBeNull();
      await waitFor(() => expect(useDrafts.getState().byLevel["oth-L2"]).toEqual([shop]));
      expect(find).toHaveBeenCalledTimes(1);
    });

    it("asks first when every draft was decided, since the rejected ones come back", async () => {
      useEditorStore.getState().setModel(withRoom([`pdf:${"d".repeat(64)}`]));
      useEditorStore.getState().setLevelImages([plan()]);
      find.mockResolvedValue(foundShop);
      render(<DraftsFind api={fakeApi()} />);

      fireEvent.click(button());
      expect(question()!.textContent).toBe("! Find rooms again? Drafts you rejected or marked Done come back.");
      expect(find).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Find again" }));
      await waitFor(() => expect(find).toHaveBeenCalledTimes(1));
    });

    it("says one draft as one", () => {
      useEditorStore.getState().setLevelImages([plan()]);
      useDrafts.getState().setDrafts("oth-L2", [shop]);
      render(<DraftsFind api={fakeApi()} />);
      fireEvent.click(button());
      expect(question()!.textContent)
        .toBe("! Find rooms again? The 1 draft waiting is replaced, and drafts you rejected or marked Done come back.");
    });

    it("finds at once on a floor with no drafts, its rooms traced by hand", async () => {
      useEditorStore.getState().setModel(withRoom([]));
      useEditorStore.getState().setLevelImages([plan()]);
      find.mockResolvedValue(foundShop);
      render(<DraftsFind api={fakeApi()} />);
      fireEvent.click(button());
      expect(question()).toBeNull();
      await waitFor(() => expect(find).toHaveBeenCalledTimes(1));
    });
  });

  it("says what it is doing, and takes no second click while it works", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    let finish!: (value: unknown) => void;
    find.mockImplementation(({ stage }: { stage: (s: string) => void }) => {
      stage("Finding rooms…");
      return new Promise(resolve => { finish = resolve; });
    });
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    expect(await screen.findByText("Finding rooms…")).toBeTruthy();
    expect(button()).toBeDisabled();
    fireEvent.click(button());
    expect(find).toHaveBeenCalledTimes(1);
    finish({ drafts: [], rooms: 0, open: 0, skipped: [] });
    await waitFor(() => expect(button()).not.toBeDisabled());
  });

  it("names the floor when another floor's search shows here", async () => {
    useEditorStore.getState().setLevelImages([plan(), plan({ id: "img_3", levelId: "oth-L3" })]);
    let finish!: (value: FindSummary) => void;
    find.mockImplementation(({ stage }: FindArgs) => {
      stage("Finding rooms…");
      return new Promise(resolve => { finish = resolve; });
    });
    render(<DraftsFind api={fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [shop] }) })} />);
    fireEvent.click(button());
    expect(await screen.findByText("Finding rooms…")).toBeTruthy();

    act(() => useEditorStore.getState().setActiveLevel("oth-L3"));
    expect(screen.getByText("Finding rooms on L2…")).toBeTruthy();
    expect(screen.queryByText("Finding rooms…")).toBeNull();
    expect(button()).toBeDisabled();
    expect(cancel()).toBeTruthy();

    finish(foundShop);
    await waitFor(() => expect(button()).not.toBeDisabled());
    // The search's drafts are L2's, wherever you were when it finished.
    await waitFor(() => expect(useDrafts.getState().byLevel["oth-L2"]).toEqual([shop]));
    expect(useDrafts.getState().byLevel["oth-L3"]).toBeUndefined();
  });

  it("says a drawing it cannot read is unreadable, and what to do instead", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    find.mockRejectedValue(new PdfUnreadableError("the drawing couldn't be read (bad XRef)"));
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.message).toBe(
      "Couldn't find rooms: the drawing couldn't be read (bad XRef). Draw the rooms by hand, or import the floor's PDF again on the Floorplan step.",
    ));
    expect(lastToast()?.action).toBeUndefined();
  });

  it("says a drawing too large for this browser is that, and what to do instead", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    find.mockRejectedValue(new CanvasTooLargeError(40_000, 30_000));
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()).toMatchObject({
      tone: "error",
      message: "Couldn't find rooms: the drawing is too large for this browser to draw. Try again on a computer, in Chrome or Edge, or draw the rooms by hand.",
    }));
  });

  it("says the room finder stopped, and its Retry searches again", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    find.mockRejectedValueOnce(new RoomFinderStoppedError(new Error("Out of memory"))).mockResolvedValueOnce(foundShop);
    render(<DraftsFind api={fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [shop] }) })} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()).toMatchObject({
      tone: "error", message: "The room finder stopped. Try again, or find rooms on a smaller part.", action: { label: "Retry" },
    }));
    await act(() => lastToast()!.action!.run());
    expect(find).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(useDrafts.getState().byLevel["oth-L2"]).toEqual([shop]));
  });

  it("offers Retry when the server had a problem, and the Retry reads the plan as it is now", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    find.mockRejectedValueOnce(new ApiError(500, {})).mockResolvedValueOnce(foundShop);
    render(<DraftsFind api={fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [shop] }) })} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.action?.label).toBe("Retry"));

    // Align moved the plan before the Retry: the Retry searches it where it is now.
    setPlans([plan({ offsetX: 40, offsetY: -12, version: 3 })]);
    await act(() => lastToast()!.action!.run());
    expect(find.mock.calls[1]![0]).toMatchObject({ image: { offsetX: 40, offsetY: -12, version: 3 } });
    await waitFor(() => expect(useDrafts.getState().byLevel["oth-L2"]).toEqual([shop]));
  });

  it("knows the plan moved if it is aligned, rescaled or replaced during the search, but not for its opacity", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    const moved: Record<string, boolean> = {};
    // It runs inside the click, so the store is changed directly rather than in an act() of its own.
    const plansNow = (images: LevelImage[]) => useEditorStore.getState().setLevelImages(images);
    find.mockImplementation(async ({ planMoved }: FindArgs) => {
      moved.never = planMoved();
      plansNow([plan({ opacity: 0.3, version: 3 })]);
      moved.opacity = planMoved();
      plansNow([plan({ metresPerPixel: 0.06, version: 4 })]);
      moved.rescaled = planMoved();
      plansNow([plan({ offsetX: 5, version: 4 })]);
      moved.aligned = planMoved();
      plansNow([plan({ id: "img_9", version: 0 })]);
      moved.replaced = planMoved();
      plansNow([]);
      moved.removed = planMoved();
      throw new PlanMovedError();
    });
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()).toMatchObject({
      tone: "error", message: "The plan moved while rooms were being found. Find again.", action: { label: "Find again" },
    }));
    expect(moved).toEqual({ never: false, opacity: false, rescaled: true, aligned: true, replaced: true, removed: true });
  });

  it("keeps the floor's drafts when the plan moved during the search, and Find again searches it where it is", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    useDrafts.getState().setDrafts("oth-L2", [shop]);
    find.mockRejectedValueOnce(new PlanMovedError()).mockResolvedValueOnce({ drafts: [], rooms: 0, open: 0, skipped: [] });
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    // It asks first, with a draft waiting; the toast's Find again, below, doesn't ask twice.
    fireEvent.click(screen.getByRole("button", { name: "Find again" }));
    await waitFor(() => expect(lastToast()?.action?.label).toBe("Find again"));
    expect(useDrafts.getState().byLevel["oth-L2"]).toEqual([shop]);

    setPlans([plan({ offsetX: 5, version: 3 })]);
    await act(() => lastToast()!.action!.run());
    expect(find.mock.calls[1]![0]).toMatchObject({ image: { offsetX: 5 } });
  });

  it("repeats only the save when the save failed", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    const save = vi.fn().mockResolvedValue(foundShop);
    find.mockRejectedValueOnce(new DraftsNotSavedError(new ApiError(503, {}), save));
    render(<DraftsFind api={fakeApi({ listRoomDrafts: vi.fn().mockResolvedValue({ drafts: [shop] }) })} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()).toMatchObject({
      message: "Couldn't save the drafts from the drawing: the server had a problem. Try again in a moment.", action: { label: "Retry" },
    }));
    await act(() => lastToast()!.action!.run());
    expect(save).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(useDrafts.getState().byLevel["oth-L2"]).toEqual([shop]));
    expect(lastToast()?.message).toBe("Found 1 room in the drawing.");
  });

  it("doesn't let a failed save's Retry put back drafts a newer search replaced", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    const save = vi.fn().mockResolvedValue(foundShop);
    find.mockRejectedValueOnce(new DraftsNotSavedError(new ApiError(503, {}), save))
      .mockResolvedValueOnce({ drafts: [], rooms: 0, open: 0, skipped: [] });
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.action?.label).toBe("Retry"));
    const staleRetry = lastToast()!.action!.run;

    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.message).toBe("Found 0 rooms in the drawing."));
    await act(() => staleRetry());
    expect(save).not.toHaveBeenCalled();
    expect(useDrafts.getState().byLevel["oth-L2"]).toEqual([]);
  });

  it("stops when you cancel, says so, and leaves the floor's drafts as they were", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    useDrafts.getState().setDrafts("oth-L2", [shop]);
    let later!: () => void;
    find.mockImplementation(({ stage, signal }: FindArgs) => {
      stage("Reading the drawing…");
      // Like the page's render, it only notices the cancel when it next looks.
      return new Promise((_resolve, reject) => {
        later = () => {
          stage("Finding rooms…");
          reject(signal.reason);
        };
      });
    });
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    // It asks first, with a draft waiting.
    fireEvent.click(screen.getByRole("button", { name: "Find again" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Stopping…")).toBeTruthy();
    expect(cancel()).toBeNull();
    expect(button()).toBeDisabled();

    later();
    await waitFor(() => expect(button()).not.toBeDisabled());
    expect(screen.queryByText("Finding rooms…")).toBeNull();
    expect(lastToast()).toMatchObject({ tone: "info", message: "Stopped finding rooms. The floor's drafts are as they were." });
    expect(useDrafts.getState().byLevel["oth-L2"]).toEqual([shop]);
  });

  it("offers no Cancel once the drafts are being saved", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    let finish!: (value: unknown) => void;
    find.mockImplementation(({ stage }: FindArgs) => {
      stage("Saving the drafts…");
      return new Promise(resolve => { finish = resolve; });
    });
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    expect(await screen.findByText("Saving the drafts…")).toBeTruthy();
    expect(cancel()).toBeNull();
    finish({ drafts: [], rooms: 0, open: 0, skipped: [] });
    await waitFor(() => expect(button()).not.toBeDisabled());
  });
});
