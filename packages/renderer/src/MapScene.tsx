import type { MapModel } from "@oth/model";
import { OrbitControls } from "@react-three/drei";
import { bboxOfRings } from "@oth/model";
import { Canvas } from "@react-three/fiber";
import { useMemo, type ReactNode } from "react";
import { StructuredLevel } from "./StructuredLevel";

export type MapSceneProps = {
  model: MapModel;
  activeLevelId: string;
  /** Ghost the level below so vertical alignment is visible while authoring. */
  showLevelBelow?: boolean;
  selectedId?: string | null;
  onSelect?: (roomId: string) => void;
  /** Resolves an asset id to a URL the renderer can fetch. */
  assetUrl?: (assetId: string) => string;
  /** Walls at each room's full height rather than 1.2 m (Part D). */
  fullHeightWalls?: boolean;
  /**
   * More of the scene, drawn with the active level: room labels, and the
   * layers later parts add. Rendered inside the canvas, so three.js elements
   * and drei's helpers work here.
   */
  children?: ReactNode;
};

export function MapScene({
  model, activeLevelId, showLevelBelow = true, selectedId, onSelect, assetUrl, fullHeightWalls = false, children,
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
    <Canvas
      // R3F defaults to frameloop="always", which re-renders WebGL every
      // animation frame forever whether or not anything changed. For a static
      // preview that is a permanent 60fps shadow-map plus scene pass the moment
      // any geometry exists — measurably the only cost in the editor that grows
      // with room count. "demand" renders on React commits and on OrbitControls
      // interaction, which is all this panel ever needs.
      frameloop="demand"
      shadows
      camera={{ position: [...view.position], fov: 45 }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[60, 120, 40]} intensity={1.1} castShadow />
      {showLevelBelow && below && (
        <StructuredLevel model={model} level={below} ghosted fullHeightWalls={fullHeightWalls} />
      )}
      {active && (
        <StructuredLevel
          model={model}
          level={active}
          assetUrl={assetUrl}
          selectedId={selectedId}
          onSelect={onSelect}
          fullHeightWalls={fullHeightWalls}
        />
      )}
      {children}
      <OrbitControls makeDefault target={[...view.target]} />
    </Canvas>
  );
}
