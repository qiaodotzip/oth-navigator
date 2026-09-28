import type { Level, Placement, Room } from "@oth/model";
import { Suspense } from "react";
import { modelToThree } from "./coords";
import { PlacementBoundary, PlacementMesh } from "./PlacementMesh";
import { RoomMesh } from "./RoomMesh";

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

export function LevelGroup({
  level, rooms, placements = [], assetUrl, ghosted = false, selectedId, onSelect,
}: {
  level: Level;
  rooms: Room[];
  placements?: Placement[];
  assetUrl?: (assetId: string) => string;
  ghosted?: boolean;
  selectedId?: string | null;
  onSelect?: (roomId: string) => void;
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
        />
      ))}
      {!ghosted && assetUrl && placements.map(p => (
        // Suspended and caught per placement: one asset failing to load must not blank the level.
        <PlacementBoundary key={p.id} url={assetUrl(p.assetId)}>
          <Suspense fallback={null}>
            <PlacementMesh placement={p} url={assetUrl(p.assetId)} />
          </Suspense>
        </PlacementBoundary>
      ))}
    </group>
  );
}
