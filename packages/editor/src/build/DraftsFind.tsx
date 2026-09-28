import { useId } from "react";
import type { Api } from "../api/client";
import { SAVING_DRAFTS, describeFind, findRoomsInDrawing } from "../pdf/findInDrawing";
import { PdfUnreadableError } from "../pdf/pdfjs";
import { useEditorStore } from "../state/store";
import { imageForLevel } from "../state/underlay";
import { Button } from "../ui/Button";
import { reportFailure } from "../ui/failure";
import { toast } from "../ui/toast";
import { useDrafts } from "./drafts";

const STOPPING = "Stopping…";

/**
 * The search under way. It lives out here, as its words live in the drafts
 * store, so its Cancel still reaches it after you step off Areas & rooms and
 * back: the search carries on while you are away.
 */
let running: AbortController | null = null;

/**
 * Find rooms in the drawing (spec §5.2 step 5), beside Import DXF. It needs
 * the floor's plan to have come from its PDF, and to be scaled. When it can't
 * run, it says why, and where to go. While it runs it says what it is doing,
 * and can be cancelled until the drafts are on their way to the server.
 */
export function DraftsFind({ api }: { api: Api }) {
  const levelId = useEditorStore(s => s.activeLevelId);
  const image = useEditorStore(s => imageForLevel(s.levelImages, s.activeLevelId));
  const finding = useDrafts(s => s.finding);
  const hintId = useId();

  const why = !image
    ? "Add this floor's plan as a PDF on the Floorplan step first."
    : !image.source
      ? "This plan came from an image. Add the floor's PDF on the Floorplan step to find rooms in it."
      : image.metresPerPixel == null
        ? "Set the plan's scale on the Floorplan step first."
        : null;

  async function find(): Promise<void> {
    if (!image || !levelId || why || useDrafts.getState().finding) return;
    const stop = new AbortController();
    running = stop;
    // Once cancelled, it says it is stopping until it has, whatever stage it reaches on the way.
    const say = (words: string) => {
      if (!stop.signal.aborted) useDrafts.getState().setFinding(words);
    };
    say("Fetching the drawing…");
    try {
      const found = await findRoomsInDrawing({ api, image, levelId, stage: say, signal: stop.signal });
      useDrafts.getState().setDrafts(levelId, found.drafts);
      toast({ tone: "success", message: describeFind(found) });
    } catch (err) {
      if (stop.signal.aborted) toast({ message: "Stopped finding rooms. The floor's drafts are as they were." });
      else if (err instanceof PdfUnreadableError) toast({ tone: "error", message: `Couldn't find rooms: ${err.message}.` });
      else reportFailure(err, { doing: "find rooms in the drawing", retry: find });
    } finally {
      if (running === stop) running = null;
      useDrafts.getState().setFinding(null);
    }
  }

  function cancel(): void {
    running?.abort();
    useDrafts.getState().setFinding(STOPPING);
  }

  const canCancel = finding != null && finding !== STOPPING && finding !== SAVING_DRAFTS;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={why != null || finding != null} aria-describedby={hintId} onClick={() => void find()}>
          Find rooms in the drawing
        </Button>
        {canCancel && (
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
      <p id={hintId} aria-live="polite" className="text-xs text-stone-600">
        {finding ?? why ?? "Finds each named space as a draft for you to review, in place of the drafts found before."}
      </p>
    </div>
  );
}
