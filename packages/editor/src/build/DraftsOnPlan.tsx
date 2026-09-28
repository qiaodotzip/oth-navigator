import { useEffect, useRef } from "react";
import { DraftLayer, type ShownDraft } from "../plan/DraftLayer";
import { fitViewport } from "../plan/viewport";
import { useEditorStore } from "../state/store";
import { useDraftView, useDrafts } from "./drafts";

/** Room round a framed draft on screen, as zooming to a selection has. */
const FRAME_PAD_PX = 60;

/**
 * The drafts layer, wired to the stores. Mounted through PlanCanvas's
 * `overlays` slot on Areas & rooms. It frames what the review asks it to: it
 * sits inside the plan's own <svg>, so it knows the plan's size.
 */
export function DraftsOnPlan({ levelId }: { levelId: string | null }) {
  const view = useDraftView(levelId);
  const showCovered = useDrafts(s => s.showCovered);
  const selectedId = useDrafts(s => s.selectedId);
  const frame = useDrafts(s => s.frame);
  const viewport = useEditorStore(s => s.viewport);
  const tool = useEditorStore(s => s.tool);
  const group = useRef<SVGGElement>(null);

  useEffect(() => {
    const svg = group.current?.ownerSVGElement;
    if (!frame || !svg) return;
    const width = Number(svg.getAttribute("width"));
    const height = Number(svg.getAttribute("height"));
    if (width > 0 && height > 0) useEditorStore.getState().setViewport(fitViewport(frame.box, width, height, FRAME_PAD_PX));
  }, [frame]);

  const shown: ShownDraft[] = [
    ...view.review.map(draft => ({ draft, covered: false, shape: view.shapes.get(draft.id) })),
    ...(showCovered ? view.covered.map(c => ({ draft: c.draft, covered: true, shape: view.shapes.get(c.draft.id) })) : []),
  ];
  return (
    <g ref={group}>
      <DraftLayer
        drafts={shown}
        open={view.open}
        selectedId={selectedId}
        viewport={viewport}
        clickable={tool === "select"}
        onSelect={id => {
          // One thing is selected at a time: a draft in hand lets go of the room or pathway.
          useEditorStore.getState().select(null);
          useDrafts.getState().select(id);
        }}
      />
    </g>
  );
}
