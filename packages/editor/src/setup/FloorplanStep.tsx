import { live, type Level } from "@oth/model";
import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { loadDrafts, useLinedUp } from "../build/drafts";
import { DraftsFind } from "../build/DraftsFind";
import { DraftsOnPlan } from "../build/DraftsOnPlan";
import { FloorplanTools, PlanDropZone, patchPlan } from "../build/FloorplanTools";
import {
  alreadyHasRoomsWords, linedUpWords, LineUpWarning, lineUpWords, notCheckedWords, planMovedWords,
} from "../build/LineUpWarning";
import { StepGuide } from "../build/StepGuide";
import { belowRingsFor, levelBelow } from "../flow/floors";
import { roomLabels } from "../places/labels";
import { PlanCanvas } from "../plan/PlanCanvas";
import { PlanRoomLabels } from "../plan/RoomLabels";
import { useElementSize } from "../plan/useElementSize";
import { useEditorStore } from "../state/store";
import { imageForLevel } from "../state/underlay";
import { useRefuseWindowFileDrop } from "../ui/fileDrop";
import { roomsFound } from "./progress";
import { useStepContext } from "./sync";

/**
 * Step 4 (spec §4.2): Build's Floorplan tools and canvas, then Find rooms.
 * The PDF goes in, its page is picked, it is scaled and lined up on the floor
 * below, and Find rooms leaves its drafts on the plan. The drafts are decided
 * at step 5, by Claude or on Build.
 */
export function FloorplanStep({ api, level }: { api: Api; level: Level }) {
  const model = useEditorStore(s => s.model);
  const levelImages = useEditorStore(s => s.levelImages);
  const [box, size] = useElementSize();
  const image = imageForLevel(levelImages, level.id);
  const below = levelBelow(model, level.id);
  const belowRings = useMemo(() => belowRingsFor(model, below), [model, below]);
  const labels = useMemo(() => (model ? roomLabels(model, level.id) : []), [model, level.id]);
  // One line under the tools says whether the drawing lines up with the rooms
  // already on the floor. First, once Find rooms has run, whether the plan
  // changed since (amber): then the drafts' word was about the plan before.
  // Else it doesn't line up (amber), it does, or, once Find rooms has run and
  // neither was said, that it couldn't be checked.
  const ctx = useStepContext(level);
  const lineUp = ctx?.lineUp;
  const linedUp = useLinedUp(level.id);
  const found = ctx !== null && roomsFound(ctx);
  const moved = found && ctx?.planChanged === true;
  const existingRooms = useMemo(
    () => (model ? live(model.rooms).filter(r => r.levelId === level.id).length : 0),
    [model, level.id],
  );

  // Measure and Align are this step's tools. Moving on puts Select back in hand.
  useEffect(() => () => useEditorStore.getState().setTool("select"), []);

  // The floor's drafts as they are now: Claude may have decided some at step
  // 5 since they were loaded, and Back brings you here after it.
  useEffect(() => {
    void loadDrafts(api, level.id);
  }, [api, level.id]);

  // Only the drop box takes a file, as on Build. A file let go anywhere else
  // would be opened by the browser in place of the editor.
  useRefuseWindowFileDrop();

  return (
    <div ref={box} className="relative h-full overflow-hidden bg-stone-100">
      {size && (
        <PlanCanvas
          width={size.width}
          height={size.height}
          imageUrl={api.levelImageFileUrl}
          showHint={false}
          belowRings={belowRings}
          overlays={<>
            <DraftsOnPlan levelId={level.id} />
            <PlanRoomLabels labels={labels} />
          </>}
          onMoveUnderlay={offset => (image ? patchPlan(api, image, offset, { doing: "move the plan" }) : undefined)}
        />
      )}
      <StepGuide
        step="floorplan"
        extras={<>
          <FloorplanTools api={api} />
          <div className="space-y-2 border-t border-stone-200 pt-2">
            {moved ? (
              <LineUpWarning>{planMovedWords()}</LineUpWarning>
            ) : lineUp ? (
              <LineUpWarning>{lineUpWords(lineUp, level.code)}</LineUpWarning>
            ) : linedUp ? (
              <p className="text-xs text-stone-600">{linedUpWords(level.code)}</p>
            ) : existingRooms === 0 ? null : found ? (
              <p className="text-xs text-stone-600">{notCheckedWords(level.code, existingRooms)}</p>
            ) : (
              <LineUpWarning>{alreadyHasRoomsWords(level.code, existingRooms)}</LineUpWarning>
            )}
            <DraftsFind api={api} inSetup />
          </div>
        </>}
      />
      {!image && <PlanDropZone api={api} />}
    </div>
  );
}
