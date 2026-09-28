import { bboxOfRing, pointInPolygon } from "../geometry/point";
import type { RoomDraft } from "../schema/pdfPlan";
import type { Room } from "../schema/structure";

/**
 * How much of a room a draft covers, 0 to 1, by sampling the room on a grid
 * of about 400 points. Pairs whose boxes do not meet cost one comparison, so
 * L1's 193 rooms against as many drafts stay quick.
 */
export function coverage(draft: Pick<RoomDraft, "footprint" | "holes">, room: Pick<Room, "footprint" | "holes">): number {
  if (!draft.footprint) return 0;
  const r = bboxOfRing(room.footprint);
  const d = bboxOfRing(draft.footprint);
  if (d.maxX <= r.minX || d.minX >= r.maxX || d.maxY <= r.minY || d.minY >= r.maxY) return 0;
  const step = Math.max(0.05, Math.sqrt(((r.maxX - r.minX) * (r.maxY - r.minY)) / 400));
  let inRoom = 0;
  let both = 0;
  for (let x = r.minX + step / 2; x < r.maxX; x += step) {
    for (let y = r.minY + step / 2; y < r.maxY; y += step) {
      if (!pointInPolygon([x, y], room.footprint, room.holes)) continue;
      inRoom++;
      if (pointInPolygon([x, y], draft.footprint, draft.holes)) both++;
    }
  }
  return inRoom === 0 ? 0 : both / inRoom;
}

export type DraftMatch = { copyOf: Room | null; overRooms: boolean };

/**
 * Build's "already on the map" (editor/src/build/drafts.ts draftView), here so
 * Claude's list_drafts says it by the same rule. A draft copies a room when
 * each covers more than half of the other. One way alone would hide a new hall
 * built round a riser, since the hall covers all of the riser. A column is
 * measured against columns only, so a hall is never taken for a column in it.
 */
export function draftMatch(draft: Pick<RoomDraft, "footprint" | "holes" | "kind">, rooms: readonly Room[]): DraftMatch {
  if (!draft.footprint) return { copyOf: null, overRooms: false };
  const outline = { footprint: draft.footprint, holes: draft.holes };
  const detail = draft.kind === "detail";
  let overRooms = false;
  for (const r of rooms) {
    const ofRoom = coverage(draft, r);
    if ((r.kind === "detail") === detail && ofRoom > 0.5 && coverage(r, outline) > 0.5) return { copyOf: r, overRooms: true };
    // Asked both ways: a big room's samples can step right over a small draft inside it.
    overRooms ||= ofRoom > 0 || coverage(r, outline) > 0;
  }
  return { copyOf: null, overRooms };
}
