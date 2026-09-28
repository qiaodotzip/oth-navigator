import type { MapModel } from "@oth/model";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { quadsGeometry } from "./blocks";
import { STRIP_HEIGHT_M, STRIP_OPACITY, pathwayStrips } from "./pathwayStrips";

export function Pathways({ model, levelId }: { model: MapModel; levelId: string }) {
  const strips = useMemo(
    () => pathwayStrips(model, levelId).map(s => ({ colour: s.colour, geometry: quadsGeometry(s.quads, STRIP_HEIGHT_M) })),
    [model, levelId],
  );
  useEffect(() => () => strips.forEach(s => s.geometry.dispose()), [strips]);
  return (
    <>
      {strips.map(s => (
        <mesh key={s.colour} geometry={s.geometry} receiveShadow>
          <meshStandardMaterial color={s.colour} transparent opacity={STRIP_OPACITY} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
    </>
  );
}
