import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useEffect } from "react";
import * as THREE from "three";
import { useStore } from "@/store";

const TOPDOWN_POS = new THREE.Vector3(0, 180, 80);
const TOPDOWN_LOOK = new THREE.Vector3(0, 0, 0);

export function CameraRig() {
  const { camera } = useThree();
  const targetPos = useRef(TOPDOWN_POS.clone());
  const targetLook = useRef(TOPDOWN_LOOK.clone());
  const lookProxy = useRef(new THREE.Vector3());
  const route = useStore(s => s.activeRoute);
  const floors = useStore(s => s.floors);
  const activeFloor = useStore(s => s.activeFloor);

  useEffect(() => {
    if (!route) {
      targetPos.current.copy(TOPDOWN_POS);
      targetLook.current.copy(TOPDOWN_LOOK);
      return;
    }
    const wp = route.variant.steps[route.currentWaypointIndex];
    if (!wp) return;
    const floor = floors.find(f => f.id === wp.floorId);
    if (!floor) return;
    const x = wp.point[0] - floor.bounds.width / 2;
    const z = floor.bounds.depth / 2 - wp.point[1];
    if (wp.decisionPoint) {
      targetPos.current.set(x + 18, 28, z + 18);
      targetLook.current.set(x, 2, z);
    } else {
      targetPos.current.set(0, 180, 80);
      targetLook.current.copy(TOPDOWN_LOOK);
    }
  }, [route, floors, activeFloor]);

  useFrame((_, dt) => {
    const lerpRate = 1 - Math.pow(0.001, dt);
    camera.position.lerp(targetPos.current, lerpRate);
    lookProxy.current.lerp(targetLook.current, lerpRate);
    camera.lookAt(lookProxy.current);
  });

  return null;
}
