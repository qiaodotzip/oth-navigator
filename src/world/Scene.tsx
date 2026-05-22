import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useState } from "react";
import { Floor } from "./Floor";
import { loadDataBundle } from "@/data/loaders";
import type { Floor as FloorData } from "@/data/types";

export function Scene() {
  const [floors, setFloors] = useState<FloorData[]>([]);

  useEffect(() => {
    loadDataBundle()
      .then(b => setFloors(b.floors))
      .catch(e => console.warn("[Scene] loadDataBundle failed:", e));
  }, []);

  return (
    <Canvas shadows camera={{ position: [120, 180, 120], fov: 35 }}>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[80, 200, 60]}
        intensity={1}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      {floors[0] && <Floor data={floors[0]} yOffset={0} />}
      {floors[1] && <Floor data={floors[1]} yOffset={5} />}
      <OrbitControls />
    </Canvas>
  );
}
