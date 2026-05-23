import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Floor } from "@/data/types";
import { useStore } from "@/store";

/**
 * Draws the upcoming leg as a pulsing polyline that hugs the wall-avoiding
 * path (steps[currentIndex + 1].pathFromPrev), with an arrowhead at the end.
 */
export function RouteArrow({ floor }: { floor: Floor }) {
  const activeRoute = useStore(s => s.activeRoute);
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.06;
    groupRef.current.scale.set(1, pulse, 1);
  });

  const i = activeRoute?.currentWaypointIndex ?? -1;
  const next = i >= 0 ? activeRoute?.variant.steps[i + 1] : undefined;

  const points = useMemo<THREE.Vector3[]>(() => {
    if (!next) return [];
    if (next.floorId !== floor.id) return [];
    const raw =
      next.pathFromPrev && next.pathFromPrev.length >= 2
        ? next.pathFromPrev
        : null;
    const current = i >= 0 ? activeRoute?.variant.steps[i] : undefined;
    const seq =
      raw ??
      (current && current.floorId === floor.id
        ? [current.point, next.point]
        : null);
    if (!seq) return [];
    return seq.map(
      ([mx, my]) =>
        new THREE.Vector3(
          mx - floor.bounds.width / 2,
          0.25,
          my - floor.bounds.depth / 2,
        ),
    );
  }, [next, i, activeRoute, floor]);

  const tube = useMemo(() => {
    if (points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.2);
    return new THREE.TubeGeometry(curve, Math.max(8, points.length * 4), 0.5, 6, false);
  }, [points]);

  if (!tube || points.length < 2) return null;

  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const dir = new THREE.Vector3().subVectors(last, prev);
  const yaw = Math.atan2(dir.x, dir.z);

  return (
    <group ref={groupRef}>
      <mesh geometry={tube}>
        <meshBasicMaterial color="#E91E63" transparent opacity={0.75} />
      </mesh>
      <mesh position={[last.x, 0.25, last.z]} rotation={[Math.PI / 2, 0, -yaw]}>
        <coneGeometry args={[1.4, 2.6, 4]} />
        <meshBasicMaterial color="#E91E63" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}
