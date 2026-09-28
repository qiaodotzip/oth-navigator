import type { PlanSheet } from "@oth/model";
import { describe, expect, it, vi } from "vitest";
import type { LevelImage } from "../api/client";
import { NotAPdfError, PlanPartlyStoredError, finishPdfPlan, importPdfPlan, type PageChoice, type PdfImport } from "./importPlan";
import { PdfUnreadableError, readBytes } from "./pdfjs";
import { PLAN_SHEET_SCALE, planSheet, syntheticPdf } from "./testing/syntheticPdf";

const sheetPdf = (content = planSheet(), pages = 1) =>
  syntheticPdf(Array.from({ length: pages }, () => ({ width: 400, height: 300, content })));
const asFile = (bytes: Uint8Array, name = "L2.pdf") => new File([bytes.slice()], name, { type: "application/pdf" });

/** The three calls an import makes, each answering as the server would. */
function fakes() {
  let latest: LevelImage;
  const api = {
    uploadLevelImage: vi.fn(async (levelId: string, file: File) => {
      latest = {
        id: "img_new", levelId, filename: file.name, widthPx: 2092, heightPx: 2132, sizeBytes: file.size,
        metresPerPixel: null, offsetX: 0, offsetY: 0, opacity: 0.6, version: 0, source: null,
      };
      return latest;
    }),
    patchLevelImage: vi.fn(async (_id: string, version: number, patch: Partial<LevelImage>) => {
      latest = { ...latest, ...patch, version: version + 1 };
      return latest;
    }),
    uploadPlanSource: vi.fn(async (_id: string, version: number, _pdf: Blob, filename: string, sheet: PlanSheet) => {
      latest = { ...latest, version: version + 1, source: { ...sheet, pdfId: "pdf_x", checksum: "b".repeat(64), filename } };
      return latest;
    }),
  };
  return api;
}

const options = (over: Partial<PdfImport> = {}): PdfImport => ({
  api: fakes(), levelId: "oth-L2", file: asFile(sheetPdf()), current: () => null, below: () => null,
  choosePage: vi.fn(async () => 1), ...over,
});

