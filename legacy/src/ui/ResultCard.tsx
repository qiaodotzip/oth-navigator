import { ArrowRight, MapPinLine, ArrowSquareOut, Check, Info } from "phosphor-react";
import { useStore } from "@/store";
import type { Plan, PlanStop } from "@/intent/types";

export function ResultCard({
  plan,
  onGuide,
  onStartInApp,
  onAskAgain,
  onGoToHelpDesk,
  onSkipStop,
}: {
  plan: Plan;
  onGuide: (plan: Plan) => void;
  onStartInApp: (plan: Extract<Plan, { kind: "offsite" }>) => void;
  onAskAgain: () => void;
  onGoToHelpDesk: (stop: PlanStop) => void;
  onSkipStop: (stop: PlanStop) => void;
}) {
  const language = useStore(s => s.language);
  const journey = useStore(s => s.journey);
  const t = (x: { en: string; zh: string }) => (language === "zh" ? x.zh : x.en);

  const AskAgain = (
    <button
      onClick={onAskAgain}
      className="mt-2 w-full text-center text-sm font-semibold text-neutral-400 hover:text-oth-primary"
    >
      {language === "zh" ? "不是这个？重新询问" : "Not quite? Ask again"}
    </button>
  );

  if (plan.kind === "human") {
    return (
      <div className="flex flex-col px-4 py-4">
        <div className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <Info size={26} weight="fill" className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-base font-semibold text-oth-ink">{t(plan.message)}</p>
        </div>
        <button
          onClick={() => onGuide(plan)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-oth-primary py-3 text-[15px] font-bold leading-tight text-white shadow-sm transition active:scale-95"
        >
          {language === "zh" ? "带我去服务柜台" : "Take me to the help desk"}
          <ArrowRight size={20} weight="bold" />
        </button>
        {AskAgain}
      </div>
    );
  }

  if (plan.kind === "offsite") {
    return (
      <div className="flex flex-col px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-wider text-violet-500">
          {language === "zh" ? "线上服务" : "Online service"}
        </p>
        <h2 className="mt-0.5 text-xl font-extrabold text-oth-ink">{t(plan.stop.name)}</h2>
        <p className="mt-1 text-sm font-medium text-neutral-500">
          {language === "zh" ? "此服务在应用中办理。" : "This is handled in the OTH app."}
        </p>
        <button
          onClick={() => onStartInApp(plan)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3 text-[15px] font-bold leading-tight text-white shadow-sm transition active:scale-95"
        >
          {t(plan.appHandoff.label)}
          <ArrowSquareOut size={20} weight="bold" />
        </button>
        {AskAgain}
      </div>
    );
  }

  if (plan.kind === "unreachable") {
    const stop = plan.stop;
    // Is there another journey stop after this one? Drives the "move on" label.
    const order = journey?.stops.find(s => s.serviceId === stop.serviceId)?.order ?? -1;
    const hasNext = !!journey?.stops.some(s => s.order > order);
    const where = stop.unmodelledLevel
      ? language === "zh"
        ? `${t(stop.name)}位于 ${stop.unmodelledLevel} 楼，我们暂时无法在馆内为您导航至该处。`
        : `${t(stop.name)} is on Level ${stop.unmodelledLevel} — we can't guide you indoors there yet.`
      : language === "zh"
        ? `我们暂时无法在馆内为您导航至${t(stop.name)}。`
        : `We can't guide you indoors to ${t(stop.name)} yet.`;
    return (
      <div className="flex flex-col px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-wider text-violet-500">
          {language === "zh" ? "线上办理或前往柜台" : "Do it online or at a desk"}
        </p>
        <h2 className="mt-0.5 text-xl font-extrabold text-oth-ink">{t(stop.name)}</h2>
        <p className="mt-1 text-sm font-medium text-neutral-500">{where}</p>

        {stop.website && (
          <a
            href={stop.website}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3 text-[15px] font-bold leading-tight text-white shadow-sm transition active:scale-95"
          >
            {language === "zh" ? "在线办理" : "Do it online"}
            <ArrowSquareOut size={20} weight="bold" />
          </a>
        )}

        <button
          onClick={() => onGoToHelpDesk(stop)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-oth-primary py-3 text-[15px] font-bold leading-tight text-white shadow-sm transition active:scale-95"
        >
          {language === "zh" ? "带我去最近的服务柜台" : "Go to the nearest help desk"}
          <MapPinLine size={20} weight="bold" />
        </button>

        {/* After doing it online, move on without walking anywhere. */}
        <button
          onClick={() => onSkipStop(stop)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-neutral-300 py-3 text-[15px] font-bold leading-tight text-oth-ink transition active:scale-95"
        >
          {hasNext
            ? language === "zh"
              ? "下一站"
              : "Next stop"
            : language === "zh"
              ? "完成"
              : "I'm done"}
          {hasNext ? <ArrowRight size={20} weight="bold" /> : <Check size={20} weight="bold" />}
        </button>
        {AskAgain}
      </div>
    );
  }

  if (plan.kind === "journey") {
    return (
      <div className="flex flex-col px-4 py-4">
        <p className="text-xs font-bold uppercase tracking-wider text-oth-primary">
          {language === "zh" ? `行程 · ${plan.stops.length} 站` : `Your plan · ${plan.stops.length} stops`}
        </p>
        <ul className="mt-2 flex flex-col gap-2 overflow-y-auto">
          {plan.stops.map((s, i) => (
            <li key={s.serviceId} className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-2.5">
              <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-oth-primary text-sm font-bold text-white">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold leading-tight text-oth-ink">{t(s.name)}</span>
                {s.reason && (
                  <span className="mt-0.5 block text-xs leading-snug text-neutral-500 line-clamp-2">
                    {t(s.reason)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <button
          onClick={() => onGuide(plan)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-oth-primary py-3 text-[15px] font-bold leading-tight text-white shadow-sm transition active:scale-95"
        >
          {language === "zh" ? "开始行程" : "Start journey"}
          <ArrowRight size={20} weight="bold" />
        </button>
        {AskAgain}
      </div>
    );
  }

  // destination
  const a11y = plan.stop.accessibility;
  return (
    <div className="flex flex-col px-4 py-4">
      <div className="flex items-center gap-2">
        <Check size={20} weight="bold" className="text-green-600" />
        <h2 className="text-xl font-extrabold leading-tight text-oth-ink">{t(plan.answer)}</h2>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {a11y?.stepFree && (
          <span className="inline-flex items-center gap-1 font-semibold text-green-700">
            <Check size={14} weight="bold" />
            {language === "zh" ? "无障碍" : "Step-free"}
          </span>
        )}
        {plan.stop.walkInAccepted && (
          <span className="font-semibold text-neutral-600">
            {language === "zh" ? "可直接前往" : "Walk-in OK"}
          </span>
        )}
      </div>
      {plan.stop.requiredDocuments && plan.stop.requiredDocuments.length > 0 && (
        <p className="mt-2 text-sm text-neutral-600">
          📄 {language === "zh" ? "请携带：" : "Bring: "}
          {plan.stop.requiredDocuments.map(d => d.name).join(", ")}
        </p>
      )}
      <button
        onClick={() => onGuide(plan)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-oth-primary py-3 text-[15px] font-bold leading-tight text-white shadow-sm transition active:scale-95"
      >
        <MapPinLine size={20} weight="bold" />
        {language === "zh" ? "带我去" : "Guide me there"}
      </button>
      {AskAgain}
    </div>
  );
}
