import type { Level } from "@oth/model";
import { waitingReview } from "../flow/floorProgress";
import { FLOOR_TABS, followLink, href, type FloorTab } from "../route";
import { useEditorStore } from "../state/store";

const LABELS: Record<FloorTab, string> = { survey: "Survey", review: "Review", build: "Build" };

/**
 * Survey · Review (n) · Build for one floor; n is what is waiting on a person.
 * On Build, clicking Build again stays on the step you are on (`buildStep`)
 * rather than jumping to the first unfinished one.
 */
export function FloorTabs({ level, tab, buildStep }: { level: Level; tab: FloorTab | null; buildStep?: string }) {
  const model = useEditorStore(s => s.model);
  const waiting = waitingReview(model, level.id);

  return (
    <nav aria-label="Workspace" className="flex gap-1">
      {FLOOR_TABS.map(t => {
        const to = href({ name: "floor", code: level.code, tab: t, params: t === "build" && buildStep ? { step: buildStep } : {} });
        return (
          <a
            key={t}
            href={to}
            onClick={followLink(to)}
            aria-current={tab === t ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${
              tab === t ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {LABELS[t]}
            {t === "review" && waiting > 0 && (
              // Ruling 13: stone text and a proposed border, since the proposed
              // blue as 13 px text on its soft fill is 3.57:1.
              <span className="rounded-full border border-proposed bg-proposed-soft px-1.5 text-xs text-stone-900">{waiting}</span>
            )}
          </a>
        );
      })}
    </nav>
  );
}
