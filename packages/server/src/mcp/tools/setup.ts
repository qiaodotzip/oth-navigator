import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RoomDraftSchema, RoomKindSchema, live, namedLikeAStop, type StopKind } from "@oth/model";
import { z } from "zod";
import { placements } from "../../db/schema";
import {
  DraftRefusedError, MAX_DECISIONS, RoomIdTakenError, decideDrafts, floorDrafts, listDrafts, tallyDrafts, type Decided,
} from "../../drafts/service";
import { assembleModel } from "../../model/assemble";
import { objectSpotReport } from "../../objects/spots";
import { UnknownFloorError, getSetup, setStep, type SetupCounts, type SetupState } from "../../setup/service";
import { SETUP_STEPS, STEP_NAMES, isClaudeStep, stepNumber, type ClaudeStepId } from "../../setup/steps";
import { StopRefusal, makeStop, type MadeStop } from "../../stops/makeStop";
import type { ToolContext } from "../context";
import { refuseIfLocked } from "../guards";
import { Refusal, count, reply, replyJson, runTool, singaporeTime } from "../results";
import { draftList, spotsView } from "../views";
import { FLOOR, READ_ONLY, levelFor, teamNames } from "./read";

const ID = z.string().min(1).max(120);
const VERSION = z.number().int().min(0).describe("The version you last read, from get or get_floor, where a version left out is 0.");
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
    if (err instanceof StopRefusal || err instanceof DraftRefusedError || err instanceof RoomIdTakenError || err instanceof UnknownFloorError) throw new Refusal(err.message);
    throw err;
  }
}

const A_STOP: Record<StopKind, string> = { lift: "a lift", escalator: "an escalator", stair: "a stair" };

