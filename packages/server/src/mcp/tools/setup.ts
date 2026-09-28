import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StopKind } from "@oth/model";
import { z } from "zod";
import { assembleModel } from "../../model/assemble";
import { StopRefusal, makeStop, type MadeStop } from "../../stops/makeStop";
import type { ToolContext } from "../context";
import { refuseIfLocked } from "../guards";
import { Refusal, reply, runTool } from "../results";
import { FLOOR, levelFor } from "./read";

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
    if (err instanceof StopRefusal) throw new Refusal(err.message);
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

/** Plan 6C's tools for a floor's guided setup (spec §7.2). Each group registers here. */
export function registerSetupTools(server: McpServer, ctx: ToolContext): void {
  registerStopTools(server, ctx);
}
