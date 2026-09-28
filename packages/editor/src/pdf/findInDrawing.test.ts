import type { PlanSource, RoomDraft, RoomDraftInput, DraftSource } from "@oth/model";
import { describe, expect, it, vi } from "vitest";
import type { LevelImage } from "../api/client";
import { describeFind, findRoomsInDrawing } from "./findInDrawing";
import { PdfUnreadableError, openPdf } from "./pdfjs";
import { readSheet } from "./sheet";
import { planSheet, syntheticPdf } from "./testing/syntheticPdf";

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

function fakes(bytes = pdf) {
  const replaceRoomDrafts = vi.fn(async (levelId: string, body: { source: DraftSource; drafts: RoomDraftInput[] }) =>
    body.drafts.map((d, i) => ({ ...d, holes: d.holes ?? [], id: `rd_${i}`, levelId, source: body.source, version: 0 }) as RoomDraft));
  return { fetchPlanSource: vi.fn(async () => bytes.slice()), replaceRoomDrafts };
}

describe("findRoomsInDrawing", () => {
  it("reads the floor's PDF where its plan sits now, and saves what it finds as the floor's drafts", async () => {
    const source = await sourceFor(pdf);
    const image: LevelImage = {
      id: "img_2", levelId: "oth-L2", filename: "L2.jpg", widthPx: 2092, heightPx: 2132, sizeBytes: 1,
      metresPerPixel: 0.05, offsetX: 10, offsetY: 200, opacity: 0.6, version: 2, source,
    };
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

    // Where the plan is now: the image's corner is at (10, 200). The shop's west wall is sheet x 100 pt,
    // its inner face 100.2 pt, and the window starts at clipPt[0], at 0.5 m a point.
    const shop = body.drafts.find(d => d.nameEn === "Shop")!;
    expect(Math.min(...shop.footprint!.map(p => p[0]))).toBeCloseTo(10 + (100.2 - source.clipPt[0]) * 0.5, 0);
  });

  it("calls a PDF it cannot read unreadable, not a lost connection", async () => {
    const image: LevelImage = {
      id: "img_2", levelId: "oth-L2", filename: "L2.jpg", widthPx: 1, heightPx: 1, sizeBytes: 1,
      metresPerPixel: 0.05, offsetX: 0, offsetY: 0, opacity: 0.6, version: 2, source: await sourceFor(pdf),
    };
    const api = fakes(new TextEncoder().encode("%PDF-1.4\nnothing"));
    await expect(findRoomsInDrawing({ api, image, levelId: "oth-L2" })).rejects.toBeInstanceOf(PdfUnreadableError);
    expect(api.replaceRoomDrafts).not.toHaveBeenCalled();
  });

  it("stops when it is cancelled, as a cancel and not an unreadable drawing, and keeps the floor's drafts", async () => {
    const image: LevelImage = {
      id: "img_2", levelId: "oth-L2", filename: "L2.jpg", widthPx: 1, heightPx: 1, sizeBytes: 1,
      metresPerPixel: 0.05, offsetX: 0, offsetY: 0, opacity: 0.6, version: 2, source: await sourceFor(pdf),
    };
    const api = fakes();
    const stop = new AbortController();
    const stages: string[] = [];
    const finding = findRoomsInDrawing({
      api, image, levelId: "oth-L2", metresPerPixel: 0.1, signal: stop.signal,
      stage: s => {
        stages.push(s);
        if (s === "Finding rooms…") stop.abort();
      },
    });
    await expect(finding).rejects.toMatchObject({ name: "AbortError" });
    expect(stages).not.toContain("Saving the drafts…");
    expect(api.replaceRoomDrafts).not.toHaveBeenCalled();
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
});
