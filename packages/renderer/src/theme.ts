import type { RoomKind } from "@oth/model";

/**
 * A restrained, legible palette. The visual target is "recognise where you are",
 * so structure reads as calm background and the dressing layer plus the route
 * carry attention. Areas are deliberately distinct from rooms: one is space you
 * cross, the other somewhere you arrive.
 */
const BASE: Record<RoomKind, string> = {
  // A destination reads as a solid block; an area reads as open floor you cross.
  room: "#e7ddc7",
  area: "#f0e8d6",
  // Reads as an object standing on a floor rather than a piece of floor.
  detail: "#c8bfa8",
  service: "#d3d3cc",
  void: "#9aa0a6",
};

/**
 * Walls sit a shade darker than the floor they stand on.
 *
 * Same hue rather than a contrasting one: the wall is the same material seen
 * edge-on, and the shading does the separating. A second colour here turns
 * every room into a diagram.
 */
const WALLS: Record<RoomKind, string> = {
  room: "#cdc0a3",
  area: "#cdc0a3",
  detail: "#b4a98f",
  service: "#bcbcb2",
  void: "#8b9197",
};

const SELECTED = "#f2a33c";
const GHOSTED = "#d8d8d4";

export function wallColor(
  kind: RoomKind,
  opts: { ghosted?: boolean } = {},
): string {
  return opts.ghosted ? GHOSTED : WALLS[kind];
}

export function roomColor(
  kind: RoomKind,
  opts: { selected?: boolean; ghosted?: boolean } = {},
): string {
  if (opts.selected) return SELECTED;
  if (opts.ghosted) return GHOSTED;
  return BASE[kind];
}
