import type { Room, RoomKind } from "@oth/model";
import type * as THREE from "three";
import type { Block } from "./blocks";
import { roomGeometry } from "./geometry";
import { massingOf } from "./massing";
import { wallTop } from "./structure";
import { roomColor } from "./theme";
import { BALUSTRADE_HEIGHT_M, type Rail } from "./voids";
import type { WallPiece } from "./wallPlan";

/*
 * The pieces of one level as the preview builds them, as plain functions, so
 * the 3D export (export/floorGlb.ts) builds exactly what the preview shows
 * rather than a copy that drifts from it.
 */

const NO_HOLES: Room["holes"] = [];

/**
 * A room's floor: its slab with the level's voids cut out of it, or a
 * detail's whole solid block, since `massingOf` says a detail builds its
 * full height.
 */
export function roomFloorGeometry(room: Room, extraHoles: Room["holes"] = NO_HOLES): THREE.ExtrudeGeometry {
  return roomGeometry(
    extraHoles.length > 0 ? { ...room, holes: [...room.holes, ...extraHoles] } : room,
    massingOf(room) === "solid" ? { slabHeightM: room.heightM } : {},
  );
}

/** A floor's colour: its place's tint, unless the room is selected or on the ghosted floor below. */
export function floorColour(
  kind: RoomKind,
  opts: { tint?: string; selected?: boolean; ghosted?: boolean } = {},
): string {
  return opts.tint && !opts.selected && !opts.ghosted ? opts.tint : roomColor(kind, opts);
}

/** A wall standing on the floor: 1.2 m high, or at full height as tall as the taller room it encloses. */
export function wallBlock(piece: WallPiece, heights: ReadonlyMap<string, number>, fullHeight: boolean): Block {
  return { a: piece.a, b: piece.b, thicknessM: piece.thicknessM, baseM: 0, topM: wallTop(piece, heights, fullHeight) };
}

/** A void's balustrade standing on the floor. */
export function railBlock(rail: Rail): Block {
  return { a: rail.a, b: rail.b, thicknessM: rail.thicknessM, baseM: 0, topM: BALUSTRADE_HEIGHT_M };
}
