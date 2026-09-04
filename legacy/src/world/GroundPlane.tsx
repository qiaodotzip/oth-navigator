import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useStore } from "@/store";

function makeFloorTexture(): THREE.Texture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  // Slightly off-white tile face so the grout lines read clearly.
  ctx.fillStyle = "#F3F4F6";
  ctx.fillRect(0, 0, size, size);
  // Inset darker grout border (one tile per texture repeat).
  ctx.strokeStyle = "rgba(90,100,112,0.40)";
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, size, size);
  // Faint inner highlight for a polished look.
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, size - 16, size - 16);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function GroundPlane({
  width,
  depth,
  centerX = 0,
  centerZ = 0,
  margin = 14,
  color = "#FAFBFC",
  tiled = true,
}: {
  width: number;
  depth: number;
  centerX?: number;
  centerZ?: number;
  margin?: number;
  color?: string;
  /** When false, render a plain solid surface with no grout-line tile texture. */
  tiled?: boolean;
}) {
  const tileSizeM = useStore(s => s.tileSizeM);
  // Plane snug to the building footprint plus a small margin; fog fades the edge.
  const w = width + margin * 2;
  const d = depth + margin * 2;
  const tex = useMemo(() => {
    if (!tiled) return null;
    const t = makeFloorTexture();
    t.repeat.set(w / tileSizeM, d / tileSizeM);
    return t;
  }, [w, d, tileSizeM, tiled]);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  // three.js only toggles the USE_MAP shader define when the material is
  // recompiled. Adding/removing `map` at runtime (e.g. switching floors) needs
  // an explicit needsUpdate, or the ground keeps sampling the old tile texture.
  useEffect(() => {
    if (matRef.current) matRef.current.needsUpdate = true;
  }, [tex]);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[centerX, -0.06, centerZ]}
      receiveShadow
    >
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial ref={matRef} map={tex} color={color} />
    </mesh>
  );
}