function stopText(made: MadeStop, kind: StopKind, code: string): string {
  // A slash command works on one floor: the floor above is told of, never offered.
  const next = made.above === null
    ? "This is the top floor."
    : made.above.landing
      ? `${made.above.code} has a space traced over this spot too. Its stop is made when ${made.above.code} is set up; stay on ${code}.`
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
      "never for a lobby or landing beside one. room is the space's id and expectedVersion its version, from " +
      "get_floor's rooms (a version left out there is 0).",
    inputSchema: { floor: FLOOR, room: ID, expectedVersion: VERSION, kind: z.enum(["lift", "escalator", "stair"]) },
    annotations: WRITES,
  }, ({ floor, room, expectedVersion, kind }) => runTool(ctx, async () => {
    const level = levelFor(ctx, await assembleModel(ctx.db), floor);
    await refuseIfLocked(ctx.db, [{ type: "room", id: room }]);
    const made = await refusing(makeStop(ctx.db, { levelId: level.id, roomId: room, expectedVersion, kind }, ctx.user.id, ctx.now().getTime()));
    return reply(stopText(made, kind, level.code));
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
  if (d.setAside.length > 0) said.push(`Set aside ${d.setAside.length} for a person, who sees your reason in Build: ${listed(d.setAside)}.`);
  const lines = said.length > 0 ? [said.join(" ")] : [];
  if (d.unknown.length > 0) {
    lines.push(`Skipped ${count(d.unknown.length, "id")} no draft has: ${listed(d.unknown)}. Copy ids exactly as list_drafts gives them.`);
  }
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
      "The room drafts Find rooms read from a floor's floorplan PDF that still wait for a decision, largest first, " +
      "50 at a time: each one's id, version, name, kind, area, labelPoint (where its name is printed, in metres), " +
      "whether the drawing leaves it open (no shape), the room already on the map it copies (onMapAs), the rooms it " +
      "lies over (overlaps: each room's id and name, and share, how much of the draft is over that room, 0 to 1), " +
      "and whether it is named like a lift, escalator or stairs. Drafts set aside for a person are not listed. counts " +
      "says how the floor's drafts stand: waiting, setAside (waiting for a person), accepted and rejected. " +
      "decide_drafts takes decided drafts off this list, so after deciding some, read again from offset 0 rather " +
      "than carrying on from where you left off.",
    inputSchema: {
      floor: FLOOR,
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    },
    annotations: READ_ONLY,
  }, ({ floor, limit, offset }) => runTool(ctx, async () => {
    const model = await assembleModel(ctx.db);
    const level = levelFor(ctx, model, floor);
    const waiting = (await listDrafts(ctx.db, level.id)).filter(row => !row.setAside).map(row => RoomDraftSchema.parse(row));
    const rooms = live(model.rooms).filter(r => r.levelId === level.id);
    return replyJson(draftList(level.code, waiting, tallyDrafts(await floorDrafts(ctx.db, level.id)), rooms, limit, offset));
  }));

  server.registerTool("decide_drafts", {
    title: "Decide room drafts",
    description:
      `Decides up to ${MAX_DECISIONS} of a floor's room drafts at once, as Build's review does. For each: ` +
      "accept makes it a room (nameEn and kind correct the drawing's name and kind), reject takes junk or a copy " +
      "off the list, and set_aside leaves it waiting for a person, with a reason: one line they read beside it in " +
      "Build, such as \"Open on the drawing: trace it by hand\". Each item's expectedVersion is the draft's version " +
      "from list_drafts. An id no draft has is skipped and named in the answer; any other refusal decides none of " +
      "them. Every change is on the setup's check step, with Undo.",
    inputSchema: {
      floor: FLOOR,
      items: z.array(z.object({
        id: ID,
        expectedVersion: VERSION,
        decision: z.enum(["accept", "reject", "set_aside"]),
        nameEn: z.string().trim().min(1).max(200).optional().describe("accept only: the room's name, when the drawing's is wrong."),
        kind: RoomKindSchema.optional().describe("accept only: room, area, detail, service or void."),
        reason: z.string().max(300).optional().describe("set_aside only, and needed there: one line on why a person should decide it."),
      })).min(1).max(MAX_DECISIONS),
    },
    annotations: WRITES,
  }, ({ floor, items }) => runTool(ctx, async () => {
    const level = levelFor(ctx, await assembleModel(ctx.db), floor);
    const misplaced = items.find(i => i.decision !== "accept" && (i.nameEn !== undefined || i.kind !== undefined));
    if (misplaced) throw new Refusal(`nameEn and kind go with accept only: draft ${misplaced.id} is a ${misplaced.decision}.`);
    const reasoned = items.find(i => i.decision !== "set_aside" && i.reason !== undefined);
    if (reasoned) throw new Refusal(`reason goes with set_aside only: draft ${reasoned.id} is a ${reasoned.decision}.`);
    await refuseIfLocked(ctx.db, items.map(i => ({ type: "roomDraft", id: i.id })));
    const decided = await refusing(decideDrafts(ctx.db, level.id, items, ctx.user.id));
    if (decided.accepted.length + decided.rejected.length + decided.setAside.length === 0) {
      const ids = decided.unknown.length === 1 ? `the id ${decided.unknown[0]}` : `the ids ${listed(decided.unknown)}`;
      throw new Refusal(`Decided nothing: no draft has ${ids}. list_drafts gives ${level.code}'s.`);
    }
    return reply(decidedText(decided));
  }, items.map(i => ({ type: "roomDraft", id: i.id, sent: i.expectedVersion }))));
}

/** What step_status shows Claude: each step plainly, as stored, who finished it, and the counts. */
function statusView(code: string, state: SetupState, names: ReadonlyMap<string, string>) {
  return {
    floor: code,
    steps: state.steps.map(s => ({
      n: stepNumber(s.step), step: s.step, name: STEP_NAMES[s.step], who: isClaudeStep(s.step) ? "claude" : "you", status: s.status,
      ...(s.note ? { note: s.note } : {}),
      ...(s.finishedBy ? { by: `${names.get(s.finishedBy) ?? s.finishedBy}${s.finishedVia ? " via Claude Code" : ""}` } : {}),
      ...(s.finishedAt ? { at: singaporeTime(s.finishedAt) } : {}),
    })),
    counts: state.counts,
  };
}

const LEFT: Record<ClaudeStepId, { noun: string; state: string; n: (c: SetupCounts) => number }> = {
  label: { noun: "frame", state: "untagged", n: c => c.label.left },
  rooms: { noun: "draft", state: "waiting", n: c => c.rooms.waiting },
  things: { noun: "place", state: "not bound to a room", n: c => c.things.unbound },
  paths: { noun: "room", state: "with a door that no route reaches", n: c => c.paths.unreachable ?? 0 },
};

function registerStepTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("step_status", {
    title: "Floor setup status",
    description:
      "Where a floor's guided setup stands: its nine steps in order, as marked (open, done or skipped) and by whom, and " +
      "each step's live counts, such as frames left to tag, drafts waiting and set aside for a person, places not " +
      "bound (things.unbound), objects placed and rooms with a door that no route reaches. Use these numbers in your " +
      "report and note. A person's step can read open while the counts show its work done: the app ticks it from the map.",
    inputSchema: { floor: FLOOR },
    annotations: READ_ONLY,
  }, ({ floor }) => runTool(ctx, async () => {
    const level = levelFor(ctx, await assembleModel(ctx.db), floor);
    return replyJson(statusView(level.code, await getSetup(ctx.db, level.id), await teamNames(ctx)));
  }));

  server.registerTool("finish_step", {
    title: "Finish a setup step",
    description:
      "Marks one of your setup steps done on a floor, with a one-line note the setup screen shows beside it. step is " +
      "label (2), rooms (5), things (6) or paths (7); the others are a person's, marked in the app. Call it only when " +
      "the step's stop rule is met, after your report; never when you stopped early. rooms is refused while any draft " +
      "still waits for a decision: a draft a person should decide is set aside, with a reason.",
    inputSchema: { floor: FLOOR, step: z.enum(SETUP_STEPS), note: z.string().trim().min(1).max(200) },
    annotations: WRITES,
  }, ({ floor, step, note }) => runTool(ctx, async () => {
    const level = levelFor(ctx, await assembleModel(ctx.db), floor);
    if (!isClaudeStep(step)) throw new Refusal(`Step ${stepNumber(step)}, ${STEP_NAMES[step]}, is a person's: they mark it in the app.`);
    if (step === "rooms") {
      const { waiting } = tallyDrafts(await floorDrafts(ctx.db, level.id));
      if (waiting > 0) {
        throw new Refusal(
          `Not marked: ${count(waiting, "draft")} on ${level.code} still ${waiting === 1 ? "waits" : "wait"} for a decision. ` +
          "Decide them with decide_drafts, setting aside with a reason any a person should decide, then finish.",
        );
      }
    }
    await refusing(setStep(ctx.db, level.id, step, { status: "done", note }, ctx.user.id, ctx.token.id));
    const left = LEFT[step];
    const { counts } = await getSetup(ctx.db, level.id);
    const n = left.n(counts);
    const still = [
      n > 0 ? `Still left: ${count(n, left.noun)} ${left.state}.` : "",
      step === "rooms" && counts.rooms.setAside > 0
        ? `${count(counts.rooms.setAside, "draft")} ${counts.rooms.setAside === 1 ? "is" : "are"} set aside for a person.`
        : "",
    ].filter(Boolean).map(s => ` ${s}`).join("");
    return reply(`Marked step ${stepNumber(step)}, ${STEP_NAMES[step]}, done on ${level.code}, with your note.${still}`);
  }));
}

function registerSpotTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("suggest_object_spots", {
    title: "Suggest where objects stand",
    description:
      "Where each object filmed on a floor probably stands, worked out from the survey: from the rooms bound to " +
      "places seen near its frame, at the edge of the walkable floor, facing into it. Sightings of one object a few " +
      "frames apart are merged. Each suggestion gives its frames, the rooms that fixed it (anchors), a confidence " +
      "(high needs two anchors; low with no anchors is a guess from the nearest frame that has some), and the " +
      "placement to create with create, type placement. A place bound to an open area over 500 m², such as a gate " +
      "bound to a whole concourse, is no anchor: it doesn't say where in the area a frame was taken. unplaced lists " +
      "the sightings it could not place, each with why: name them in your report. Sightings already on a placement " +
      "are skipped. It changes nothing.",
    inputSchema: { floor: FLOOR },
    annotations: READ_ONLY,
  }, ({ floor }) => runTool(ctx, async () => {
    const model = await assembleModel(ctx.db);
    const level = levelFor(ctx, model, floor);
    const taken = new Set((await ctx.db.select({ id: placements.id }).from(placements)).map(p => p.id));
    return replyJson(spotsView(model, level, objectSpotReport(model, level.id), taken));
  }));
}

/** Plan 6C's tools for a floor's guided setup (spec §7.2). Each group registers here. */
export function registerSetupTools(server: McpServer, ctx: ToolContext): void {
  registerStopTools(server, ctx);
  registerDraftTools(server, ctx);
  registerStepTools(server, ctx);
  registerSpotTools(server, ctx);
}