describe("importPdfPlan", () => {
  it("draws the sheet as the floor's plan at 0.05 m per pixel, scaled from its own grid, with its PDF beside it", async () => {
    const pdf = sheetPdf();
    const o = options({ file: asFile(pdf) });
    const done = await importPdfPlan(o);
    const api = o.api as ReturnType<typeof fakes>;

    const [levelId, uploaded] = api.uploadLevelImage.mock.calls[0]!;
    expect(levelId).toBe("oth-L2");
    expect(uploaded.name).toBe("L2.jpg");
    expect(Array.from((await readBytes(uploaded)).subarray(0, 2))).toEqual([0xff, 0xd8]);

    const [, , patch] = api.patchLevelImage.mock.calls[0]!;
    expect(patch.metresPerPixel).toBeCloseTo(0.05, 10);

    const [, , sent, filename, sheet] = api.uploadPlanSource.mock.calls[0]!;
    // The file itself: a 50 MB PDF is not copied again to send it.
    expect(sent).toBe(o.file);
    expect(filename).toBe("L2.pdf");
    // Compared as plain arrays: FileReader hands back a Uint8Array from jsdom's realm.
    expect(Array.from(await readBytes(sent))).toEqual(Array.from(pdf));
    expect(sheet).toMatchObject({ page: 1, pageCount: 1, pageSizePt: [400, 300], rotation: 0, runsAgree: 2, runsFound: 2 });
    expect(sheet.metresPerPoint).toBeCloseTo(PLAN_SHEET_SCALE, 6);
    expect(sheet.pointsPerPixel).toBeCloseTo(0.1, 10);
    expect(sheet.clipPt[0]).toBeCloseTo(36.5, 0);

    expect(done!.image.source?.pdfId).toBe("pdf_x");
    expect(done!.report).toBe("Scale from the drawing's grid: 0.5000 m per point, 2 of 2 dimension runs agree. Line it up with Align.");
  });

  it("places the sheet over the floor below's when the two are one drawing set", async () => {
    const first = options();
    const below = (await importPdfPlan(first))!.image;
    const moved = { ...below, levelId: "oth-L1", offsetX: 40, offsetY: 90 };
    const o = options({ below: () => ({ code: "L1", image: moved }) });
    const done = await importPdfPlan(o);
    const [, , patch] = (o.api as ReturnType<typeof fakes>).patchLevelImage.mock.calls[0]!;
    expect(patch).toMatchObject({ offsetX: 40, offsetY: 90 });
    expect(done!.report).toMatch(/It is placed over L1's plan, as the same drawing set\.$/);
  });

  it("asks which page when there are several, and stops without a word if you don't choose", async () => {
    const choosePage = vi.fn(async (_pages: PageChoice[]): Promise<number | null> => null);
    const o = options({ file: asFile(sheetPdf(planSheet(), 2)), choosePage });
    expect(await importPdfPlan(o)).toBeNull();
    expect(choosePage.mock.calls[0]![0].map(c => c.number)).toEqual([1, 2]);
    expect((o.api as ReturnType<typeof fakes>).uploadLevelImage).not.toHaveBeenCalled();
  });

  it("draws the page you choose", async () => {
    const o = options({ file: asFile(sheetPdf(planSheet(), 2)), choosePage: vi.fn(async () => 2) });
    await importPdfPlan(o);
    const [, , , , sheet] = (o.api as ReturnType<typeof fakes>).uploadPlanSource.mock.calls[0]!;
    expect(sheet).toMatchObject({ page: 2, pageCount: 2 });
  });

  it("adds a sheet with no grid whole and unscaled, and says how to scale it", async () => {
    const o = options({ file: asFile(sheetPdf(planSheet({ dimensions: false }))) });
    const done = await importPdfPlan(o);
    const api = o.api as ReturnType<typeof fakes>;
    expect(api.patchLevelImage.mock.calls[0]![2]).toEqual({ offsetX: 0, offsetY: 0 });
    const sheet = api.uploadPlanSource.mock.calls[0]![4];
    expect(sheet).toMatchObject({ metresPerPoint: null, clipPt: [0, 0, 400, 300], pointsPerPixel: 0.25 });
    expect(done!.report).toMatch(/^Not scaled: the drawing has no runs of grid dimensions/);
  });

  it("refuses a file that isn't a PDF before reading anything", async () => {
    const o = options({ file: asFile(new TextEncoder().encode("GIF89a"), "L2.pdf") });
    await expect(importPdfPlan(o)).rejects.toBeInstanceOf(NotAPdfError);
    expect((o.api as ReturnType<typeof fakes>).uploadLevelImage).not.toHaveBeenCalled();
  });

  it("calls a PDF it cannot read unreadable, not a lost connection", async () => {
    const o = options({ file: asFile(new TextEncoder().encode("%PDF-1.4\nnothing here")) });
    await expect(importPdfPlan(o)).rejects.toBeInstanceOf(PdfUnreadableError);
  });

  it("says what it is doing as it goes", async () => {
    const stages: string[] = [];
    await importPdfPlan(options({ stage: s => stages.push(s) }));
    expect(stages).toEqual(["Reading L2.pdf…", "Drawing the plan…", "Uploading L2.pdf…"]);
  });

  it("reads the plans it places against once the sheet is drawn, so one moved meanwhile is placed from where it is", async () => {
    const log: string[] = [];
    await importPdfPlan(options({
      stage: s => log.push(s),
      current: () => { log.push("current"); return null; },
      below: () => { log.push("below"); return null; },
    }));
    expect(log).toEqual(["Reading L2.pdf…", "Drawing the plan…", "current", "below", "Uploading L2.pdf…"]);
  });

  it("hands back each part of the plan as it is stored", async () => {
    const stored: LevelImage[] = [];
    const done = await importPdfPlan(options({ onStored: image => stored.push(image) }));
    expect(stored.map(i => [i.version, i.metresPerPixel != null, i.source != null])).toEqual([[0, false, false], [1, true, false], [2, true, true]]);
    expect(stored.at(-1)).toBe(done!.image);
  });

  it("keeps the plan that went in when its scale doesn't save, and finishing it sends only what is missing", async () => {
    const api = fakes();
    api.patchLevelImage.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const stored: LevelImage[] = [];
    const err = await importPdfPlan(options({ api, onStored: image => stored.push(image) })).catch(e => e);
    expect(err).toBeInstanceOf(PlanPartlyStoredError);
    const { unfinished } = err as PlanPartlyStoredError;
    expect(unfinished).toMatchObject({ missing: "scale", image: { id: "img_new", version: 0 } });
    expect(stored.map(i => i.id)).toEqual(["img_new"]);
    expect(api.uploadPlanSource).not.toHaveBeenCalled();

    // The next try goes through: the fake answers as the server would again.
    const done = await finishPdfPlan(api, unfinished);
    expect(api.uploadLevelImage).toHaveBeenCalledTimes(1);
    expect(api.patchLevelImage.mock.calls[1]![2].metresPerPixel).toBeCloseTo(0.05, 10);
    expect(done.image).toMatchObject({ version: 2, source: { pdfId: "pdf_x" } });
    expect(done.report).toMatch(/^Scale from the drawing's grid/);
  });

  it("keeps the scaled plan when its PDF doesn't save, and finishing it sends the PDF alone", async () => {
    const api = fakes();
    api.uploadPlanSource.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const o = options({ api });
    const err = await importPdfPlan(o).catch(e => e);
    expect(err).toBeInstanceOf(PlanPartlyStoredError);
    const { unfinished } = err as PlanPartlyStoredError;
    expect(unfinished).toMatchObject({ missing: "pdf", image: { version: 1 } });
    expect(unfinished.image.metresPerPixel).toBeCloseTo(0.05, 10);

    const done = await finishPdfPlan(api, unfinished);
    expect(api.patchLevelImage).toHaveBeenCalledTimes(1);
    expect(api.uploadPlanSource.mock.calls[1]![2]).toBe(o.file);
    expect(done.image.source?.pdfId).toBe("pdf_x");
  });
});
