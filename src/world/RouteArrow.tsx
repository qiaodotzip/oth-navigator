import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Floor, Pt } from "@/data/types";
import { useStore } from "@/store";

const ROUTE_CORE = "#E91E63"; // matches the pink "You" marker — reads as *your* path
const ROUTE_CASING = "#FF8FB6";
const ROUTE_Y = 0.28;

/**
 * Draws the whole remaining route *on this floor* (every upcoming same-floor
 * leg, not just the next one) as a map-style line: a soft glow casing, a bright
 * core, flowing direction chevrons, and an arrowhead at the on-floor goal.
 * Cross-floor hops (lift / escalator) have no on-floor polyline, so the path
 * naturally stops at the connector and resumes on the next floor.
 */
export function RouteArrow({ floor }: { floor: Floor }) {
  const activeRoute = useStore(s => s.activeRoute);
  const groupRef = useRef<THREE.Group>(null!);
  const chevronRef = useRef<THREE.Group>(null!);

  const i = activeRoute?.currentWaypointIndex ?? -1;
  const steps = activeRoute?.variant.steps;

  // Concatenate all remaining same-floor legs into one continuous polyline.
  const points = useMemo<THREE.Vector3[]>(() => {
    if (!steps || i < 0) return [];
    const seq: Pt[] = [];
    for (let j = i + 1; j < steps.length; j++) {
      const step = steps[j];
      const prev = steps[j - 1];
      if (step.floorId !== floor.id) continue;
      let leg: Pt[] | null = null;
      if (step.pathFromPrev && step.pathFromPrev.length >= 2) leg = step.pathFromPrev;
      else if (prev.floorId === floor.id) leg = [prev.point, step.point];
      if (!leg) continue;
      for (const p of leg) {
        const lastP = seq[seq.length - 1];
        // Skip near-duplicate joints (CatmullRom NaNs on coincident points).
        if (lastP && Math.hypot(lastP[0] - p[0], lastP[1] - p[1]) < 0.05) continue;
        seq.push(p);
      }
    }
    return seq.map(
      ([mx, my]) =>
        new THREE.Vector3(mx - floor.bounds.width / 2, ROUTE_Y, my - floor.bounds.depth / 2),
    );
  }, [steps, i, floor]);

  const curve = useMemo(
    () => (points.length >= 2 ? new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.2) : null),
    [points],
  );

  const { core, casing } = useMemo(() => {
    if (!curve) return { core: null, casing: null };
    const segs = Math.max(12, points.length * 6);
    return {
      core: new THREE.TubeGeometry(curve, segs, 0.42, 8, false),
      casing: new THREE.TubeGeometry(curve, segs, 1.0, 8, false),
    };
  }, [curve, points.length]);

  // Evenly spaced chevrons that animate "flowing" toward the destination.
  const chevrons = useMemo(() => {
    if (!curve) return [];
    const total = curve.getLength();
    const count = Math.min(24, Math.max(2, Math.round(total / 4)));
    return Array.from({ length: count }, (_, k) => (k + 0.5) / count);
  }, [curve]);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 3.5) * 0.05;
      groupRef.current.scale.set(1, pulse, 1);
    }
    if (chevronRef.current && curve) {
      const flow = (clock.elapsedTime * 0.12) % 1; // 0..1 march along the path
      chevronRef.current.children.forEach((child, k) => {
        const base = chevrons[k];
        if (base === undefined) return;
        const t = (base + flow) % 1;
        const pos = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        child.position.set(pos.x, ROUTE_Y + 0.08, pos.z);
        child.rotation.set(Math.PI / 2, 0, -Math.atan2(tan.x, tan.z));
        // Fade in/out near the ends so chevrons don't pop.
        const edge = Math.min(t, 1 - t);
        const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = Math.min(0.9, edge * 8);
      });
    }
  });

  if (!core || !casing || points.length < 2) return null;

  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const dir = new THREE.Vector3().subVectors(last, prev);
  const yaw = Math.atan2(dir.x, dir.z);

  return (
    <group ref={groupRef}>
      {/* soft glow casing */}
      <mesh geometry={casing} renderOrder={1}>
        <meshBasicMaterial color={ROUTE_CASING} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      {/* bright core */}
      <mesh geometry={core} renderOrder={2}>
        <meshBasicMaterial color={ROUTE_CORE} transparent opacity={0.95} depthWrite={false} />
      </mesh>
      {/* flowing direction chevrons */}
      <group ref={chevronRef}>
        {chevrons.map((_, k) => (
          <mesh key={k} renderOrder={3}>
            <coneGeometry args={[0.7, 1.3, 3]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
          </mesh>
        ))}
      </group>
      {/* arrowhead at the on-floor goal */}
      <mesh position={[last.x, ROUTE_Y, last.z]} rotation={[Math.PI / 2, 0, -yaw]} renderOrder={3}>
        <coneGeometry args={[1.5, 2.8, 4]} />
        <meshBasicMaterial color={ROUTE_CORE} transparent opacity={0.95} depthWrite={false} />
      </mesh>
    </group>
  );
}
