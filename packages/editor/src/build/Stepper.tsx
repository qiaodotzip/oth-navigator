import { BUILD_STEPS, type BuildStepId } from "../flow/floorProgress";

/**
 * The six steps across the top of Build. Each says whether it is done and how
 * much is open on it; choosing one changes the guide, the tools and the to-do
 * list. None is locked: they guide, they do not gate.
 */
export function Stepper({
  current,
  done,
  counts,
  onChoose,
}: {
  current: BuildStepId;
  done: Record<BuildStepId, boolean>;
  counts: Record<BuildStepId, number>;
  onChoose: (step: BuildStepId) => void;
}) {
  return (
    <nav aria-label="Build steps" className="shrink-0 border-b border-stone-200 bg-white px-4">
      <ol className="flex gap-1 overflow-x-auto py-2">
        {BUILD_STEPS.map((s, i) => {
          const isCurrent = s.id === current;
          const open = counts[s.id];
          // Said whole, because the button is a flex row: each part is a block,
          // and a name pieced together from blocks reads "Floorplan , done".
          const name = `${s.label}${done[s.id] ? ", done" : ""}${open > 0 ? `, ${open} open` : ""}`;
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
                {open > 0 && (
                  <span className="rounded-full bg-yours-soft px-1.5 text-xs font-medium text-yours">{open}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
