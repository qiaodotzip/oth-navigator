import { live, type Level, type MapModel, type Room } from "@oth/model";
import { useCallback, useMemo } from "react";
import { LevelGroup } from "./LevelGroup";
import type { RoomExtras } from "./RoomMesh";
import { levelStructure } from "./structure";
import { StructureMesh } from "./StructureMesh";

/**
 * One level as Part D builds it: the rooms' floors from `LevelGroup`, with
 * the level's merged and opened walls in place of each room's own shell.
 */
export function StructuredLevel({
  model, level, ghosted = false, fullHeightWalls = false, selectedId, onSelect, assetUrl,
}: {
  model: MapModel;
  level: Level;
  ghosted?: boolean;
  fullHeightWalls?: boolean;
  selectedId?: string | null;
  onSelect?: (roomId: string) => void;
  assetUrl?: (assetId: string) => string;
}) {
  const rooms = useMemo(() => live(model.rooms).filter(r => r.levelId === level.id), [model.rooms, level.id]);
  const placements = useMemo(
    () => (ghosted ? [] : live(model.placements).filter(p => p.levelId === level.id)),
    [model.placements, level.id, ghosted],
  );
  const structure = useMemo(() => levelStructure(model, level.id), [model, level.id]);
  const roomExtras = useCallback(
    (room: Room): RoomExtras => ({ ownWalls: false, extraHoles: structure.holesByRoom.get(room.id) }),
    [structure],
  );

  return (
    <LevelGroup
      level={level}
      rooms={rooms}
      placements={placements}
      assetUrl={assetUrl}
      ghosted={ghosted}
      selectedId={selectedId}
      onSelect={onSelect}
      roomExtras={roomExtras}
    >
      <StructureMesh structure={structure} fullHeight={fullHeightWalls} ghosted={ghosted} selectedId={selectedId ?? null} />
    </LevelGroup>
  );
}
