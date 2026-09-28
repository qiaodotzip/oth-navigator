import { useState } from "react";
import { BUILD_STEPS, type BuildStepId } from "../flow/floorProgress";
import { Button } from "../ui/Button";
import type { TodoItem } from "./todo";

/** Enough to act on, with the rest one click away: a floor can have 190 places to bind. */
const SHOWN_AT_FIRST = 50;

function Severity({ severity }: { severity: TodoItem["severity"] }) {
  return severity === "error" ? (
    <>
      <span aria-hidden className="w-3 shrink-0 font-semibold text-danger">✕</span>
      <span className="sr-only">Error: </span>
    </>
  ) : (
    <>
      <span aria-hidden className="w-3 shrink-0 font-semibold text-yours">!</span>
      <span className="sr-only">Warning: </span>
    </>
  );
}

/**
 * What is left on this step, each item a way to the thing it is about.
 * Errors come first: they are what stop Publish.
 */
export function StepTodo({
  step,
  items,
  onChoose,
  onDeleteOrphan,
}: {
  step: BuildStepId;
  items: readonly TodoItem[];
  onChoose: (item: TodoItem) => void;
  onDeleteOrphan: (item: TodoItem) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const { label } = BUILD_STEPS.find(s => s.id === step)!;
  const shown = showAll ? items : items.slice(0, SHOWN_AT_FIRST);

  return (
    <section aria-label="To do" className="flex min-h-0 flex-1 flex-col">
      <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
        To do{items.length > 0 ? ` · ${items.length}` : ""}
      </h2>
      {items.length === 0 ? (
        <p className="px-3 text-xs text-stone-600">
          <span aria-hidden className="text-confirmed">✓ </span>Nothing left to do on {label}.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {shown.map(item => (
            <li key={item.key}>
              {item.target.kind === "select" || item.target.kind === "place" ? (
                <button
                  type="button"
                  onClick={() => onChoose(item)}
                  className="flex w-full gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-stone-100"
                >
                  <Severity severity={item.severity} />
                  <span>{item.message}</span>
                </button>
              ) : (
                <div className="flex items-start gap-2 px-2 py-1.5 text-xs">
                  <Severity severity={item.severity} />
                  <span className="flex-1">{item.message}</span>
                  {item.target.kind === "orphan-portal" && (
                    <Button size="sm" aria-label="Delete this lift" onClick={() => onDeleteOrphan(item)}>
                      Delete
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!showAll && items.length > SHOWN_AT_FIRST && (
        <div className="px-3 pb-3">
          <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
            Show all {items.length}
          </Button>
        </div>
      )}
    </section>
  );
}
