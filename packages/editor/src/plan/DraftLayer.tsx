import { labelPoint, labelSpan, type LabelSpan, type RoomDraft, type Vec2 } from "@oth/model";
import { fitLabel, LABEL_COLOURS, LABEL_FONT_PX } from "@oth/renderer";
import { PROPOSED_STROKE, SELECTED_STROKE } from "./colours";
import { worldToScreen, type Viewport } from "./viewport";

/**
 * How a draft is drawn, worked out once as the drafts are sorted
 * (`draftView`), not on every frame of a pan or a zoom.
 */
export type DraftShape = {
  /** Where its name is centred. */
  at: Vec2;
  /** The widest and tallest its name can be there, in metres (`labelSpan`). */
  span: LabelSpan;
  /**
   * It lies over a room or a detail on the map. It then takes clicks on its
   * outline only, so what lies inside it can still be clicked.
   */
  overRooms: boolean;
};

/** `shape` comes from `draftView`. Without it, the draft is taken to lie over rooms, which never traps a click. */
export type ShownDraft = { draft: RoomDraft; covered: boolean; shape?: DraftShape };

/**
 * Where a draft's name goes: where the drawing prints it, as long as that is
 * inside the draft; otherwise at the draft's middle, where the name has the
 * most room. A few names on OTH's sheets sit just outside the space they name,
 * and there the drawing's spot would leave no room for any name at all.
 */
export function draftNameSpot(d: Pick<RoomDraft, "footprint" | "holes" | "labelPoint">): { at: Vec2; span: LabelSpan } {
  const span = labelSpan(d.labelPoint, d.footprint!, d.holes);
  if (span.width > 0) return { at: d.labelPoint, span };
  const { point } = labelPoint(d.footprint!, d.holes);
  return { at: point, span: labelSpan(point, d.footprint!, d.holes) };
}

/** Said after an open space's name, and never cut: it is what to do. */
const DRAW_BY_HAND = " · draw by hand";

/**
 * An open space has no outline to fit its name in. It gets the 30 m that the
 * review frames round it (`draftBox`), so its name shows once the plan is
 * close enough to draw the space by hand.
 */
const OPEN_SPAN_M = 30;

/** How wide the band along a draft's outline is that takes its clicks: easy to catch, and still narrow beside a room. */
const HIT_STROKE_PX = 10;

/**
 * A draft's name, set as the room labels are. The proposed token itself is
 * under 4.5:1 as text, so names take the label's darker shade, on an opaque
 * white halo that keeps them readable over the drawing's own lines.
 */
const NAME_TEXT = {
  fontSize: LABEL_FONT_PX,
  fontWeight: 500,
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
 * Names are fitted as the room labels are, so 200 drafts on a floor read as a
 * plan rather than a wall of text.
 *
 * A draft over a room or a detail takes clicks on its outline only: were its
 * whole inside to take them, a column inside a waiting hall, or every room
 * under the drafts already on the map, could no longer be clicked.
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
  const cursor = clickable ? "pointer" : undefined;
  return (
    <g data-testid="draft-layer">
      {drafts.map(({ draft, covered, shape }) => {
        const selected = draft.id === selectedId;
        const { at, span } = shape ?? draftNameSpot(draft);
        const outlineOnly = shape?.overRooms ?? true;
        const [lx, ly] = worldToScreen(viewport, at);
        const name = fitLabel(draft.nameEn, 0, span.width * viewport.scale, span.height * viewport.scale);
        const d = path(draft);
        return (
          <g
            key={draft.id}
            data-testid={`draft-${draft.id}`}
            onClick={event => {
              if (!clickable) return;
              event.stopPropagation();
              onSelect(draft.id);
            }}
          >
            <title>{`Draft: ${draft.nameEn}${covered ? " (already on the map)" : ""}`}</title>
            <path
              d={d}
              fillRule="evenodd"
              fill={PROPOSED_STROKE}
              fillOpacity={selected ? 0.18 : 0.06}
              stroke={selected ? SELECTED_STROKE : PROPOSED_STROKE}
              strokeOpacity={covered ? 0.5 : 1}
              strokeWidth={selected ? 2.5 : 1.5}
              strokeDasharray="6 4"
              pointerEvents={clickable && !outlineOnly ? "visiblePainted" : "none"}
              style={{ cursor }}
            />
            {outlineOnly && (
              <path
                data-hit="outline"
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={HIT_STROKE_PX}
                pointerEvents={clickable ? "stroke" : "none"}
                style={{ cursor }}
              />
            )}
            {name && (
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" {...NAME_TEXT}>
                {name}
              </text>
            )}
          </g>
        );
      })}
      {open.map(d => {
        const [x, y] = worldToScreen(viewport, d.labelPoint);
        const span = OPEN_SPAN_M * viewport.scale;
        const name = fitLabel(d.nameEn, DRAW_BY_HAND.length, span, span);
        return (
          <g key={d.id} data-testid={`open-${d.id}`} pointerEvents="none">
            <circle cx={x} cy={y} r={6} fill="none" stroke={PROPOSED_STROKE} strokeDasharray="2 2" />
            {name && <text x={x + 10} y={y} dominantBaseline="central" {...NAME_TEXT}>{`${name}${DRAW_BY_HAND}`}</text>}
          </g>
        );
      })}
    </g>
  );
}
