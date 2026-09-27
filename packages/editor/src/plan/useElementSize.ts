import { useCallback, useEffect, useState } from "react";

export type Size = { width: number; height: number };

/**
 * The laid-out size of an element, following it as the window resizes.
 *
 * Returns a callback ref rather than taking a ref object, so an element that
 * mounts later than the component — after sign-in, say — is still measured.
 *
 * Null until the first measurement. The plan canvas frames the level once, on
 * mount, so rendering it at a guessed size first would frame it for the guess.
 */
export function useElementSize(): [(el: HTMLElement | null) => void, Size | null] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);

  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width === 0 || rect.height === 0) return;
      const next = { width: Math.floor(rect.width), height: Math.floor(rect.height) };
      setSize(prev => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return [ref, size];
}
