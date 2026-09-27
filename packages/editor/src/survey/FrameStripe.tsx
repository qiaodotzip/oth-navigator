import type { FrameStatus } from "./frameStatus";

/** A frame's status in words, for screen readers and titles. */
export const STATUS_WORD: Record<FrameStatus, string> = {
  untagged: "no tags yet",
  proposed: "has proposals",
  tagged: "tagged",
};

// The stripe carries a glyph as small text over a colour. bg-proposed's blue
// reaches only 4.1:1 against white at 13px, under AA's 4.5:1, so proposed
// takes the soft fill with dark text and a border instead — the same
// combination FrameCanvas's boxes and TagBar's chips already use for a
// proposed tag. Untagged and tagged carry no such risk: untagged shows no
// glyph at all, and white on bg-confirmed's green clears AA.
const FILL: Record<FrameStatus, string> = {
  untagged: "bg-stone-200",
  proposed: "border border-proposed bg-proposed-soft text-stone-900",
  tagged: "bg-confirmed text-white",
};

const GLYPH: Record<FrameStatus, string> = { untagged: "", proposed: "?", tagged: "✓" };

/** The stripe under a thumbnail: its colour, and a glyph, so colour is never the only signal. */
export function FrameStripe({ status }: { status: FrameStatus }) {
  return (
    <span
      aria-hidden="true"
      data-status={status}
      className={`flex h-4 items-center justify-end px-1 text-xs leading-4 ${FILL[status]}`}
    >
      {GLYPH[status]}
    </span>
  );
}
