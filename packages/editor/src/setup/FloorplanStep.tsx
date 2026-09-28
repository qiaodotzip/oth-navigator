import { live, type Level } from "@oth/model";
import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { DraftsFind } from "../build/DraftsFind";
import { DraftsOnPlan } from "../build/DraftsOnPlan";
import { FloorplanTools, PlanDropZone, patchPlan } from "../build/FloorplanTools";
import { StepGuide } from "../build/StepGuide";
import { levelBelow } from "../flow/floors";
import { roomLabels } from "../places/labels";
import { PlanCanvas } from "../plan/PlanCanvas";
import { PlanRoomLabels } from "../plan/RoomLabels";
import { useElementSize } from "../plan/useElementSize";
import { useEditorStore } from "../state/store";
import { imageForLevel } from "../state/underlay";

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
  const belowRings = useMemo(
    () => (model && below
      ? live(model.rooms).filter(r => r.levelId === below.id && r.kind !== "detail").map(r => r.footprint)
      : undefined),
    [model, below],
  );
  const labels = useMemo(() => (model ? roomLabels(model, level.id) : []), [model, level.id]);

  // Measure and Align are this step's tools. Moving on puts Select back in hand.
  useEffect(() => () => useEditorStore.getState().setTool("select"), []);

  // Only the drop box takes a file, as on Build. A file let go anywhere else
  // would be opened by the browser in place of the editor. This repeats
  // BuildWorkspace's own effect, which the other plans leave in place there.
  useEffect(() => {
    const refuse = (event: DragEvent) => {
      if (event.defaultPrevented) return; // The drop box took it.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", refuse);
    window.addEventListener("drop", refuse);
    return () => {
      window.removeEventListener("dragover", refuse);
      window.removeEventListener("drop", refuse);
    };
  }, []);

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
          <div className="border-t border-stone-200 pt-2">
            <DraftsFind api={api} />
          </div>
        </>}
      />
      {!image && <PlanDropZone api={api} />}
    </div>
  );
}
