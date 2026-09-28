import type { PlanSheet } from "@oth/model";
import type { Api, LevelImage, LevelImagePatch } from "../api/client";
import { describeCalibration, type Calibration } from "./calibrate";
import { placePlan, type Placed } from "./placement";
import { PdfUnreadableError, looksLikePdf, openPdf, readBytes, type PdfDocument } from "./pdfjs";
import { CanvasTooLargeError, encodeJpeg, renderWindow } from "./render";
import { fitBudget, readSheet, renderMetresPerPixel, unscaledPointsPerPixel } from "./sheet";

/** The server's own limit for a plan image (`IMAGE_MAX_BYTES`). */
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export class NotAPdfError extends Error {
  constructor(filename: string) {
    super(`${filename} isn't a PDF`);
    this.name = "NotAPdfError";
  }
}

export type PageChoice = { number: number; title: string };

type PlanApi = Pick<Api, "uploadLevelImage" | "patchLevelImage" | "uploadPlanSource">;

export type PdfImport = {
  api: PlanApi;
  levelId: string;
  file: File;
  /**
   * This floor's plan now, which the new one replaces, and the floor below's.
   * Asked for once the sheet is drawn: drawing takes seconds, and a plan
   * moved meanwhile is placed from where it is by then.
   */
  current: () => LevelImage | null;
  below: () => { code: string; image: LevelImage } | null;
  choosePage: (pages: PageChoice[]) => Promise<number | null>;
  stage?: (words: string) => void;
  /**
   * The plan as the server has it, after each request that stores part of it.
   * The server retires the floor's old plan with the first, so a screen that
   * waited for the last would go on editing a plan that is gone.
   */
  onStored?: (image: LevelImage) => void;
};

/** What a stored plan still lacks: its scale and place, then its PDF; or its PDF alone. */
export type Unfinished = {
  /** The plan as the server last answered. */
  image: LevelImage;
  missing: "scale" | "pdf";
  patch: LevelImagePatch;
  pdf: Blob;
  filename: string;
  sheet: PlanSheet;
  report: string;
};

/**
 * The plan went in, but a request after it failed. It carries what is still
 * to send, so a Retry finishes the plan rather than uploading it again.
 */
export class PlanPartlyStoredError extends Error {
  constructor(readonly unfinished: Unfinished, cause: unknown) {
    super(`the plan is stored, but its ${unfinished.missing === "pdf" ? "PDF" : "scale"} didn't save`, { cause });
    this.name = "PlanPartlyStoredError";
  }
}

type Drawn = { jpeg: Blob; sheet: PlanSheet; metresPerPixel: number | null; calibration: Calibration; hasText: boolean };

/** "L2 Floor Plan.pdf" → "L2 Floor Plan.jpg". */
const imageName = (pdfName: string) => `${pdfName.replace(/\.pdf$/i, "")}.jpg`;

/** Each page, by its largest lettering: on a CAD sheet that is the drawing's title. */
async function pageChoices(doc: PdfDocument): Promise<PageChoice[]> {
  const out: PageChoice[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let title = "";
    let tallest = 0;
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      if (item.height > tallest) {
        tallest = item.height;
        title = item.str.trim().slice(0, 48);
      }
    }
    out.push({ number: n, title });
  }
  return out;
}

/**
 * Renders one page's drawing as the plan image (spec §5.2 steps 2–3): scaled
 * from its grid, windowed round the drawing, within the pixel budget. A
 * browser that will not hold the canvas gets a coarser plan rather than none,
 * and a JPEG over the server's 20 MB is saved again at a lower quality.
 * Anything that goes wrong here is local, and is said as the PDF being
 * unreadable, not as a lost connection.
 */
async function drawPage(doc: PdfDocument, n: number, stage?: (w: string) => void): Promise<Drawn> {
  try {
    const page = await doc.getPage(n);
    const reading = await readSheet(page);
    const scale = reading.calibration.metresPerPoint;
    let pointsPerPixel = scale
      ? fitBudget(reading.window, scale, renderMetresPerPixel(reading.width * scale)) / scale
      : unscaledPointsPerPixel(reading.window);
    stage?.("Drawing the plan…");
    for (let attempt = 0; ; attempt++) {
      let rendered;
      try {
        rendered = await renderWindow(doc, page, reading.window, 1 / pointsPerPixel);
      } catch (err) {
        if (!(err instanceof CanvasTooLargeError) || attempt >= 2) throw err;
        pointsPerPixel *= 1.5;
        continue;
      }
      try {
        let jpeg = await encodeJpeg(rendered.canvas, 0.88);
        for (const quality of [0.75, 0.6]) {
          if (jpeg.size <= IMAGE_MAX_BYTES) break;
          jpeg = await encodeJpeg(rendered.canvas, quality);
        }
        const w = reading.window;
        return {
          jpeg,
          metresPerPixel: scale ? scale * pointsPerPixel : null,
          calibration: reading.calibration,
          hasText: reading.items.length > 0,
          sheet: {
            page: n, pageCount: doc.numPages, pageSizePt: [reading.width, reading.height], rotation: reading.rotation,
            clipPt: [w.x0, w.y0, w.x1, w.y1], pointsPerPixel, metresPerPoint: scale,
            runsAgree: reading.calibration.runsAgree, runsFound: reading.calibration.runsFound,
          },
        };
      } finally {
        rendered.release();
      }
    }
  } catch (err) {
    if (err instanceof PdfUnreadableError) throw err;
    throw new PdfUnreadableError(`the drawing couldn't be drawn (${err instanceof Error ? err.message : String(err)})`);
  }
}

