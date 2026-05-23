import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Floor } from "@/data/types";
import { useStore } from "@/store";

const TOWN_SQUARE_M: [number, number] = [128, 73];

function metresToScene(point: [number, number], floor: Floor) {
  return [point[0] - floor.bounds.width / 2, floor.bounds.depth / 2 - point[1]] as const;
}

export function UserBlob({ floor }: { floor: Floor }) {
  const activeRoute = useStore(s => s.activeRoute);

  let target: [number, number] | null = null;
  let label = "You are here";
  if (activeRoute) {
    const wp = activeRoute.variant.steps[activeRoute.currentWaypointIndex];
    if (wp && wp.floorId === floor.id) {
      target = wp.point;
      label = "You";
    }
  } else if (floor.id === "L1") {
    target = TOWN_SQUARE_M;
  }

  if (!target) return null;
  return <BlobMesh target={target} floor={floor} label={label} />;
}

function BlobMesh({
  target,
  floor,
  label,
}: {
  target: [number, number];
  floor: Floor;
  label: string;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const yawRef = useRef(0);
  const [tx, tz] = metresToScene(target, floor);
  const targetVec = useRef(new THREE.Vector3(tx, 0, tz));
  const lastTargetKey = useRef("");
  const lastPos = useRef(new THREE.Vector3(tx, 0, tz));

  useEffect(() => {
    targetVec.current.set(tx, 0, tz);
  }, [tx, tz]);

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.set(tx, 0, tz);
      lastPos.current.set(tx, 0, tz);
    }
  }, []);

  useFrame((_, dt) => {
    if (!groupRef.current) return;
    const rate = 1 - Math.pow(0.0005, dt);
    groupRef.current.position.lerp(targetVec.current, rate);

    const dx = targetVec.current.x - lastPos.current.x;
    const dz = targetVec.current.z - lastPos.current.z;
    if (Math.hypot(dx, dz) > 0.5) {
      const targetYaw = Math.atan2(dx, -dz);
      yawRef.current += (targetYaw - yawRef.current) * Math.min(1, dt * 6);
      groupRef.current.rotation.y = yawRef.current;
    }
    lastPos.current.copy(groupRef.current.position);
  });

  const key = `${target[0]},${target[1]}`;
  if (key !== lastTargetKey.current) lastTargetKey.current = key;

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.45, 0.9, 6, 12]} />
        <meshStandardMaterial color="#E91E63" emissive="#E91E63" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[0, 1.4, 0]} castShadow>
        <sphereGeometry args={[0.32, 24, 24]} />
        <meshStandardMaterial color="#F2C5A0" />
      </mesh>
      <Html position={[0, 2.4, 0]} center distanceFactor={70}>
        <div className="pointer-events-none whitespace-nowrap rounded-full bg-pink-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md">
          {label}
        </div>
      </Html>
    </group>
  );
}
