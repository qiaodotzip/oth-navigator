import { useStore } from "@/store";
import { ServiceTiles } from "./ServiceTiles";
import { ArrowRight, Check, Warning } from "phosphor-react";
import { checkSegment } from "@/routing/pathChecks";

const WALK_SPEED_MPS = 1.2;

export function PromptPanel({
  narrationText,
  onPickService,
  onNext,
}: {
  narrationText: string;
  onPickService: (id: string) => void;
  onNext: () => void;
}) {
  const route = useStore(s => s.activeRoute);
  const services = useStore(s => s.services);
  const floors = useStore(s => s.floors);
  const language = useStore(s => s.language);
  const endRoute = useStore(s => s.endRoute);

  if (!route) {
    return (
      <div className="h-full bg-oth-paper border-t border-neutral-300 overflow-hidden">
        <ServiceTiles onPick={onPickService} />
      </div>
    );
  }

  const steps = route.variant.steps;
  const idx = route.currentWaypointIndex;
  const current = steps[idx];
  const next = steps[idx + 1];
  const isLast = idx >= steps.length - 1;
  const svc = services.find(s => s.id === route.variant.serviceId);
  const svcName = svc ? (language === "zh" ? svc.nameZh : svc.nameEn) : "";

  const distance = next
    ? Math.hypot(
        next.point[0] - current.point[0],
        next.point[1] - current.point[1],
      )
    : 0;
  const walkSec = Math.max(1, Math.round(distance / WALK_SPEED_MPS));
  const floorChange = !!(next && next.floorId !== current.floorId);

  let blockedRooms: string[] = [];
  if (next && !floorChange) {
    const floor = floors.find(f => f.id === current.floorId);
    if (floor) {
      const destRoomId =
        svc && svc.floorId === floor.id ? svc.roomId : undefined;
      blockedRooms = checkSegment(current.point, next.point, floor, destRoomId)
        .blockingRoomIds;
    }
  }

  return (
    <div className="h-full bg-oth-paper border-t border-neutral-300 overflow-hidden p-4 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
          Step {idx + 1} of {steps.length}
        </p>
        {svcName && (
          <p className="text-[10px] font-semibold text-oth-primary truncate ml-2">
            → {svcName}
          </p>
        )}
      </div>

      <p className="text-base font-semibold text-oth-ink leading-snug mb-3 flex-shrink-0">
        {narrationText || (isLast ? "You've arrived." : "…")}
      </p>

      {!isLast && (
        <div className="flex items-center gap-2 mb-2 text-xs text-neutral-600">
          {floorChange ? (
            <span className="font-semibold text-oth-primary">
              Take the {current.segmentKey === "lift" ? "lift" : "escalator"} to {next!.floorId}
            </span>
          ) : (
            <>
              <span>About {Math.round(distance)}m</span>
              <span>•</span>
              <span>{walkSec}s walk</span>
            </>
          )}
        </div>
      )}

      {blockedRooms.length > 0 && (
        <div className="mb-3 flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          <Warning size={14} weight="fill" className="flex-shrink-0 mt-0.5" />
          <span>
            Path crosses {blockedRooms.length === 1 ? "room" : "rooms"}:{" "}
            <span className="font-mono">{blockedRooms.join(", ")}</span>. Adjust waypoints to walk around.
          </span>
        </div>
      )}

      <div className="mt-auto">
        {isLast ? (
          <button
            onClick={endRoute}
            className="w-full py-3 rounded-2xl bg-green-600 text-white font-semibold flex items-center justify-center gap-2 active:scale-95 transition"
          >
            <Check size={20} weight="bold" />
            Arrived
          </button>
        ) : (
          <button
            onClick={onNext}
            className="w-full py-3 rounded-2xl bg-oth-primary text-white font-semibold flex items-center justify-center gap-2 active:scale-95 transition"
          >
            {language === "zh" ? "我到了，下一步" : "I'm here, what's next"}
            <ArrowRight size={20} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}
