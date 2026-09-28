import type { Node as GltfNode, Scene } from "@gltf-transform/core";
import { live, type Level, type MapModel, type Room } from "@oth/model";
import { blocksGeometry, quadsGeometry, type Block } from "../blocks";
import { CATEGORY_TINT, roomTints } from "../categoryTint";
import { CONTEXT_ORIGIN_NOTE } from "../contextExport";
import { modelToThree } from "../coords";
import { roomsToDraw } from "../LevelGroup";
import { floorColour, railBlock, roomFloorGeometry, wallBlock } from "../levelParts";
import { massingOf } from "../massing";
import { STRIP_HEIGHT_M, STRIP_OPACITY, pathwayColour, stripQuads } from "../pathwayStrips";
import { PORTAL_COLOUR, SHAFT_OPACITY, flightColour, portalParts, shaftBlocks } from "../portals";
import { levelStructure, type LevelStructure } from "../structure";
import { wallColor } from "../theme";
import { BALUSTRADE_COLOUR, BALUSTRADE_OPACITY } from "../voids";
import { GlbWriter, type Paint } from "./gltfWrite";

/** A placed model's bytes, fetched through the asset URL; null when it can't be had. */
export type AssetBytes = (assetId: string) => Promise<Uint8Array | null>;

/** The parts of a floor, in the order the file lists them (spec §6). */
export const FLOOR_GROUPS = ["Floors", "Walls", "Voids", "Stops", "Objects", "Pathways"] as const;
export type FloorGroup = (typeof FLOOR_GROUPS)[number];

/** Said in the file, and after the download, when it holds more than one floor. */
export const STACKED_NOTE = "Each floor stands at its elevation above the building datum.";

/** What the file says about itself (spec §6): the context export's origin note, and the stacking when there is any. */
export function floorExportNote(stacked: boolean): string {
  return stacked ? `${CONTEXT_ORIGIN_NOTE} ${STACKED_NOTE}` : CONTEXT_ORIGIN_NOTE;
}

/** A thing's name in the file: its English name, or its id when it has none. */
function label(name: string, id: string): string {
  return name.trim() || id;
}

const TINT_CATEGORY = new Map(Object.entries(CATEGORY_TINT).map(([category, hex]) => [hex, category]));

/** Everything one floor's builders need. */
type FloorContext = {
  writer: GlbWriter;
  model: MapModel;
  level: Level;
  /** The floor's live rooms. */
  rooms: Room[];
  /** Each of those rooms' names in the file. */
  roomNames: ReadonlyMap<string, string>;
  structure: LevelStructure;
  groups: Record<FloorGroup, GltfNode>;
};

/**
 * A floor's node, raised to its elevation when the file holds several floors
 * (spec §6) and at floor level when it's alone, as the context export was,
 * with its six groups under it in the spec's order.
 */
function floorContext(writer: GlbWriter, scene: Scene, model: MapModel, level: Level, stacked: boolean): FloorContext {
  const floor = writer.doc.createNode(level.code)
    .setTranslation(stacked ? modelToThree(0, 0, level.elevationM) : [0, 0, 0])
    .setExtras({ othId: level.id, elevationM: level.elevationM });
  scene.addChild(floor);
  const groups = Object.fromEntries(FLOOR_GROUPS.map(name => {
    const node = writer.doc.createNode(name);
    floor.addChild(node);
    return [name, node];
  })) as Record<FloorGroup, GltfNode>;
  const rooms = live(model.rooms).filter(r => r.levelId === level.id);
  return {
    writer, model, level, rooms, groups,
    roomNames: new Map(rooms.map(r => [r.id, label(r.nameEn, r.id)])),
    structure: levelStructure(model, level.id),
  };
}

const WALL_PAINT: Paint = { name: "wall", colour: wallColor("room"), doubleSided: true };
const BALUSTRADE_PAINT: Paint = { name: "balustrade", colour: BALUSTRADE_COLOUR, opacity: BALUSTRADE_OPACITY, doubleSided: true };

/**
 * Walls: Plan 5D's merged walls with their doors cut, always at full height
 * (spec §6). One mesh per room, and one per pair of rooms sharing a wall, so
 * a modeller can hide one shop's walls.
 */
function addWalls(ctx: FloorContext): void {
  const byRooms = new Map<string, { rooms: string[]; blocks: Block[] }>();
  for (const piece of ctx.structure.walls) {
    const rooms = [...piece.rooms].sort();
    const key = rooms.join("|");
    const entry = byRooms.get(key) ?? { rooms, blocks: [] };
    entry.blocks.push(wallBlock(piece, ctx.structure.heightByRoom, true));
    byRooms.set(key, entry);
  }
  for (const { rooms, blocks } of byRooms.values()) {
    const name = rooms.map(id => ctx.roomNames.get(id) ?? id).join(" / ");
    const node = ctx.writer.mesh(name, blocksGeometry(blocks), WALL_PAINT);
    if (node) ctx.groups.Walls.addChild(node.setExtras({ rooms }));
  }
}

