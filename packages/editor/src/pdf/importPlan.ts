import type { PlanSheet } from "@oth/model";
import type { Api, LevelImage } from "../api/client";
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

export type PdfImport = {
  api: Pick<Api, "uploadLevelImage" | "patchLevelImage" | "uploadPlanSource">;
  levelId: string;
  file: File;
  /** This floor's plan now, which the new one replaces. */
  current: LevelImage | null;
  below: { code: string; image: LevelImage } | null;
  choosePage: (pages: PageChoice[]) => Promise<number | null>;
  stage?: (words: string) => void;
};

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

function placementWords(placed: Placed, o: PdfImport, scaled: boolean): string {
  if (!scaled) return "";
  const onBelow = placed.on != null && placed.on === o.below?.image;
  if (placed.how === "same-sheet") {
    return onBelow ? `It is placed over ${o.below!.code}'s plan, as the same drawing set.` : "It is placed where the plan it replaces was.";
  }
  if (placed.how === "centred") {
    return onBelow ? `It is centred on ${o.below!.code}'s plan. Line it up with Align.` : "It is centred where the plan it replaces was. Line it up with Align.";
  }
  return "Line it up with Align.";
}

/**
 * A floor's PDF becomes its plan (spec §5.2 steps 1–4). The file is read in
 * this tab only. Three requests follow: the image, its calibration and place,
 * and the PDF with where on it the image is. Null when you did not choose a
 * page.
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

  o.stage?.(`Uploading ${o.file.name}…`);
  const uploaded = await o.api.uploadLevelImage(o.levelId, new File([drawn.jpeg], imageName(o.file.name), { type: "image/jpeg" }));
  const placed = placePlan(
    { sheet: drawn.sheet, widthPx: uploaded.widthPx, heightPx: uploaded.heightPx, metresPerPixel: drawn.metresPerPixel },
    o.current, o.below?.image ?? null,
  );
  const patched = await o.api.patchLevelImage(uploaded.id, uploaded.version, {
    ...(drawn.metresPerPixel != null ? { metresPerPixel: drawn.metresPerPixel } : {}),
    offsetX: placed.offsetX,
    offsetY: placed.offsetY,
  });
  const image = await o.api.uploadPlanSource(
    patched.id, patched.version, new Blob([bytes.slice().buffer], { type: "application/pdf" }), o.file.name, drawn.sheet,
  );
  const report = [describeCalibration(drawn.calibration, drawn.hasText), placementWords(placed, o, drawn.metresPerPixel != null)]
    .filter(Boolean).join(" ");
  return { image, report };
}
