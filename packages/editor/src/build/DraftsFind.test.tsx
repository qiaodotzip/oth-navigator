import { RoomDraftSchema, parseModel, type PlanSource } from "@oth/model";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ApiError, type LevelImage } from "../api/client";
import { findRoomsInDrawing } from "../pdf/findInDrawing";
import { PdfUnreadableError } from "../pdf/pdfjs";
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
  levels: [{ id: "oth-L2", buildingId: "oth", code: "L2", ordinal: 2, nameEn: "L2", nameZh: "二楼", elevationM: 6, heightM: 4 }],
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
const button = () => screen.getByRole("button", { name: "Find rooms in the drawing" });
const cancel = () => screen.queryByRole("button", { name: "Cancel" });
const lastToast = () => useToasts.getState().toasts.at(-1);
type FindArgs = { stage: (s: string) => void; signal: AbortSignal };

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
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.message)
      .toBe("Found 1 room in the drawing. 1 escalator or stair left out: mark it on Entrances & lifts."));
    expect(useDrafts.getState().byLevel["oth-L2"]).toEqual([shop]);
    expect(find.mock.calls[0]![0]).toMatchObject({ levelId: "oth-L2", image: { id: "img_2" } });
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

  it("says a drawing it cannot read is unreadable", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    find.mockRejectedValue(new PdfUnreadableError("the drawing couldn't be read (bad XRef)"));
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.message).toBe("Couldn't find rooms: the drawing couldn't be read (bad XRef)."));
  });

  it("offers Retry when the server had a problem", async () => {
    useEditorStore.getState().setLevelImages([plan()]);
    find.mockRejectedValue(new ApiError(500, {}));
    render(<DraftsFind api={fakeApi()} />);
    fireEvent.click(button());
    await waitFor(() => expect(lastToast()?.action?.label).toBe("Retry"));
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
