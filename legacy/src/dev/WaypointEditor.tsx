import { useEffect, useState } from "react";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { Floor } from "@/world/Floor";
import { loadDataBundle } from "@/data/loaders";
import type { Floor as FloorData } from "@/data/types";

export function WaypointEditor() {
  const [floors, setFloors] = useState<FloorData[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [points, setPoints] = useState<[number, number][]>([]);

  useEffect(() => {
    loadDataBundle()
      .then(b => setFloors(b.floors))
      .catch(e => console.warn("[WaypointEditor] loadDataBundle failed:", e));
  }, []);
  const active = floors[activeIdx];

  const handlePick = (e: ThreeEvent<MouseEvent>) => {
    if (!active) return;
    const p = e.point;
    if (!p) return;
    const x = p.x + active.bounds.width / 2;
    const z = p.z + active.bounds.depth / 2;
    setPoints(prev => [...prev, [Math.round(x * 10) / 10, Math.round(z * 10) / 10]]);
  };

  return (
    <div className="grid grid-cols-2 h-screen">
      <div className="relative">
        <Canvas camera={{ position: [0, 200, 0], fov: 35 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[80, 200, 60]} intensity={1} />
          {active && (
            <>
              <Floor data={active} />
              <mesh
                position={[0, 0.01, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                onClick={handlePick}
              >
                <planeGeometry args={[active.bounds.width, active.bounds.depth]} />
                <meshBasicMaterial transparent opacity={0} />
              </mesh>
            </>
          )}
        </Canvas>
      </div>
      <div className="p-4 overflow-auto bg-neutral-100">
        <div className="flex gap-2 mb-3">
          {floors.map((f, i) => (
            <button
              key={f.id}
              onClick={() => setActiveIdx(i)}
              className={`px-3 py-1 rounded ${
                activeIdx === i ? "bg-oth-primary text-white" : "bg-white"
              }`}
            >
              {f.id}
            </button>
          ))}
          <button
            onClick={() => setPoints([])}
            className="ml-auto px-3 py-1 rounded bg-red-500 text-white"
          >
            Clear
          </button>
        </div>
        <pre className="text-xs whitespace-pre-wrap break-all bg-white p-3 rounded">
{JSON.stringify(points, null, 2)}
        </pre>
        <p className="text-xs mt-3 text-neutral-600">
          Click on the floor to add a waypoint. Copy the JSON into <code>public/data/waypoints.json</code>.
        </p>
      </div>
    </div>
  );
}
