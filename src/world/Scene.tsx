import { Canvas, ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Floor } from "./Floor";
import { FloorDetails } from "./FloorDetails";
import { CameraRig } from "./CameraRig";
import { PolygonLabels } from "./PolygonLabels";
import { RouteArrow } from "./RouteArrow";
import { useStore } from "@/store";
import { AnalyticsAgent } from "@/agents/AnalyticsAgent";
import { WANDER_LOOPS } from "@/agents/wanderLoops";
import { useCounterLoadSimulator } from "@/agents/counterLoads";
import { UserBlob } from "@/agents/UserBlob";
import { GroundPlane } from "./GroundPlane";
import type { Floor as FloorData } from "@/data/types";

export function Scene() {
  const floors = useStore(s => s.floors);
  const activeFloor = useStore(s => s.activeFloor);
  const inspectMode = useStore(s => s.inspectMode);
  const showLabels = useStore(s => s.showLabels);
  const pickingLocation = useStore(s => s.pickingLocation);
  const setUserLocation = useStore(s => s.setUserLocation);
  const setPickingLocation = useStore(s => s.setPickingLocation);

  useCounterLoadSimulator();

  const active = floors.find(f => f.id === activeFloor);

  const onPickGround = (e: ThreeEvent<MouseEvent>, floor: FloorData) => {
    e.stopPropagation();
    const mx = e.point.x + floor.bounds.width / 2;
    const my = e.point.z + floor.bounds.depth / 2;
    setUserLocation({ floorId: floor.id, point: [mx, my] });
    setPickingLocation(false);
  };

  return (
    <Canvas shadows camera={{ position: [0, 180, 80], fov: 35 }}>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[80, 200, 60]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <GroundPlane />
      {active && <Floor data={active} />}
      {active && <FloorDetails floor={active} />}
      {active && showLabels && <PolygonLabels floor={active} />}
      {active && <RouteArrow floor={active} />}
      {active && <UserBlob floor={active} />}
      {active && pickingLocation && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.02, 0]}
          onClick={e => onPickGround(e, active)}
        >
          <planeGeometry args={[active.bounds.width * 1.2, active.bounds.depth * 1.2]} />
          <meshBasicMaterial transparent opacity={0.12} color="#0066B3" />
        </mesh>
      )}
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
