import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { parseSelectParam, selectParam } from "../build/selection";
import { zoomViewportTo } from "../build/zoomTo";
import { roomLabels } from "../places/labels";
import { PlanCanvas } from "../plan/PlanCanvas";
import { PlanRoomLabels } from "../plan/RoomLabels";
import { useElementSize } from "../plan/useElementSize";
import { useEditorStore, type Selection } from "../state/store";

/** A request to frame something on the map. `seq` makes the same thing asked twice two requests. */
export type MapFocus = { target: NonNullable<Selection>; seq: number };

/**
 * The floor's plan beside a step (spec §4.2, §8): what Claude has put on it so
 * far, with the rooms' names. It draws nothing itself; a click selects, as on
 * Build.
 */
export function SetupMap({ api, focus = null }: { api: Pick<Api, "levelImageFileUrl">; focus?: MapFocus | null }) {
  const model = useEditorStore(s => s.model);
  const levelId = useEditorStore(s => s.activeLevelId);
  const selection = useEditorStore(s => s.selection);
  const [box, size] = useElementSize();
  const labels = useMemo(() => (model && levelId ? roomLabels(model, levelId) : []), [model, levelId]);

  // Select only: a drawing tool left in hand on Build would draw here on a click.
  useEffect(() => {
    useEditorStore.getState().setTool("select");
  }, []);

  // Leaving lets go of the selection, which is also the collaboration lock.
  useEffect(() => () => useEditorStore.getState().select(null), []);

  // A selection whose thing has gone, undone say, is let go, as on Build.
  useEffect(() => {
    if (selection && !parseSelectParam(selectParam(selection), model, levelId)) useEditorStore.getState().select(null);
  }, [selection, model, levelId]);

  // Frame what Show asked for, once the map has a size.
  useEffect(() => {
    if (!focus || !size) return;
    const viewport = zoomViewportTo(useEditorStore.getState().model, focus.target, size.width, size.height);
    if (viewport) useEditorStore.getState().setViewport(viewport);
  }, [focus, size]);

  return (
    <div ref={box} data-testid="setup-map" className="relative min-w-0 flex-1 overflow-hidden bg-stone-100">
      {size && (
        <PlanCanvas
          width={size.width}
          height={size.height}
          imageUrl={api.levelImageFileUrl}
          showHint={false}
          overlays={<PlanRoomLabels labels={labels} />}
        />
      )}
    </div>
  );
}
