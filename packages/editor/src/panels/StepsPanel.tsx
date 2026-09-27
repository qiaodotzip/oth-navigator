import { useState, type ReactNode } from "react";
import { levelChecklist } from "../flow/checklist";
import { nextSectionId, stepSections, type SectionId } from "../flow/sections";
import { useEditorStore } from "../state/store";
import { TOOL_LABELS } from "../state/tools";
import { imageForLevel } from "../state/underlay";

const MARK = { done: "●", todo: "○" } as const;

export function StepsPanel({ sections: content }: { sections: Partial<Record<SectionId, ReactNode>> }) {
  const model = useEditorStore(s => s.model);
  const report = useEditorStore(s => s.report);
  const levelId = useEditorStore(s => s.activeLevelId);
  const levelImages = useEditorStore(s => s.levelImages);
  const setTool = useEditorStore(s => s.setTool);
  const select = useEditorStore(s => s.select);

  const sections = stepSections(
    levelChecklist({ model, levelId, image: imageForLevel(levelImages, levelId), report }),
  );
  const next = nextSectionId(sections);

  // Null means "follow the next unfinished section". Once someone opens one by
  // hand, their choice sticks rather than being yanked away as they work.
  const [opened, setOpened] = useState<SectionId | null>(null);
  const openId = opened ?? next;

  return (
    <div className="text-sm">
      {sections.map(section => {
        const isOpen = section.id === openId;
        return (
          <section key={section.id} data-testid={`section-${section.id}`} data-open={String(isOpen)}>
            <button
              className={`flex w-full items-baseline gap-2 border-b px-3 py-2 text-left ${
                section.id === next ? "bg-amber-50" : "bg-white hover:bg-stone-50"
              }`}
              onClick={() => setOpened(isOpen ? ("none" as SectionId) : section.id)}
            >
              <span className="w-3 text-stone-400">{isOpen ? "▾" : "▸"}</span>
              {section.status && (
                <span className={section.status === "done" ? "text-emerald-600" : "text-stone-400"}>
                  {MARK[section.status]}
                </span>
              )}
              <span className="flex-1 font-medium">{section.label}</span>
              <span className="text-xs text-stone-500">{section.detail}</span>
            </button>

            {isOpen && (
              <div className="space-y-3 border-b bg-stone-50/60 px-3 py-3">
                {section.steps.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {section.steps
                      .flatMap(step => step.tools)
                      .map(t => (
                        <button
                          key={t}
                          className="rounded border bg-white px-2 py-1 text-xs hover:bg-stone-100"
                          onClick={() => setTool(t)}
                        >
                          {TOOL_LABELS[t]}
                        </button>
                      ))}
                  </div>
                )}

                {content[section.id]}

                {section.issues.length > 0 && (
                  <ul className="space-y-0.5">
                    {section.issues.map((issue, i) => (
                      <li key={`${issue.code}-${issue.entityId}-${i}`}>
                        <button
                          className="text-left text-xs hover:underline"
                          onClick={() => {
                            if (issue.entityType === "room" || issue.entityType === "entrance") {
                              select({ type: issue.entityType, id: issue.entityId });
                            }
                          }}
                        >
                          <span
                            className={issue.severity === "error" ? "text-red-700" : "text-amber-700"}
                          >
                            {issue.severity === "error" ? "✕" : "!"}
                          </span>{" "}
                          {issue.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
