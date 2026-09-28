import { live, placeLevels, validateModel, type MapModel } from "@oth/model";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { captures, floorSetup, keyframes, levels } from "../db/schema";
import { floorDrafts, tallyDrafts, type DraftRow } from "../drafts/service";
import { recordAudit } from "../entities/repository";
import { assembleModel } from "../model/assemble";
import { SETUP_STEPS, stepNumber, type SetupStepId } from "./steps";

export { SETUP_STEPS, type SetupStepId } from "./steps";

export const SETUP_STATUSES = ["open", "done", "skipped"] as const;
export type SetupStatus = (typeof SETUP_STATUSES)[number];

/**
 * One step as floor_setup stores it, in the shape of Plan 6E's
 * editor/src/setup/types.ts, which is the contract. A step with no row is
 * open, with everything else empty. The status is only what was stored: the
 * wizard works out for itself when a person's step is done by the map.
 */
export type SetupStepState = {
  step: SetupStepId;
  status: SetupStatus;
  note: string;
  finishedBy: string | null;
  /** The Claude Code token that finished it; null when a person did. */
  finishedVia: string | null;
  finishedAt: string | null;
};

/** Each step's live counts (spec §4.3) on one floor, field for field as 6E reads them (contract v2). */
export type SetupCounts = {
  label: { tagged: number; binned: number; left: number };
  review: { left: number };
  /** waiting leaves out the drafts Claude set aside for a person, which setAside counts. */
  rooms: { waiting: number; setAside: number; accepted: number; rejected: number; stops: number };
  things: { bound: number; unbound: number; objects: { kindId: string; name: string; count: number }[] };
  /** unreachable: rooms with at least one doorway that no route reaches; null in light mode. */
  paths: { pathways: number; entrances: number; unreachable: number | null };
};

/** Light counts leave out what needs the whole model validated: paths.unreachable. */
export type CountOptions = { light?: boolean };

export type SetupState = { steps: SetupStepState[]; counts: SetupCounts };

/** A floor's setup writes go in the audit log under this type, one id per floor and step. */
export const SETUP_ENTITY = "floorSetup";
export function setupEntityId(levelId: string, step: SetupStepId): string {
  return `${levelId}/${step}`;
}

export class UnknownFloorError extends Error {
  constructor(levelId: string) {
    super(`There is no floor ${levelId}.`);
    this.name = "UnknownFloorError";
  }
}

export async function requireLevel(db: Database, levelId: string): Promise<void> {
  const [level] = await db.select({ id: levels.id }).from(levels).where(and(eq(levels.id, levelId), isNull(levels.deletedAt)));
  if (!level) throw new UnknownFloorError(levelId);
}

async function storedSteps(db: Database, levelId: string): Promise<SetupStepState[]> {
  const rows = await db.select().from(floorSetup).where(eq(floorSetup.levelId, levelId));
  const byNumber = new Map(rows.map(r => [r.step, r]));
  return SETUP_STEPS.map((step): SetupStepState => {
    const row = byNumber.get(stepNumber(step));
    return {
      step,
      status: (row?.status ?? "open") as SetupStatus,
      note: row?.note ?? "",
      finishedBy: row?.finishedBy ?? null,
      finishedVia: row?.finishedVia ?? null,
      finishedAt: row?.finishedAt ? row.finishedAt.toISOString() : null,
    };
  });
}

