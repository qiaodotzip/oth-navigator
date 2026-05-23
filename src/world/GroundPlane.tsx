import { useMemo } from "react";
import * as THREE from "three";

function makeFloorTexture(): THREE.Texture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  // Light grey base
  ctx.fillStyle = "#DEE1E4";
  ctx.fillRect(0, 0, size, size);
  // Subtle speckle for texture
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = Math.random() > 0.5 ? "rgba(0,0,0,0.025)" : "rgba(255,255,255,0.06)";
    ctx.fillRect(x, y, 2, 2);
  }
  // Tile grid lines
  ctx.strokeStyle = "rgba(140,148,156,0.22)";
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
      <meshStandardMaterial map={tex} color="#EDEFF1" />
    </mesh>
  );
}
