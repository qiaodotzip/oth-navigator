import type { Level } from "@oth/model";
import { followLink, href } from "../route";
import { stepDone, storedState } from "./progress";
import { WIZARD_STEPS } from "./steps";
import { useStepContext } from "./sync";

/**
 * The setup's nine steps, in the header in place of the floor's tabs (spec
 * §4.2): numbered, the current one named and marked, a tick on each done, and
 * every one a link. Below 1536 px the others show their numbers only, so the
 * row fits beside Claude Code and Publish. A screen reader hears each in full.
 */
export function SetupStepBar({ level, current }: { level: Level; current: number | undefined }) {
  const ctx = useStepContext(level);
  return (
    <nav aria-label="Setup steps" className="min-w-0">
      <ol className="flex items-center gap-0.5">
        {WIZARD_STEPS.map((step, i) => {
          const n = i + 1;
          const to = href({ name: "setup", code: level.code, step: n, params: {} });
          const here = n === current;
          const skipped = storedState(ctx?.setup ?? null, step.id)?.status === "skipped";
          const done = !skipped && ctx !== null && stepDone(step.id, ctx);
          return (
            <li key={step.id}>
              <a
                href={to}
                onClick={followLink(to)}
                aria-current={here ? "step" : undefined}
                title={step.title}
                className={`flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-sm ${
                  here ? "bg-stone-900 font-medium text-white" : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                <span aria-hidden className="tabular-nums">{n}</span>
                <span aria-hidden className={here ? "" : "hidden 2xl:inline"}>{step.short}</span>
                {done && <span aria-hidden>✓</span>}
                {skipped && <span aria-hidden>–</span>}
                <span className="sr-only">{`Step ${n}: ${step.title}${done ? ", done" : skipped ? ", skipped" : ""}`}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
