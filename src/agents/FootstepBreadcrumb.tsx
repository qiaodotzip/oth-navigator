import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { WalkPose } from "./useWaypointWalk";

const MAX_PRINTS = 16;
const LIFETIME_MS = 800;

type Print = { pos: THREE.Vector3; born: number };

export function FootstepBreadcrumb({
  poseRef,
}: {
  poseRef: React.MutableRefObject<WalkPose>;
}) {
  const prints = useRef<Print[]>([]);
  const lastSpawn = useRef(0);
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime * 1000;
    if (now - lastSpawn.current > 250) {
      prints.current.push({
        pos: new THREE.Vector3(poseRef.current.x, 0.05, poseRef.current.z),
        born: now,
      });
      if (prints.current.length > MAX_PRINTS) prints.current.shift();
      lastSpawn.current = now;
    }
    if (!groupRef.current) return;
    groupRef.current.clear();
    for (const p of prints.current) {
      const age = now - p.born;
      if (age > LIFETIME_MS) continue;
      const opacity = 1 - age / LIFETIME_MS;
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(0.2, 8),
        new THREE.MeshBasicMaterial({
          color: "#0066B3",
          transparent: true,
          opacity: opacity * 0.6,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(p.pos);
      groupRef.current.add(mesh);
    }
  });

  return <group ref={groupRef} />;
}
