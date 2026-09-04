import type { Level, Room } from "@oth/model";
import { modelToThree } from "./coords";
import { RoomMesh } from "./RoomMesh";

export function LevelGroup({
  level, rooms, ghosted = false, selectedId, onSelect,
}: {
  level: Level;
  rooms: Room[];
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
    </group>
  );
}
