import { useEffect, useId, useRef, useState } from "react";
import { BUILD_STEPS, type BuildStepId } from "../flow/floorProgress";
import { Button } from "../ui/Button";
import { countTodos, type TodoItem } from "./todo";

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
 * What is left on this step, each item a way to the thing it is about. It
 * keeps the order it is given: `stepTodos` puts errors first, since they are
 * what stop Publish.
 */
export function StepTodo({
  step,
  done,
  items,
  onChoose,
  onDeleteOrphan,
}: {
  step: BuildStepId;
  /**
   * Whether the step is finished (`buildStepsDone`). An empty list is not
   * enough: a blank floor has nothing to fix only because nothing is traced yet.
   */
  done: boolean;
  items: readonly TodoItem[];
  onChoose: (item: TodoItem) => void;
  onDeleteOrphan: (item: TodoItem) => void;
}) {
  // Let go when the step changes, so every step's list, this one's included
  // when you come back to it, starts short.
  const [expandedFor, setExpandedFor] = useState<BuildStepId | null>(null);
  if (expandedFor !== null && expandedFor !== step) setExpandedFor(null);
  const showAll = expandedFor === step;
  const ids = useId();

  // "Show all" is gone once pressed, so focus goes to the first thing it
  // revealed rather than falling back to the page.
  const firstNew = useRef<HTMLElement | null>(null);
  const focusFirstNew = useRef(false);
  const holdFirstNew = (el: HTMLElement | null) => {
    firstNew.current = el;
  };
  useEffect(() => {
    if (!showAll || !focusFirstNew.current) return;
    focusFirstNew.current = false;
    firstNew.current?.focus();
  }, [showAll]);

  const { label, next } = BUILD_STEPS.find(s => s.id === step)!;
  const shown = showAll ? items : items.slice(0, SHOWN_AT_FIRST);
  const { errors, warnings } = countTodos(items);

  return (
    <section aria-label="To do" className="flex min-h-0 flex-1 flex-col">
      <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
        To do{items.length > 0 ? ` · ${items.length}` : ""}
      </h2>
      {/* What the stepper's mark means, said here in words: errors stop Publish, warnings never do. */}
      {errors > 0 ? (
        <p className="px-3 pb-1 text-xs text-stone-600">
          Fix {errors === 1 ? "this error" : `these ${errors} errors`} before publishing.
        </p>
      ) : (
        done && warnings > 0 && (
          <p className="px-3 pb-1 text-xs text-stone-600">
            <span aria-hidden className="text-confirmed">✓ </span>Nothing here stops you publishing, but{" "}
            {warnings === 1 ? "1 warning is" : `${warnings} warnings are`} worth a look.
          </p>
        )
      )}
      {items.length === 0 ? (
        done ? (
          <p className="px-3 text-xs text-stone-600">
            <span aria-hidden className="text-confirmed">✓ </span>Nothing left to do on {label}.
          </p>
        ) : (
          // The same words as the floor card's next step.
          <p className="px-3 text-xs text-stone-600">Next: {next}</p>
        )
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {shown.map((item, i) => {
            const ref = i === SHOWN_AT_FIRST ? holdFirstNew : undefined;
            const messageId = `${ids}-${i}`;
            return (
              <li key={item.key}>
                {item.target.kind === "select" || item.target.kind === "place" ? (
                  <button
                    ref={ref}
                    type="button"
                    onClick={() => onChoose(item)}
                    className="flex w-full gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-stone-100"
                  >
                    <Severity severity={item.severity} />
                    <span>{item.message}</span>
                  </button>
                ) : (
                  // A row with no button of its own can still take focus when "Show all" lands on it.
                  <div ref={ref} tabIndex={ref ? -1 : undefined} className="flex items-start gap-2 px-2 py-1.5 text-xs">
                    <Severity severity={item.severity} />
                    <span id={messageId} className="flex-1">{item.message}</span>
                    {item.target.kind === "orphan-portal" && (
                      // Each Delete is described by its own row, which names the lift.
                      <Button
                        size="sm"
                        aria-label="Delete this lift"
                        aria-describedby={messageId}
                        onClick={() => onDeleteOrphan(item)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!showAll && items.length > SHOWN_AT_FIRST && (
        <div className="px-3 pb-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              focusFirstNew.current = true;
              setExpandedFor(step);
            }}
          >
            Show all {items.length}
          </Button>
        </div>
      )}
    </section>
  );
}