function placementWords(placed: Placed, below: { code: string; image: LevelImage } | null, scaled: boolean): string {
  if (!scaled) return "";
  const onBelow = placed.on != null && placed.on === below?.image;
  if (placed.how === "same-sheet") {
    return onBelow ? `It is placed over ${below!.code}'s plan, as the same drawing set.` : "It is placed where the plan it replaces was.";
  }
  if (placed.how === "centred") {
    return onBelow ? `It is centred on ${below!.code}'s plan. Line it up with Align.` : "It is centred where the plan it replaces was. Line it up with Align.";
  }
  return "Line it up with Align.";
}

/**
 * A floor's PDF becomes its plan (spec §5.2 steps 1–4). The file is read in
 * this tab only. Three requests follow: the image, its calibration and place,
 * and the PDF with where on it the image is. Null when you did not choose a
 * page. Once the image is stored, a failure is a PlanPartlyStoredError that
 * `finishPdfPlan` can pick up from.
 */
export async function importPdfPlan(o: PdfImport): Promise<{ image: LevelImage; report: string } | null> {
  const bytes = await readBytes(o.file);
  if (!looksLikePdf(bytes)) throw new NotAPdfError(o.file.name);
  o.stage?.(`Reading ${o.file.name}…`);
  const { doc, close } = await openPdf(bytes);
  let drawn: Drawn;
  try {
    const n = doc.numPages === 1 ? 1 : await o.choosePage(await pageChoices(doc));
    if (n == null) return null;
    drawn = await drawPage(doc, n, o.stage);
  } finally {
    await close();
  }

  const current = o.current();
  const below = o.below();
  o.stage?.(`Uploading ${o.file.name}…`);
  const uploaded = await o.api.uploadLevelImage(o.levelId, new File([drawn.jpeg], imageName(o.file.name), { type: "image/jpeg" }));
  o.onStored?.(uploaded);
  const placed = placePlan(
    { sheet: drawn.sheet, widthPx: uploaded.widthPx, heightPx: uploaded.heightPx, metresPerPixel: drawn.metresPerPixel },
    current, below?.image ?? null,
  );
  return finishPdfPlan(o.api, {
    image: uploaded,
    missing: "scale",
    patch: {
      ...(drawn.metresPerPixel != null ? { metresPerPixel: drawn.metresPerPixel } : {}),
      offsetX: placed.offsetX,
      offsetY: placed.offsetY,
    },
    // The file itself: it is a Blob already, and a 50 MB PDF need not be copied again.
    pdf: o.file,
    filename: o.file.name,
    sheet: drawn.sheet,
    report: [describeCalibration(drawn.calibration, drawn.hasText), placementWords(placed, below, drawn.metresPerPixel != null)]
      .filter(Boolean).join(" "),
  }, o.onStored);
}

/**
 * Sends what a stored plan still lacks, from where an import stopped. Each
 * request carries the version the one before it brought back; `u.image` is
 * the plan as it stands now, so a Retry after the plan was nudged still fits.
 */
export async function finishPdfPlan(
  api: PlanApi, u: Unfinished, onStored?: (image: LevelImage) => void,
): Promise<{ image: LevelImage; report: string }> {
  let image = u.image;
  if (u.missing === "scale") {
    try {
      image = await api.patchLevelImage(image.id, image.version, u.patch);
    } catch (err) {
      throw new PlanPartlyStoredError({ ...u, image }, err);
    }
    onStored?.(image);
  }
  try {
    image = await api.uploadPlanSource(image.id, image.version, u.pdf, u.filename, u.sheet);
  } catch (err) {
    throw new PlanPartlyStoredError({ ...u, image, missing: "pdf" }, err);
  }
  onStored?.(image);
  return { image, report: u.report };
}
