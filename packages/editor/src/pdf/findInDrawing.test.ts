import type { PlanSource, RoomDraft, RoomDraftInput, DraftSource } from "@oth/model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type LevelImage } from "../api/client";
import { prepareFind } from "./extract";
import {
  DraftsNotSavedError, PlanMovedError, RoomFinderStoppedError, describeFind, findRoomsInDrawing,
} from "./findInDrawing";
import { PdfUnreadableError, openPdf } from "./pdfjs";
import { CanvasTooLargeError } from "./render";
import { runFindRooms } from "./runFind";
import { readSheet } from "./sheet";
import { planSheet, syntheticPdf } from "./testing/syntheticPdf";

// The real thing, watched: to see what a cancel or a failed save leaves undone, and to fail one on cue.
vi.mock("./extract", async importOriginal => {
  const real = await importOriginal<typeof import("./extract")>();
  return { ...real, prepareFind: vi.fn(real.prepareFind) };
});
vi.mock("./runFind", async importOriginal => {
  const real = await importOriginal<typeof import("./runFind")>();
  return { ...real, runFindRooms: vi.fn(real.runFindRooms) };
});

const pdf = syntheticPdf([{ width: 400, height: 300, content: planSheet() }]);

/** The source Task 4 would have saved for this sheet at 0.05 m a pixel. */
async function sourceFor(bytes: Uint8Array): Promise<PlanSource> {
  const { doc, close } = await openPdf(bytes);
  try {
    const r = await readSheet(await doc.getPage(1));
    const S = r.calibration.metresPerPoint!;
    return {
      page: 1, pageCount: 1, pageSizePt: [r.width, r.height], rotation: r.rotation,
      clipPt: [r.window.x0, r.window.y0, r.window.x1, r.window.y1], pointsPerPixel: 0.05 / S, metresPerPoint: S,
      runsAgree: 2, runsFound: 2, pdfId: "pdf_1", checksum: "d".repeat(64), filename: "L2.pdf",
    };
  } finally {
    await close();
  }
}

let sourceRead: Promise<PlanSource> | null = null;
const theSource = () => (sourceRead ??= sourceFor(pdf));

/** L2's plan, drawn from the sheet at 0.05 m a pixel, and placed as `place` says. */
async function planImage(place = { metresPerPixel: 0.05, offsetX: 10, offsetY: 200 }): Promise<LevelImage> {
  return {
    id: "img_2", levelId: "oth-L2", filename: "L2.jpg", widthPx: 2092, heightPx: 2132, sizeBytes: 1,
    opacity: 0.6, version: 2, source: await theSource(), ...place,
  };
}

function fakes(bytes = pdf) {
  const replaceRoomDrafts = vi.fn(async (levelId: string, body: { source: DraftSource; drafts: RoomDraftInput[] }) =>
    body.drafts.map((d, i) => ({ ...d, holes: d.holes ?? [], id: `rd_${i}`, levelId, source: body.source, version: 0 }) as RoomDraft));
  return { fetchPlanSource: vi.fn(async () => bytes.slice()), replaceRoomDrafts };
}

