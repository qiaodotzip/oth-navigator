import type { Box, Keyframe } from "@oth/model";
import { useState } from "react";
import { frameWindow } from "./evidence";

/** Percentages rounded to a hundredth, so 0.1 / 0.4 is "25%" and not "25.000000000000007%". */
const pct = (v: number) => `${Math.round(v * 10_000) / 100}%`;

/**
 * A frame zoomed so its box sits large in the middle, with the box drawn:
 * the sign readable at card size. The container keeps the frame's shape, so
 * the box's fractions line up with the picture. A proposed tag's box is
 * dashed, so colour is not the only thing that tells it apart.
 *
 * A photo that will not load says so, and its box goes with it: a box drawn
 * round nothing would claim a sign nobody can see.
 */
export function BoxedFrame({ src, frame, box, tone, alt, className = "" }: {
  src: string;
  frame: Pick<Keyframe, "widthPx" | "heightPx">;
  box: Box | undefined;
  tone: "confirmed" | "proposed";
  alt: string;
  className?: string;
}) {
  // By source, so stepping to another frame tries that one afresh.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;
  const win = frameWindow(box);
  return (
    <div
      className={`relative overflow-hidden rounded bg-stone-200 ${className}`}
      style={{ aspectRatio: `${frame.widthPx} / ${frame.heightPx}` }}
    >
      {failed ? (
        // leading-none: three lines of it fit an 80 px thumbnail.
        <p className="absolute inset-0 flex items-center justify-center px-1 text-center text-xs leading-none text-stone-600">
          The photo could not load.
        </p>
      ) : (
        // max-w-none: Tailwind's reset caps an img at its container's width, which would undo the zoom.
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailedSrc(src)}
          className="absolute max-w-none"
          style={{ width: pct(1 / win.size), left: pct(-win.x / win.size), top: pct(-win.y / win.size) }}
        />
      )}
      {box && !failed && (
        <div
          data-testid="frame-box"
          aria-hidden
          className={`absolute rounded-sm border-2 ${tone === "confirmed" ? "border-confirmed" : "border-dashed border-proposed"}`}
          style={{
            left: pct((box.x - win.x) / win.size),
            top: pct((box.y - win.y) / win.size),
            width: pct(box.w / win.size),
            height: pct(box.h / win.size),
          }}
        />
      )}
    </div>
  );
}
