import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useRef } from "react";
import * as THREE from "three";
import { Floor } from "./Floor";
import { CameraRig } from "./CameraRig";
import { PolygonLabels } from "./PolygonLabels";
import { useStore } from "@/store";
import { GuideAgent } from "@/agents/GuideAgent";
import { useWaypointWalk } from "@/agents/useWaypointWalk";
import { FootstepBreadcrumb } from "@/agents/FootstepBreadcrumb";
import { AnalyticsAgent } from "@/agents/AnalyticsAgent";
import { WANDER_LOOPS } from "@/agents/wanderLoops";
import { useCounterLoadSimulator } from "@/agents/counterLoads";
import { CounterBadges } from "./CounterBadge";
import type { Floor as FloorData } from "@/data/types";

export function Scene() {
  const floors = useStore(s => s.floors);
  const activeFloor = useStore(s => s.activeFloor);
  const activeRoute = useStore(s => s.activeRoute);
  const inspectMode = useStore(s => s.inspectMode);
  const showLabels = useStore(s => s.showLabels);

  useCounterLoadSimulator();

  const active = floors.find(f => f.id === activeFloor);

  return (
    <Canvas shadows camera={{ position: [0, 180, 80], fov: 35 }}>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[80, 200, 60]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      {active && <Floor data={active} />}
      {active && showLabels && <PolygonLabels floor={active} />}
      {active && <CounterBadges floor={active} />}
      {active &&
        WANDER_LOOPS.filter(l => l.floorId === active.id).flatMap((loop, li) =>
          Array.from({ length: 4 }).map((_, ai) => (
            <AnalyticsAgent
              key={`${li}-${ai}`}
              loop={loop}
              floor={active}
              speed={2 + ai * 0.5}
              phase={ai * 20}
            />
          )),
        )}
      {activeRoute && <WalkingGuide floors={floors} />}
      {inspectMode ? (
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          maxPolarAngle={Math.PI / 2.05}
          target={[0, 0, 0]}
        />
      ) : (
        <CameraRig />
      )}
    </Canvas>
  );
}

function WalkingGuide({ floors }: { floors: FloorData[] }) {
  const pose = useWaypointWalk(floors);
  const groupRef = useRef<THREE.Group>(null!);
  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.set(pose.current.x, 0, pose.current.z);
    groupRef.current.rotation.y = pose.current.yawRad;
  });
  return (
    <>
      <FootstepBreadcrumb poseRef={pose} />
      <group ref={groupRef}>
        <GuideAgent pose={{ x: 0, z: 0, yawRad: 0, bobPhase: 0 }} />
      </group>
    </>
  );
}
