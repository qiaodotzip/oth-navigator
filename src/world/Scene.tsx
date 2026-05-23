import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Floor } from "./Floor";
import { CameraRig } from "./CameraRig";
import { PolygonLabels } from "./PolygonLabels";
import { RouteArrow } from "./RouteArrow";
import { useStore } from "@/store";
import { AnalyticsAgent } from "@/agents/AnalyticsAgent";
import { WANDER_LOOPS } from "@/agents/wanderLoops";
import { useCounterLoadSimulator } from "@/agents/counterLoads";
import { UserBlob } from "@/agents/UserBlob";

export function Scene() {
  const floors = useStore(s => s.floors);
  const activeFloor = useStore(s => s.activeFloor);
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
      {active && <RouteArrow floor={active} />}
      {active && <UserBlob floor={active} />}
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
