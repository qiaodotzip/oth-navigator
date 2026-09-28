import type { Box, Keyframe } from "@oth/model";
import { frameWindow } from "./evidence";

/** Percentages rounded to a hundredth, so 0.1 / 0.4 is "25%" and not "25.000000000000007%". */
const pct = (v: number) => `${Math.round(v * 10_000) / 100}%`;

/**
 * A frame zoomed so its box sits large in the middle, with the box drawn:
 * the sign readable at card size. The container keeps the frame's shape, so
 * the box's fractions line up with the picture. A proposed tag's box is
 * dashed, so colour is not the only thing that tells it apart.
 */
export function BoxedFrame({ src, frame, box, tone, alt, className = "" }: {
  src: string;
  frame: Pick<Keyframe, "widthPx" | "heightPx">;
  box: Box | undefined;
  tone: "confirmed" | "proposed";
  alt: string;
  className?: string;
}) {
  const win = frameWindow(box);
  return (
    <div
      className={`relative overflow-hidden rounded bg-stone-200 ${className}`}
      style={{ aspectRatio: `${frame.widthPx} / ${frame.heightPx}` }}
    >
      {/* max-w-none: Tailwind's reset caps an img at its container's width, which would undo the zoom. */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="absolute max-w-none"
        style={{ width: pct(1 / win.size), left: pct(-win.x / win.size), top: pct(-win.y / win.size) }}
      />
      {box && (
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
