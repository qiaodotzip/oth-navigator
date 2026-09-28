import { live, type Level, type MapModel, type Room } from "@oth/model";
import { useCallback, useMemo } from "react";
import { roomTints } from "./categoryTint";
import { LevelGroup } from "./LevelGroup";
import { Markers } from "./MarkerMesh";
import { Pathways } from "./Pathways";
import { Portals } from "./PortalMesh";
import type { RoomExtras } from "./RoomMesh";
import { levelStructure } from "./structure";
import { StructureMesh } from "./StructureMesh";

/**
 * One level as Part D builds it: the rooms' floors from `LevelGroup`, with
 * the level's merged and opened walls in place of each room's own shell.
 * The active level also shows its pathways, its entrances and lift stops,
 * and each bound room in its category's tint. The ghosted level below gets
 * none of these: it is only there for lining up. Both levels build their
 * lift shafts and flights, since the flights on the floor below are what
 * show where its escalators and stairs arrive on this one.
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
  const objectKinds = useMemo(() => live(model.objectKinds), [model.objectKinds]);
  const structure = useMemo(() => levelStructure(model, level.id), [model, level.id]);
  const tints = useMemo(() => roomTints(model, level.id), [model, level.id]);
  const roomExtras = useCallback(
    (room: Room): RoomExtras => ({
      ownWalls: false,
      extraHoles: structure.holesByRoom.get(room.id),
      tint: ghosted ? undefined : tints.get(room.id),
    }),
    [structure, tints, ghosted],
  );

  return (
    <LevelGroup
      level={level}
      rooms={rooms}
      placements={placements}
      objectKinds={objectKinds}
      assetUrl={assetUrl}
      ghosted={ghosted}
      selectedId={selectedId}
      onSelect={onSelect}
      roomExtras={roomExtras}
    >
      <StructureMesh structure={structure} fullHeight={fullHeightWalls} ghosted={ghosted} selectedId={selectedId ?? null} />
      <Portals model={model} levelId={level.id} ghosted={ghosted} />
      {!ghosted && <Pathways model={model} levelId={level.id} />}
      {!ghosted && <Markers model={model} levelId={level.id} />}
    </LevelGroup>
  );
}
