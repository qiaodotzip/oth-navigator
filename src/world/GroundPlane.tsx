import { useMemo } from "react";
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
  color = "#FAFBFC",
}: {
  width: number;
  depth: number;
  color?: string;
}) {
  const tileSizeM = useStore(s => s.tileSizeM);
  // Plane snug to the floor footprint plus a small margin; fog fades the edge.
  const w = width + 24;
  const d = depth + 24;
  const tex = useMemo(() => {
    const t = makeFloorTexture();
    t.repeat.set(w / tileSizeM, d / tileSizeM);
    return t;
  }, [w, d, tileSizeM]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={tex} color={color} />
    </mesh>
  );
}
