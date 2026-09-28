import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RoomDraftSchema, RoomKindSchema, live, namedLikeAStop, type StopKind } from "@oth/model";
import { z } from "zod";
import {
  DraftRefusedError, MAX_DECISIONS, RoomIdTakenError, decideDrafts, floorDrafts, listDrafts, tallyDrafts, type Decided,
} from "../../drafts/service";
import { assembleModel } from "../../model/assemble";
import { StopRefusal, makeStop, type MadeStop } from "../../stops/makeStop";
import type { ToolContext } from "../context";
import { refuseIfLocked } from "../guards";
import { Refusal, count, reply, replyJson, runTool } from "../results";
import { draftList } from "../views";
import { FLOOR, READ_ONLY, levelFor } from "./read";

const ID = z.string().min(1).max(120);
const VERSION = z.number().int().min(0).describe("The version you last read, from get or get_floor.");
/**
 * Plan 6's writes are not destructive: a stop comes off, a draft comes back,
 * and every change has Undo in the setup's check step. security.test.ts
 * holds every write but delete and publish to this.
 */
const WRITES = { readOnlyHint: false, destructiveHint: false } as const;

/** The services' own refusals, as refusals the model reads. */
async function refusing<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (err) {
    if (err instanceof StopRefusal || err instanceof DraftRefusedError || err instanceof RoomIdTakenError) throw new Refusal(err.message);
    throw err;
  }
}

const A_STOP: Record<StopKind, string> = { lift: "a lift", escalator: "an escalator", stair: "a stair" };

function stopText(made: MadeStop, kind: StopKind): string {
  const next = made.above === null
    ? "This is the top floor."
    : made.above.landing
      ? `${made.above.code} has a space traced over this spot: make_stop on it with kind "${kind}" adds the next stop to this one.`
      : `${made.above.code} has no space traced over this spot yet, so the next stop up waits until someone traces it.`;
  switch (made.outcome) {
    case "made":
      return `Made ${made.roomName} ${A_STOP[kind]} stop (${made.endpointId}, on ${made.portalId}), with the space's outline, and opened the space so routes reach it. ${next}`;
    case "joined":
      return `Made ${made.roomName} ${A_STOP[kind]} stop (${made.endpointId}), joining ${made.portalId}, which already stops at this spot on another floor.`;
    case "outlined":
      return `Gave the stop already placed in ${made.roomName} (${made.endpointId}) the space's outline, as ${A_STOP[kind]}, and opened the space.`;
    case "opened":
      return `${made.roomName} was already a stop but still had walls. Opened it, so routes reach the stop.`;
  }
}

function registerStopTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("make_stop", {
    title: "Make a lift or stair stop",
    description:
      "Turns a traced space on a floor into a lift, escalator or stairs stop, as Build's MakeStop does. The stop keeps " +
      "the space's outline, so 3D builds a shaft or a flight from it, and the space loses its walls and becomes " +
      "walkable, so routes reach the stop. A stop of the same kind already at this spot on another floor is joined, " +
      'not doubled. Use it for a space named as the flight or shaft itself ("Escalator - 07", "Lift A", "Stairs"), ' +
      "never for a lobby or landing beside one. room is the space's id and expectedVersion its version, from get_floor.",
    inputSchema: { floor: FLOOR, room: ID, expectedVersion: VERSION, kind: z.enum(["lift", "escalator", "stair"]) },
    annotations: WRITES,
  }, ({ floor, room, expectedVersion, kind }) => runTool(ctx, async () => {
    const level = levelFor(ctx, await assembleModel(ctx.db), floor);
    await refuseIfLocked(ctx.db, [{ type: "room", id: room }]);
    const made = await refusing(makeStop(ctx.db, { levelId: level.id, roomId: room, expectedVersion, kind }, ctx.user.id, ctx.now().getTime()));
    return reply(stopText(made, kind));
  }, { type: "room", id: room, sent: expectedVersion }));
}

const SHOWN = 20;
function listed(items: readonly string[]): string {
  return items.length <= SHOWN ? items.join(", ") : `${items.slice(0, SHOWN).join(", ")} and ${items.length - SHOWN} more`;
}

