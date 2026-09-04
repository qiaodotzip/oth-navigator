import type { Level, Placement, Room } from "@oth/model";
import { Suspense } from "react";
import { modelToThree } from "./coords";
import { PlacementMesh } from "./PlacementMesh";
import { RoomMesh } from "./RoomMesh";

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
      {rooms.map(room => (
        <RoomMesh
          key={room.id}
          room={room}
          ghosted={ghosted}
          selected={selectedId === room.id}
          onSelect={ghosted ? undefined : onSelect}
        />
      ))}
      {!ghosted && assetUrl && placements.map(p => (
        // Suspended per placement: one asset failing to load must not blank the level.
        <Suspense key={p.id} fallback={null}>
          <PlacementMesh placement={p} url={assetUrl(p.assetId)} />
        </Suspense>
      ))}
    </group>
  );
}