/** The shop's footprint, as the one PUT sent it. */
function shopSent(api: ReturnType<typeof fakes>, call = 0) {
  return api.replaceRoomDrafts.mock.calls[call]![1].drafts.find(d => d.nameEn === "Shop")!.footprint!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findRoomsInDrawing", () => {
  it("reads the floor's PDF where its plan sits now, and saves what it finds as the floor's drafts", async () => {
    const source = await theSource();
    const image = await planImage();
    const api = fakes();
    const stages: string[] = [];
    const found = await findRoomsInDrawing({ api, image, levelId: "oth-L2", stage: s => stages.push(s), metresPerPixel: 0.1 });

    expect(api.fetchPlanSource).toHaveBeenCalledWith("img_2");
    const [levelId, body] = api.replaceRoomDrafts.mock.calls[0]!;
    expect(levelId).toBe("oth-L2");
    expect(body.source).toEqual({ checksum: "d".repeat(64), page: 1 });
    expect(body.drafts.map(d => d.nameEn).sort()).toEqual(["Changing Room", "Plaza", "Shop", "Void"]);
    expect(found).toMatchObject({ rooms: 3, open: 1, skipped: ["Escalator"] });
    expect(found.drafts).toHaveLength(4);
    expect(stages).toEqual(["Fetching the drawing…", "Reading the drawing…", "Finding rooms…", "Saving the drafts…"]);

    // Where the plan is now: the image's corner is at (10, 200), at 0.5 m a point from the window's corner
    // (clipPt). The shop's walls are 0.4 pt: its inner faces on the sheet as shown (y down) are x 100.2 and
    // 123.8 pt, and y 130.2 and 149.8 pt. Model y runs up, so the sheet's top is the shop's greatest y.
    const [x0, y0] = source.clipPt;
    const shop = shopSent(api);
    expect(Math.min(...shop.map(p => p[0]))).toBeCloseTo(10 + (100.2 - x0) * 0.5, 0);
    expect(Math.max(...shop.map(p => p[1]))).toBeCloseTo(200 - (130.2 - y0) * 0.5, 0);
    expect(Math.min(...shop.map(p => p[1]))).toBeCloseTo(200 - (149.8 - y0) * 0.5, 0);
  });

  it("follows a plan moved and rescaled since it was imported", async () => {
    // Measure scale made it 0.04 m a pixel, so 0.4 m a point; Align moved its corner to (−40, 75). The
    // shop's east wall has the door in it, so its west wall and its two solid walls say where it is.
    const [x0, y0] = (await theSource()).clipPt;
    const api = fakes();
    await findRoomsInDrawing({ api, image: await planImage({ metresPerPixel: 0.04, offsetX: -40, offsetY: 75 }), levelId: "oth-L2", metresPerPixel: 0.1 });
    const shop = shopSent(api);
    expect(Math.min(...shop.map(p => p[0]))).toBeCloseTo(-40 + (100.2 - x0) * 0.4, 0);
    expect(Math.max(...shop.map(p => p[1]))).toBeCloseTo(75 - (130.2 - y0) * 0.4, 0);
    expect(Math.min(...shop.map(p => p[1]))).toBeCloseTo(75 - (149.8 - y0) * 0.4, 0);
  });

  it("calls a PDF it cannot read unreadable, not a lost connection", async () => {
    const api = fakes(new TextEncoder().encode("%PDF-1.4\nnothing"));
    await expect(findRoomsInDrawing({ api, image: await planImage(), levelId: "oth-L2" })).rejects.toBeInstanceOf(PdfUnreadableError);
    expect(api.replaceRoomDrafts).not.toHaveBeenCalled();
  });

  it("leaves a canvas too big for the browser as that, not as an unreadable drawing", async () => {
    vi.mocked(prepareFind).mockRejectedValueOnce(new CanvasTooLargeError(40_000, 30_000));
    const api = fakes();
    await expect(findRoomsInDrawing({ api, image: await planImage(), levelId: "oth-L2" })).rejects.toBeInstanceOf(CanvasTooLargeError);
    expect(api.replaceRoomDrafts).not.toHaveBeenCalled();
  });

  it("says the room finder stopped when its worker fails, not that the drawing is unreadable", async () => {
    vi.mocked(runFindRooms).mockRejectedValueOnce(new Error("Out of memory"));
    const api = fakes();
    const failed = findRoomsInDrawing({ api, image: await planImage(), levelId: "oth-L2", metresPerPixel: 0.1 });
    await expect(failed).rejects.toBeInstanceOf(RoomFinderStoppedError);
    await expect(failed).rejects.toMatchObject({ cause: { message: "Out of memory" } });
    expect(api.replaceRoomDrafts).not.toHaveBeenCalled();
  });

  it("stops when it is cancelled, as a cancel and not an unreadable drawing, and keeps the floor's drafts", async () => {
    const api = fakes();
    const stop = new AbortController();
    const stages: string[] = [];
    const finding = findRoomsInDrawing({
      api, image: await planImage(), levelId: "oth-L2", metresPerPixel: 0.1, signal: stop.signal,
      stage: s => {
        stages.push(s);
        if (s === "Finding rooms…") stop.abort();
      },
    });
    await expect(finding).rejects.toMatchObject({ name: "AbortError" });
    expect(stages).not.toContain("Saving the drafts…");
    expect(api.replaceRoomDrafts).not.toHaveBeenCalled();
  });

  it("doesn't draw the page when it is cancelled while the drawing is read", async () => {
    const api = fakes();
    const stop = new AbortController();
    const finding = findRoomsInDrawing({
      api, image: await planImage(), levelId: "oth-L2", signal: stop.signal,
      stage: s => {
        if (s === "Reading the drawing…") stop.abort();
      },
    });
    await expect(finding).rejects.toMatchObject({ name: "AbortError" });
    expect(prepareFind).not.toHaveBeenCalled();
    expect(api.replaceRoomDrafts).not.toHaveBeenCalled();
  });

  it("doesn't save rooms found over a plan that moved while they were found", async () => {
    const api = fakes();
    const stages: string[] = [];
    let seenWhenAsked: string[] = [];
    const finding = findRoomsInDrawing({
      api, image: await planImage(), levelId: "oth-L2", metresPerPixel: 0.1, stage: s => stages.push(s),
      planMoved: () => {
        seenWhenAsked = [...stages];
        return true;
      },
    });
    await expect(finding).rejects.toBeInstanceOf(PlanMovedError);
    // Asked once the rooms are found, just before the save.
    expect(seenWhenAsked.at(-1)).toBe("Finding rooms…");
    expect(api.replaceRoomDrafts).not.toHaveBeenCalled();
  });

  it("keeps what it found when the save fails, and sends only that again", async () => {
    const api = fakes();
    api.replaceRoomDrafts.mockRejectedValueOnce(new ApiError(500, {}));
    let moved = false;
    const err: unknown = await findRoomsInDrawing({
      api, image: await planImage(), levelId: "oth-L2", metresPerPixel: 0.1, planMoved: () => moved,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DraftsNotSavedError);
    const failed = err as DraftsNotSavedError;
    expect(failed.cause).toBeInstanceOf(ApiError);

    const saved = await failed.save();
    expect(saved).toMatchObject({ rooms: 3, open: 1, skipped: ["Escalator"] });
    expect(api.fetchPlanSource).toHaveBeenCalledTimes(1);
    expect(runFindRooms).toHaveBeenCalledTimes(1);
    expect(api.replaceRoomDrafts).toHaveBeenCalledTimes(2);
    expect(api.replaceRoomDrafts.mock.calls[1]).toEqual(api.replaceRoomDrafts.mock.calls[0]);

    // A plan moved since the search is still a reason not to save, on the second try too.
    moved = true;
    await expect(failed.save()).rejects.toBeInstanceOf(PlanMovedError);
    expect(api.replaceRoomDrafts).toHaveBeenCalledTimes(2);
  });
});

