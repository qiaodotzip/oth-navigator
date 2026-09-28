import { live } from "@oth/model";
import { useEffect, useMemo } from "react";
import type { Api } from "../api/client";
import { BuildWorkspace } from "../build/BuildWorkspace";
import { findLevel, pickTab } from "../flow/floors";
import { PlacesWorkspace } from "../places/PlacesWorkspace";
import { ReviewWorkspace } from "../review/ReviewWorkspace";
import { href, navigate, type FloorRoute } from "../route";
import { createSaver, type Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { SurveyWorkspace } from "../survey/SurveyWorkspace";
import { recall, remember } from "../ui/remember";
import { toast } from "../ui/toast";

/**
 * One floor's workspace: finds the floor, makes it the active level, picks and
 * remembers the tab, and shows it.
 *
 * Survey and Review share one saver that skips validation: every survey rule
 * is a warning, so nothing they write can change what blocks publishing, and
 * skipping it saves half a second on every tag. Neither loads the model —
 * the shell already has. The Build tab is `BuildWorkspace`, on the shell's
 * saver, which validates: what Build draws can change what blocks publishing.
 * Places writes nothing, so it takes no saver.
 */
export function FloorWorkspace({ api, saver, route }: { api: Api; saver: Saver; route: FloorRoute }) {
  const model = useEditorStore(s => s.model);
  const activeLevelId = useEditorStore(s => s.activeLevelId);
  const setActiveLevel = useEditorStore(s => s.setActiveLevel);
  const surveySaver = useMemo(() => createSaver(api, { validate: false }), [api]);
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
  if (route.tab === "survey") {
    return <SurveyWorkspace api={api} saver={surveySaver} level={level} params={route.params} />;
  }
  if (route.tab === "review") {
    return <ReviewWorkspace api={api} saver={surveySaver} level={level} params={route.params} />;
  }
  if (route.tab === "places") {
    return <PlacesWorkspace api={api} level={level} params={route.params} />;
  }
  // Build reads the active level everywhere. Until it is this floor, a link's
  // ?select= would be judged against the wrong one and dropped.
  if (activeLevelId !== level.id) {
    return <p className="p-8 text-sm text-stone-500">Loading the floor…</p>;
  }
  // Keyed by floor, so a half-finished choice on one floor never follows you to the next.
  return <BuildWorkspace key={level.id} api={api} saver={saver} route={route} />;
}
