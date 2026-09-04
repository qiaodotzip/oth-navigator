import type { Room } from "@oth/model";
import { useMemo } from "react";
import { roomGeometry } from "./geometry";
import { roomColor } from "./theme";

export function RoomMesh({
  room, selected = false, ghosted = false, onSelect,
}: {
  room: Room;
  selected?: boolean;
  ghosted?: boolean;
  onSelect?: (roomId: string) => void;
}) {
  const geometry = useMemo(() => roomGeometry(room), [room]);

  return (
    <mesh
      geometry={geometry}
      castShadow
      receiveShadow
      onClick={event => {
        if (!onSelect) return;
        event.stopPropagation();
        onSelect(room.id);
      }}
    >
      <meshStandardMaterial
        color={roomColor(room.kind, { selected, ghosted })}
        transparent={ghosted}
        opacity={ghosted ? 0.35 : 1}
      />
    </mesh>
  );
}
