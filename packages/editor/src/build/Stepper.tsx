import { BUILD_STEPS, type BuildStepId } from "../flow/floorProgress";
import type { TodoCounts } from "./todo";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * The six steps across the top of Build. Each says whether it is done and
 * what is on its to-do list; choosing one changes the guide, the tools and the
 * to-do list. None is locked: they guide, they do not gate.
 *
 * Errors and warnings are counted apart, each with its own sign: a ✓ means
 * nothing on the step stops Publish, and a ✓ over warnings still shows them.
 */
export function Stepper({
  current,
  done,
  counts,
  onChoose,
}: {
  current: BuildStepId;
  /** From `buildStepsDone`: done means nothing on the step is an error. */
  done: Record<BuildStepId, boolean>;
  /** From `stepCounts`: exactly what each step's to-do list shows. */
  counts: Record<BuildStepId, TodoCounts>;
  onChoose: (step: BuildStepId) => void;
}) {
  return (
    <nav aria-label="Build steps" className="shrink-0 border-b border-stone-200 bg-white px-4">
      <ol className="flex gap-1 overflow-x-auto py-2">
        {BUILD_STEPS.map((s, i) => {
          const isCurrent = s.id === current;
          const { errors, warnings } = counts[s.id];
          // Said whole, because the button is a flex row: each part is a block,
          // and a name pieced together from blocks reads "Floorplan , done".
          const name = [
            s.label,
            done[s.id] && "done",
            errors > 0 && plural(errors, "error"),
            warnings > 0 && plural(warnings, "warning"),
          ].filter(Boolean).join(", ");
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-label={name}
                aria-current={isCurrent ? "step" : undefined}
                onClick={() => onChoose(s.id)}
                className={`flex h-9 items-center gap-2 whitespace-nowrap rounded px-3 text-sm ${
                  isCurrent ? "bg-accent-soft font-semibold text-accent" : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                {/* Stone-600, not 500: 500 falls under 4.5:1 on the hover grey. */}
                <span
                  aria-hidden
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    done[s.id] ? "bg-confirmed text-white" : "border border-stone-300 text-stone-600"
                  }`}
                >
                  {done[s.id] ? "✓" : i + 1}
                </span>
                {s.label}
                {errors > 0 && (
                  <span className="flex items-center gap-0.5 rounded-full bg-danger-soft px-1.5 text-xs font-semibold text-danger">
                    <span aria-hidden>✕</span>
                    {errors}
                  </span>
                )}
                {/* Secondary on purpose: unfilled, so a step's errors are what catch the eye. */}
                {warnings > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-stone-600">
                    <span aria-hidden className="font-semibold text-yours">!</span>
                    {warnings}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