function decidedText(d: Decided): string {
  const said: string[] = [];
  if (d.accepted.length > 0) said.push(`Accepted ${count(d.accepted.length, "draft")} as rooms: ${listed(d.accepted.map(a => `${a.nameEn} (${a.roomId})`))}.`);
  if (d.rejected.length > 0) said.push(`Rejected ${d.rejected.length}.`);
  if (d.setAside.length > 0) said.push(`Set aside ${d.setAside.length} for a person: ${listed(d.setAside)}.`);
  const lines = [said.join(" ")];
  const stops = d.accepted.filter(a => namedLikeAStop(a.nameEn));
  if (stops.length > 0) {
    lines.push(`Named like a lift, escalator or stairs, so make_stop may be next: ${listed(stops.map(a => `${a.nameEn} (${a.roomId}, version ${a.roomVersion})`))}.`);
  }
  lines.push("Each is on the setup's check step, with Undo.");
  return lines.join("\n");
}

function registerDraftTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("list_drafts", {
    title: "List room drafts",
    description:
      "The room drafts Find rooms read from a floor's floorplan PDF and still waiting, largest first, 50 at a time: " +
      "each one's id, version, name, kind, area, where its name is printed, whether the drawing leaves it open " +
      "(no shape), the room already on the map it copies (onMapAs), whether it lies over rooms, and whether it is " +
      "named like a lift, escalator or stairs. counts says how the floor's drafts stand: waiting, accepted, and rejected or set aside.",
    inputSchema: {
      floor: FLOOR,
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    },
    annotations: READ_ONLY,
  }, ({ floor, limit, offset }) => runTool(ctx, async () => {
    const model = await assembleModel(ctx.db);
    const level = levelFor(ctx, model, floor);
    const waiting = (await listDrafts(ctx.db, level.id)).map(row => RoomDraftSchema.parse(row));
    const rooms = live(model.rooms).filter(r => r.levelId === level.id);
    return replyJson(draftList(level.code, waiting, tallyDrafts(await floorDrafts(ctx.db, level.id)), rooms, limit, offset));
  }));

  server.registerTool("decide_drafts", {
    title: "Decide room drafts",
    description:
      `Decides up to ${MAX_DECISIONS} of a floor's room drafts at once, all or none, as Build's review does. For each: ` +
      "accept makes it a room (nameEn and kind correct the drawing's name and kind), reject takes junk off the list, " +
      "and set_aside leaves it for a person, such as a space the drawing leaves open. Each item's expectedVersion is " +
      "the draft's version from list_drafts. Every change is on the setup's check step, with Undo.",
    inputSchema: {
      floor: FLOOR,
      items: z.array(z.object({
        id: ID,
        expectedVersion: VERSION,
        decision: z.enum(["accept", "reject", "set_aside"]),
        nameEn: z.string().trim().min(1).max(200).optional().describe("accept only: the room's name, when the drawing's is wrong."),
        kind: RoomKindSchema.optional().describe("accept only: room, area, detail, service or void."),
      })).min(1).max(MAX_DECISIONS),
    },
    annotations: WRITES,
  }, ({ floor, items }) => runTool(ctx, async () => {
    const level = levelFor(ctx, await assembleModel(ctx.db), floor);
    const misplaced = items.find(i => i.decision !== "accept" && (i.nameEn !== undefined || i.kind !== undefined));
    if (misplaced) throw new Refusal(`nameEn and kind go with accept only: draft ${misplaced.id} is a ${misplaced.decision}.`);
    await refuseIfLocked(ctx.db, items.map(i => ({ type: "roomDraft", id: i.id })));
    return reply(decidedText(await refusing(decideDrafts(ctx.db, level.id, items, ctx.user.id))));
  }, items.map(i => ({ type: "roomDraft", id: i.id, sent: i.expectedVersion }))));
}

/** Plan 6C's tools for a floor's guided setup (spec §7.2). Each group registers here. */
export function registerSetupTools(server: McpServer, ctx: ToolContext): void {
  registerStopTools(server, ctx);
  registerDraftTools(server, ctx);
}
