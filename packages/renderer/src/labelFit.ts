import type { Vec2 } from "@oth/model";
import { modelToThree } from "./coords";

/** How a room's label reads: its place, confirmed or still proposed, or the drawing's own name. */
export type LabelTone = "confirmed" | "proposed" | "drawing";

/**
 * One room's label, worked out once per model. How much of it shows is
 * decided per view, by `fitLabel`, on the plan and in 3D alike.
 */
export type RoomLabel = {
  roomId: string;
  name: string;
  tone: LabelTone;
  /** The room's pole of inaccessibility, in plan metres. */
  at: Vec2;
  /** The widest and tallest a label centred on `at` can be inside the room, in metres (`labelSpan`). */
  widthM: number;
  heightM: number;
  /** How far above its floor the label floats in 3D: the top of the room, which is what the camera sees. */
  liftM: number;
};

export type ShownLabel = { roomId: string; text: string; tone: LabelTone; position: [number, number, number] };

export type SceneView = {
  camera: readonly [number, number, number];
  fovDeg: number;
  heightPx: number;
  elevationM: number;
  /** Whether a point is in the camera's view. Labels outside it are not mounted. */
  inView?: (position: readonly [number, number, number]) => boolean;
};

/** 13 px: the smallest text anywhere in the app. */
export const LABEL_FONT_PX = 13;

/**
 * The label colours, written once in hex because SVG attributes and the
 * renderer's inline styles cannot use Tailwind's names.
 */
export const LABEL_COLOURS = {
  /** A place's name: stone-900. */
  name: "#1c1917",
  /** The ✓ of a confirmed place: the confirmed token. */
  confirmed: "#047857",
  /** "proposed": sky-700, one step darker than the proposed token, which is under 4.5:1 as 13 px text on white. */
  proposed: "#0369a1",
  /** The drawing's own name: stone-500, grey, and still 4.8:1 on the white halo. */
  drawing: "#78716c",
} as const;

/** An average character of Inter at weight 500, as a fraction of its size. Generous, so a label that "fits" does. */
const CHAR_EM = 0.6;
/** The line box a label needs vertically, as a fraction of its size. */
const LINE_EM = 1.3;
/** The share of a room's width a label may use, so it keeps clear of the walls. */
const MARGIN = 0.9;
/** Fewer letters than this before the ellipsis is noise, not a name. */
const MIN_LETTERS = 3;

/** What a label adds to its name, in characters: "✓ " before a confirmed one, " proposed" after a proposed one. */
export function labelExtra(tone: LabelTone): number {
  return tone === "confirmed" ? 2 : tone === "proposed" ? 9 : 0;
}

/**
 * The name as it fits across a room at this zoom (spec §4): whole, cut short
 * with an ellipsis, or null when it cannot be shown at all — too few letters
 * would fit, or the room is too shallow for a line. This is what keeps L1's
 * 193 rooms from turning into a wall of text.
 */
export function fitLabel(
  name: string, extraChars: number, widthPx: number, heightPx: number, fontPx = LABEL_FONT_PX,
): string | null {
  if (name.trim() === "" || heightPx < fontPx * LINE_EM) return null;
  const fits = Math.floor((widthPx * MARGIN) / (fontPx * CHAR_EM)) - extraChars;
  if (fits >= name.length) return name;
  if (fits < MIN_LETTERS + 1) return null;
  return `${name.slice(0, fits - 1).trimEnd()}…`;
}

/** How many screen pixels a metre covers at this distance from a perspective camera. */
export function pixelsPerMetreAt(distanceM: number, fovDeg: number, viewportHeightPx: number): number {
  if (!(distanceM > 0)) return Number.POSITIVE_INFINITY;
  return viewportHeightPx / (2 * distanceM * Math.tan((fovDeg * Math.PI) / 360));
}

/**
 * The labels worth mounting in 3D for this camera: in view, and fitting their
 * room at the scale the room is seen at, which is the plan's fit rule applied
 * by camera distance.
 */
export function sceneLabelsToShow(labels: readonly RoomLabel[], view: SceneView): ShownLabel[] {
  const shown: ShownLabel[] = [];
  for (const label of labels) {
    const position = modelToThree(label.at[0], label.at[1], view.elevationM + label.liftM);
    if (view.inView && !view.inView(position)) continue;
    const distance = Math.hypot(
      position[0] - view.camera[0], position[1] - view.camera[1], position[2] - view.camera[2],
    );
    const perMetre = pixelsPerMetreAt(distance, view.fovDeg, view.heightPx);
    const text = fitLabel(label.name, labelExtra(label.tone), label.widthM * perMetre, label.heightM * perMetre);
    if (text) shown.push({ roomId: label.roomId, text, tone: label.tone, position });
  }
  return shown;
}
