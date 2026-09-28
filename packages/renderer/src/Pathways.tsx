import type { MapModel } from "@oth/model";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { quadsGeometry } from "./blocks";
import { SLAB_HEIGHT_M } from "./geometry";
import { pathwayStrips } from "./pathwayStrips";

/** Just above the floor slabs, so a strip is never lost in them. */
const STRIP_HEIGHT_M = SLAB_HEIGHT_M + 0.02;

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
          <meshStandardMaterial color={s.colour} transparent opacity={0.7} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
    </>
  );
}
