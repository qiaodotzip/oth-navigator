import { live } from "@oth/model";
import { useId, useState } from "react";
import { create } from "zustand";
import type { Api, LevelImage } from "../api/client";
import {
  DraftsNotSavedError, PlanMovedError, RoomFinderStoppedError, SAVING_DRAFTS, describeFind, findRoomsInDrawing,
  type FindSummary,
} from "../pdf/findInDrawing";
import { PdfUnreadableError } from "../pdf/pdfjs";
import { CanvasTooLargeError } from "../pdf/render";
import { useEditorStore } from "../state/store";
import { imageForLevel } from "../state/underlay";
import { Button } from "../ui/Button";
import { reportFailure } from "../ui/failure";
import { toast } from "../ui/toast";
import { useDrafts } from "./drafts";

const STOPPING = "Stopping…";

/**
 * A search: its floor, its place in line among that floor's searches, its
 * Cancel, and whether it was started in the setup wizard, whose toast words
 * what was left out differently.
 */
type Search = { n: number; levelId: string; stop: AbortController; inSetup: boolean };

/**
 * The search under way. It lives out here, as its words live in the drafts
 * store, so it outlives the component: the search carries on while you are
 * off Areas & rooms, and its Cancel still reaches it when you come back.
 */
const useSearch = create<{ running: Search | null }>(() => ({ running: null }));

let searches = 0;
/** Each floor's newest search. A Retry of an older one's save would put back the drafts a newer one replaced. */
const newest = new Map<string, number>();

/** Why a floor's plan can't be searched, in words that say where to go; null when it can. */
function whyNot(image: LevelImage | null): string | null {
  if (!image) return "Add this floor's plan as a PDF on the Floorplan step first.";
  if (!image.source) return "This plan came from an image. Add the floor's PDF on the Floorplan step to find rooms in it.";
  if (image.metresPerPixel == null) return "Set the plan's scale on the Floorplan step first.";
  return null;
}

/** The floor's plan as it is now: what a search reads, and what its save checks against. */
const planNow = (levelId: string) => imageForLevel(useEditorStore.getState().levelImages, levelId);

/**
 * Whether the floor's plan is still the one searched, where it was searched.
 * Only where it sits counts, not its version: an opacity change bumps the
 * version but moves nothing, and shouldn't throw a search away.
 */
function samePlace(was: LevelImage, now: LevelImage | null): boolean {
  return now != null && now.id === was.id && now.metresPerPixel === was.metresPerPixel
    && now.offsetX === was.offsetX && now.offsetY === was.offsetY
    && now.source?.checksum === was.source?.checksum && now.source?.page === was.source?.page;
}

/**
 * Finds the rooms on a floor, over its plan as it is when the search starts:
 * a click, a Retry and Find again all come here, so none of them searches a
 * plan that has moved since.
 */
async function findRoomsOn(api: Api, levelId: string, inSetup: boolean): Promise<void> {
  if (useDrafts.getState().finding) return;
  const image = planNow(levelId);
  const why = whyNot(image);
  if (!image || why) {
    // Only a Retry gets here: the button is off while the floor can't be searched.
    if (why) toast({ message: why });
    return;
  }
  const search: Search = { n: ++searches, levelId, stop: new AbortController(), inSetup };
  newest.set(levelId, search.n);
  await run(api, search, "Fetching the drawing…", say => findRoomsInDrawing({
    api, image, levelId, stage: say, signal: search.stop.signal,
    planMoved: () => !samePlace(image, planNow(levelId)),
  }));
}

/** Sends a search's drafts again after its save failed, without finding them again. */
async function saveAgain(api: Api, search: Search, save: () => Promise<FindSummary>): Promise<void> {
  // The floor has been searched again since: that search's drafts stand, and this Retry is stale.
  if (newest.get(search.levelId) !== search.n || useDrafts.getState().finding) return;
  await run(api, search, SAVING_DRAFTS, () => save());
}

async function run(
  api: Api, search: Search, first: string, work: (say: (words: string) => void) => Promise<FindSummary>,
): Promise<void> {
  // Once cancelled, it says it is stopping until it has, whatever stage it reaches on the way.
  const say = (words: string) => {
    if (!search.stop.signal.aborted) useDrafts.getState().setFinding(words);
  };
  useSearch.setState({ running: search });
  say(first);
  try {
    const found = await work(say);
    useDrafts.getState().setDrafts(search.levelId, found.drafts);
    toast({ tone: "success", message: describeFind(found, { inSetup: search.inSetup }) });
  } catch (err) {
    sayWhy(api, search, err);
  } finally {
    useSearch.setState({ running: null });
    useDrafts.getState().setFinding(null);
  }
}

