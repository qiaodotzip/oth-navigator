import { levelChecklist } from "../flow/checklist";
import { useEditorStore } from "../state/store";
import { imageForLevel } from "../state/underlay";

const MARK = { done: "●", todo: "○" } as const;

export function ChecklistPanel() {
  const model = useEditorStore(s => s.model);
  const report = useEditorStore(s => s.report);
  const levelId = useEditorStore(s => s.activeLevelId);
  const levelImages = useEditorStore(s => s.levelImages);
  const setTool = useEditorStore(s => s.setTool);
  const select = useEditorStore(s => s.select);

  const level = model?.levels.find(l => l.id === levelId);
  const steps = levelChecklist({
    model,
    levelId,
    image: imageForLevel(levelImages, levelId),
    report,
  });

  // Exactly one step is "next": the first unfinished one. Without it the panel
  // is a status list, not guidance.
  const nextId = steps.find(s => s.status === "todo")?.id ?? null;

  return (
    <div className="border-b p-3 text-sm">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
        {level ? `Steps for ${level.code}` : "Steps for this level"}
      </h2>
      <ol className="space-y-1">
        {steps.map(step => (
          <li
            key={step.id}
            data-testid={`step-${step.id}`}
            data-next={String(step.id === nextId)}
            className={`rounded px-2 py-1 ${
              step.id === nextId ? "bg-amber-50 ring-1 ring-amber-300" : ""
            }`}
          >
            <button
              className="flex w-full items-baseline gap-2 text-left"
              onClick={() => step.tool && setTool(step.tool)}
            >
              <span className={step.status === "done" ? "text-emerald-600" : "text-stone-400"}>
                {MARK[step.status]}
              </span>
              <span className="flex-1">{step.label}</span>
              <span className="text-xs text-stone-500">{step.detail}</span>
            </button>

            {step.issues.length > 0 && (
              <ul className="ml-6 mt-1 space-y-0.5">
                {step.issues.map((issue, i) => (
                  <li key={`${issue.code}-${issue.entityId}-${i}`}>
                    <button
                      className="text-left text-xs hover:underline"
                      onClick={() => {
                        if (issue.entityType === "room") select({ type: "room", id: issue.entityId });
                      }}
                    >
                      <span className={issue.severity === "error" ? "text-red-700" : "text-amber-700"}>
                        {issue.severity === "error" ? "✕" : "!"}
                      </span>{" "}
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
