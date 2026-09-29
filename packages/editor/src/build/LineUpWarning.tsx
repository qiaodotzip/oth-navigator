import type { ReactNode } from "react";
import type { LineUp } from "../api/client";

/** Rounded to 0.1 m, as words say it (contract v3). */
function round1(n: number): number {
  return Math.round(Math.abs(n) * 10) / 10;
}

/** "11.5 m east" / "0.4 m west": +x is east, the model's own coordinates. */
function eastWest(dx: number): string {
  return `${round1(dx)} m ${dx >= 0 ? "east" : "west"}`;
}

/** "4.6 m south" / "1.1 m north": +y is north. */
function northSouth(dy: number): string {
  return `${round1(dy)} m ${dy >= 0 ? "north" : "south"}`;
}

/**
 * Said on the Floorplan step and the rooms Claude step once a fresh plan's
 * drafts show it sits off the rooms already on the floor (contract v3), and
 * above Build's own drafts review. `alignWhere` says where Align actually is:
 * "this step" on the wizard's own Floorplan step (the default), where Align
 * is one of the step's tools; Build's drafts review names the Floorplan step
 * instead, since Align isn't on Areas & rooms.
 */
export function lineUpWords(lineUp: LineUp, floorCode: string, alignWhere = "this step"): string {
  return `The drawing sits about ${eastWest(lineUp.dx)} and ${northSouth(lineUp.dy)} of the rooms already on ${floorCode}. `
    + `Line it up with Align on ${alignWhere}, then run Find rooms again.`;
}

/**
 * Said on the Floorplan step before Find rooms has anything to go on: the
 * floor already has rooms for it to match, so line the plan up with them first.
 */
export function alreadyHasRoomsWords(floorCode: string, roomCount: number): string {
  return `${floorCode} already has ${roomCount} room${roomCount === 1 ? "" : "s"}: `
    + "line the plan up with them first (Align), so Find rooms can match them.";
}

/**
 * Said plainly on the Floorplan step once a fresh plan's drafts show it does
 * line up with the rooms already on the floor (contract v4 `linedUp`).
 */
export function linedUpWords(floorCode: string): string {
  return `The drawing lines up with ${floorCode}'s rooms.`;
}

/**
 * Said plainly on the Floorplan step once Find rooms has run on a floor with
 * rooms, and its drafts gave neither answer: too few of them pair with a room
 * to tell whether the drawing lines up, so the person looks before step 5,
 * where Claude decides the drafts.
 */
export function notCheckedWords(floorCode: string, roomCount: number): string {
  return `Couldn't check the drawing against ${floorCode}'s ${roomCount} room${roomCount === 1 ? "" : "s"}: look before step 5.`;
}

/**
 * Said, amber, on the Floorplan step once the plan has been added, moved or
 * rescaled since Find rooms ran on the floor: the drafts were found on the
 * plan as it was, so neither what they said about lining up nor any silence
 * holds for the plan as it is.
 */
export function planMovedWords(): string {
  return "The plan moved since Find rooms ran. Run Find rooms again to check it lines up.";
}

/** The amber line-up warning box, worded the same wherever it shows. */
export function LineUpWarning({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-yours/30 bg-yours-soft p-2 text-xs text-yours">
      <span aria-hidden className="font-semibold">! </span>
      {children}
    </p>
  );
}
