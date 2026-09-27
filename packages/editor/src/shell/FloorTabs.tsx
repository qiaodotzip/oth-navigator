import type { Level } from "@oth/model";
import { waitingReview } from "../flow/floorProgress";
import { FLOOR_TABS, followLink, href, type FloorTab } from "../route";
import { useEditorStore } from "../state/store";

const LABELS: Record<FloorTab, string> = { survey: "Survey", review: "Review", build: "Build" };

/** Survey · Review (n) · Build for one floor; n is what is waiting on a person. */
export function FloorTabs({ level, tab }: { level: Level; tab: FloorTab | null }) {
  const model = useEditorStore(s => s.model);
  const waiting = waitingReview(model, level.id);

  return (
    <nav aria-label="Workspace" className="flex gap-1">
      {FLOOR_TABS.map(t => {
        const to = href({ name: "floor", code: level.code, tab: t, params: {} });
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
              <span className="rounded-full bg-proposed-soft px-1.5 text-xs text-proposed">{waiting}</span>
            )}
          </a>
        );
      })}
    </nav>
  );
}
