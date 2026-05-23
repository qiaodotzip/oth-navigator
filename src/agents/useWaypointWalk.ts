import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Floor } from "@/data/types";
import { useStore } from "@/store";

const SPEED_MPS = 4;

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export type WalkPose = { x: number; z: number; yawRad: number; bobPhase: number };

export function useWaypointWalk(floors: Floor[]) {
  const segT = useRef(0);
  const pose = useRef<WalkPose>({ x: 0, z: 0, yawRad: 0, bobPhase: 0 });
  const lastYaw = useRef(0);

  useFrame((_, dt) => {
    const route = useStore.getState().activeRoute;
    if (!route) return;
    const steps = route.variant.steps;
    const i = route.currentWaypointIndex;
    if (i >= steps.length - 1) return;
    const a = steps[i];
    const b = steps[i + 1];
    const floor = floors.find(f => f.id === a.floorId);
    if (!floor) return;
    const ax = a.point[0] - floor.bounds.width / 2;
    const az = floor.bounds.depth / 2 - a.point[1];
    const bx = b.point[0] - floor.bounds.width / 2;
    const bz = floor.bounds.depth / 2 - b.point[1];
    const dx = bx - ax;
    const dz = bz - az;
    const segLen = Math.hypot(dx, dz);
    if (segLen < 0.0001) return;

    segT.current += (SPEED_MPS * dt) / segLen;
    const t = Math.min(1, segT.current);
    const e = easeInOut(t);
    pose.current.x = ax + dx * e;
    pose.current.z = az + dz * e;
    pose.current.bobPhase += dt * 6;
    const targetYaw = Math.atan2(dx, dz);
    lastYaw.current += (targetYaw - lastYaw.current) * Math.min(1, dt * 6);
    pose.current.yawRad = lastYaw.current + Math.sin(pose.current.bobPhase) * 0.03;

    if (t >= 1) {
      segT.current = 0;
      useStore.getState().advanceRoute();
    }
  });

  return pose;
}
