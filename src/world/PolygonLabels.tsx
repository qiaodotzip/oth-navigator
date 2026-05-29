import { Html } from "@react-three/drei";
import { useState } from "react";
import type { BusynessSource, Floor, Service } from "@/data/types";
import { useStore } from "@/store";
import { busynessSourceFor, crowdEstimate } from "@/enrichment/popularTimes";
import { poiLabel } from "./poiNames";

type Agg = { sx: number; sy: number; n: number; maxH: number };

const SOURCE_LABEL: Record<BusynessSource, string> = {
  live: "live now",
  forecast: "typical (real data)",
  modeled: "typical (estimated)",
};

// Busyness band -> dot colour + word. avg counter load is 0..1.
function band(avg: number): { color: string; word: string } {
  if (avg < 0.34) return { color: "#2e7d32", word: "Quiet" };
  if (avg < 0.67) return { color: "#f59e0b", word: "Moderate" };
  return { color: "#d32f2f", word: "Busy" };
}

export function PolygonLabels({
  floor,
  onPickPlace,
}: {
  floor: Floor;
  onPickPlace?: (serviceId: string) => void;
}) {
  const language = useStore(s => s.language);
  const services = useStore(s => s.services);
  const counterLoads = useStore(s => s.counterLoads);
  const popularTimes = useStore(s => s.popularTimes);
  const activeRoute = useStore(s => s.activeRoute);
  const [openId, setOpenId] = useState<string | null>(null);

  // The room the user is currently being guided to — emphasised on the map.
  const destRoomId = (() => {
    const sid = activeRoute?.variant.serviceId;
    if (!sid) return null;
    const svc = services.find(s => s.id === sid);
    return svc?.floorId === floor.id ? svc.roomId ?? null : null;
  })();

  // roomId -> the (first) service in that room, for busyness + "Take me here".
  const svcByRoom = new Map<string, Service>();
  for (const s of services) {
    if (s.floorId === floor.id && s.roomId && !svcByRoom.has(s.roomId)) {
      svcByRoom.set(s.roomId, s);
    }
  }

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
        const name = poiLabel(id, floor.id, language);
        if (!name) return null; // infrastructure — leave unlabelled
        const cx = a.sx / a.n;
        const cy = a.sy / a.n;
        const x = cx - floor.bounds.width / 2;
        const z = cy - floor.bounds.depth / 2;
        const isDest = id === destRoomId;

        // Destination room: emphasised pin, not interactive.
        if (isDest) {
          return (
            <Html
              key={id}
              position={[x, a.maxH + 1, z]}
              center
              distanceFactor={52}
              occlude={false}
              zIndexRange={[40, 0]}
            >
              <div className="pointer-events-none flex flex-col items-center -translate-y-1">
                <div className="whitespace-nowrap rounded-full bg-oth-primary px-3 py-1 text-[13px] font-bold text-white shadow-lg ring-2 ring-white">
                  {name}
                </div>
                <div className="h-2.5 w-2.5 -mt-0.5 rotate-45 bg-oth-primary" />
                <div className="mt-0.5 h-2 w-2 rounded-full bg-oth-primary/40 animate-pulse" />
              </div>
            </Html>
          );
        }

        const svc = svcByRoom.get(id);

        // A zone with no service: plain, non-interactive name (unchanged).
        if (!svc) {
          return (
            <Html
              key={id}
              position={[x, a.maxH + 1, z]}
              center
              distanceFactor={72}
              occlude={false}
              zIndexRange={[15, 0]}
            >
              <div className="pointer-events-none whitespace-nowrap rounded-lg bg-white/95 px-2 py-0.5 text-[12px] font-semibold text-oth-ink shadow-md border border-black/5">
                {name}
              </div>
            </Html>
          );
        }

        // A service zone: clickable label with a busyness dot; tap reveals a
        // card with people-waiting + provenance + a "Take me here" action.
        const ids = svc.counterIds ?? [];
        const avg =
          ids.length === 0
            ? 0
            : ids.reduce((acc, cid) => acc + (counterLoads[cid] ?? 0), 0) / ids.length;
        const crowd = crowdEstimate(svc.id, avg);
        const b = band(avg);
        const source = busynessSourceFor(svc.id, popularTimes);
        const open = openId === id;

        return (
          <Html
            key={id}
            position={[x, a.maxH + 1, z]}
            center
            distanceFactor={open ? 50 : 72}
            occlude={false}
            zIndexRange={open ? [45, 0] : [15, 0]}
          >
            {open ? (
              <div className="w-44 rounded-xl border border-black/10 bg-white px-3 py-2 text-oth-ink shadow-xl">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-bold leading-tight">{name}</div>
                  <button
                    onClick={() => setOpenId(null)}
                    className="text-[15px] leading-none text-black/40 hover:text-black/70"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: b.color }}
                  />
                  <span className="text-[12px] font-semibold">{b.word}</span>
                  <span className="text-[12px] text-black/60">
                    · {crowd.count} {crowd.noun}
                  </span>
                </div>
                {source && (
                  <div className="text-[10px] text-black/45">{SOURCE_LABEL[source]}</div>
                )}
                <button
                  onClick={() => {
                    onPickPlace?.(svc.id);
                    setOpenId(null);
                  }}
                  className="mt-2 w-full rounded-lg bg-oth-primary px-2 py-1.5 text-[12px] font-bold text-white"
                >
                  Take me here
                </button>
              </div>
            ) : (
              <button
                onClick={() => setOpenId(id)}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-black/5 bg-white/95 px-2 py-0.5 text-[12px] font-semibold text-oth-ink shadow-md"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} />
                {name}
              </button>
            )}
          </Html>
        );
      })}
    </>
  );
}