describe("describeFind", () => {
  it("says what was found, what to draw by hand, and what was left out", () => {
    expect(describeFind({ rooms: 3, open: 1, skipped: ["Escalator"] }))
      .toBe("Found 3 rooms in the drawing. 1 open space to draw by hand. 1 escalator or stair left out: mark it on Entrances & lifts.");
    expect(describeFind({ rooms: 1, open: 0, skipped: [] })).toBe("Found 1 room in the drawing.");
    expect(describeFind({ rooms: 190, open: 4, skipped: ["Escalator 7", "Escalator 8"] }))
      .toBe("Found 190 rooms in the drawing. 4 open spaces to draw by hand. 2 escalators and stairs left out: mark them on Entrances & lifts.");
  });

  it("in the setup wizard, says Claude makes them stops in step 5", () => {
    expect(describeFind({ rooms: 3, open: 0, skipped: ["Escalator"] }, { inSetup: true }))
      .toBe("Found 3 rooms in the drawing. 1 escalator or stair left out: Claude makes lifts, escalators and stairs into stops in step 5.");
    expect(describeFind({ rooms: 199, open: 16, skipped: Array(8).fill("Escalator") }, { inSetup: true }))
      .toBe("Found 199 rooms in the drawing. 16 open spaces to draw by hand. 8 escalators and stairs left out: Claude makes lifts, escalators and stairs into stops in step 5.");
  });
});
