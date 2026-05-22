import { useStore } from "@/store";
import { CheckCircle, X } from "phosphor-react";

export function SuccessCard({ onDismiss }: { onDismiss: () => void }) {
  const services = useStore(s => s.services);
  const activeRoute = useStore(s => s.activeRoute);
  const counterLoads = useStore(s => s.counterLoads);
  const language = useStore(s => s.language);
  if (!activeRoute) return null;
  const finished =
    activeRoute.currentWaypointIndex >= activeRoute.variant.steps.length - 1;
  if (!finished) return null;
  const svc = services.find(s => s.id === activeRoute.variant.serviceId);
  if (!svc) return null;
  const counterId = activeRoute.variant.counterId;
  const load = counterId ? Math.round((counterLoads[counterId] ?? 0) * 10) : null;

  return (
    <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-oth-primary text-white shadow-xl p-4 z-10">
      <div className="flex items-start gap-3">
        <CheckCircle size={28} weight="fill" />
        <div className="flex-1">
          <p className="text-sm opacity-80">
            {language === "en" ? "You've arrived" : "您已到达"}
          </p>
          <p className="text-lg font-semibold">
            {language === "en" ? svc.nameEn : svc.nameZh}
          </p>
          {load !== null && (
            <p className="text-xs opacity-80 mt-1">
              {language === "en"
                ? `Counter ${counterId} — about ${load} people waiting`
                : `${counterId} 柜台 — 大约 ${load} 人在等候`}
            </p>
          )}
        </div>
        <button onClick={onDismiss} aria-label="Close">
          <X size={20} weight="bold" />
        </button>
      </div>
    </div>
  );
}
