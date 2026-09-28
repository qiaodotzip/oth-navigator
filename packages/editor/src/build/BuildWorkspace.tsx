import { live } from "@oth/model";
import { MapScene, SceneRoomLabels, forgetPlacementModels } from "@oth/renderer";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Api } from "../api/client";
import { commitPoint } from "../flow/commitPoint";
import { BUILD_STEPS, buildStepsDone, type BuildStepId } from "../flow/floorProgress";
import { levelBelow } from "../flow/floors";
import { newPathway, newSpace } from "../flow/newSpace";
import { LockBanner } from "../panels/LockBanner";
import { roomLabels } from "../places/labels";
import { contentBBox } from "../plan/content";
import { PlanCanvas } from "../plan/PlanCanvas";
import { PlanRoomLabels } from "../plan/RoomLabels";
import { useElementSize } from "../plan/useElementSize";
import { fitViewport } from "../plan/viewport";
import { setParams, type FloorRoute } from "../route";
import { useRecheck } from "../state/recheck";
import type { Saver } from "../state/save";
import { ringsOnActiveLevel, useEditorStore, type Selection } from "../state/store";
import { displayBBox, imageForLevel } from "../state/underlay";
import { Button } from "../ui/Button";
import { toast, useToasts } from "../ui/toast";
import { deleteWithUndo } from "../ui/undo";
import { BindTools, waitingForRoom } from "./BindPlaces";
import { selectionRemovals } from "./deleteSelection";
import { useDraftView, useRoomDrafts } from "./drafts";
import { DraftsOnPlan } from "./DraftsOnPlan";
import { FloorplanTools, PlanDropZone, patchPlan } from "./FloorplanTools";
import { LayersDrawer } from "./LayersDrawer";
import { PreviewPanel, PreviewToggle, usePreview, usePreviewOptions } from "./PreviewToggle";
import { parseSelectParam, selectParam } from "./selection";
import { SelectionInspector } from "./SelectionInspector";
import { StepGuide } from "./StepGuide";
import { StepTodo } from "./StepTodo";
import { Stepper } from "./Stepper";
import { STEP_GUIDES, parseStep } from "./steps";
import { DressingTools, PathwaysTools, RoomsTools } from "./StepTools";
import { EMPTY_TODOS, stepCounts, stepTodos, type TodoItem } from "./todo";
import { useBuildKeys } from "./useBuildKeys";
import { zoomViewportTo } from "./zoomTo";

const NOTHING_DONE: Record<BuildStepId, boolean> = {
  floorplan: false, rooms: false, pathways: false, entrances: false, bind: false, dressing: false,
};

/** The address bar's own `?select=`, read fresh rather than from a render that may be a step behind it. */
function selectInAddress(): string {
  return new URLSearchParams(window.location.search).get("select") ?? "";
}

/**
 * Keeps a failing 3D preview to itself. A placed model that will not load is
 * caught in the scene, which then draws without it; what reaches here is the
 * scene failing as a whole (no WebGL, say). Uncaught, that blanks the whole
 * editor — and, as the preview is remembered on, blanks it again on every reload.
 */
class PreviewBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onFail();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * One floor's Build tab (spec §11): the six steps across the top, the plan
 * with the step's guide floating over it, and on the right the selection above
 * the step's to-do list.
 *
 * It never loads the map — the workspace already has — and never returns early
 * without a user, so an expired session keeps the page behind the sign-in dialog.
 */
