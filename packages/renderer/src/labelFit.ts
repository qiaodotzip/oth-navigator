import type { Room, Vec2 } from "@oth/model";
import { Frustum, Matrix4, PerspectiveCamera, Vector3, type Camera } from "three";
import { modelToThree } from "./coords";
import { SLAB_HEIGHT_M } from "./geometry";
import { MASSING } from "./massing";
import { LOW_WALL_M } from "./structure";

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
  /** How far above its floor the label floats in 3D: on top of what the preview draws there (`labelLiftM`). */
  liftM: number;
  /** The same with the preview's walls at full height. Absent, it is `liftM`. */
  fullHeightLiftM?: number;
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
 * renderer's inline styles cannot use Tailwind's names. Each ratio holds on
 * solid white only, so a label's halo must be opaque: at 85% white over a
 * dark room, the ✓, "proposed" and the grey all fall under 4.5:1.
 */
export const LABEL_COLOURS = {
  /** A place's name: stone-900, 17.5:1 on white. */
  name: "#1c1917",
  /** The ✓ of a confirmed place: the confirmed token, 5.5:1 on white. */
  confirmed: "#047857",
  /** "proposed": sky-700, 5.9:1 on white, one step darker than the proposed token, which is under 4.5:1 as 13 px text. */
  proposed: "#0369a1",
  /** The drawing's own name: stone-500, grey, and still 4.8:1 on white. */
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
 * 252 rooms from turning into a wall of text.
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

/**
 * How far above its floor a room's label floats in 3D: on top of what the
 * preview draws there. The top of the room was too high once walls stood at
 * 1.2 m: L1's rooms are 4.5–5 m high and mostly under 12 m deep, so from the
 * preview's pitch a pill that high sat past the back wall, over the room
 * behind, and named the wrong unit.
 *
 * An area is its slab. A room's walls stand 1.2 m, or at the room's full
 * height when the preview is asked for that. A solid stands as tall as it
 * is, and a void builds nothing.
 */
export function labelLiftM(room: Pick<Room, "kind" | "heightM">, fullHeightWalls: boolean): number {
  switch (MASSING[room.kind]) {
    case "slab":
      return SLAB_HEIGHT_M;
    case "shell":
      return fullHeightWalls ? room.heightM : Math.min(LOW_WALL_M, room.heightM);
    case "solid":
      return room.heightM;
    case "none":
      return 0;
  }
}

/** How many screen pixels a metre covers at this distance from a perspective camera. */
export function pixelsPerMetreAt(distanceM: number, fovDeg: number, viewportHeightPx: number): number {
  if (!(distanceM > 0)) return Number.POSITIVE_INFINITY;
  return viewportHeightPx / (2 * distanceM * Math.tan((fovDeg * Math.PI) / 360));
}

/**
 * The labels worth mounting in 3D for this camera: in view, and fitting their
 * room at the scale the room is seen at, which is the plan's fit rule applied
 * by camera distance. Each sits on what the preview draws, so it rises with
 * the walls when they stand at full height.
 */
export function sceneLabelsToShow(
  labels: readonly RoomLabel[], view: SceneView, fullHeightWalls = false,
): ShownLabel[] {
  const shown: ShownLabel[] = [];
  for (const label of labels) {
    const liftM = fullHeightWalls ? label.fullHeightLiftM ?? label.liftM : label.liftM;
    const position = modelToThree(label.at[0], label.at[1], view.elevationM + liftM);
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

/**
 * Everything a shown label draws from, as one string. A change in any of it
 * must reach the screen: a place confirmed or a label point moved, with the
 * text unchanged, would otherwise leave a stale pill up.
 */
export function shownLabelsKey(labels: readonly ShownLabel[]): string {
  return labels.map(l => `${l.roomId}:${l.tone}:${l.position.join()}:${l.text}`).join("|");
}

/** Scratch objects for `cameraView`, made once per component so a frame allocates no matrices. */
export type ViewProbe = { frustum: Frustum; matrix: Matrix4; point: Vector3 };

export function viewProbe(): ViewProbe {
  return { frustum: new Frustum(), matrix: new Matrix4(), point: new Vector3() };
}

/**
 * A three.js camera as `sceneLabelsToShow` sees it, with `inView` testing
 * against the camera's frustum. Pure maths, so it runs without WebGL.
 */
export function cameraView(
  camera: Camera, heightPx: number, elevationM: number, probe: ViewProbe = viewProbe(),
): SceneView {
  // OrbitControls moves the camera between frames; without this the frustum
  // would be last frame's, or the identity before the first render.
  camera.updateMatrixWorld();
  probe.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  probe.frustum.setFromProjectionMatrix(probe.matrix);
  return {
    camera: [camera.position.x, camera.position.y, camera.position.z],
    fovDeg: camera instanceof PerspectiveCamera ? camera.fov : 45,
    heightPx,
    elevationM,
    inView: ([x, y, z]) => probe.frustum.containsPoint(probe.point.set(x, y, z)),
  };
}
