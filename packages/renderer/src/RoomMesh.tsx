import type { Room } from "@oth/model";
import { useMemo } from "react";
import { roomGeometry } from "./geometry";
import { massingOf, WALL_THICKNESS_M } from "./massing";
import { shellWalls } from "./shell";
import { roomColor, wallColor } from "./theme";

export function RoomMesh({
  room, selected = false, ghosted = false, onSelect,
}: {
  room: Room;
  selected?: boolean;
  ghosted?: boolean;
  onSelect?: (roomId: string) => void;
}) {
  const massing = massingOf(room);
  // A solid builds its whole height in one extrusion; everything else gets a
  // floor, and a shell gets walls standing on it.
  const floor = useMemo(
    () => roomGeometry(room, massing === "solid" ? { slabHeightM: room.heightM } : {}),
    [room, massing],
  );
  const walls = useMemo(
    () => (massing === "shell"
      ? shellWalls(room, { thicknessM: WALL_THICKNESS_M })
      : null),
    [room, massing],
  );

  if (massing === "none") return null;

  const select = onSelect
    ? (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onSelect(room.id);
    }
    : undefined;

  return (
    <group>
      <mesh geometry={floor} castShadow receiveShadow onClick={select}>
        <meshStandardMaterial
          color={roomColor(room.kind, { selected, ghosted })}
          transparent={ghosted}
          opacity={ghosted ? 0.35 : 1}
        />
      </mesh>
      {walls && (
        <mesh geometry={walls} castShadow receiveShadow onClick={select}>
          <meshStandardMaterial
            color={selected ? roomColor(room.kind, { selected }) : wallColor(room.kind, { ghosted })}
            transparent={ghosted}
            opacity={ghosted ? 0.25 : 1}
          />
        </mesh>
      )}
    </group>
  );
}
