import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Floor } from "@/data/types";
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
  const ref = useRef<THREE.Mesh>(null!);
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

  useFrame((_, dt) => {
    t.current += speed * dt;
    const totalLen = offsets[offsets.length - 1];
    const u = ((t.current % totalLen) + totalLen) % totalLen;
    let segIdx = 0;
    while (segIdx < offsets.length - 1 && offsets[segIdx + 1] < u) segIdx++;
    const segStart = offsets[segIdx];
    const segEnd = offsets[segIdx + 1];
    const segT = (u - segStart) / Math.max(0.001, segEnd - segStart);
    const p = loop.points[segIdx % loop.points.length];
    const q = loop.points[(segIdx + 1) % loop.points.length];
    const x = p[0] + (q[0] - p[0]) * segT - floor.bounds.width / 2;
    const z = p[1] + (q[1] - p[1]) * segT - floor.bounds.depth / 2;
    if (ref.current) ref.current.position.set(x, 0.1, z);
  });

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.5, 16]} />
      <meshBasicMaterial color={loop.color} />
    </mesh>
  );
}
