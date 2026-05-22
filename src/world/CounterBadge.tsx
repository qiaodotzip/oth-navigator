import { Html } from "@react-three/drei";
import { useStore } from "@/store";
import type { Service, Floor } from "@/data/types";

export function CounterBadges({ floor }: { floor: Floor }) {
  const services = useStore(s => s.services);
  const counterLoads = useStore(s => s.counterLoads);
  const onFloor = services.filter((s: Service) => s.floorId === floor.id);
  return (
    <>
      {onFloor.map(svc => {
        const poly = floor.polygons.find(p => p.id === svc.roomId);
        if (!poly) return null;
        const cx = poly.points.reduce((a, [x]) => a + x, 0) / poly.points.length;
        const cz = poly.points.reduce((a, [, z]) => a + z, 0) / poly.points.length;
        const x = cx - floor.bounds.width / 2;
        const z = cz - floor.bounds.depth / 2;
        const ids = svc.counterIds ?? [];
        const avg =
          ids.length === 0
            ? 0
            : ids.reduce((acc, id) => acc + (counterLoads[id] ?? 0), 0) / ids.length;
        const people = Math.round(avg * 12);
        return (
          <Html key={svc.id} position={[x, 6, z]} center>
            <div className="text-[10px] px-2 py-0.5 rounded-full bg-oth-ink text-white whitespace-nowrap">
              {people} waiting
            </div>
          </Html>
        );
      })}
    </>
  );
}
