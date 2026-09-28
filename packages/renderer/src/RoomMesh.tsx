import type { Room } from "@oth/model";
import { useMemo } from "react";
import { floorColour, roomFloorGeometry } from "./levelParts";
import { massingOf, WALL_THICKNESS_M } from "./massing";
import { shellWalls } from "./shell";
import { roomColor, wallColor } from "./theme";

/**
 * What the level's structure changes about one room (Part D). Each field is
 * optional, and absent means "as before", so a caller passing none gets the
 * old closed box.
 */
export type RoomExtras = {
  /** False when the level draws merged walls with doorways instead of this room's own shell. */
  ownWalls?: boolean;
  /** Voids cut out of this room's floor. */
  extraHoles?: Room["holes"];
  /** Its bound place's category colour. */
  tint?: string;
};

const NO_HOLES: Room["holes"] = [];

export function RoomMesh({
  room, selected = false, ghosted = false, onSelect, ownWalls = true, extraHoles = NO_HOLES, tint,
}: {
  room: Room;
  selected?: boolean;
  ghosted?: boolean;
  onSelect?: (roomId: string) => void;
} & RoomExtras) {
  const massing = massingOf(room);
  // A solid builds its whole height in one extrusion; everything else gets a
  // floor, and a shell gets walls standing on it.
  const floor = useMemo(() => roomFloorGeometry(room, extraHoles), [room, extraHoles]);
  const walls = useMemo(
    () => (massing === "shell" && ownWalls
      ? shellWalls(room, { thicknessM: WALL_THICKNESS_M })
      : null),
    [room, massing, ownWalls],
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
          color={floorColour(room.kind, { tint, selected, ghosted })}
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
