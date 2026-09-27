import type { Room, RoomKind } from "@oth/model";
import { SLAB_HEIGHT_M } from "./geometry";

/**
 * How much of its height a space actually builds.
 *
 * Every room used to render as a 12 cm slab, on the theory that volume would
 * arrive later as modelled assets. Until it does, a floor reads as a floor
 * plan lying on the ground — you cannot tell a toilet from a plant room from
 * a concourse, because all three are the same paving. So each kind now builds
 * what it is:
 *
 * - `room` and `service` are enclosed, so they raise a shell: a floor with
 *   walls around its boundary and nothing on top. Open above, because a lid
 *   would hide the space from the only angle anybody looks from.
 * - `detail` is a solid object standing on the floor — a column, a bench, a
 *   bank of vending machines — so it extrudes solid to its own height.
 * - `area` is floor you walk across. It stays a slab, which is the whole
 *   distinction between crossing a space and arriving in one.
 * - `void` is a hole and builds nothing.
 */
export type Massing = "shell" | "solid" | "slab" | "none";

export const MASSING: Record<RoomKind, Massing> = {
  room: "shell",
  service: "shell",
  detail: "solid",
  area: "slab",
  void: "none",
};

/** Thin enough to read as a partition, thick enough to catch the light. */
export const WALL_THICKNESS_M = 0.15;

export function massingOf(room: Room): Massing {
  return MASSING[room.kind];
}

/**
 * How tall this room's geometry stands.
 *
 * A slab is the floor itself. Anything else uses the room's own height, which
 * is a measurement when somebody has taken one and a placeholder otherwise.
 */
export function massingHeight(room: Room): number {
  return massingOf(room) === "slab" ? SLAB_HEIGHT_M : room.heightM;
}