/** A search that didn't save, said by whose it is, with the next step. */
function sayWhy(api: Api, search: Search, err: unknown): void {
  const again = () => findRoomsOn(api, search.levelId, search.inSetup);
  if (search.stop.signal.aborted) {
    toast({ message: "Stopped finding rooms. The floor's drafts are as they were." });
  } else if (err instanceof PlanMovedError) {
    toast({ tone: "error", message: "The plan moved while rooms were being found. Find again.", action: { label: "Find again", run: again } });
  } else if (err instanceof DraftsNotSavedError) {
    reportFailure(err.cause, { doing: "save the drafts from the drawing", retry: () => saveAgain(api, search, err.save) });
  } else if (err instanceof RoomFinderStoppedError) {
    toast({ tone: "error", message: "The room finder stopped. Try again, or find rooms on a smaller part.", action: { label: "Retry", run: again } });
  } else if (err instanceof CanvasTooLargeError) {
    toast({
      tone: "error",
      message: "Couldn't find rooms: the drawing is too large for this browser to draw. Try again on a computer, in Chrome or Edge, or draw the rooms by hand.",
    });
  } else if (err instanceof PdfUnreadableError) {
    toast({
      tone: "error",
      message: `Couldn't find rooms: ${err.message}. Draw the rooms by hand, or import the floor's PDF again on the Floorplan step.`,
    });
  } else {
    reportFailure(err, { doing: "find rooms in the drawing", retry: again });
  }
}

/**
 * What a second search would undo, asked before it runs, or null when there is
 * nothing to lose. A search replaces the floor's drafts waiting, and finds
 * again what you rejected or marked Done: those were only set aside.
 *
 * The server lists only the drafts waiting, so a floor whose drafts were all
 * decided is known by the rooms accepted from its drawing (their evidence is
 * the PDF). A floor whose every draft was rejected, none accepted, isn't asked:
 * throwing a whole search away is the likeliest reason to find again.
 */
function againQuestion(waiting: number, roomsFromDrawing: boolean): string | null {
  if (waiting > 0) {
    const replaced = waiting === 1 ? "The 1 draft waiting is replaced" : `The ${waiting} drafts waiting are replaced`;
    return `Find rooms again? ${replaced}, and drafts you rejected or marked Done come back.`;
  }
  return roomsFromDrawing ? "Find rooms again? Drafts you rejected or marked Done come back." : null;
}

/**
 * Find rooms in the drawing (spec §5.2 step 5), beside Import DXF. It needs
 * the floor's plan to have come from its PDF, and to be scaled. When it can't
 * run, it says why, and where to go. On a floor already searched it asks
 * first, as Replace plan does. While it runs it says what it is doing, and can
 * be cancelled until the drafts are on their way to the server. A search of
 * another floor shows here as that floor's. `inSetup` is the setup wizard's
 * Floorplan step, where Claude makes the stops left out.
 */
export function DraftsFind({ api, inSetup = false }: { api: Api; inSetup?: boolean }) {
  const levelId = useEditorStore(s => s.activeLevelId);
  const image = useEditorStore(s => imageForLevel(s.levelImages, s.activeLevelId));
  const finding = useDrafts(s => s.finding);
  const waiting = useDrafts(s => (levelId ? s.byLevel[levelId]?.length ?? 0 : 0));
  const roomsFromDrawing = useEditorStore(s => levelId != null && s.model != null && live(s.model.rooms).some(r =>
    r.levelId === levelId && r.verification.evidence.some(e => e.startsWith("pdf:"))));
  const searching = useSearch(s => s.running?.levelId ?? null);
  const elsewhere = useEditorStore(s =>
    searching && searching !== s.activeLevelId ? (s.model?.levels.find(l => l.id === searching)?.code ?? "another floor") : null);
  // The floor a question is open for: it shows on that floor only, and never while a search runs.
  const [askingFor, setAskingFor] = useState<string | null>(null);
  const hintId = useId();

  const why = whyNot(image);
  const canCancel = finding != null && finding !== STOPPING && finding !== SAVING_DRAFTS;
  // Another floor's stages would read as this floor's: it names the floor instead.
  const doing = finding != null && elsewhere && finding !== STOPPING ? `Finding rooms on ${elsewhere}…` : finding;
  // Worded as the floor is now, so a draft decided while it is open is counted.
  const question = askingFor != null && askingFor === levelId && finding == null ? againQuestion(waiting, roomsFromDrawing) : null;

  function find(): void {
    if (!levelId) return;
    if (againQuestion(waiting, roomsFromDrawing)) setAskingFor(levelId);
    else void findRoomsOn(api, levelId, inSetup);
  }

  function findAgain(): void {
    setAskingFor(null);
    if (levelId) void findRoomsOn(api, levelId, inSetup);
  }

  function cancel(): void {
    useSearch.getState().running?.stop.abort();
    useDrafts.getState().setFinding(STOPPING);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={why != null || finding != null} aria-describedby={hintId} onClick={find}>
          Find rooms in the drawing
        </Button>
        {canCancel && (
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
      <p id={hintId} aria-live="polite" className="text-xs text-stone-600">
        {doing ?? why ?? "Finds each named space as a draft for you to review, in place of the drafts found before."}
      </p>
      {question && (
        <div className="space-y-2 rounded border border-yours/30 bg-yours-soft p-2">
          <p className="text-xs text-yours">
            <span aria-hidden className="font-semibold">!</span> {question}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" onClick={findAgain}>Find again</Button>
            <Button size="sm" onClick={() => setAskingFor(null)}>Keep these</Button>
          </div>
        </div>
      )}
    </div>
  );
}
