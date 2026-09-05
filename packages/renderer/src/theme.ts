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
  service: "#d3d3cc",
  void: "#9aa0a6",
};

const SELECTED = "#f2a33c";
const GHOSTED = "#d8d8d4";

export function roomColor(
  kind: RoomKind,
  opts: { selected?: boolean; ghosted?: boolean } = {},
): string {
  if (opts.selected) return SELECTED;
  if (opts.ghosted) return GHOSTED;
  return BASE[kind];
}
