import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Floor } from "@/data/types";
import { useStore } from "@/store";

const TOWN_SQUARE_M: [number, number] = [128, 83.37];
const WALK_SPEED = 16; // scene units per second

function metresToScene(point: [number, number], floor: Floor): [number, number] {
  return [point[0] - floor.bounds.width / 2, point[1] - floor.bounds.depth / 2];
}

export function UserBlob({ floor }: { floor: Floor }) {
  const activeRoute = useStore(s => s.activeRoute);
  const userLocation = useStore(s => s.userLocation);

  let visible = false;
  let label = "You are here";
  let staticPoint: [number, number] | null = null;
  if (activeRoute) {
    const wp = activeRoute.variant.steps[activeRoute.currentWaypointIndex];
    if (wp && wp.floorId === floor.id) {
      visible = true;
      label = "You";
    }
  } else {
    const loc = userLocation ?? { floorId: "L1" as const, point: TOWN_SQUARE_M };
    if (loc.floorId === floor.id) {
      visible = true;
      staticPoint = loc.point;
    }
  }

  if (!visible) return null;
  return <BlobMesh floor={floor} label={label} staticPoint={staticPoint} />;
}

function BlobMesh({
  floor,
  label,
  staticPoint,
}: {
  floor: Floor;
  label: string;
  staticPoint: [number, number] | null;
}) {
  const activeRoute = useStore(s => s.activeRoute);
  const groupRef = useRef<THREE.Group>(null!);
  const yawRef = useRef(0);
  const progress = useRef(0);

  const idx = activeRoute?.currentWaypointIndex ?? -1;
  const step = idx >= 0 ? activeRoute?.variant.steps[idx] : undefined;

  // Scene-space polyline for the current leg (previous waypoint -> current).
  const legPath = useMemo<THREE.Vector3[]>(() => {
    if (!step) {
      const [x, z] = metresToScene(staticPoint ?? TOWN_SQUARE_M, floor);
      return [new THREE.Vector3(x, 0, z)];
    }
    const raw =
      step.pathFromPrev && step.pathFromPrev.length >= 2
        ? step.pathFromPrev
        : [step.point];
    return raw.map(([mx, my]) => {
      const [x, z] = metresToScene([mx, my], floor);
      return new THREE.Vector3(x, 0, z);
    });
  }, [step, floor, staticPoint]);

  const segLengths = useMemo(() => {
    const lens: number[] = [];
    for (let i = 1; i < legPath.length; i++) {
      lens.push(legPath[i].distanceTo(legPath[i - 1]));
    }
    return lens;
  }, [legPath]);
  const totalLen = segLengths.reduce((a, b) => a + b, 0);

  // Reset the walk whenever the leg changes; snap to the leg start.
  useEffect(() => {
    progress.current = 0;
    if (groupRef.current && legPath.length > 0) {
      groupRef.current.position.copy(legPath[0]);
    }
  }, [legPath]);

  useFrame((_, dt) => {
    if (!groupRef.current || legPath.length === 0) return;

    if (legPath.length === 1) {
      groupRef.current.position.lerp(legPath[0], 1 - Math.pow(0.001, dt));
      const bob = Math.sin(performance.now() * 0.006) * 0.04;
      groupRef.current.position.y = bob;
      return;
    }

    progress.current = Math.min(totalLen, progress.current + WALK_SPEED * dt);

    let acc = 0;
    let pos = legPath[legPath.length - 1].clone();
    const dir = new THREE.Vector3();
    for (let i = 0; i < segLengths.length; i++) {
      if (acc + segLengths[i] >= progress.current) {
        const t = (progress.current - acc) / Math.max(0.001, segLengths[i]);
        pos = legPath[i].clone().lerp(legPath[i + 1], t);
        dir.subVectors(legPath[i + 1], legPath[i]);
        break;
      }
      acc += segLengths[i];
    }
    groupRef.current.position.set(pos.x, Math.sin(performance.now() * 0.006) * 0.04, pos.z);
    if (dir.lengthSq() > 0.0001) {
      const targetYaw = Math.atan2(dir.x, dir.z);
      yawRef.current += (targetYaw - yawRef.current) * Math.min(1, dt * 8);
      groupRef.current.rotation.y = yawRef.current;
    }
  });

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
      <Html position={[0, 2.4, 0]} center distanceFactor={70} zIndexRange={[20, 0]}>
        <div className="pointer-events-none whitespace-nowrap rounded-full bg-pink-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-md">
          {label}
        </div>
      </Html>
    </group>
  );
}
