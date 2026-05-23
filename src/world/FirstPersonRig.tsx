import { useEffect, useRef, useLayoutEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { PointerLockControls } from "@react-three/drei";
import * as THREE from "three";
import { useStore } from "@/store";

const EYE_HEIGHT = 1.7; // metres
const WALK_SPEED = 6; // m/s
const SPRINT_SPEED = 12; // m/s

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
    if (fwdInput === 0 && rightInput === 0) return;

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
    if (move.current.lengthSq() === 0) return;
    move.current.normalize();

    const speed = k.ShiftLeft || k.ShiftRight ? SPRINT_SPEED : WALK_SPEED;
    camera.position.addScaledVector(move.current, speed * dt);
    camera.position.y = EYE_HEIGHT; // stay grounded
  });

  return <PointerLockControls />;
}
