import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { live, type Level, type MapModel } from "@oth/model";
import { z } from "zod";
import { readAsset } from "../../assets/storage";
import type { Database } from "../../db/client";
import { pathways } from "../../db/schema";
import { roomIdFor } from "../../drafts/service";
import { createEntity, recordAudit } from "../../entities/repository";
import { assembleModel } from "../../model/assemble";
import { BRIDGES_ON, BRIDGE_WIDTH_M, BRIDGED, type Bridge } from "../../paths/bridge";
import {
  ACCESS_M, CLOSED_NEAR_M, CONNECT_MAX_M, CONNECTOR_MAX_WIDTH_M, CONNECTOR_MIN_WIDTH_M, CONTAINER_SHARE, CannotConnect, MAX_CONNECTORS,
  MAX_LINK_M, connectRooms, type Connector,
} from "../../paths/connect";
import { planInk, type PlanInk } from "../../paths/ink";
import { GUESS_APART_M, GUESS_INSET_M, GUESS_MAX_INSET_M, OUTWARD_M } from "../../paths/entrances";
import { SurfaceTooLarge } from "../../paths/raster";
import { CROSS_M, REACH_M } from "../../paths/reach";
import { suggestPaths } from "../../paths/suggest";
import type { ToolContext } from "../context";
import { Refusal, replyJson, runTool } from "../results";
import { FLOOR, READ_ONLY, levelFor, livePlan } from "./read";

/**
 * connect_rooms' writer: the connectors as pathways, in one transaction
 * through the same create as the create tool, so each has its own audit row,
 * marked through the token, and its own Undo in the setup's check step. Each
 * id is read off the room it runs to, as decide_drafts names a room: the
 * floor's code, "to" and the room's name, then -2, -3… until it is free
 * (every pathway id, deleted ones too, is taken).
 */
async function makeConnectors(
  ctx: ToolContext, model: MapModel, level: Level, connectors: readonly Connector[], bridges: readonly Bridge[],
): Promise<{ ids: string[]; bridgeIds: string[] }> {
  const names = new Map(live(model.rooms).map(r => [r.id, r.nameEn.trim() || r.id]));
  return ctx.db.transaction(async t => {
    const tx = t as unknown as Database;
    const taken = new Set((await tx.select({ id: pathways.id }).from(pathways)).map(p => p.id));
    const ids: string[] = [];
    for (const c of connectors) {
      const id = roomIdFor(level.code, `to ${names.get(c.roomIds[0]!) ?? c.roomIds[0]!}`, taken);
      await createEntity(tx, "pathway", { id, levelId: level.id, polyline: c.polyline, widthM: c.widthM }, ctx.user.id);
      ids.push(id);
    }
    const bridgeIds: string[] = [];
    for (const b of bridges) {
      const id = roomIdFor(level.code, `to ${b.toName}`, taken);
      await createEntity(tx, "pathway", { id, levelId: level.id, polyline: [b.from, b.to], widthM: BRIDGE_WIDTH_M }, ctx.user.id);
      // Contract v6: a row of its own beside the create, so the check step reads
      // the line as a bridge over ground nobody traced, not as a connector.
      await recordAudit(tx, "pathway", id, BRIDGED, ctx.user.id, null, { roomId: b.toRoomId, roomName: b.toName, openM: b.openM });
      bridgeIds.push(id);
    }
    return { ids, bridgeIds };
  });
}

/**
 * The floor's plan as the ink probe reads it (contract v6), or null where there
 * is nothing to read: no plan, no scale set on it, or bytes sharp cannot
 * decode. `connect_rooms` then bridges nothing and reports its islands as
 * contract v5 does — bridging is an improvement on the report, never a
 * precondition for it.
 */
async function planProbe(ctx: ToolContext, levelId: string): Promise<PlanInk | null> {
  const image = await livePlan(ctx, levelId);
  if (!image || image.metresPerPixel == null) return null;
  try {
    return await planInk(await readAsset(ctx.dataDir, image.storagePath), { ...image, metresPerPixel: image.metresPerPixel });
  } catch {
    return null;
  }
}

