import { useStore } from "@/store";
import { ArrowRight, Check } from "phosphor-react";

export function JourneyTimeline({ onPick }: { onPick: (serviceId: string) => void }) {
  const journey = useStore(s => s.journey);
  const doneStops = useStore(s => s.doneStops);
  const services = useStore(s => s.services);
  const activeRoute = useStore(s => s.activeRoute);
  const language = useStore(s => s.language);

  if (!journey || journey.stops.length === 0) return null;

  const stops = [...journey.stops].sort((a, b) => a.order - b.order);
  const activeServiceId = activeRoute?.variant.serviceId ?? null;
  // The "current" stop: the one being routed to, else the first not-yet-done.
  const currentId =
    activeServiceId && stops.some(s => s.serviceId === activeServiceId)
      ? activeServiceId
      : stops.find(s => !doneStops.includes(s.serviceId))?.serviceId ?? null;

  const nameOf = (id: string) => {
    const svc = services.find(s => s.id === id);
    if (!svc) return id;
    return language === "zh" ? svc.nameZh : svc.nameEn;
  };

  return (
    <div className="absolute top-2 left-2 right-14 z-20">
      <div className="flex items-stretch gap-1.5 overflow-x-auto rounded-2xl bg-white/85 backdrop-blur px-2 py-2 shadow-md border border-white/60">
        <span className="self-center pl-1 pr-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-400 shrink-0">
          Your<br />trip
        </span>
        {stops.map((stop, i) => {
          const done = doneStops.includes(stop.serviceId);
          const isCurrent = stop.serviceId === currentId && !done;
          return (
            <button
              key={stop.serviceId}
              onClick={() => onPick(stop.serviceId)}
              className={`relative flex items-center gap-1.5 rounded-xl px-2 py-1.5 shrink-0 transition active:scale-95 border ${
                isCurrent
                  ? "bg-oth-primary text-white border-oth-primary shadow"
                  : done
                    ? "bg-green-50 text-green-800 border-green-200"
                    : "bg-white text-neutral-600 border-neutral-200"
              }`}
            >
              <span
                className={`grid place-items-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 ${
                  isCurrent
                    ? "bg-white text-oth-primary"
                    : done
                      ? "bg-green-600 text-white"
                      : "bg-neutral-200 text-neutral-600"
                }`}
              >
                {done ? <Check size={12} weight="bold" /> : i + 1}
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-xs font-semibold whitespace-nowrap">
                  {nameOf(stop.serviceId)}
                </span>
                {isCurrent && stop.reason && (
                  <span className="text-[10px] font-normal opacity-90 whitespace-nowrap">
                    {language === "zh" ? stop.reason.zh : stop.reason.en}
                  </span>
                )}
              </span>
            </button>
          );
        })}

        {/* ── "Take me on the route" CTA ── */}
        {currentId && (
          <button
            onClick={() => onPick(currentId)}
            aria-label={language === "zh" ? "带我出发" : "Take me on the route"}
            className="flex items-center gap-2 rounded-full bg-oth-primary px-4 py-2 text-white font-bold text-sm shrink-0 shadow-lg active:scale-95 transition ml-1 whitespace-nowrap"
          >
            <ArrowRight size={18} weight="bold" />
            {language === "zh" ? "带我出发" : "Take me on the route"}
          </button>
        )}
      </div>
    </div>
  );
}
