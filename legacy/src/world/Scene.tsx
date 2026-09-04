import { useMemo } from "react";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, SoftShadows } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Floor } from "./Floor";
import { FloorDetails } from "./FloorDetails";
import { CameraRig } from "./CameraRig";
import { FirstPersonRig } from "./FirstPersonRig";
import { PolygonLabels } from "./PolygonLabels";
import { RouteArrow } from "./RouteArrow";
import { useStore } from "@/store";
import { AnalyticsAgent } from "@/agents/AnalyticsAgent";
import { WANDER_LOOPS } from "@/agents/wanderLoops";
import { useCounterLoadSimulator } from "@/agents/counterLoads";
import { UserBlob } from "@/agents/UserBlob";
import { GroundPlane } from "./GroundPlane";
import { TIME_PRESETS } from "./timePresets";
import type { Floor as FloorData } from "@/data/types";

export function Scene({ onPickPlace }: { onPickPlace?: (serviceId: string) => void }) {
  const floors = useStore(s => s.floors);
  const activeFloor = useStore(s => s.activeFloor);
  const inspectMode = useStore(s => s.inspectMode);
  const firstPerson = useStore(s => s.firstPerson);
  const showLabels = useStore(s => s.showLabels);
  const pickingLocation = useStore(s => s.pickingLocation);
  const setUserLocation = useStore(s => s.setUserLocation);
  const setPickingLocation = useStore(s => s.setPickingLocation);
  const timeOfDay = useStore(s => s.timeOfDay);
  const effectsEnabled = useStore(s => s.effectsEnabled);

  useCounterLoadSimulator();

  const active = floors.find(f => f.id === activeFloor);

  const onPickGround = (e: ThreeEvent<MouseEvent>, floor: FloorData) => {
    e.stopPropagation();
    const mx = e.point.x + floor.bounds.width / 2;
    const my = e.point.z + floor.bounds.depth / 2;
    setUserLocation({ floorId: floor.id, point: [mx, my] });
    setPickingLocation(false);
  };

  const preset = TIME_PRESETS[timeOfDay];

  // Size the ground to the actual building footprint (bbox of polygons),
  // centred on the cluster — not the whole floor bounds.
  const ground = useMemo(() => {
    if (!active || active.polygons.length === 0) {
      return { w: 120, d: 120, cx: 0, cz: 0 };
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of active.polygons) {
      for (const [x, y] of p.points) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const W = active.bounds.width;
    const D = active.bounds.depth;
    return {
      w: maxX - minX,
      d: maxY - minY,
      cx: (minX + maxX) / 2 - W / 2,
      cz: (minY + maxY) / 2 - D / 2,
    };
  }, [active]);

  return (
    <Canvas
      shadows
      dpr={[1, effectsEnabled ? 1.75 : 1]}
      camera={{ position: [0, 180, 80], fov: 35 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      {effectsEnabled && timeOfDay !== "morning" && (
        <SoftShadows size={26} samples={8} focus={0.7} />
      )}
      <color attach="background" args={[preset.bg]} />
      <fog attach="fog" args={[preset.bg, preset.fog[0], preset.fog[1]]} />
      <ambientLight color={preset.ambient.color} intensity={preset.ambient.intensity} />
      <hemisphereLight
        color={preset.hemi.sky}
        groundColor={preset.hemi.ground}
        intensity={preset.hemi.intensity}
      />
      <directionalLight
        position={preset.dir.pos}
        color={preset.dir.color}
        intensity={preset.dir.intensity}
        castShadow={effectsEnabled}
        shadow-mapSize={effectsEnabled ? [2048, 2048] : [1024, 1024]}
        shadow-bias={-0.0004}
        shadow-camera-near={1}
        shadow-camera-far={600}
        shadow-camera-left={-160}
        shadow-camera-right={160}
        shadow-camera-top={160}
        shadow-camera-bottom={-160}
      />
      <GroundPlane
        width={ground.w}
        depth={ground.d}
        centerX={ground.cx}
        centerZ={ground.cz}
        color={preset.groundColor}
        tiled={activeFloor === "L1"}
      />
      {active && <Floor data={active} />}
      {active && <FloorDetails floor={active} />}
      {active && showLabels && <PolygonLabels floor={active} onPickPlace={onPickPlace} />}
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
      {firstPerson ? (
        <FirstPersonRig />
      ) : inspectMode ? (
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
      {effectsEnabled && (
        <EffectComposer>
          <Bloom
            intensity={timeOfDay === "night" ? 1.4 : 0.2}
            luminanceThreshold={timeOfDay === "night" ? 0.18 : 0.85}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
        </EffectComposer>
      )}
    </Canvas>
  );
}
