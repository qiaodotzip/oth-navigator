import type { Level, ObjectKind, Placement, Room } from "@oth/model";
import { Suspense, type ReactNode } from "react";
import { modelToThree } from "./coords";
import { ObjectBoxMesh } from "./ObjectBoxMesh";
import { placementLook, type PlacementLook } from "./objectBox";
import { PlacementBoundary, PlacementMesh } from "./PlacementMesh";
import { RoomMesh, type RoomExtras } from "./RoomMesh";

/**
 * Which rooms draw geometry of their own.
 *
 * A detail's block is a placeholder for a mesh that does not exist yet. Once
 * one is placed on it the block would sit inside the vending machines, so it
 * stops being drawn. A room is never replaced by the furniture standing in it.
 */
export function roomsToDraw(
  rooms: readonly Room[],
  placements: readonly Placement[],
): Room[] {
  const dressed = new Set(placements.map(p => p.roomId));
  return rooms.filter(r => r.kind !== "detail" || !dressed.has(r.id));
}

const NO_KINDS: readonly ObjectKind[] = [];

/**
 * One placement, as `placementLook` says: its model, suspended and caught on
 * its own so one failing file cannot blank the level, or its kind's box. An
 * object shows its box while its model loads, and in place of one that will
 * not.
 */
function Placed({ placement, look, assetUrl }: {
  placement: Placement;
  look: PlacementLook;
  assetUrl?: (assetId: string) => string;
}) {
  const boxed = look.as === "box" ? look : look.as === "model" ? look.box : null;
  const box = boxed ? <ObjectBoxMesh placement={placement} size={boxed.size} name={boxed.name} /> : null;
  if (look.as !== "model" || !assetUrl) return box;
  const url = assetUrl(look.assetId);
  return (
    <PlacementBoundary url={url} fallback={box}>
      <Suspense fallback={box}>
        <PlacementMesh placement={placement} url={url} />
      </Suspense>
    </PlacementBoundary>
  );
}

export function LevelGroup({
  level, rooms, placements = [], assetUrl, ghosted = false, selectedId, onSelect, roomExtras, objectKinds = NO_KINDS, children,
}: {
  level: Level;
  rooms: Room[];
  placements?: Placement[];
  assetUrl?: (assetId: string) => string;
  ghosted?: boolean;
  selectedId?: string | null;
  onSelect?: (roomId: string) => void;
  /** Per-room changes from the level's structure (Part D). */
  roomExtras?: (room: Room) => RoomExtras;
  /** The model's kinds of object, which say how each object is drawn. */
  objectKinds?: readonly ObjectKind[];
  /** Drawn inside the level, so it stands at the level's elevation. */
  children?: ReactNode;
}) {
  // The level's elevation is applied once, here, rather than baked per room.
  const [x, y, z] = modelToThree(0, 0, level.elevationM);

  return (
    <group position={[x, y, z]}>
      {roomsToDraw(rooms, placements).map(room => (
        <RoomMesh
          key={room.id}
          room={room}
          ghosted={ghosted}
          selected={selectedId === room.id}
          onSelect={ghosted ? undefined : onSelect}
          {...(roomExtras ? roomExtras(room) : {})}
        />
      ))}
      {!ghosted && placements.map(p => (
        <Placed key={p.id} placement={p} look={placementLook(p, objectKinds)} assetUrl={assetUrl} />
      ))}
      {children}
    </group>
  );
}
