import { useMemo } from "react";
import * as THREE from "three";

function makeFloorTexture(): THREE.Texture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  // Warm base
  ctx.fillStyle = "#E7E0D0";
  ctx.fillRect(0, 0, size, size);
  // Subtle speckle for texture
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.04)";
    ctx.fillRect(x, y, 2, 2);
  }
  // Tile grid lines
  ctx.strokeStyle = "rgba(120,110,90,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(70, 70); // ~3m tiles across the 210m floor
  tex.anisotropy = 4;
  return tex;
}

export function GroundPlane() {
  const tex = useMemo(makeFloorTexture, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
      <planeGeometry args={[600, 600]} />
      <meshStandardMaterial map={tex} color="#F4F0E6" />
    </mesh>
  );
}
