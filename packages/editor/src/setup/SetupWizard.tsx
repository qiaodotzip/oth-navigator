import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Api } from "../api/client";
import { useRoomDrafts } from "../build/drafts";
import { findLevel } from "../flow/floors";
import { ReviewWorkspace } from "../review/ReviewWorkspace";
import { href, navigate, type SetupRoute } from "../route";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { reportFailure } from "../ui/failure";
import { toast } from "../ui/toast";
import { CheckStep } from "./CheckStep";
import { ClaudeStep } from "./ClaudeStep";
import { FinishStep } from "./FinishStep";
import { FloorplanStep } from "./FloorplanStep";
import { FootageStep } from "./FootageStep";
import {
  autoDone, doneLine, firstOpenStep, notDoneLine, sinceParam, stepDone, storedState, type StepContext,
} from "./progress";
import { STEP_COUNT, stepAt, stepNumber, wizardStep } from "./steps";
import { loadSetup, useSetupStore, useStepContext } from "./sync";
import type { SetupApi, SetupStepId } from "./types";

/**
 * One floor's setup (spec §4): the step the address names, as its real tool,
 * above a bar to move on. Progress is the server's, so anyone can carry on
 * where a teammate left off. Next is never refused: the bar says in one line
 * what a step still lacks, and you decide.
 *
 * It saves through a saver that skips validation, as Survey and Review do:
 * nothing here shows the report, and Build checks again as it opens.
 */
