import type { BBox, Vec2 } from "@oth/model";
import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { parseSelectParam, selectParam } from "../build/selection";
import { zoomViewportTo, zoomViewportToBox } from "../build/zoomTo";
import { roomLabels } from "../places/labels";
import { DraftOutline } from "../plan/DraftLayer";
import { PlanCanvas } from "../plan/PlanCanvas";
import { PlanRoomLabels } from "../plan/RoomLabels";
import { useElementSize } from "../plan/useElementSize";
import { useEditorStore, type Selection } from "../state/store";

/**
 * A request to frame something on the map: a selectable thing, or (Check's
 * draft rows) a plain box with nothing to select, and the draft's outline to
 * draw in it, which stays drawn until the next request. `seq` makes the same
 * thing asked twice two requests.
 */
export type MapFocus = ({ target: NonNullable<Selection> } | { box: BBox; outline?: readonly Vec2[] }) & { seq: number };

/** A stable reference, so passing it does not itself make PlanCanvas re-render. */
function noSelect(): void {}

/** The outline Show asked for, drawn at the map's zoom. */
function FocusOutline({ outline }: { outline: readonly Vec2[] }) {
  const viewport = useEditorStore(s => s.viewport);
  return <DraftOutline outline={outline} viewport={viewport} />;
}

/**
 * The floor's plan beside a step (spec §4.2, §8): what Claude has put on it so
 * far, with the rooms' names. It draws nothing itself but the draft outline
 * a focus carries (Check's Show on a draft row); a click selects, as on
 * Build, but only where `keepSelection` says so (Check, whose Show selects).
 * Elsewhere Claude is at work, and a selection is also the collaboration
 * lock: a room held here would turn Claude's writes to it away. So a click
 * does not select at all — a select-then-release on the next render still
 * races Claude's own acquire and release of the lock over the network — and
 * any selection already held, one brought from Build included, is let go at
 * once.
 */
export function SetupMap({ api, focus = null, keepSelection = false }: {
  api: Pick<Api, "levelImageFileUrl">;
  focus?: MapFocus | null;
  keepSelection?: boolean;
}) {
  const model = useEditorStore(s => s.model);
  const levelId = useEditorStore(s => s.activeLevelId);
  const selection = useEditorStore(s => s.selection);
  const [box, size] = useElementSize();
  const labels = useMemo(() => (model && levelId ? roomLabels(model, levelId) : []), [model, levelId]);
  const outline = focus && "box" in focus ? focus.outline : undefined;

  // Select only: a drawing tool left in hand on Build would draw here on a click.
  useEffect(() => {
    useEditorStore.getState().setTool("select");
  }, []);

  useEffect(() => {
    if (!keepSelection && selection) useEditorStore.getState().select(null);
  }, [keepSelection, selection]);

  // Leaving lets go of the selection, which is also the collaboration lock.
  useEffect(() => () => useEditorStore.getState().select(null), []);

  // A selection whose thing has gone, undone say, is let go, as on Build.
  useEffect(() => {
    if (selection && !parseSelectParam(selectParam(selection), model, levelId)) useEditorStore.getState().select(null);
  }, [selection, model, levelId]);

  // Frame what Show asked for, once the map has a size.
  useEffect(() => {
    if (!focus || !size) return;
    const viewport = "box" in focus
      ? zoomViewportToBox(focus.box, size.width, size.height)
      : zoomViewportTo(useEditorStore.getState().model, focus.target, size.width, size.height);
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
          overlays={<>
            {/* Under the names, so they still read across it. */}
            {outline && <FocusOutline outline={outline} />}
            <PlanRoomLabels labels={labels} />
          </>}
          // Undefined keeps Check's own Show selecting normally; elsewhere a
          // no-op keeps a click from ever taking the collaboration lock.
          onSelect={keepSelection ? undefined : noSelect}
        />
      )}
    </div>
  );
}
