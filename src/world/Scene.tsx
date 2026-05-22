import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect } from "react";
import { Floor } from "./Floor";
import { loadDataBundle } from "@/data/loaders";
import { useStore } from "@/store";

export function Scene() {
  const floors = useStore(s => s.floors);
  const activeFloor = useStore(s => s.activeFloor);
  const setBundle = useStore(s => s.setBundle);

  useEffect(() => {
    loadDataBundle()
      .then(setBundle)
      .catch(e => console.warn("[Scene] loadDataBundle failed:", e));
  }, [setBundle]);

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
      <OrbitControls maxPolarAngle={Math.PI / 2.2} />
    </Canvas>
  );
}
