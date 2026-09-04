import type { RoomKind } from "@oth/model";

/**
 * A restrained, legible palette. The visual target is "recognise where you are",
 * so structure reads as calm background and the dressing layer plus the route
 * carry attention. Corridors are deliberately distinct from rooms because that
 * is the distinction people navigate by.
 */
const BASE: Record<RoomKind, string> = {
  room: "#e7ddc7",
  corridor: "#cfc3a5",
  atrium: "#f0e8d6",
  service: "#d3d3cc",
  outdoor: "#cfe0c3",
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
