import type { Keyframe } from "@oth/model";
import { useLayoutEffect } from "react";
import { centerOffset, useScrollWindow, visibleRange } from "../ui/windowing";
import { FrameStripe, STATUS_WORD } from "./FrameStripe";
import { statusOf, type FrameStatus } from "./frameStatus";

const THUMB = 128;
const ITEM = THUMB + 8;
/** Before the strip is measured (and always, in jsdom), assume a laptop-wide one. */
const FALLBACK = { width: 1200, height: 100 };

/**
 * The footage as a strip of small frames under the tag bar, each with its
 * stripe. Only the frames around the one in view are rendered — a strip of
 * 400 full images is what made the old one crawl — and the one in view is
 * kept in the middle as you move.
 */
export function Filmstrip({ frames, statuses, currentId, thumbUrl, onPick }: {
  frames: readonly Keyframe[];
  statuses: ReadonlyMap<string, FrameStatus>;
  currentId: string | null;
  thumbUrl: (id: string) => string;
  onPick: (id: string) => void;
}) {
  const { ref, size, offset, onScroll, scrollTo } = useScrollWindow({ axis: "x", fallback: FALLBACK });
  const index = frames.findIndex(f => f.id === currentId);

  // The frame in view, kept in the middle whenever it changes.
  useLayoutEffect(() => {
    if (index < 0) return;
    scrollTo(centerOffset(index, ITEM, size.width));
  }, [index, size.width, scrollTo]);

  const { start, end } = visibleRange(offset, size.width, ITEM, frames.length, 6);

  return (
    <div
      ref={ref}
      data-testid="filmstrip"
      role="group"
      aria-label="Frames"
      className="h-[100px] shrink-0 overflow-x-auto overflow-y-hidden border-t border-stone-200 bg-stone-100"
      onScroll={onScroll}
    >
      <div className="relative h-full" style={{ width: frames.length * ITEM }}>
        {frames.slice(start, end).map((f, i) => {
          const n = start + i;
          const status = statusOf(statuses, f.id);
          const current = f.id === currentId;
          return (
            <button
              key={f.id}
              type="button"
              data-testid={`filmstrip-${f.id}`}
              aria-label={`Frame ${n + 1}, ${STATUS_WORD[status]}`}
              aria-current={current ? "true" : undefined}
              className={`absolute top-1.5 overflow-hidden rounded border-2 bg-white ${
                current ? "border-accent" : "border-transparent hover:border-stone-400"
              }`}
              style={{ left: n * ITEM + 4, width: THUMB }}
              onClick={() => onPick(f.id)}
            >
              <img src={thumbUrl(f.id)} alt="" loading="lazy" decoding="async" draggable={false} className="block h-[72px] w-full object-cover" />
              <FrameStripe status={status} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
