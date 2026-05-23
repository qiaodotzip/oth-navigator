import { useMemo } from "react";
import * as THREE from "three";

const TILE_M = 2.5; // metres per tile

function makeFloorTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(0,0,0,0.02)" : "rgba(0,0,0,0.04)";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.strokeStyle = "rgba(120,128,138,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function GroundPlane({
  width,
  depth,
  color = "#FAFBFC",
}: {
  width: number;
  depth: number;
  color?: string;
}) {
  // Plane snug to the floor footprint plus a small margin; fog fades the edge.
  const w = width + 24;
  const d = depth + 24;
  const tex = useMemo(() => {
    const t = makeFloorTexture();
    t.repeat.set(w / TILE_M, d / TILE_M);
    return t;
  }, [w, d]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={tex} color={color} />
    </mesh>
  );
}
