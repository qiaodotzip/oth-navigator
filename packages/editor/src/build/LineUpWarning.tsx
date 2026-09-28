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
 * above Build's own drafts review, in the same words everywhere.
 */
export function lineUpWords(lineUp: LineUp, floorCode: string): string {
  return `The drawing sits about ${eastWest(lineUp.dx)} and ${northSouth(lineUp.dy)} of the rooms already on ${floorCode}. `
    + "Line it up with Align on this step, then run Find rooms again.";
}

/**
 * Said on the Floorplan step before Find rooms has anything to go on: the
 * floor already has rooms for it to match, so line the plan up with them first.
 */
export function alreadyHasRoomsWords(floorCode: string, roomCount: number): string {
  return `${floorCode} already has ${roomCount} room${roomCount === 1 ? "" : "s"}: `
    + "line the plan up with them first (Align), so Find rooms can match them.";
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
