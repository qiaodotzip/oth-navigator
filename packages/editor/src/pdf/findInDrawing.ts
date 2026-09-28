import type { RoomDraft } from "@oth/model";
import type { Api, LevelImage } from "../api/client";
import { FIND_METRES_PER_PIXEL, prepareFind } from "./extract";
import type { FindInput, FindResult } from "./findRooms";
import { PdfUnreadableError, openPdf } from "./pdfjs";
import { CanvasTooLargeError } from "./render";
import { runFindRooms } from "./runFind";

export type FindSummary = { drafts: RoomDraft[]; rooms: number; open: number; skipped: string[] };

/** The last stage: from here the drafts are on their way, and a cancel is too late. */
export const SAVING_DRAFTS = "Saving the drafts…";

/** The worker stopped or ran out of memory: the drawing may be fine, and a second try may work. */
export class RoomFinderStoppedError extends Error {
  constructor(cause: unknown) {
    super(`the room finder stopped (${cause instanceof Error ? cause.message : String(cause)})`, { cause });
    this.name = "RoomFinderStoppedError";
  }
}

/** The plan was moved, rescaled or replaced while its rooms were found: they were found where it was. */
export class PlanMovedError extends Error {
  constructor() {
    super("the plan moved while its rooms were being found");
    this.name = "PlanMovedError";
  }
}

/**
 * The rooms were found, but the save failed: `cause` is why. `save` sends
 * the same drafts again, so a Retry doesn't find them all over again. It
 * checks the plan again first: a plan moved since is still a reason not to save.
 */
export class DraftsNotSavedError extends Error {
  constructor(cause: unknown, readonly save: () => Promise<FindSummary>) {
    super("the drafts were found but not saved", { cause });
    this.name = "DraftsNotSavedError";
  }
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What a search found, for the toast (spec §5.2 step 5). In the setup wizard
 * (`inSetup`), what was left out is Claude's to make into stops at step 5,
 * so it doesn't send you to do them by hand.
 */
export function describeFind(s: Pick<FindSummary, "rooms" | "open" | "skipped">, { inSetup = false } = {}): string {
  const parts = [`Found ${count(s.rooms, "room", "rooms")} in the drawing.`];
  if (s.open > 0) parts.push(`${count(s.open, "open space", "open spaces")} to draw by hand.`);
  const leftOut = s.skipped.length === 1 ? "1 escalator or stair left out" : `${s.skipped.length} escalators and stairs left out`;
  if (s.skipped.length > 0 && inSetup) parts.push(`${leftOut}: Claude makes lifts, escalators and stairs into stops in step 5.`);
  else if (s.skipped.length > 0) parts.push(`${leftOut}: ${s.skipped.length === 1 ? "mark it" : "mark them"} on Entrances & lifts.`);
  return parts.join(" ");
}

/**
 * Finds the rooms in a floor's PDF, over its plan as it is placed now, and
 * saves them as the floor's drafts, in place of the last search's (spec §5.2
 * step 5). The PDF is read in this tab; the flood runs in a worker.
 *
 * What goes wrong is said by whose it is:
 * - reading the drawing: the PDF's, as PdfUnreadableError;
 * - a canvas too big to draw it on: the browser's, as CanvasTooLargeError;
 * - the worker stopping or running out of memory: RoomFinderStoppedError;
 * - the save: DraftsNotSavedError, which can send the same drafts again;
 * - on the wire before that: left as it is, for the caller's Retry.
 *
 * A cancel through `signal` stops the worker at once, and anything else at
 * the next stage. It rejects with the signal's reason, and it is never let
 * through to the save: a cancelled search leaves the floor's drafts as they were.
 *
 * `planMoved` is asked just before the save. When the plan was moved,
 * rescaled or replaced during the search, the rooms were found where it
 * was, so they are not saved over the floor's drafts: PlanMovedError.
 */
export async function findRoomsInDrawing({
  api, image, levelId, stage, metresPerPixel = FIND_METRES_PER_PIXEL, signal, planMoved,
}: {
  api: Pick<Api, "fetchPlanSource" | "replaceRoomDrafts">;
  image: LevelImage;
  levelId: string;
  stage?: (words: string) => void;
  /** Coarser in the tests, to keep them quick. */
  metresPerPixel?: number;
  signal?: AbortSignal;
  planMoved?: () => boolean;
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
    let input: FindInput;
    try {
      // Drawing the window is the slow part of reading, and can't be stopped once begun: look first.
      signal?.throwIfAborted();
      const page = await doc.getPage(source.page);
      signal?.throwIfAborted();
      input = await prepareFind(doc, page, source, place, metresPerPixel);
    } catch (err) {
      // A cancel is the person's, and a canvas too big is the browser's: neither is the drawing's.
      if (err instanceof PdfUnreadableError || err instanceof CanvasTooLargeError || signal?.aborted) throw err;
      throw new PdfUnreadableError(`the drawing couldn't be read (${err instanceof Error ? err.message : String(err)})`);
    }
    signal?.throwIfAborted();
    stage?.("Finding rooms…");
    try {
      result = await runFindRooms(input, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new RoomFinderStoppedError(err);
    }
    // Part D: columns and flight outlines join the list here, while the document is open. What its
    // finders take: the page (doc.getPage(source.page)); (await loadPdfjs()).OPS; userSpaceToModel(page,
    // source, place); result.skippedLabels; and roomsExtent(result.drafts), 5 m wider. Their drafts go
    // in result.drafts, so the one PUT below carries both: a second PUT would replace the rooms'.
  } finally {
    await close();
  }

  const found = result;
  const save = async (): Promise<FindSummary> => {
    if (planMoved?.()) throw new PlanMovedError();
    stage?.(SAVING_DRAFTS);
    let drafts: RoomDraft[];
    try {
      drafts = await api.replaceRoomDrafts(levelId, {
        source: { checksum: source.checksum, page: source.page },
        drafts: found.drafts,
      });
    } catch (err) {
      throw new DraftsNotSavedError(err, save);
    }
    return {
      drafts,
      rooms: found.drafts.filter(d => d.footprint).length,
      open: found.drafts.filter(d => !d.footprint).length,
      skipped: found.skippedLabels.map(s => s.text),
    };
  };
  signal?.throwIfAborted();
  return save();
}
