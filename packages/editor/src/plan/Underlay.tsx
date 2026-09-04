import type { Calibration } from "./calibration";
import { worldToScreen, type Viewport } from "./viewport";

/**
 * The reference floor plan, positioned by its calibration rather than eyeballed.
 * Rendered inside the same SVG as the geometry so it pans and zooms with it.
 */
export function Underlay({
  src, calibration, viewport, widthPx, heightPx, opacity = 0.6,
}: {
  src: string;
  calibration: Calibration;
  viewport: Viewport;
  widthPx: number;
  heightPx: number;
  opacity?: number;
}) {
  // The image's top-left pixel sits at the calibration offset in world space.
  const [x, y] = worldToScreen(viewport, [calibration.offsetX, calibration.offsetY]);
  const scale = calibration.metresPerPixel * viewport.scale;

  return (
    <image
      href={src}
      x={x}
      y={y}
      width={widthPx * scale}
      height={heightPx * scale}
      opacity={opacity}
      style={{ pointerEvents: "none" }}
    />
  );
}
