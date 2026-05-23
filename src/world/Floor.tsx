import { useMemo } from "react";
import * as THREE from "three";
import type { Floor as FloorData, Polygon } from "@/data/types";

function polygonToShape(p: Polygon, depth: number): THREE.Shape {
  const shape = new THREE.Shape();
  const [x0, y0] = p.points[0];
  shape.moveTo(x0, depth - y0);
  for (let i = 1; i < p.points.length; i++) {
    shape.lineTo(p.points[i][0], depth - p.points[i][1]);
  }
  shape.closePath();
  return shape;
}

const COLORS: Record<Polygon["type"], string> = {
  room: "#E6DCC4",
  corridor: "#D6CBB0",
  landmark: "#F2A33C",
  void: "#A0A0A0",
};

export function Floor({ data, yOffset = 0 }: { data: FloorData; yOffset?: number }) {
  const meshes = useMemo(
    () =>
      data.polygons.map(p => {
        const shape = polygonToShape(p, data.bounds.depth);
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: p.heightMeters,
          bevelEnabled: false,
        });
        geometry.rotateX(-Math.PI / 2);
        return { id: p.id, geometry, color: COLORS[p.type] };
      }),
    [data],
  );

  return (
    <group position={[-data.bounds.width / 2, yOffset, data.bounds.depth / 2]}>
      {meshes.map(m => (
        <mesh key={m.id} geometry={m.geometry} castShadow receiveShadow>
          <meshStandardMaterial color={m.color} />
        </mesh>
      ))}
    </group>
  );
}
