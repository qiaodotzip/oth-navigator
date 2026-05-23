import { Html } from "@react-three/drei";
import type { Floor } from "@/data/types";

export function PolygonLabels({ floor }: { floor: Floor }) {
  return (
    <>
      {floor.polygons.map(p => {
        const cx = p.points.reduce((a, [x]) => a + x, 0) / p.points.length;
        const cy = p.points.reduce((a, [, y]) => a + y, 0) / p.points.length;
        const x = cx - floor.bounds.width / 2;
        const z = floor.bounds.depth / 2 - cy;
        const label = p.id.startsWith(`${floor.id}-`)
          ? p.id.slice(floor.id.length + 1)
          : p.id;
        return (
          <Html
            key={p.id}
            position={[x, p.heightMeters + 1, z]}
            center
            distanceFactor={70}
            occlude={false}
          >
            <div className="pointer-events-none whitespace-nowrap rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-mono text-oth-ink shadow-md border border-neutral-300">
              {label}
            </div>
          </Html>
        );
      })}
    </>
  );
}
