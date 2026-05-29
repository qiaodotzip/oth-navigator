import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useStore } from "@/store";
import { guidePose } from "./guidePose";

const TOPDOWN_POS = new THREE.Vector3(0, 180, 80);
const TOPDOWN_LOOK = new THREE.Vector3(0, 0, 0);

// Default chase framing: camera sits behind + above the guide at a gentle tilt.
const CHASE_BACK = 26;
const CHASE_HEIGHT = 20;
// GPS-follow framing: closer and much steeper, so it reads like a navigation
// app's top-down "you are here" view while still showing heading.
const GPS_BACK = 9;
const GPS_HEIGHT = 26;
const LOOK_HEIGHT = 1.5;

export function CameraRig() {
  const { camera } = useThree();
  const route = useStore(s => s.activeRoute);
  const cameraFollow = useStore(s => s.cameraFollow);
  const targetPos = useRef(TOPDOWN_POS.clone());
  const targetLook = useRef(TOPDOWN_LOOK.clone());
  const lookProxy = useRef(TOPDOWN_LOOK.clone());

  useFrame((_, dt) => {
    if (route && guidePose.following) {
      const g = guidePose.pos;
      const back = cameraFollow ? GPS_BACK : CHASE_BACK;
      const height = cameraFollow ? GPS_HEIGHT : CHASE_HEIGHT;
      // Guide forward is (sin yaw, cos yaw); place the camera behind it.
      const fx = Math.sin(guidePose.yaw);
      const fz = Math.cos(guidePose.yaw);
      targetPos.current.set(g.x - fx * back, height, g.z - fz * back);
      targetLook.current.set(g.x, LOOK_HEIGHT, g.z);
    } else {
      targetPos.current.copy(TOPDOWN_POS);
      targetLook.current.copy(TOPDOWN_LOOK);
    }
    // Smooth follow; a bit snappier than before so turns feel responsive.
    const rate = 1 - Math.pow(0.0006, dt);
    camera.position.lerp(targetPos.current, rate);
    lookProxy.current.lerp(targetLook.current, rate);
    camera.lookAt(lookProxy.current);
  });

  return null;
}