export function BuildWorkspace({ api, saver, route }: { api: Api; saver: Saver; route: FloorRoute }) {
  const model = useEditorStore(s => s.model);
  const report = useEditorStore(s => s.report);
  const levelImages = useEditorStore(s => s.levelImages);
  const levelId = useEditorStore(s => s.activeLevelId);
  const selection = useEditorStore(s => s.selection);
  const [canvasBox, canvasSize] = useElementSize();
  useRoomDrafts(api, levelId);
  const [layersOpen, setLayersOpen] = useState(false);
  const [previewOn, togglePreview] = usePreview();
  const [previewOptions, setPreviewOptions] = usePreviewOptions();
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);

  const draftsToReview = useDraftView(levelId).review.length;
  const todos = useMemo(
    () => (model && levelId ? stepTodos(model, report, levelImages, levelId, draftsToReview) : EMPTY_TODOS),
    [model, report, levelImages, levelId, draftsToReview],
  );
  // The tick and the numbers are both read off `todos`, so neither can disagree with the list.
  const done = useMemo(
    () => (model && levelId ? buildStepsDone(model, report, levelImages, levelId, todos) : NOTHING_DONE),
    [model, report, levelImages, levelId, todos],
  );
  // One set of labels for the plan and the preview, so the two never disagree about a name.
  const labels = useMemo(() => (model && levelId ? roomLabels(model, levelId) : []), [model, levelId]);
  const elevationM = model?.levels.find(l => l.id === levelId)?.elevationM ?? 0;
  // No step in the address: the first one not done yet — a new floor starts at its plan.
  const step: BuildStepId = parseStep(route.params.step) ?? BUILD_STEPS.find(s => !done[s.id])?.id ?? "floorplan";
  const counts = useMemo(() => stepCounts(todos), [todos]);
  const image = imageForLevel(levelImages, levelId);
  const selectValue = route.params.select ?? "";

  const below = step === "floorplan" && levelId ? levelBelow(model, levelId) : null;
  const belowRings = useMemo(
    () => (model && below
      ? live(model.rooms).filter(r => r.levelId === below.id && r.kind !== "detail").map(r => r.footprint)
      : undefined),
    [model, below],
  );

  // Survey and Review save without validating, so the to-do list may be older
  // than a place tagged since, which Bind places would then never list.
  useRecheck(api, "refresh the to-do list");

  // A missing or unknown ?step= becomes a real one, so the address is always worth sending.
  useEffect(() => {
    if (model && levelId && route.params.step !== step) setParams({ step });
  }, [model, levelId, route.params.step, step]);

  // A tool from another step would leave the guide explaining one thing while
  // the canvas does another. Here rather than in `chooseStep`, as the stepper
  // is not the only way the step changes: a floor or Publish link, or Back.
  useEffect(() => {
    const s = useEditorStore.getState();
    if (s.tool !== "select" && !STEP_GUIDES[step].tools.includes(s.tool)) s.setTool("select");
    setPendingPlaceId(null);
  }, [step]);

  // A link from the Places tab's "Bind it": that place in hand, as choosing
  // its to-do item does. Read once, then taken out of the address, so the
  // address never goes on naming a place already bound. After the effect
  // above, which lets go of the place in hand as Build opens, and before the
  // selection's, so a room left selected from before is let go before it can
  // be written back into the address.
  const placeParam = route.params.place ?? "";
  useEffect(() => {
    if (!placeParam) return;
    takePlace(placeParam);
    setParams({ place: null });
  }, [placeParam]);

  // The place in hand is let go once it stops waiting: bound by a teammate,
  // by a Retry that went through late, or deleted. Held, it would come back
  // into hand whenever it was next unbound, picked by nobody.
  useEffect(() => {
    if (!pendingPlaceId || !model) return;
    const place = live(model.places).find(p => p.id === pendingPlaceId);
    if (!place || !waitingForRoom(model, place)) setPendingPlaceId(null);
  }, [model, pendingPlaceId]);

  // Leaving Build lets go of the selection. It is also the collaboration lock,
  // which would otherwise show you to teammates as editing that room from
  // Survey, Review or the floors home until it timed out.
  useEffect(() => () => useEditorStore.getState().select(null), []);

  // Only the plan's drop box takes a file. One let go anywhere else would be
  // opened by the browser in place of the editor, and what you had half done
  // with it; so it is refused, with the cursor saying so.
  useEffect(() => {
    const refuse = (event: DragEvent) => {
      if (event.defaultPrevented) return; // The drop box took it.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    window.addEventListener("dragover", refuse);
    window.addEventListener("drop", refuse);
    return () => {
      window.removeEventListener("dragover", refuse);
      window.removeEventListener("drop", refuse);
    };
  }, []);

  function zoomTo(target: NonNullable<Selection>) {
    if (!canvasSize) return;
    const vp = zoomViewportTo(useEditorStore.getState().model, target, canvasSize.width, canvasSize.height);
    if (vp) useEditorStore.getState().setViewport(vp);
  }

  // The address → the selection: on arrival from a link, and on Back.
  const arrived = useRef<NonNullable<Selection> | null>(null);
  useEffect(() => {
    if (!model || !levelId) return;
    if (selectValue === selectParam(useEditorStore.getState().selection)) return;
    const wanted = parseSelectParam(selectValue, model, levelId);
    if (wanted) {
      useEditorStore.getState().select(wanted);
      arrived.current = wanted;
    } else if (selectValue) {
      // Since deleted, or on another floor: select nothing, and say so in the
      // address too. Nothing means nothing: a selection left from before a tab
      // switch would otherwise be written back over the link.
      useEditorStore.getState().select(null);
      setParams({ select: null });
    }
  }, [model, levelId, selectValue]);

  // Zoom to what a link pointed at once the canvas has a size — which is also
  // after the canvas's own first fit, so the zoom is not undone by it.
  useEffect(() => {
    if (arrived.current && canvasSize) {
      zoomTo(arrived.current);
      arrived.current = null;
    }
  });

  // A selection whose thing has gone — deleted from the Layers drawer, or by a
  // teammate — is let go, as Delete lets go of what it deletes. Held on to, it
  // would leave the address, and the next Delete, pointing at nothing.
  useEffect(() => {
    const held = useEditorStore.getState().selection;
    if (held && model && levelId && !parseSelectParam(selectParam(held), model, levelId)) {
      useEditorStore.getState().select(null);
    }
  }, [model, levelId, selection]);

  // The Layers drawer deletes through this. A delete that landed lets go of
  // what it deleted, as Delete does, even when the reload after it failed and
  // the map still shows the thing, so the effect above cannot see it gone.
  const drawerSaver = useMemo<Saver>(() => ({
    ...saver,
    remove: async (type, id, expectedVersion) => {
      const landed = await saver.remove(type, id, expectedVersion);
      const held = useEditorStore.getState().selection;
      if (landed && held?.type === type && held.id === id) useEditorStore.getState().select(null);
      return landed;
    },
  }), [saver]);

  // The selection → the address, so what you are looking at can be sent to a
  // teammate. Also when the address changes: a link to this floor that names
  // nothing (a Publish item, the Build tab) keeps the selection, so it is
  // written back rather than left out of the address.
  useEffect(() => {
    const value = selectParam(useEditorStore.getState().selection);
    if (levelId && value !== selectInAddress()) setParams({ select: value || null });
  }, [selection, levelId, selectValue]);

  function chooseStep(next: BuildStepId) {
    setParams({ step: next });
  }

  /**
   * A place in hand, from its to-do item or a link from Places: Bind places
   * then asks for the room it is in. Whatever was selected is let go first.
   * The store keeps a selection across tabs, so a room selected before would
   * stay, its picker would ring this place first, and one click would bind it
   * there.
   */
  function takePlace(placeId: string) {
    const s = useEditorStore.getState();
    s.setTool("select");
    s.select(null);
    setPendingPlaceId(placeId);
  }

  function chooseTodo(item: TodoItem) {
    if (item.target.kind === "place") {
      takePlace(item.target.placeId);
      return;
    }
    const s = useEditorStore.getState();
    s.setTool("select");
    if (item.target.kind === "select") {
      s.select(item.target.selection);
      zoomTo(item.target.selection);
    }
  }

  function deleteOrphan(item: TodoItem) {
    if (item.target.kind !== "orphan-portal") return;
    void deleteWithUndo({
      api,
      saver,
      removals: [{ type: "portal", id: item.target.portalId, version: item.target.version }],
      label: "the lift with no stops",
    });
  }

  // F frames the floor as the canvas's own Fit button does. That one lives
  // inside PlanCanvas; this reads the store fresh, as a key press can come
  // between renders.
  function fit() {
    if (!canvasSize) return;
    const s = useEditorStore.getState();
    const plan = displayBBox(imageForLevel(s.levelImages, s.activeLevelId));
    s.setViewport(fitViewport(contentBBox(ringsOnActiveLevel(s), plan), canvasSize.width, canvasSize.height));
  }

  async function deleteSelected() {
    const s = useEditorStore.getState();
    const found = selectionRemovals(s.model, s.activeLevelId, s.selection);
    if (!found) return;
    if (await deleteWithUndo({ api, saver, removals: found.removals, label: found.label })) {
      useEditorStore.getState().select(null);
    }
  }

  // Off, and remembered off, so a reload opens on the plan rather than failing
  // again. Turning it back on mounts a fresh boundary, which is the retry, once
  // the loader has forgotten the models: it keeps a failed load failed for the
  // page's life. One model that will not load is caught in the scene, so what
  // lands here is the scene as a whole (no WebGL, say). Tried again and failing
  // again, it replaces its toast: an error toast stays until dismissed.
  const previewToast = useRef<string | null>(null);
  function previewFailed() {
    if (previewOn) togglePreview();
    forgetPlacementModels(useEditorStore.getState().model?.placements ?? [], api.assetFileUrl);
    if (previewToast.current) useToasts.getState().dismiss(previewToast.current);
    previewToast.current = toast({
      tone: "error",
      message: "The 3D preview failed to load, so it's off. Turn it on again to retry.",
    });
  }

  useBuildKeys({
    onFit: fit,
    onDelete: () => void deleteSelected(),
    onStep: next => {
      if (next !== step) chooseStep(next);
    },
  });

  function extrasFor(s: BuildStepId): ReactNode {
    switch (s) {
      case "floorplan":
        return <FloorplanTools api={api} />;
      case "rooms":
        return <RoomsTools api={api} saver={saver} />;
      case "pathways":
        return <PathwaysTools saver={saver} />;
      case "entrances":
        return null;
      case "bind":
        return <BindTools api={api} pendingPlaceId={pendingPlaceId} onCancel={() => setPendingPlaceId(null)} />;
      case "dressing":
        return <DressingTools api={api} saver={saver} />;
    }
  }

  return (
    <div className="flex h-full flex-col">
      <Stepper current={step} done={done} counts={counts} onChoose={chooseStep} />
      <LockBanner />
      <div className="flex min-h-0 flex-1">
        <div ref={canvasBox} className="relative min-w-0 flex-1 overflow-hidden bg-stone-100">
          {canvasSize && (
            <PlanCanvas
              width={canvasSize.width}
              height={canvasSize.height}
              imageUrl={api.levelImageFileUrl}
              showHint={false}
              belowRings={belowRings}
              // Drafts under the room labels, so a room's name is never hidden by a draft's wash.
              overlays={<>
                {step === "rooms" && <DraftsOnPlan levelId={levelId} />}
                <PlanRoomLabels labels={labels} />
              </>}
              // The save is handed back, so the canvas holds the plan where it
              // was dropped until the save lands rather than jumping back first.
              onMoveUnderlay={offset => (image ? patchPlan(api, image, offset, { doing: "move the plan" }) : undefined)}
              onReshapeRoom={(room, footprint) => void saver.update("room", room.id, room.version, { footprint })}
              onMovePlacement={(placement, position) =>
                void saver.update("placement", placement.id, placement.version, { position })}
              onCommitSpace={(kind, ring) => {
                if (levelId) void saver.create("room", newSpace(kind, levelId, ring));
              }}
              onCommitPathway={polyline => {
                if (levelId) void saver.create("pathway", newPathway(levelId, polyline));
              }}
              onCommitPoint={point => {
                const s = useEditorStore.getState();
                if (!s.model || !levelId) return;
                void commitPoint({ saver, model: s.model, tool: s.tool, levelId, point, say: (message, tone) => toast({ message, tone }) });
              }}
            />
          )}

          <StepGuide step={step} extras={extrasFor(step)} />
          {step === "floorplan" && !image && <PlanDropZone api={api} />}

          <div className="absolute bottom-3 left-3 z-20 flex gap-2">
            <Button size="sm" aria-expanded={layersOpen} onClick={() => setLayersOpen(o => !o)}>
              Layers
            </Button>
            <PreviewToggle on={previewOn} onToggle={togglePreview} />
          </div>

          {layersOpen && (
            <LayersDrawer
              api={api}
              saver={drawerSaver}
              onClose={() => setLayersOpen(false)}
              onChoose={target => {
                const s = useEditorStore.getState();
                s.setTool("select");
                s.select(target);
                zoomTo(target);
              }}
            />
          )}

          {previewOn && model && levelId && (
            <PreviewBoundary onFail={previewFailed}>
              <PreviewPanel options={previewOptions} onOptions={setPreviewOptions}>
                <MapScene
                  model={model}
                  activeLevelId={levelId}
                  assetUrl={api.assetFileUrl}
                  selectedId={selection?.type === "room" ? selection.id : null}
                  onSelect={id => useEditorStore.getState().select({ type: "room", id })}
                  fullHeightWalls={previewOptions.fullHeightWalls}
                >
                  <SceneRoomLabels labels={labels} elevationM={elevationM} fullHeightWalls={previewOptions.fullHeightWalls} />
                </MapScene>
              </PreviewPanel>
            </PreviewBoundary>
          )}
        </div>

        <aside aria-label="Selection and to-do" className="flex w-80 shrink-0 flex-col border-l border-stone-200 bg-white">
          <section
            aria-label="Selection"
            className="flex max-h-[55%] min-h-0 shrink-0 flex-col overflow-auto border-b border-stone-200 has-[[data-place-picker]]:max-h-none has-[[data-place-picker]]:flex-[3_1_0%]"
          >
            <h2 className="shrink-0 px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Selection</h2>
            <SelectionInspector
              api={api}
              saver={saver}
              step={step}
              pendingPlaceId={pendingPlaceId}
              onBound={() => setPendingPlaceId(null)}
            />
          </section>
          <StepTodo step={step} done={done[step]} items={todos[step]} onChoose={chooseTodo} onDeleteOrphan={deleteOrphan} />
        </aside>
      </div>
    </div>
  );
}
