import { useEffect, useRef, useLayoutEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "@/store";

const EYE_HEIGHT = 1.4; // metres (a shorter walker)
const WALK_SPEED = 6; // m/s
const SPRINT_SPEED = 12; // m/s
const BOB_AMP = 0.07; // vertical head-bob amplitude in metres
const BOB_CADENCE = 1.6; // bob phase advance per metre travelled (radians)
const BOB_DAMP = 7; // how fast the bob eases in/out when you start/stop

/**
 * First-person walk mode: pointer-lock mouse-look plus WASD movement across the
 * floor's XZ plane (no collision — you can clip through walls). Spawns at the
 * pinned user location if one is set, otherwise at the floor centre.
 */
export function FirstPersonRig() {
  const { camera } = useThree();
  const floors = useStore(s => s.floors);
  const activeFloor = useStore(s => s.activeFloor);
  const userLocation = useStore(s => s.userLocation);

  // Live keyboard state, read each frame.
  const keys = useRef<Record<string, boolean>>({});
  // Scratch vectors reused every frame to avoid per-frame allocation.
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const move = useRef(new THREE.Vector3());
  // Head-bob state: phase advances while walking, amplitude eases in/out.
  const bobPhase = useRef(0);
  const bobAmp = useRef(0);

  // Spawn the camera once when this rig mounts.
  useLayoutEffect(() => {
    const floor = floors.find(f => f.id === activeFloor);
    let x = 0;
    let z = 0;
    if (floor && userLocation && userLocation.floorId === floor.id) {
      x = userLocation.point[0] - floor.bounds.width / 2;
      z = userLocation.point[1] - floor.bounds.depth / 2;
    }
    camera.position.set(x, EYE_HEIGHT, z);
    // Face the floor centre, looking horizontally.
    camera.lookAt(0, EYE_HEIGHT, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      keys.current = {};
    };
  }, []);

  useFrame((_, dt) => {
    const k = keys.current;
    const fwdInput = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    const rightInput = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const sprinting = !!(k.ShiftLeft || k.ShiftRight);
    const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
    let moving = false;

    if (fwdInput !== 0 || rightInput !== 0) {
      // Camera forward flattened onto the XZ plane.
      camera.getWorldDirection(forward.current);
      forward.current.y = 0;
      forward.current.normalize();
      // Right = forward × up.
      right.current.crossVectors(forward.current, camera.up).normalize();

      move.current
        .set(0, 0, 0)
        .addScaledVector(forward.current, fwdInput)
        .addScaledVector(right.current, rightInput);
      if (move.current.lengthSq() > 0) {
        move.current.normalize();
        camera.position.addScaledVector(move.current, speed * dt);
        moving = true;
      }
    }

    // Head bob: advance the phase by distance travelled while walking, ease the
    // amplitude toward its target so it starts/stops smoothly. The eye height is
    // set absolutely each frame, so the bob never drifts.
    if (moving) {
      bobPhase.current += speed * dt * BOB_CADENCE;
      bobAmp.current = THREE.MathUtils.damp(
        bobAmp.current,
        sprinting ? BOB_AMP * 1.5 : BOB_AMP,
        BOB_DAMP,
        dt,
      );
    } else {
      bobAmp.current = THREE.MathUtils.damp(bobAmp.current, 0, BOB_DAMP, dt);
    }
    camera.position.y = EYE_HEIGHT + Math.sin(bobPhase.current) * bobAmp.current;
  });

  return <PointerLockControls />;
}
