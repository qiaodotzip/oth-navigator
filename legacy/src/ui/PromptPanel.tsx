import type { ReactNode } from "react";
import { useStore } from "@/store";
import { IntentEntry } from "./IntentEntry";
import { ResultCard } from "./ResultCard";
import { buildStepInstruction } from "./stepInstruction";
import {
  ArrowRight,
  Check,
  PersonSimpleWalk,
  ArrowUp,
  ArrowDown,
  MapPin,
  X,
  Sun,
  MoonStars,
  Wheelchair,
} from "phosphor-react";

const WALK_SPEED_MPS = 1.2;

export function PromptPanel({
  onSubmitIntent,
  onRoutingDemo,
  onAccessDemo,
  onGuide,
  onStartInApp,
  onAskAgain,
  onNext,
  onArrived,
  onGoToHelpDesk,
  onSkipStop,
}: {
  onSubmitIntent: (query: string, fromText?: boolean) => void;
  onRoutingDemo?: () => void;
  onAccessDemo?: () => void;
  onGuide: (plan: import("@/intent/types").Plan) => void;
  onStartInApp: (plan: Extract<import("@/intent/types").Plan, { kind: "offsite" }>) => void;
  onAskAgain: () => void;
  onNext: () => void;
  onArrived: () => void;
  onGoToHelpDesk: (stop: import("@/intent/types").PlanStop) => void;
  onSkipStop: (stop: import("@/intent/types").PlanStop) => void;
}) {
  const route = useStore(s => s.activeRoute);
  const routePreview = useStore(s => s.routePreview);
  const timeOfDay = useStore(s => s.timeOfDay);
  const setTimeOfDay = useStore(s => s.setTimeOfDay);
  const setProfile = useStore(s => s.setProfile);
  const activePlan = useStore(s => s.activePlan);
  const intentStatus = useStore(s => s.intentStatus);
  const services = useStore(s => s.services);
  const language = useStore(s => s.language);
  const journey = useStore(s => s.journey);
  const profile = useStore(s => s.profile);
  const endRoute = useStore(s => s.endRoute);
  const resetIntent = useStore(s => s.resetIntent);

  if (!route) {
    const shell = (inner: ReactNode) => (
      <div className="h-full overflow-y-auto overflow-x-hidden bg-oth-paper border-t border-neutral-300 md:border-t-0 md:border-r">
        {inner}
      </div>
    );
    if (intentStatus === "resolving") {
      return shell(
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-oth-primary/20 border-t-oth-primary" />
          <p className="text-base font-semibold text-oth-ink">
            {language === "zh" ? "正在为您寻找…" : "Finding the right place…"}
          </p>
          <p className="text-xs text-neutral-400">
            {language === "zh" ? "正在查询 One Tampines Hub" : "Checking One Tampines Hub"}
          </p>
        </div>,
      );
    }
    if (activePlan) {
      return shell(
        <ResultCard
          plan={activePlan}
          onGuide={onGuide}
          onStartInApp={onStartInApp}
          onAskAgain={onAskAgain}
          onGoToHelpDesk={onGoToHelpDesk}
          onSkipStop={onSkipStop}
        />,
      );
    }
    return shell(
      <IntentEntry
        onSubmit={onSubmitIntent}
        onRoutingDemo={onRoutingDemo}
        onAccessDemo={onAccessDemo}
      />,
    );
  }

  // PREVIEW: the route is drawn on the map (orbit view) purely to illustrate the
  // routing. No turn-by-turn — instead an in-panel switch (Morning/Evening for
  // the crowd demo, Step-free/Stairs for the accessibility demo) so the presenter
  // flips it and watches the path re-bend.
  if (routePreview) {
    const isAccess = routePreview === "access";
    const svc = services.find(s => s.id === route.variant.serviceId);
    const svcName = svc ? (language === "zh" ? svc.nameZh : svc.nameEn) : "";
    const switchBtn = (
      active: boolean,
      onClick: () => void,
      Icon: typeof Sun,
      label: string,
    ) => (
      <button
        onClick={onClick}
        aria-pressed={active}
        className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-sm font-bold transition active:scale-95 ${
          active
            ? "bg-oth-primary text-white shadow-sm"
            : "bg-white text-oth-ink ring-1 ring-neutral-200"
        }`}
      >
        <Icon size={18} weight="bold" />
        {label}
      </button>
    );
    const headline = isAccess
      ? language === "zh"
        ? "切换路线类型，看它改走电梯或楼梯"
        : "Switch the route type — lift or staircase"
      : language === "zh"
        ? "切换时间，看路线避开人潮"
        : "Switch the time — watch the route avoid the crowd";
    const sub = isAccess
      ? language === "zh"
        ? "无障碍只走电梯；可走楼梯时，路线改走附近的楼梯。"
        : "Step-free takes the lift; allow stairs and it routes via the nearby staircase."
      : language === "zh"
        ? "傍晚小贩中心人多，路线会改走较空的电梯。"
        : "In the evening the hawker centre fills up, so the route takes a quieter lift.";
    return (
      <div className="h-full overflow-x-hidden bg-oth-paper border-t border-neutral-300 md:border-t-0 md:border-r flex flex-col">
        <div className="flex flex-shrink-0 items-center justify-between gap-2 px-4 pt-3">
          <span className="min-w-0 truncate text-sm font-semibold text-neutral-500">
            {language === "zh" ? "路线预览" : "Routing preview"}
            {svcName && ` → ${svcName}`}
          </span>
          <button
            onClick={() => {
              endRoute();
              resetIntent();
            }}
            aria-label={language === "zh" ? "关闭预览" : "Close preview"}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-200"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-3 overflow-y-auto px-4 py-3">
          <p className="text-lg font-extrabold leading-tight text-oth-ink">{headline}</p>
          <p className="text-sm font-semibold leading-snug text-neutral-500">{sub}</p>
          <div className="mt-1 flex flex-col gap-2">
            {isAccess ? (
              <>
                {switchBtn(
                  profile === "stepFree",
                  () => setProfile("stepFree"),
                  Wheelchair,
                  language === "zh" ? "无障碍 · 电梯" : "Step-free · lift",
                )}
                {switchBtn(
                  profile === "default",
                  () => setProfile("default"),
                  PersonSimpleWalk,
                  language === "zh" ? "可走楼梯 · 楼梯" : "Stairs OK · staircase",
                )}
              </>
            ) : (
              <>
                {switchBtn(
                  timeOfDay === "morning",
                  () => setTimeOfDay("morning"),
                  Sun,
                  language === "zh" ? "早晨 · 人少" : "Morning · quiet",
                )}
                {switchBtn(
                  timeOfDay === "evening",
                  () => setTimeOfDay("evening"),
                  MoonStars,
                  language === "zh" ? "傍晚 · 人多" : "Evening · busy",
                )}
              </>
            )}
          </div>
        </div>
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

  // Journey progress: which stop (of how many) is this service?
  const stopProgress = (() => {
    if (!journey || journey.stops.length === 0) return null;
    const sorted = [...journey.stops].sort((a, b) => a.order - b.order);
    const i = sorted.findIndex(s => s.serviceId === route.variant.serviceId);
    return i >= 0 ? { n: i + 1, total: sorted.length } : null;
  })();

  // The next journey stop after the one we're arriving at (for the chain prompt).
  const nextStop = (() => {
    if (!journey) return null;
    const cur = journey.stops.find(s => s.serviceId === route.variant.serviceId);
    return (
      journey.stops
        .filter(s => s.order > (cur?.order ?? -1))
        .sort((a, b) => a.order - b.order)[0] ?? null
    );
  })();
  const nextStopName = nextStop
    ? (() => {
        const s = services.find(x => x.id === nextStop.serviceId);
        return s ? (language === "zh" ? s.nameZh : s.nameEn) : nextStop.serviceId;
      })()
    : null;

  // Headline instruction for this step — same builder the spoken guidance uses,
  // so the on-screen distance and the spoken distance always match.
  const instruction = buildStepInstruction(route.variant, idx, services, language);
  const distance = instruction.distanceM;
  const walkSec = Math.max(1, Math.round(distance / WALK_SPEED_MPS));
  const eta = walkSec < 60 ? `${walkSec}${language === "zh" ? "秒" : "s"}` : `${Math.round(walkSec / 60)} ${language === "zh" ? "分钟" : "min"}`;
  const floorChange = !!(next && next.floorId !== current.floorId);
  const goingUp = floorChange && next!.floorId > current.floorId; // "L2" > "L1"

  const progressPct = steps.length > 1 ? (idx / (steps.length - 1)) * 100 : 100;

  const HeroIcon =
    instruction.kind === "arrived"
      ? MapPin
      : instruction.kind === "handoff"
        ? ArrowUp
        : instruction.kind === "transit"
          ? goingUp
            ? ArrowUp
            : ArrowDown
          : PersonSimpleWalk;
  const heroTone =
    instruction.kind === "arrived"
      ? "bg-green-600"
      : instruction.kind === "handoff"
        ? "bg-amber-500"
        : "bg-oth-primary";

  return (
    <div className="h-full overflow-x-hidden bg-oth-paper border-t border-neutral-300 md:border-t-0 md:border-r flex flex-col">
      {/* Header: journey progress + step counter + exit */}
      <div className="flex-shrink-0 px-4 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stopProgress && (
              <span className="rounded-full bg-oth-primary/10 px-2.5 py-0.5 text-xs font-bold text-oth-primary">
                {language === "zh"
                  ? `第 ${stopProgress.n}/${stopProgress.total} 站`
                  : `Stop ${stopProgress.n} of ${stopProgress.total}`}
              </span>
            )}
            {svcName && (
              <span className="truncate text-sm font-semibold text-neutral-500">
                → {svcName}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              endRoute();
              resetIntent(); // cancel → back to the ask box, not the result card
            }}
            aria-label={language === "zh" ? "结束导航" : "End navigation"}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-200"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
        {/* Slim progress bar across the route's waypoints */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full rounded-full bg-oth-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Hero instruction */}
      <div className="flex flex-1 flex-col justify-center gap-3 overflow-y-auto px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl text-white shadow-md ${heroTone}`}
          >
            <HeroIcon size={26} weight="bold" />
          </span>
          {instruction.kind !== "arrived" && (
            <span className="rounded-full bg-oth-primary/10 px-3 py-1 text-sm font-bold text-oth-primary">
              {Math.round(distance)} m · {eta}
            </span>
          )}
        </div>

        <div>
          <p className="text-lg font-extrabold leading-tight text-oth-ink">
            {instruction.title}
          </p>
          {instruction.sub && (
            <p className="mt-1 text-sm font-semibold leading-snug text-neutral-500">
              {instruction.sub}
            </p>
          )}
        </div>

        {profile === "stepFree" && instruction.kind !== "arrived" && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
            <Check size={13} weight="bold" />
            {language === "zh" ? "无障碍路线" : "Step-free route"}
          </span>
        )}
      </div>

      {/* Pinned footer action */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        {isLast ? (
          <button
            onClick={onArrived}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-3 text-[15px] font-bold leading-tight text-white shadow-sm transition active:scale-95"
          >
            {nextStopName ? (
              <>
                {language === "zh" ? "下一站：" : "Next stop: "}
                {nextStopName}
                <ArrowRight size={20} weight="bold" />
              </>
            ) : (
              <>
                <Check size={20} weight="bold" />
                {language === "zh" ? "行程完成" : "Journey complete"}
              </>
            )}
          </button>
        ) : (
          <button
            onClick={onNext}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-oth-primary py-3 text-[15px] font-bold leading-tight text-white shadow-sm transition active:scale-95"
          >
            {language === "zh" ? "我到了" : "I'm here"}
            <ArrowRight size={20} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}