/** Voids: each void's balustrade, named after the void. A void that cuts no floor has none (Plan 5D). */
function addVoids(ctx: FloorContext): void {
  const byVoid = new Map<string, Block[]>();
  for (const rail of ctx.structure.balustrades) {
    const id = rail.rooms[0] ?? "void";
    byVoid.set(id, [...(byVoid.get(id) ?? []), railBlock(rail)]);
  }
  for (const [id, blocks] of byVoid) {
    const node = ctx.writer.mesh(ctx.roomNames.get(id) ?? id, blocksGeometry(blocks), BALUSTRADE_PAINT);
    if (node) ctx.groups.Voids.addChild(node.setExtras({ othId: id }));
  }
}

const SHAFT_PAINT: Paint = { name: "lift shaft", colour: PORTAL_COLOUR.shaft, opacity: SHAFT_OPACITY, doubleSided: true };

/** Stops: each lift's shaft on this floor, and each flight that climbs from it, named after its portal (Plan 5D). */
function addStops(ctx: FloorContext): void {
  const portals = new Map(live(ctx.model.portals).map(p => [p.id, p]));
  const name = (portalId: string) => {
    const portal = portals.get(portalId);
    return portal ? label(portal.nameEn, portal.id) : portalId;
  };
  const { shafts, flights } = portalParts(ctx.model, ctx.level.id);
  for (const shaft of shafts) {
    const node = ctx.writer.mesh(name(shaft.portalId), blocksGeometry(shaftBlocks(shaft)), SHAFT_PAINT);
    if (node) ctx.groups.Stops.addChild(node.setExtras({ othId: shaft.portalId, kind: "lift" }));
  }
  for (const flight of flights) {
    const paint: Paint = { name: flight.kind, colour: flightColour(flight.kind), doubleSided: true };
    const node = ctx.writer.mesh(name(flight.portalId), blocksGeometry(flight.steps), paint);
    if (node) ctx.groups.Stops.addChild(node.setExtras({ othId: flight.portalId, kind: flight.kind }));
  }
}

/** Pathways: one strip per pathway, in its kind's colour, just above the slabs. */
function addPathways(ctx: FloorContext): void {
  const kinds = live(ctx.model.pathwayKinds);
  for (const pathway of live(ctx.model.pathways)) {
    if (pathway.levelId !== ctx.level.id) continue;
    const quads = stripQuads(pathway.polyline, pathway.widthM);
    if (quads.length === 0) continue;
    const kind = kinds.find(k => k.id === pathway.kindId);
    const paint: Paint = {
      name: kind ? kind.nameEn : "pathway",
      colour: pathwayColour(pathway, kinds),
      opacity: STRIP_OPACITY,
      doubleSided: true,
    };
    const node = ctx.writer.mesh(label(pathway.nameEn, pathway.id), quadsGeometry(quads, STRIP_HEIGHT_M), paint);
    if (node) ctx.groups.Pathways.addChild(node.setExtras({ othId: pathway.id, widthM: pathway.widthM }));
  }
}

/** Floors: one mesh per room the preview draws, with its voids cut, tinted as the preview tints it. */
function addFloors(ctx: FloorContext): void {
  const placements = live(ctx.model.placements).filter(p => p.levelId === ctx.level.id);
  const tints = roomTints(ctx.model, ctx.level.id);
  for (const room of roomsToDraw(ctx.rooms, placements)) {
    if (massingOf(room) === "none") continue;
    const tint = tints.get(room.id);
    const paint: Paint = {
      name: (tint && TINT_CATEGORY.get(tint)) || room.kind,
      colour: floorColour(room.kind, { tint }),
    };
    const geometry = roomFloorGeometry(room, ctx.structure.holesByRoom.get(room.id));
    const node = ctx.writer.mesh(ctx.roomNames.get(room.id) ?? room.id, geometry, paint);
    if (node) ctx.groups.Floors.addChild(node.setExtras({ othId: room.id, kind: room.kind }));
  }
}

/**
 * The floors asked for, as one .glb of named parts (spec §6), built from the
 * preview's own geometry. Floors come out lowest first; ids of deleted or
 * unknown floors are skipped.
 */
export async function buildFloorGlb(
  model: MapModel,
  levelIds: string[],
  // Used by the Objects group, which comes with Plan 6A (Task 8).
  _assetBytes: AssetBytes,
): Promise<Uint8Array> {
  const wanted = new Set(levelIds);
  const levels = live(model.levels).filter(l => wanted.has(l.id)).sort((a, b) => a.ordinal - b.ordinal);
  const stacked = levels.length > 1;
  const writer = new GlbWriter();
  const scene = writer.doc.createScene(model.building.id);
  writer.doc.getRoot().setDefaultScene(scene);
  for (const level of levels) {
    const ctx = floorContext(writer, scene, model, level, stacked);
    addFloors(ctx);
    addWalls(ctx);
    addVoids(ctx);
    addStops(ctx);
    addPathways(ctx);
  }
  writer.setNote(floorExportNote(stacked), { floors: levels.map(l => l.code) });
  return writer.write();
}
