import type { MapModel } from "@oth/model";
import { OrbitControls } from "@react-three/drei";
import { bboxOfRings } from "@oth/model";
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
  /** Resolves an asset id to a URL the renderer can fetch. */
  assetUrl?: (assetId: string) => string;
};

export function MapScene({
  model, activeLevelId, showLevelBelow = true, selectedId, onSelect, assetUrl,
}: MapSceneProps) {
  const { active, below } = useMemo(() => {
    const ordered = [...model.levels].sort((a, b) => a.ordinal - b.ordinal);
    const index = ordered.findIndex(l => l.id === activeLevelId);
    return { active: ordered[index] ?? null, below: index > 0 ? ordered[index - 1] : null };
  }, [model.levels, activeLevelId]);

  const roomsFor = (levelId: string) => model.rooms.filter(r => r.levelId === levelId);

  /**
   * Frame the level's geometry.
   *
   * A fixed camera aimed at the origin showed the building edge-on from
   * outside whenever the model did not happen to sit at (0,0) — which it never
   * does, since footprints are traced wherever the floorplan put them.
   */
  const view = useMemo(() => {
    const rings = active ? roomsFor(active.id).map(r => r.footprint) : [];
    if (rings.length === 0) {
      return { target: [0, 0, 0] as const, position: [60, 70, 60] as const };
    }
    const b = bboxOfRings(rings);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 10);
    const elevation = active?.elevationM ?? 0;
    return {
      target: [cx, elevation, -cy] as const,
      position: [cx + span * 0.8, elevation + span * 0.9, -cy + span * 0.8] as const,
    };
  }, [model.rooms, active]);

  return (
    <Canvas shadows camera={{ position: [...view.position], fov: 45 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[60, 120, 40]} intensity={1.1} castShadow />
      {showLevelBelow && below && (
        <LevelGroup level={below} rooms={roomsFor(below.id)} ghosted />
      )}
      {active && (
        <LevelGroup
          level={active}
          rooms={roomsFor(active.id)}
          placements={model.placements.filter(p => p.levelId === active.id)}
          assetUrl={assetUrl}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
      <OrbitControls makeDefault target={[...view.target]} />
    </Canvas>
  );
}
