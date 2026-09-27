import { useCallback, useRef, useState, type UIEvent } from "react";
import { useElementSize, type Size } from "../plan/useElementSize";

/**
 * Which items of a long list are worth rendering: those in view, plus a few
 * either side so a scroll shows frames rather than blanks while React catches
 * up. `end` is exclusive.
 */
export function visibleRange(
  offset: number, viewport: number, itemSize: number, count: number, overscan: number,
): { start: number; end: number } {
  if (count <= 0 || itemSize <= 0) return { start: 0, end: 0 };
  const first = Math.min(count - 1, Math.floor(Math.max(0, offset) / itemSize));
  const inView = Math.ceil(Math.max(0, viewport) / itemSize) + 1;
  return { start: Math.max(0, first - overscan), end: Math.min(count, first + inView + overscan) };
}

/** The scroll offset that puts item `index` in the middle of the view. */
export function centerOffset(index: number, itemSize: number, viewport: number): number {
  return Math.max(0, index * itemSize - (viewport - itemSize) / 2);
}

/** Which way a windowed list scrolls. */
export type Axis = "x" | "y";

/**
 * The bookkeeping a windowed, scrollable list needs — a box ref, its measured
 * size (with a fallback before that lands, and always in jsdom), and how far
 * it has scrolled. The filmstrip and the grid both windowed this way (spec
 * §9), and repeated the same block to do it; this is that block, once.
 *
 * `scrollTo` moves the box and updates the tracked offset together, so a
 * caller can recentre it — on the frame itself, or, for the grid, on the row
 * that frame is in once it knows how many columns there are — without
 * reaching for the DOM node directly.
 */
export function useScrollWindow({ axis, fallback }: { axis: Axis; fallback: Size }): {
  ref: (el: HTMLElement | null) => void;
  size: Size;
  offset: number;
  onScroll: (event: UIEvent<HTMLElement>) => void;
  scrollTo: (offset: number) => void;
} {
  const box = useRef<HTMLElement | null>(null);
  const [measure, measured] = useElementSize();
  const ref = useCallback((el: HTMLElement | null) => {
    box.current = el;
    measure(el);
  }, [measure]);
  const [offset, setOffset] = useState(0);

  const scrollTo = useCallback((next: number) => {
    if (box.current) {
      if (axis === "x") box.current.scrollLeft = next;
      else box.current.scrollTop = next;
    }
    setOffset(next);
  }, [axis]);

  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    setOffset(axis === "x" ? event.currentTarget.scrollLeft : event.currentTarget.scrollTop);
  }, [axis]);

  return { ref, size: measured ?? fallback, offset, onScroll, scrollTo };
}
