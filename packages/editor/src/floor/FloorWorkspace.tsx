import { live } from "@oth/model";
import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { App } from "../App";
import { findLevel, pickTab } from "../flow/floors";
import { href, navigate, type FloorRoute } from "../route";
import { createSaver, type Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { ReviewPanel } from "../survey/ReviewPanel";
import { SurveyApp } from "../survey/SurveyApp";
import { recall, remember } from "../ui/remember";
import { toast } from "../ui/toast";

/**
 * One floor's workspace: finds the floor, makes it the active level, picks and
 * remembers the tab.
 *
 * Until Plans 2 and 3 replace them, the tabs host the existing Survey, Review
 * and Build screens without their own headers, so the app stays usable while
 * the shell around them is new.
 */
export function FloorWorkspace({ api, route }: { api: Api; saver: Saver; route: FloorRoute }) {
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const setActiveLevel = useEditorStore(s => s.setActiveLevel);
  const reviewSaver = useMemo(() => createSaver(api, { validate: false }), [api]);
  const level = findLevel(model, route.code);

  useEffect(() => {
    if (level && level.id !== activeLevelId) setActiveLevel(level.id);
  }, [level, activeLevelId, setActiveLevel]);

  useEffect(() => {
    if (!model || level) return;
    toast({ tone: "error", message: `There is no floor ${route.code}. Pick one from the floors.` });
    navigate("/floors", { replace: true });
  }, [model, level, route.code]);

  useEffect(() => {
    if (!model || !level) return;
    if (route.tab === null) {
      const hasFootage = live(model.captures).some(c => c.levelId === level.id);
      navigate(href({ ...route, code: level.code, tab: pickTab(recall(`lastTab.${level.code}`), hasFootage) }), { replace: true });
      return;
    }
    remember(`lastTab.${level.code}`, route.tab);
    remember("lastFloor", level.code);
  }, [model, level, route]);

  if (!model || !level || route.tab === null) {
    return <p className="p-8 text-sm text-stone-500">Loading the floor…</p>;
  }
  if (route.tab === "survey") return <SurveyApp api={api} embedded />;
  if (route.tab === "review") {
    return (
      <div className="mx-auto max-w-3xl">
        <ReviewPanel api={api} saver={reviewSaver} />
      </div>
    );
  }
  return <App api={api} embedded />;
}
