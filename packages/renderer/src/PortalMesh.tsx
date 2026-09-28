import type { MapModel } from "@oth/model";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { blocksGeometry } from "./blocks";
import { portalParts, shaftBlocks } from "./portals";

const SHAFT_COLOUR = "#7c93b5";
const ESCALATOR_COLOUR = "#8d99a6";
const STAIR_COLOUR = "#b9ae96";

/**
 * A level's lift shafts and the flights that climb from it.
 * The file is not `Portals.tsx`: on a case-insensitive disk that and
 * `portals.ts` are one import, as `Markers.tsx` and `markers.ts` were.
 *
 * A flight's top step is level with the floor it arrives on, so where that
 * floor's slab reaches over it the two faces lie in one plane. The flights
 * are pulled forward in depth to win there, as the selected walls are.
 */
export function Portals({ model, levelId, ghosted = false }: { model: MapModel; levelId: string; ghosted?: boolean }) {
  const parts = useMemo(() => portalParts(model, levelId), [model, levelId]);
  const geometries = useMemo(() => ({
    shafts: blocksGeometry(parts.shafts.flatMap(shaftBlocks)),
    escalators: blocksGeometry(parts.flights.filter(f => f.kind === "escalator").flatMap(f => f.steps)),
    stairs: blocksGeometry(parts.flights.filter(f => f.kind !== "escalator").flatMap(f => f.steps)),
  }), [parts]);
  useEffect(() => () => Object.values(geometries).forEach(g => g.dispose()), [geometries]);

  return (
    <group>
      <mesh geometry={geometries.shafts}>
        <meshStandardMaterial color={SHAFT_COLOUR} transparent opacity={ghosted ? 0.2 : 0.45} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh geometry={geometries.escalators} castShadow receiveShadow>
        <meshStandardMaterial
          color={ESCALATOR_COLOUR} transparent={ghosted} opacity={ghosted ? 0.35 : 1} side={THREE.DoubleSide}
          polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh geometry={geometries.stairs} castShadow receiveShadow>
        <meshStandardMaterial
          color={STAIR_COLOUR} transparent={ghosted} opacity={ghosted ? 0.35 : 1} side={THREE.DoubleSide}
          polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1}
        />
      </mesh>
    </group>
  );
}
