import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Floor, Pt } from "@/data/types";
import { findPath, smoothPath } from "@/routing/pathfinder";
import type { WanderLoop } from "./wanderLoops";

/**
 * Build a closed WALKABLE polyline (in floor metres) for a loop by A*-routing
 * between consecutive anchors. The raw anchors are hand-placed zone centres and
 * the straight lines between them cut across non-walkable ground (e.g. L2's open
 * tile, or through rooms). Routing each leg keeps every walked segment on
 * walkable cells only — walkways, bridges, landmarks and open plaza. Segments
 * that can't connect are dropped rather than drawn as a straight cheat line.
 */
function buildWalkablePath(loop: WanderLoop, floor: Floor): Pt[] {
  const anchors = loop.points;
  const out: Pt[] = [];
  const push = (p: Pt) => {
    const last = out[out.length - 1];
    if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.15) return;
    out.push(p);
  };
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const b = anchors[(i + 1) % anchors.length];
    const raw = findPath(a, b, floor);
    if (!raw || raw.length < 2) continue;
    for (const p of smoothPath(raw, floor)) push(p);
  }
  return out;
}

// Computed once per (loop, floor) — all agents on a loop share the polyline.
const pathCache = new WeakMap<WanderLoop, Record<string, Pt[]>>();
function loopPath(loop: WanderLoop, floor: Floor): Pt[] {
  let byFloor = pathCache.get(loop);
  if (!byFloor) {
    byFloor = {};
    pathCache.set(loop, byFloor);
  }
  if (!byFloor[floor.id]) byFloor[floor.id] = buildWalkablePath(loop, floor);
  return byFloor[floor.id];
}

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
  const ref = useRef<THREE.Group>(null!);
  const yawRef = useRef(0);

  // Walkable polyline in scene coords + per-segment lengths for arc-length walk.
  const { pts, segLen, total } = useMemo(() => {
    const metres = loopPath(loop, floor);
    const ps = metres.map(
      ([mx, my]) =>
        new THREE.Vector3(mx - floor.bounds.width / 2, 0, my - floor.bounds.depth / 2),
    );
    const lens: number[] = [];
    let sum = 0;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      const b = ps[(i + 1) % ps.length]; // wrap: closed loop
      const l = a.distanceTo(b);
      lens.push(l);
      sum += l;
    }
    return { pts: ps, segLen: lens, total: sum };
  }, [loop, floor]);

  const traveled = useRef(phase);
  const tmp = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    if (!ref.current) return;
    if (pts.length < 2 || total < 0.001) {
      if (pts.length === 1) ref.current.position.copy(pts[0]);
      return;
    }
    traveled.current += speed * dt;
    const u = ((traveled.current % total) + total) % total;

    let acc = 0;
    let seg = 0;
    while (seg < segLen.length - 1 && acc + segLen[seg] < u) {
      acc += segLen[seg];
      seg++;
    }
    const a = pts[seg];
    const b = pts[(seg + 1) % pts.length];
    const segT = segLen[seg] > 0.001 ? (u - acc) / segLen[seg] : 0;
    tmp.current.copy(a).lerp(b, segT);

    const targetYaw = Math.atan2(b.x - a.x, -(b.z - a.z));
    // shortest-arc yaw lerp
    let dYaw = targetYaw - yawRef.current;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    yawRef.current += dYaw * Math.min(1, dt * 6);

    const bob = Math.sin(traveled.current * 4) * 0.05;
    ref.current.position.set(tmp.current.x, bob, tmp.current.z);
    ref.current.rotation.y = yawRef.current;
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
