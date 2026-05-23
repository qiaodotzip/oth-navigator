import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { Floor } from "@/data/types";
import { useStore } from "@/store";

export function RouteArrow({ floor }: { floor: Floor }) {
  const activeRoute = useStore(s => s.activeRoute);
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.08;
    groupRef.current.scale.set(pulse, pulse, pulse);
  });

  if (!activeRoute) return null;
  const steps = activeRoute.variant.steps;
  const i = activeRoute.currentWaypointIndex;
  const current = steps[i];
  const next = steps[i + 1];
  if (!current || !next) return null;
  if (current.floorId !== floor.id || next.floorId !== floor.id) return null;

  const ax = current.point[0] - floor.bounds.width / 2;
  const az = floor.bounds.depth / 2 - current.point[1];
  const bx = next.point[0] - floor.bounds.width / 2;
  const bz = floor.bounds.depth / 2 - next.point[1];
  const dx = bx - ax;
  const dz = bz - az;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.01) return null;
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const yaw = Math.atan2(dx, dz);

  return (
    <group ref={groupRef} position={[mx, 0.2, mz]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.4, 0.15, Math.max(2, dist - 2)]} />
        <meshBasicMaterial color="#E91E63" transparent opacity={0.7} />
      </mesh>
      <mesh position={[0, 0.05, dist / 2 - 1]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[1.5, 2.5, 4]} />
        <meshBasicMaterial color="#E91E63" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}
