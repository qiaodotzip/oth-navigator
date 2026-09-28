import { live, type Box, type Keyframe, type MapModel, type Place, type Sighting } from "@oth/model";
import type { TeamMember } from "../api/client";
import { href } from "../route";

/** One frame a place was seen in, by its best tag there. */
export type Evidence = { sighting: Sighting; frame: Keyframe };

/** The part of a frame to show, as fractions of it: the same on both axes, so the picture keeps the frame's shape. */
export type FrameWindow = { x: number; y: number; size: number };

/** Never less than 40% of the frame, so there is always some shopfront around the sign. */
const MIN_WINDOW = 0.4;

/** The widths the server keeps a frame at (`server/src/images/thumbnail.ts`). */
const SERVED_WIDTHS = [240, 320, 1600] as const;

/** "Sep", not Intl's en-GB "Sept" on newer ICU; the same reason as the Floors home's dates. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const area = (box: Box | undefined) => (box ? box.w * box.h : 0);

/** A confirmed tag with a box, then any confirmed tag, then a claim with a box, then any claim. */
function rank(s: Sighting): number {
  return (s.status === "confirmed" ? 0 : 2) + (s.box ? 0 : 1);
}

function better(a: Sighting, b: Sighting): number {
  return rank(a) - rank(b) || area(b.box) - area(a.box) || a.id.localeCompare(b.id);
}

/**
 * Every frame a place was seen in, best first (spec §4). A confirmed tag with
 * a box comes first, the largest box leading, since that is where the sign is
 * easiest to read; any other tag follows. A frame in the bin, or from deleted
 * footage, is no evidence. There is one entry per frame, by its best tag there.
 */
export function bestEvidence(model: MapModel, placeId: string): Evidence[] {
  const captures = new Set(live(model.captures).map(c => c.id));
  const frames = new Map(live(model.keyframes).filter(k => captures.has(k.captureId)).map(k => [k.id, k]));
  const byFrame = new Map<string, Evidence>();
  for (const sighting of live(model.sightings)) {
    if (sighting.placeId !== placeId) continue;
    const frame = frames.get(sighting.keyframeId);
    if (!frame) continue;
    const held = byFrame.get(frame.id);
    if (!held || better(sighting, held.sighting) < 0) byFrame.set(frame.id, { sighting, frame });
  }
  return [...byFrame.values()].sort((a, b) => better(a.sighting, b.sighting));
}

/**
 * What to show of a frame so its sign can be read at card size: the box with
 * as much again around it, never less than 40% of the frame, and kept inside
 * it. Without a box, the whole frame.
 */
export function frameWindow(box: Box | undefined): FrameWindow {
  if (!box) return { x: 0, y: 0, size: 1 };
  const size = Math.min(1, Math.max(MIN_WINDOW, box.w * 2, box.h * 2));
  const clamp = (v: number) => Math.min(1 - size, Math.max(0, v));
  return { x: clamp(box.x + box.w / 2 - size / 2), y: clamp(box.y + box.h / 2 - size / 2), size };
}

/** The frame width to ask for, so a window of it shown `displayPx` wide is sharp. */
export function imageWidthFor(displayPx: number, box: Box | undefined): number {
  const needed = displayPx / frameWindow(box).size;
  return SERVED_WIDTHS.find(w => w >= needed) ?? 1600;
}

/**
 * Where Open in Survey goes: the frame, in its footage, on the floor that the
 * footage is filed under, which can be another floor's when a shop is seen
 * through a void. It is null for footage filed under no floor, because Survey
 * lists only a floor's own footage.
 */
export function surveyLink(model: MapModel, frame: Keyframe): string | null {
  const capture = live(model.captures).find(c => c.id === frame.captureId);
  const level = capture?.levelId ? live(model.levels).find(l => l.id === capture.levelId) : undefined;
  if (!capture || !level) return null;
  return href({ name: "floor", code: level.code, tab: "survey", params: { capture: capture.id, frame: frame.id } });
}

/**
 * "Confirmed by Wei Kang, 27 Sep" for the photo shown. A place records no
 * confirmer, and binding it rewrites its `updatedBy`. A tag's last write is
 * its confirmation: Accept in Review, or the tag typed in Survey. (A later
 * box edit moves it, which is fair: that person looked too.)
 */
export function statusLine(place: Place, shown: Evidence | undefined, team: readonly TeamMember[]): string {
  if (place.status === "proposed") return "Proposed, waiting in Review";
  if (!shown) return "Confirmed";
  const tag = shown.sighting;
  if (tag.status === "proposed") return "Confirmed, but this photo's tag is still proposed";
  const who = team.find(m => m.id === tag.updatedBy)?.displayName;
  const date = tag.updatedAt ? new Date(tag.updatedAt) : null;
  const when = date && !Number.isNaN(date.getTime()) ? `${date.getDate()} ${MONTHS[date.getMonth()]}` : null;
  return `Confirmed${who ? ` by ${who}` : ""}${when ? `, ${when}` : ""}`;
}
