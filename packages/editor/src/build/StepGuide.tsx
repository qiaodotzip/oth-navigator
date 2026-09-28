import type { ReactNode } from "react";
import { BUILD_STEPS, type BuildStepId } from "../flow/floorProgress";
import { hintFor } from "../plan/DrawingHint";
import { useEditorStore, type Tool } from "../state/store";
import { TOOL_LABELS } from "../state/tools";
import { Button } from "../ui/Button";
import { Kbd } from "../ui/Kbd";
import { STEP_GUIDES, TOOL_KEYS } from "./steps";

/**
 * One instruction and the step's tools, floating over the plan where the eye
 * already is. While a tool is in use the instruction becomes that tool's own
 * "how to finish", so one voice says what to do next, not two.
 */
export function StepGuide({ step, extras }: { step: BuildStepId; extras?: ReactNode }) {
  const tool = useEditorStore(s => s.tool);
  const setTool = useEditorStore(s => s.setTool);
  const points = useEditorStore(s => (s.tool === "calibrate" ? s.calibrationDraft : s.draft)?.length ?? 0);
  const { label } = BUILD_STEPS.find(s => s.id === step)!;
  const hint = hintFor(tool, points);
  const tools: Tool[] = ["select", ...STEP_GUIDES[step].tools];

  return (
    <section
      aria-label={`${label} guide`}
      className="absolute left-3 top-3 z-20 w-80 rounded border border-stone-200 bg-white/95 p-3 shadow-lg"
    >
      <h2 className="text-sm font-semibold">{label}</h2>
      <p data-testid="guide-text" className="mt-1 text-xs text-stone-700">
        {hint ? (
          <>
            <span className="font-medium">{hint.what}.</span> {hint.how}
          </>
        ) : (
          STEP_GUIDES[step].instruction
        )}
      </p>
      <div role="toolbar" aria-label="Tools" className="mt-2 flex flex-wrap gap-1">
        {tools.map(t => {
          const key = TOOL_KEYS[t];
          return (
            <Button
              key={t}
              size="sm"
              variant={tool === t ? "primary" : "secondary"}
              aria-pressed={tool === t}
              onClick={() => setTool(t)}
            >
              {TOOL_LABELS[t]}
              {key && <Kbd>{key}</Kbd>}
            </Button>
          );
        })}
      </div>
      {extras && <div className="mt-3 space-y-2 border-t border-stone-200 pt-3">{extras}</div>}
    </section>
  );
}
