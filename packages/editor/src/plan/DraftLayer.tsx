import { bboxOfRing, type RoomDraft } from "@oth/model";
import { LABEL_COLOURS, LABEL_FONT_PX } from "@oth/renderer";
import { PROPOSED_STROKE, SELECTED_STROKE } from "./colours";
import { worldToScreen, type Viewport } from "./viewport";

export type ShownDraft = { draft: RoomDraft; covered: boolean };

/** A name is drawn only on a draft at least this wide on screen, so a floor of drafts is not a wall of text. */
const NAME_MIN_WIDTH_PX = 40;

/**
 * A draft's name, set as the room labels are. The proposed token itself is
 * under 4.5:1 as text, so names take the label's darker shade, on an opaque
 * white halo that keeps them readable over the drawing's own lines.
 */
const NAME_TEXT = {
  fontSize: LABEL_FONT_PX,
  fill: LABEL_COLOURS.proposed,
  stroke: "#ffffff",
  strokeWidth: 3,
  strokeLinejoin: "round",
  paintOrder: "stroke",
  pointerEvents: "none",
} as const;

/**
 * Drafts from the drawing on the plan (spec §5.2 step 6). Dashed, in the
 * proposed colour, and named, so a draft differs from a room by more than its
 * colour. One already on the map is fainter, and says so to a screen reader.
 * Presentational: `DraftsOnPlan` gives it what to draw.
 */
export function DraftLayer({ drafts, open, selectedId, viewport, clickable, onSelect }: {
  drafts: readonly ShownDraft[];
  open: readonly RoomDraft[];
  selectedId: string | null;
  viewport: Viewport;
  /** Only while Select is in use: a drawing tool's click belongs to the canvas under it. */
  clickable: boolean;
  onSelect: (id: string) => void;
}) {
  const path = (d: RoomDraft) =>
    [d.footprint!, ...d.holes].map(ring => `M${ring.map(p => worldToScreen(viewport, p).join(",")).join("L")}Z`).join(" ");
  return (
    <g data-testid="draft-layer">
      {drafts.map(({ draft, covered }) => {
        const selected = draft.id === selectedId;
        const [lx, ly] = worldToScreen(viewport, draft.labelPoint);
        const box = bboxOfRing(draft.footprint!);
        const wide = (box.maxX - box.minX) * viewport.scale >= NAME_MIN_WIDTH_PX;
        return (
          <g key={draft.id} data-testid={`draft-${draft.id}`}>
            <path
              d={path(draft)}
              fillRule="evenodd"
              fill={PROPOSED_STROKE}
              fillOpacity={selected ? 0.18 : 0.06}
              stroke={selected ? SELECTED_STROKE : PROPOSED_STROKE}
              strokeOpacity={covered ? 0.5 : 1}
              strokeWidth={selected ? 2.5 : 1.5}
              strokeDasharray="6 4"
              pointerEvents={clickable ? "visiblePainted" : "none"}
              style={{ cursor: clickable ? "pointer" : undefined }}
              onClick={event => {
                if (!clickable) return;
                event.stopPropagation();
                onSelect(draft.id);
              }}
            >
              <title>{`Draft: ${draft.nameEn}${covered ? " (already on the map)" : ""}`}</title>
            </path>
            {wide && (
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" {...NAME_TEXT}>
                {draft.nameEn}
              </text>
            )}
          </g>
        );
      })}
      {open.map(d => {
        const [x, y] = worldToScreen(viewport, d.labelPoint);
        return (
          <g key={d.id} data-testid={`open-${d.id}`} pointerEvents="none">
            <circle cx={x} cy={y} r={6} fill="none" stroke={PROPOSED_STROKE} strokeDasharray="2 2" />
            <text x={x + 10} y={y} dominantBaseline="central" {...NAME_TEXT}>{`${d.nameEn} · draw by hand`}</text>
          </g>
        );
      })}
    </g>
  );
}