/** One line, as the wizard shows it beside the step. */
function oneLine(note: string): string {
  return note.replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * Marks one step (6E's contract): done or skipped stamps who, through which
 * token and when, every time, a repeat included; open clears all three. The
 * note is the one sent, or none. Every write is on the audit trail.
 */
export async function setStep(
  db: Database, levelId: string, step: SetupStepId,
  patch: { status: SetupStatus; note?: string }, actor: string, via: string | null,
): Promise<SetupStepState> {
  await requireLevel(db, levelId);
  const number = stepNumber(step);
  const finished = patch.status !== "open";
  const set = {
    status: patch.status,
    note: oneLine(patch.note ?? ""),
    finishedBy: finished ? actor : null,
    finishedVia: finished ? via : null,
    finishedAt: finished ? new Date() : null,
  };
  await db.transaction(async t => {
    const tx = t as unknown as Database;
    const [before] = await tx.select().from(floorSetup).where(and(eq(floorSetup.levelId, levelId), eq(floorSetup.step, number)));
    const [after] = await tx.insert(floorSetup).values({ levelId, step: number, ...set })
      .onConflictDoUpdate({ target: [floorSetup.levelId, floorSetup.step], set })
      .returning();
    await recordAudit(tx, SETUP_ENTITY, setupEntityId(levelId, step), "set", actor,
      before ? (before as unknown as Row) : null, after as unknown as Row);
  });
  return (await storedSteps(db, levelId))[number - 1]!;
}

/** The issues that mean a room on the floor has no route: check_floor's own codes. */
const UNREACHABLE = new Set(["area.unreachable", "room.noAccess"]);

/**
 * Rooms on the floor with at least one doorway that no route reaches (contract
 * v2): a room with no door is left out, since a route can't be drawn to it
 * until a person adds one. Counted once each, however many issues it has.
 */
function unreachableRooms(model: MapModel, levelId: string): number {
  const withDoor = new Set<string>();
  for (const d of live(model.doorways)) {
    if (d.levelId !== levelId) continue;
    withDoor.add(d.roomA);
    withDoor.add(d.roomB);
  }
  if (withDoor.size === 0) return 0;
  const cut = new Set(validateModel(model).issues
    .filter(i => i.levelId === levelId && UNREACHABLE.has(i.code) && withDoor.has(i.entityId))
    .map(i => i.entityId));
  return cut.size;
}

/**
 * The editor's floorUnits (editor/src/flow/buildSteps.ts), counted: a unit is
 * a confirmed place that is not a walkway or a kind of object, bound while its
 * room is on the map.
 */
function units(model: MapModel, levelId: string): { bound: number; unbound: number } {
  const floorOf = placeLevels(model);
  const roomFloor = new Map(live(model.rooms).map(r => [r.id, r.levelId]));
  let bound = 0;
  let unbound = 0;
  for (const place of live(model.places)) {
    if (place.status !== "confirmed" || place.pathwayKindId || place.objectKindId) continue;
    const floor = place.roomId ? roomFloor.get(place.roomId) : undefined;
    if (floor !== undefined) {
      if (floor === levelId) bound++;
    } else if (floorOf.get(place.id) === levelId) {
      unbound++;
    }
  }
  return { bound, unbound };
}

/**
 * Spec §4.3's counts for one floor. Binned frames are deleted, so not in the
 * model: the caller counts them. Light mode validates nothing, so it is cheap
 * enough for the Floors home, which asks for every floor.
 */
export function setupCounts(
  model: MapModel, levelId: string, drafts: readonly DraftRow[], binnedFrames = 0, opts: CountOptions = {},
): SetupCounts {
  const captureIds = new Set(live(model.captures).filter(c => c.levelId === levelId).map(c => c.id));
  const frames = live(model.keyframes).filter(k => captureIds.has(k.captureId));
  const frameIds = new Set(frames.map(k => k.id));
  const sightings = live(model.sightings).filter(s => frameIds.has(s.keyframeId));
  const tagged = new Set(sightings.map(s => s.keyframeId)).size;
  const places = new Map(live(model.places).map(p => [p.id, p]));
  const proposals = new Set(sightings.filter(s => places.get(s.placeId)?.status === "proposed").map(s => s.placeId));

  const objects = live(model.placements).filter(p => p.levelId === levelId && p.objectKindId);
  const kinds = new Map(live(model.objectKinds).map(k => [k.id, k.nameEn]));
  const perKind = new Map<string, number>();
  for (const o of objects) perKind.set(o.objectKindId!, (perKind.get(o.objectKindId!) ?? 0) + 1);

  return {
    label: { tagged, binned: binnedFrames, left: frames.length - tagged },
    review: { left: proposals.size },
    rooms: {
      ...tallyDrafts(drafts),
      stops: live(model.portalEndpoints).filter(e => e.levelId === levelId && e.footprint).length,
    },
    things: {
      ...units(model, levelId),
      objects: [...perKind].map(([kindId, count]) => ({ kindId, name: kinds.get(kindId) ?? kindId, count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    paths: {
      pathways: live(model.pathways).filter(p => p.levelId === levelId).length,
      entrances: live(model.entrances).filter(e => e.levelId === levelId).length,
      unreachable: opts.light ? null : unreachableRooms(model, levelId),
    },
  };
}

/** Frames binned from this floor's captures still in Survey: binning is a soft delete. */
async function binnedFrames(db: Database, levelId: string): Promise<number> {
  const rows = await db.select({ id: keyframes.id }).from(keyframes)
    .innerJoin(captures, eq(captures.id, keyframes.captureId))
    .where(and(eq(captures.levelId, levelId), isNull(captures.deletedAt), isNotNull(keyframes.deletedAt)));
  return rows.length;
}

/** GET /api/levels/:id/setup, and what step_status reads: the nine steps as stored, and the counts. */
export async function getSetup(db: Database, levelId: string, opts: CountOptions = {}): Promise<SetupState> {
  await requireLevel(db, levelId);
  return {
    steps: await storedSteps(db, levelId),
    counts: setupCounts(await assembleModel(db), levelId, await floorDrafts(db, levelId), await binnedFrames(db, levelId), opts),
  };
}
