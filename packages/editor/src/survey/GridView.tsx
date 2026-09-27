import type { Keyframe } from "@oth/model";
import { useLayoutEffect } from "react";
import { centerOffset, useScrollWindow, visibleRange } from "../ui/windowing";
import { FrameStripe, STATUS_WORD } from "./FrameStripe";
import { statusOf, type FrameStatus } from "./frameStatus";

const CELL_W = 232;
const CELL_H = 150;
/** Before the sheet is measured (and always, in jsdom), assume a laptop-sized one. */
const FALLBACK = { width: 1200, height: 800 };

/**
 * A contact sheet of the footage with the same stripes (spec §9): the way to
 * see at a glance which stretches have been done. Only the rows in view are
 * rendered, and it opens scrolled to the frame you were on.
 */
export function GridView({ frames, statuses, currentId, thumbUrl, onOpen }: {
  frames: readonly Keyframe[];
  statuses: ReadonlyMap<string, FrameStatus>;
  currentId: string | null;
  thumbUrl: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  const { ref, size, offset, onScroll, scrollTo } = useScrollWindow({ axis: "y", fallback: FALLBACK });
  const cols = Math.max(1, Math.floor(size.width / CELL_W));
  const rows = Math.ceil(frames.length / cols);
  const index = frames.findIndex(f => f.id === currentId);

  useLayoutEffect(() => {
    if (index < 0) return;
    scrollTo(centerOffset(Math.floor(index / cols), CELL_H, size.height));
  }, [index, cols, size.height, scrollTo]);

  const { start, end } = visibleRange(offset, size.height, CELL_H, rows, 2);
  const cells = frames.slice(start * cols, end * cols);

  return (
    <div
      ref={ref}
      data-testid="grid"
      className="min-h-0 flex-1 overflow-y-auto bg-stone-100 p-3"
      onScroll={onScroll}
    >
      <ul aria-label="Frames" className="relative" style={{ height: rows * CELL_H }}>
        {cells.map((f, k) => {
          const i = start * cols + k;
          const status = statusOf(statuses, f.id);
          const current = f.id === currentId;
          return (
            <li
              key={f.id}
              className="absolute"
              style={{ left: (i % cols) * CELL_W, top: Math.floor(i / cols) * CELL_H, width: CELL_W - 8 }}
            >
              <button
                type="button"
                data-testid={`grid-${f.id}`}
                aria-label={`Open frame ${i + 1}, ${STATUS_WORD[status]}`}
                aria-current={current ? "true" : undefined}
                className={`block w-full overflow-hidden rounded border-2 bg-white ${
                  current ? "border-accent" : "border-transparent hover:border-stone-400"
                }`}
                onClick={() => onOpen(f.id)}
              >
                <img src={thumbUrl(f.id)} alt="" loading="lazy" decoding="async" draggable={false} className="block aspect-video w-full object-cover" />
                <FrameStripe status={status} />
              </button>
              <span className="mt-0.5 block text-xs text-stone-500">Frame {i + 1}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
