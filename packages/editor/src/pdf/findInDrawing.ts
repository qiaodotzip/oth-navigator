import type { RoomDraft } from "@oth/model";
import type { Api, LevelImage } from "../api/client";
import { FIND_METRES_PER_PIXEL, prepareFind } from "./extract";
import type { FindResult } from "./findRooms";
import { PdfUnreadableError, openPdf } from "./pdfjs";
import { runFindRooms } from "./runFind";

export type FindSummary = { drafts: RoomDraft[]; rooms: number; open: number; skipped: string[] };

/** The last stage: from here the drafts are on their way, and a cancel is too late. */
export const SAVING_DRAFTS = "Saving the drafts…";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a search found, for the toast (spec §5.2 step 5). */
export function describeFind(s: Pick<FindSummary, "rooms" | "open" | "skipped">): string {
  const parts = [`Found ${count(s.rooms, "room", "rooms")} in the drawing.`];
  if (s.open > 0) parts.push(`${count(s.open, "open space", "open spaces")} to draw by hand.`);
  if (s.skipped.length === 1) parts.push("1 escalator or stair left out: mark it on Entrances & lifts.");
  if (s.skipped.length > 1) parts.push(`${s.skipped.length} escalators and stairs left out: mark them on Entrances & lifts.`);
  return parts.join(" ");
}

/**
 * Finds the rooms in a floor's PDF, over its plan as it is placed now, and
 * saves them as the floor's drafts, in place of the last search's (spec §5.2
 * step 5). The PDF is read in this tab; the flood runs in a worker. What goes
 * wrong reading or finding is the PDF's, said as unreadable. What goes wrong
 * on the wire is left as it is, for the caller's Retry.
 *
 * A cancel through `signal` stops the worker at once, and anything else at
 * the next stage. It rejects with the signal's reason, and it is never let
 * through to the save: a cancelled search leaves the floor's drafts as they were.
 */
export async function findRoomsInDrawing({ api, image, levelId, stage, metresPerPixel = FIND_METRES_PER_PIXEL, signal }: {
  api: Pick<Api, "fetchPlanSource" | "replaceRoomDrafts">;
  image: LevelImage;
  levelId: string;
  stage?: (words: string) => void;
  /** Coarser in the tests, to keep them quick. */
  metresPerPixel?: number;
  signal?: AbortSignal;
}): Promise<FindSummary> {
  const source = image.source;
  if (!source || image.metresPerPixel == null) throw new PdfUnreadableError("this plan has no PDF behind it, or no scale");
  const place = { metresPerPixel: image.metresPerPixel, offsetX: image.offsetX, offsetY: image.offsetY };

  stage?.("Fetching the drawing…");
  const bytes = await api.fetchPlanSource(image.id);
  signal?.throwIfAborted();
  stage?.("Reading the drawing…");
  const { doc, close } = await openPdf(bytes);
  let result: FindResult;
  try {
    try {
      const page = await doc.getPage(source.page);
      const input = await prepareFind(doc, page, source, place, metresPerPixel);
      signal?.throwIfAborted();
      stage?.("Finding rooms…");
      result = await runFindRooms(input, signal);
    } catch (err) {
      // A cancel is the person's, not the drawing's.
      if (err instanceof PdfUnreadableError || signal?.aborted) throw err;
      throw new PdfUnreadableError(`the drawing couldn't be read (${err instanceof Error ? err.message : String(err)})`);
    }
    // Part D: columns and flight outlines join the list here, while the document is open. What its
    // finders take: the page (doc.getPage(source.page)); (await loadPdfjs()).OPS; userSpaceToModel(page,
    // source, place); result.skippedLabels; and roomsExtent(result.drafts), 5 m wider. Their drafts go
    // in result.drafts, so the one PUT below carries both: a second PUT would replace the rooms'.
  } finally {
    await close();
  }

  signal?.throwIfAborted();
  stage?.(SAVING_DRAFTS);
  const drafts = await api.replaceRoomDrafts(levelId, {
    source: { checksum: source.checksum, page: source.page },
    drafts: result.drafts,
  });
  return {
    drafts,
    rooms: result.drafts.filter(d => d.footprint).length,
    open: result.drafts.filter(d => !d.footprint).length,
    skipped: result.skippedLabels.map(s => s.text),
  };
}
