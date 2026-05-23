import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Floor } from "@/data/types";
import { isInBarrier } from "@/routing/pathChecks";
import type { WanderLoop } from "./wanderLoops";

export function AnalyticsAgent({
  loop,
  floor,
  speed,
  phase,
}: {
  loop: WanderLoop;
  floor: Floor;
  speed: number;
  phase: number;
}) {
  const t = useRef(phase);
  const ref = useRef<THREE.Group>(null!);
  const offsets = useMemo(() => {
    const arr: number[] = [0];
    for (let i = 1; i < loop.points.length; i++) {
      const [px, py] = loop.points[i - 1];
      const [qx, qy] = loop.points[i];
      arr.push(arr[i - 1] + Math.hypot(qx - px, qy - py));
    }
    const last = loop.points[loop.points.length - 1];
    const first = loop.points[0];
    arr.push(arr[arr.length - 1] + Math.hypot(first[0] - last[0], first[1] - last[1]));
    return arr;
  }, [loop]);
  const yawRef = useRef(0);
  const dir = useRef(1);

  useFrame((_, dt) => {
    const totalLen = offsets[offsets.length - 1];
    const nextT = t.current + dir.current * speed * dt;
    const u = ((nextT % totalLen) + totalLen) % totalLen;
    let segIdx = 0;
    while (segIdx < offsets.length - 1 && offsets[segIdx + 1] < u) segIdx++;
    const segStart = offsets[segIdx];
    const segEnd = offsets[segIdx + 1];
    const segT = (u - segStart) / Math.max(0.001, segEnd - segStart);
    const p = loop.points[segIdx % loop.points.length];
    const q = loop.points[(segIdx + 1) % loop.points.length];
    const mxMetres = p[0] + (q[0] - p[0]) * segT;
    const myMetres = p[1] + (q[1] - p[1]) * segT;

    // Bounce off walls/barriers/courts (not rooms — loops visit room centres).
    if (isInBarrier([mxMetres, myMetres], floor)) {
      dir.current *= -1;
      return;
    }
    t.current = nextT;

    const x = mxMetres - floor.bounds.width / 2;
    const z = myMetres - floor.bounds.depth / 2;
    const dx = (q[0] - p[0]) * dir.current;
    const dy = (q[1] - p[1]) * dir.current;
    const targetYaw = Math.atan2(dx, -dy);
    yawRef.current += (targetYaw - yawRef.current) * Math.min(1, dt * 6);
    const bob = Math.sin(t.current * 8) * 0.05;
    if (ref.current) {
      ref.current.position.set(x, 0, z);
      ref.current.rotation.y = yawRef.current;
      ref.current.position.y = bob;
    }
  });

  return (
    <group ref={ref}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.6, 4, 8]} />
        <meshStandardMaterial color={loop.color} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#F2C5A0" />
      </mesh>
    </group>
  );
}
