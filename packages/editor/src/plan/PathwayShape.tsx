import type { Vec2 } from "@oth/model";
import { worldToScreen, type Viewport } from "./viewport";

/**
 * A pathway drawn at its real width, so you can see whether it actually reaches
 * a shop front rather than guessing from a hairline.
 */
export function PathwayShape({
  id,
  polyline,
  widthM,
  viewport,
  selected = false,
  color,
  onClick,
  pointerEvents,
}: {
  id: string;
  polyline: readonly Vec2[];
  widthM: number;
  viewport: Viewport;
  selected?: boolean;
  /** The walkway type's colour. Undefined for one with no type yet. */
  color?: string;
  onClick?: (event: React.MouseEvent) => void;
  /** "none" while a drawing tool is active, so clicks reach the canvas beneath. */
  pointerEvents?: "none";
}) {
  const points = polyline.map(p => worldToScreen(viewport, p).join(",")).join(" ");
  return (
    <polyline
      data-testid={`pathway-${id}`}
      points={points}
      fill="none"
      stroke={selected ? "#f2a33c" : color ?? "#38bdf8"}
      strokeOpacity={0.45}
      strokeWidth={widthM * viewport.scale}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents={pointerEvents}
      onClick={onClick}
    />
  );
}
