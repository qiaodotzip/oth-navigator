import type { Box, Keyframe, PathwayKind, Place } from "@oth/model";
import type { Ref } from "react";
import type { Api } from "../api/client";
import { Kbd } from "../ui/Kbd";
import { Filmstrip } from "./Filmstrip";
import { FrameCanvas } from "./FrameCanvas";
import type { FrameStatus } from "./frameStatus";
import type { FrameLabel } from "./labelled";
import { TagBar, type TagBarHandle } from "./TagBar";
import type { Tag } from "./tagging";

const HINTS: ReadonlyArray<[string, string]> = [
  ["← →", "frames"], ["N", "next untagged"], ["T", "name"], ["Enter", "tag"],
  ["Esc", "drop box"], ["Del", "bin frame"], ["G", "grid"],
];

/**
 * Frame view (spec §9): the frame as large as the space left, the tag bar
 * directly under it, the keys that drive it, and the filmstrip at the bottom.
 */
export function FrameView({
  api, frame, alt, labels, draft, onDraft, onDrawn, onMoveLabel, onRemoveLabel, tagBar,
  candidates, levels, levelId, counts, walkwayKinds, onTag, onAddWalkwayKind, strip,
}: {
  api: Pick<Api, "keyframeFileUrl">;
  frame: Keyframe;
  alt: string;
  labels: readonly FrameLabel[];
  draft: Box | null;
  onDraft: (box: Box | null) => void;
  onDrawn: () => void;
  onMoveLabel: (label: FrameLabel, box: Box) => void;
  onRemoveLabel: (label: FrameLabel) => void;
  tagBar: Ref<TagBarHandle>;
  candidates: readonly Place[];
  levels: ReadonlyMap<string, string | undefined>;
  levelId: string;
  counts: ReadonlyMap<string, number>;
  walkwayKinds: readonly PathwayKind[];
  onTag: (tag: Tag) => boolean;
  onAddWalkwayKind: (nameEn: string) => Promise<string | null>;
  strip: { frames: readonly Keyframe[]; statuses: ReadonlyMap<string, FrameStatus>; onPick: (id: string) => void };
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 bg-stone-900 p-3">
        <FrameCanvas
          // Wide enough to read a shop sign; the box is in fractions, so the
          // size shown does not change what is saved.
          imageUrl={api.keyframeFileUrl(frame.id, 1600)}
          alt={alt}
          widthPx={frame.widthPx}
          heightPx={frame.heightPx}
          labels={labels}
          draft={draft}
          onDraft={onDraft}
          onDrawn={onDrawn}
          onMoveLabel={onMoveLabel}
          onRemoveLabel={onRemoveLabel}
        />
      </div>
      <TagBar
        ref={tagBar}
        candidates={candidates}
        levels={levels}
        levelId={levelId}
        counts={counts}
        walkwayKinds={walkwayKinds}
        box={draft}
        onTag={onTag}
        onAddWalkwayKind={onAddWalkwayKind}
      />
      <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-stone-200 bg-white px-4 py-1.5 text-xs text-stone-500">
        {HINTS.map(([k, what]) => (
          <span key={k}><Kbd>{k}</Kbd> {what}</span>
        ))}
      </p>
      <Filmstrip
        frames={strip.frames}
        statuses={strip.statuses}
        currentId={frame.id}
        thumbUrl={id => api.keyframeFileUrl(id, 240)}
        onPick={strip.onPick}
      />
    </div>
  );
}
