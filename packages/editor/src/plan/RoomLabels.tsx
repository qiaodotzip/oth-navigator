import { fitLabel, labelExtra, LABEL_COLOURS, LABEL_FONT_PX, type RoomLabel } from "@oth/renderer";
import { useEditorStore } from "../state/store";
import { worldToScreen } from "./viewport";

/**
 * Every room's name on the plan (spec §4). A label sits at the point deepest
 * inside its room, cut to the room's width at this zoom, and is left out where
 * not even a short name fits, so L1's 200-odd rooms read as a map rather than a
 * wall of text. A white halo keeps it legible over the drawing and the
 * room's wash. Clicks go through to the room beneath.
 */
export function PlanRoomLabels({ labels }: { labels: readonly RoomLabel[] }) {
  const viewport = useEditorStore(s => s.viewport);
  return (
    <g data-testid="room-labels" pointerEvents="none" fontSize={LABEL_FONT_PX} fontWeight={500}>
      {labels.map(label => {
        const text = fitLabel(label.name, labelExtra(label.tone), label.widthM * viewport.scale, label.heightM * viewport.scale);
        if (!text) return null;
        const [x, y] = worldToScreen(viewport, label.at);
        return (
          <text
            key={label.roomId}
            data-testid={`room-label-${label.roomId}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fill={label.tone === "drawing" ? LABEL_COLOURS.drawing : LABEL_COLOURS.name}
            stroke="#ffffff"
            strokeWidth={3}
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            {label.tone === "confirmed" && <tspan fill={LABEL_COLOURS.confirmed}>✓ </tspan>}
            {text}
            {label.tone === "proposed" && <tspan fill={LABEL_COLOURS.proposed} fontStyle="italic"> proposed</tspan>}
          </text>
        );
      })}
    </g>
  );
}
