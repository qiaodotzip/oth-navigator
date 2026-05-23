import { Html } from "@react-three/drei";
import type { Floor } from "@/data/types";

type Agg = { sx: number; sy: number; n: number; maxH: number };

export function PolygonLabels({ floor }: { floor: Floor }) {
  // A zone may be split across several polygons sharing one id; show a single
  // label at the combined centroid of all its pieces.
  const byId = new Map<string, Agg>();
  for (const p of floor.polygons) {
    const a = byId.get(p.id) ?? { sx: 0, sy: 0, n: 0, maxH: 0 };
    for (const [x, y] of p.points) {
      a.sx += x;
      a.sy += y;
      a.n += 1;
    }
    a.maxH = Math.max(a.maxH, p.heightMeters);
    byId.set(p.id, a);
  }

  return (
    <>
      {Array.from(byId.entries()).map(([id, a]) => {
        const cx = a.sx / a.n;
        const cy = a.sy / a.n;
        const x = cx - floor.bounds.width / 2;
        const z = cy - floor.bounds.depth / 2;
        const label = id.startsWith(`${floor.id}-`) ? id.slice(floor.id.length + 1) : id;
        return (
          <Html
            key={id}
            position={[x, a.maxH + 1, z]}
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