export function SetupWizard({ api, route }: { api: Api & SetupApi; route: SetupRoute }) {
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const setActiveLevel = useEditorStore(s => s.setActiveLevel);
  const saver = useMemo(() => createSaver(api, { validate: false }), [api]);
  const level = findLevel(model, route.code);
  const levelId = level?.id ?? null;
  const ctx = useStepContext(level);
  const loaded = useSetupStore(s => (levelId ? levelId in s.byLevel || s.failed[levelId] === true : false));
  const stepId = stepAt(route.step);
  // The floor's drafts: the Floorplan step's tick reads them, and its Find rooms replaces them.
  useRoomDrafts(api, levelId);

  useEffect(() => {
    if (level && level.id !== activeLevelId) setActiveLevel(level.id);
  }, [level, activeLevelId, setActiveLevel]);

  useEffect(() => {
    if (!model || level) return;
    toast({ tone: "error", message: `There is no floor ${route.code}. Pick one from the floors.` });
    navigate("/floors", { replace: true });
  }, [model, level, route.code]);

  // The floor's setup, fresh at every step, so its ticks and Claude's notes are.
  useEffect(() => {
    if (levelId) void loadSetup(api, levelId);
  }, [api, levelId, route.step]);

  // No step in the address, or none of the nine: the first not done, written in.
  // A setup that can't be loaded still gets one, worked out from the map.
  useEffect(() => {
    if (!ctx || stepId || !loaded) return;
    navigate(href({ name: "setup", code: ctx.levelCode, step: firstOpenStep(ctx), params: {} }), { replace: true });
  }, [ctx, stepId, loaded]);

  // Past Add footage, with footage filed and the step not stored yet: store it
  // now. That moment is when this run's step 2 began, which the check lists
  // Claude's changes from (spec §8). Once a visit; tried again if it failed.
  const stamped = useRef<string | null>(null);
  const stamp = ctx !== null && stepId !== null && stepId !== "footage" && autoDone("footage", ctx)
    && storedState(ctx.setup, "footage")?.status === "open";
  useEffect(() => {
    if (!stamp || !levelId || stamped.current === levelId) return;
    stamped.current = levelId;
    api.setSetupStep(levelId, "footage", { status: "done" })
      .then(() => loadSetup(api, levelId))
      .catch(() => {
        stamped.current = null;
      });
  }, [stamp, api, levelId]);

  if (!model || !level || !ctx || activeLevelId !== level.id) {
    return <p className="p-8 text-sm text-stone-500">Loading the floor…</p>;
  }
  if (!stepId) return <p className="p-8 text-sm text-stone-500">Loading the setup…</p>;

  const go = (n: number) => navigate(href({ name: "setup", code: level.code, step: n, params: {} }));

  /** Stores a step as done or skipped, then reloads the setup. False, and said, when it didn't land. */
  const store = async (step: SetupStepId, status: "done" | "skipped"): Promise<boolean> => {
    try {
      await api.setSetupStep(level.id, step, { status });
    } catch (err) {
      reportFailure(err, {
        doing: status === "skipped" ? "skip the step" : "mark the step done",
        retry: async () => {
          await store(step, status);
        },
      });
      return false;
    }
    await loadSetup(api, level.id);
    return true;
  };

  const body = (): ReactNode => {
    switch (stepId) {
      case "footage":
        return <FootageStep api={api} saver={saver} level={level} />;
      case "review":
        return <ReviewWorkspace api={api} saver={saver} level={level} params={route.params} />;
      case "floorplan":
        return <FloorplanStep api={api} level={level} />;
      case "check":
        return (
          <CheckStep
            api={api}
            saver={saver}
            level={level}
            since={sinceParam(ctx.setup)}
            onLooksRight={() => void store("check", "done").then(ok => {
              if (ok) go(stepNumber("finish"));
            })}
          />
        );
      case "finish":
        return (
          <FinishStep
            api={api}
            level={level}
            state={storedState(ctx.setup, "finish")}
            onFinish={() => void store("finish", "done").then(ok => {
              if (ok) navigate(href({ name: "floor", code: level.code, tab: "build", params: {} }));
            })}
          />
        );
      default:
        // Keyed, so each Claude step's poll and lists start afresh.
        return <ClaudeStep key={stepId} api={api} saver={saver} level={level} stepId={stepId} />;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">{body()}</div>
      <BottomBar
        ctx={ctx}
        stepId={stepId}
        onBack={() => go(stepNumber(stepId) - 1)}
        onNext={() => go(stepNumber(stepId) + 1)}
        onLeave={() => navigate("/floors")}
        onMark={() => void store(stepId, "done")}
        onSkip={() => void store(stepId, "skipped")}
      />
    </div>
  );
}

/**
 * Back, where you are, whether it is done, the one-line warning, Leave setup
 * and Next. Check and Finish have their own buttons, Looks right and Finish
 * setup, so they get no Mark done; only Review can be skipped.
 */
function BottomBar({ ctx, stepId, onBack, onNext, onLeave, onMark, onSkip }: {
  ctx: StepContext;
  stepId: SetupStepId;
  onBack: () => void;
  onNext: () => void;
  onLeave: () => void;
  onMark: () => void;
  onSkip: () => void;
}) {
  const team = useEditorStore(s => s.team);
  const n = stepNumber(stepId);
  const stored = doneLine(storedState(ctx.setup, stepId), team);
  const done = stepDone(stepId, ctx);
  const warning = notDoneLine(stepId, ctx);
  const ownButton = stepId === "check" || stepId === "finish";

  return (
    <section aria-label="Setup controls" className="flex shrink-0 items-center gap-3 border-t border-stone-200 bg-white px-4 py-2">
      <Button size="sm" disabled={n === 1} onClick={onBack}>Back</Button>
      <span className="shrink-0 text-sm font-medium">Step {n} of {STEP_COUNT}: {wizardStep(stepId).title}</span>
      {stored ? (
        <span className="shrink-0 text-xs text-stone-600"><span aria-hidden>✓ </span>{stored}</span>
      ) : done ? (
        <span className="shrink-0 text-xs text-stone-600"><span aria-hidden>✓ </span>Done</span>
      ) : !ownButton && (
        <>
          <Button size="sm" variant="ghost" onClick={onMark}>Mark done</Button>
          {stepId === "review" && <Button size="sm" variant="ghost" onClick={onSkip}>Skip</Button>}
        </>
      )}
      {warning && (
        <p role="status" className="min-w-0 truncate text-xs text-yours">
          <span aria-hidden className="font-semibold">! </span>
          {warning}
        </p>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onLeave}>Leave setup</Button>
        {n < STEP_COUNT && <Button size="sm" variant="primary" onClick={onNext}>Next</Button>}
      </div>
    </section>
  );
}
