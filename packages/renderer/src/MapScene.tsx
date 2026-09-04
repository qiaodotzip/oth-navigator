import type { MapModel } from "@oth/model";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { LevelGroup } from "./LevelGroup";

export type MapSceneProps = {
  model: MapModel;
  activeLevelId: string;
  /** Ghost the level below so vertical alignment is visible while authoring. */
  showLevelBelow?: boolean;
  selectedId?: string | null;
  onSelect?: (roomId: string) => void;
};

export function MapScene({
  model, activeLevelId, showLevelBelow = true, selectedId, onSelect,
}: MapSceneProps) {
  const { active, below } = useMemo(() => {
    const ordered = [...model.levels].sort((a, b) => a.ordinal - b.ordinal);
    const index = ordered.findIndex(l => l.id === activeLevelId);
    return { active: ordered[index] ?? null, below: index > 0 ? ordered[index - 1] : null };
  }, [model.levels, activeLevelId]);

  const roomsFor = (levelId: string) => model.rooms.filter(r => r.levelId === levelId);

  return (
    <Canvas shadows camera={{ position: [80, 90, 80], fov: 45 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[60, 120, 40]} intensity={1.1} castShadow />
      {showLevelBelow && below && (
        <LevelGroup level={below} rooms={roomsFor(below.id)} ghosted />
      )}
      {active && (
        <LevelGroup
          level={active}
          rooms={roomsFor(active.id)}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
      <OrbitControls makeDefault />
    </Canvas>
  );
}