/** Spec §7.3: the pathway first pass, for the draw_paths step (§4.1 step 7). */
export function registerPathTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool("suggest_paths", {
    title: "Suggest pathways",
    description:
      "A first pass of one floor's pathways, worked out from its walkable areas. Nothing is saved. " +
      "lines are centre lines in metres, longest first. A line breaks only at a fork, and runs on through a fork " +
      "where it bends gently, so a straight aisle is one line. Each has a widthM. A pathway opens its full width " +
      "wherever it runs, so where a line crosses from one room into another, check view_plan shows an opening there. " +
      "ends says what each end of a line meets: fork (other lines), end (nothing) or loop (the line closes on itself). " +
      "network numbers the lines that join up, 0 for the network with the most length. A detached network " +
      "(network above 0) usually needs a link to the main one, or should be left out, because an unreachable " +
      "pathway blocks Publish. " +
      "drawn is true when the floor already has a pathway along the line (70% of it within that pathway's half " +
      "width and a metre, running within 30° of it): leave those out, so a second run draws only what is still " +
      "missing. A line that only crosses a pathway, or branches off one, is not drawn. " +
      `reaches lists the rooms a line's "end" ends lie inside or within ${REACH_M} m of, less the rooms its midpoint ` +
      "lies in, which it runs within rather than into: on a floor with no doorways, a dead end into a room is that " +
      `room's way in. crosses lists the rooms of kind room a line runs more than ${CROSS_M} m ` +
      "inside: a pathway there opens the room's walls. " +
      "links join each doorway, lift, escalator or stair stop, and entrance to the nearest point on a line it can " +
      `reach in a straight line, within ${MAX_LINK_M} m. Links have no width; ontoDrawn is true when the line a link ` +
      "ends on is drawn already. unconnected lists the ones that could " +
      "not be joined, and why. Only entrances that exist are linked, so call it again after creating them. " +
      "entranceGuesses gives each confirmed place named as a gate, entrance, exit or way in (not in parentheses), bound to a room and with " +
      `no entrance of its name yet, a point ${GUESS_INSET_M} m inside that room (further in, up to ${GUESS_MAX_INSET_M} m, ` +
      `where routing can't start nearer the edge) on its longest stretch of outline with no room ${OUTWARD_M} m beyond ` +
      `it, the building's outside. Guesses on one stretch are at least ${GUESS_APART_M} m apart; the rest go on the next ` +
      "longest. Each is a guess a person moves in Check when the drawing shows nothing better. " +
      "Check it over view_plan, then create the pathways you agree with: type pathway, with the reply's levelId, " +
      "a polyline and a widthM.",
    inputSchema: { floor: FLOOR },
    annotations: READ_ONLY,
  }, ({ floor }) => runTool(ctx, async () => {
    const model = await assembleModel(ctx.db);
    const level = levelFor(ctx, model, floor);
    try {
      return replyJson({ floor: level.code, levelId: level.id, ...suggestPaths(model, level.id) });
    } catch (err) {
      if (err instanceof SurfaceTooLarge) throw new Refusal(`Nothing suggested for ${level.code}. ${err.message}`);
      throw err;
    }
  }));

  server.registerTool("connect_rooms", {
    title: "Connect rooms",
    description:
      "Makes the pathways that join the rooms check_floor lists as area.unreachable or room.noAccess to the " +
      "pathways routes already reach from an entrance or a stop, in one call. Nearest room first, each is the shortest " +
      `run through walkable floor from that network: into an area, or to within ${CLOSED_NEAR_M} m of a closed room's ` +
      `outline, at most ${CONNECT_MAX_M} m, ${CONNECTOR_MIN_WIDTH_M} to ${CONNECTOR_MAX_WIDTH_M} m wide. Each one made joins ` +
      `the network for the next, and a room one already runs into or passes within ${ACCESS_M} m of is not given ` +
      "another. made lists each pathway's id, the rooms it reaches (roomIds, the one it runs to first) and its lengthM. " +
      `It makes at most ${MAX_CONNECTORS} a call: left says how many more another call would make. islands are the ` +
      "rooms no such run reaches, grouped by the floor they stand on: each with gapM, the straight gap from the " +
      `network (from) to their floor or outline (to), in metres. inside names the room of kind room an island's rooms each lie ` +
      `${CONTAINER_SHARE * 100}% or more inside, when there is one: a closed block traced round open floor. It is named ` +
      "only where opening it would help, and frees says how many of the island's rooms a connector would then reach: " +
      'open it with update, kind "area" and walkable true. Working that out costs a pass of the floor each, so it does ' +
      "at most four a call, those with most to free first: containersLeft says how many it had no time to try, and " +
      "their islands are named with no container at all. Open the ones it named and call it again for the rest — but " +
      "only when it named one, since a call that names none will name none the next time either. " +
      "The islands are measured from the connectors this call made. An island no container helps is a person's: " +
      "name it, with its rooms and gapM. preview true works it all out and makes nothing. " +
      "Every pathway made is on the setup's check step, with Undo. It counts as one change against the token's limit.",
    inputSchema: {
      floor: FLOOR,
      preview: z.boolean().default(false).describe("true: work it out and make nothing; made's ids are then empty."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, ({ floor, preview }) => runTool(ctx, async () => {
    const model = await assembleModel(ctx.db);
    const level = levelFor(ctx, model, floor);
    const ink = preview ? null : await planProbe(ctx, level.id);
    const found = (() => {
      try {
        return connectRooms(model, level.id, MAX_CONNECTORS, preview, ink);
      } catch (err) {
        if (err instanceof SurfaceTooLarge || err instanceof CannotConnect) throw new Refusal(`Nothing connected on ${level.code}. ${err.message}`);
        throw err;
      }
    })();
    const { ids, bridgeIds } = preview
      ? { ids: found.connectors.map(() => ""), bridgeIds: [] }
      : await makeConnectors(ctx, model, level, found.connectors, found.bridges);
    // While BRIDGES_ON is off there are none, and the reply says nothing about them: a field the
    // description does not explain is a field Claude would have to guess at.
    const bridges = found.bridges.map((b, k) => ({
      id: bridgeIds[k]!, from: b.from, to: b.to, toRoomId: b.toRoomId, toName: b.toName, lengthM: b.lengthM, openM: b.openM,
    }));
    return replyJson({
      levelId: level.id,
      made: found.connectors.map((c, k) => ({ id: ids[k]!, roomIds: c.roomIds, lengthM: c.lengthM })),
      ...(BRIDGES_ON ? { bridges } : {}),
      islands: found.islands,
      left: found.left,
      containersLeft: found.containersLeft,
    });
  }));
}
