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
 *
 * `as="span"` for one inside a button, such as Bind places' picker, where a
 * div or a paragraph is not allowed.
 */
export function BoxedFrame({ src, frame, box, tone, alt, className = "", as: Frame = "div" }: {
  src: string;
  frame: Pick<Keyframe, "widthPx" | "heightPx">;
  box: Box | undefined;
  tone: "confirmed" | "proposed";
  alt: string;
  className?: string;
  as?: "div" | "span";
}) {
  // By source, so stepping to another frame tries that one afresh.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;
  const win = frameWindow(box);
  const Note = Frame === "span" ? "span" : "p";
  return (
    <Frame
      className={`relative block overflow-hidden rounded bg-stone-200 ${className}`}
      style={{ aspectRatio: `${frame.widthPx} / ${frame.heightPx}` }}
    >
      {failed ? (
        // leading-none: three lines of it fit an 80 px thumbnail.
        <Note className="absolute inset-0 flex items-center justify-center px-1 text-center text-xs leading-none text-stone-600">
          The photo could not load.
        </Note>
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
        // A span, which is allowed in either; placed absolutely, it lays out as a block.
        <span
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
    </Frame>
  );
}
