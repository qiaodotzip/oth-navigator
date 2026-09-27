import { live, placeLevels, type Box, type Level } from "@oth/model";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Api } from "../api/client";
import { setParams } from "../route";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Kbd } from "../ui/Kbd";
import { useKeys } from "../ui/keys";
import { toast } from "../ui/toast";
import { offerUndo } from "../ui/offerUndo";
import { deleteWithUndo } from "../ui/undo";
import { AddFootageDialog } from "./AddFootageDialog";
import { FramePanel } from "./FramePanel";
import { SURVEY_FILTERS, type SurveyFilter } from "./frameStatus";
import { FrameView } from "./FrameView";
import { GridView } from "./GridView";
import { surveyCommand } from "./keys";
import { labelsForFrame, type FrameLabel } from "./labelled";
import { sightingCounts } from "./places";
import { linkablePlaces } from "./suggest";
import { frameTime, nextUntagged, readSurveyParams, stepFrame, surveyView } from "./surveyView";
import type { TagBarHandle } from "./TagBar";
import { newId, tagWrites, walkwayColour, type Tag } from "./tagging";

const FILTER_LABEL: Record<SurveyFilter, string> = {
  all: "All", untagged: "Untagged", proposed: "Proposed", tagged: "Tagged",
};

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="max-w-md space-y-3 text-center text-sm text-stone-600">{children}</div>
    </div>
  );
}

/**
 * One floor's survey (spec §9): its footage, a frame at a time or as a
 * contact sheet, and what is in each frame.
 *
 * The address is the state — capture, frame, view, filter, place — so any
 * frame is a link. The model is the shell's one load; this screen never loads
 * it, and it stays mounted through an expired session: there is no early
 * return on a missing user.
 */
export function SurveyWorkspace({ api, saver, level, params }: {
  api: Api;
  saver: Saver;
  level: Level;
  params: Record<string, string>;
}) {
  const model = useEditorStore(s => s.model);
  const read = useMemo(() => readSurveyParams(params), [params]);
  const view = useMemo(() => surveyView(model, level.id, read), [model, level.id, read]);
  const levels = useMemo(() => (model ? placeLevels(model) : new Map<string, string | undefined>()), [model]);
  const counts = useMemo(() => sightingCounts(live(model?.sightings ?? [])), [model]);
  const candidates = useMemo(
    () => linkablePlaces(live(model?.places ?? []), levels, level.id), [model, levels, level.id]);
  const floorPlaces = useMemo(
    () => candidates.filter(p => levels.get(p.id) === level.id), [candidates, levels, level.id]);
  const frame = view.frame;
  const labels = useMemo(() => (frame ? labelsForFrame(model, frame.id) : []), [model, frame]);
  const [draft, setDraft] = useState<Box | null>(null);
  const [footage, setFootage] = useState<{ captureId: string | null } | null>(null);
  const tagBar = useRef<TagBarHandle>(null);
  // One write at a time: a second Enter or Del before the first has landed
  // would tag twice, or bin the frame that has just come into view.
  const busy = useRef(false);

  // A drawn box belongs to the frame it was drawn on.
  useEffect(() => setDraft(null), [frame?.id]);

  async function once(work: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    try {
      await work();
    } finally {
      busy.current = false;
    }
  }

  const tag = (t: Tag) => once(async () => {
    if (!frame) return;
    setDraft(null);
    const writes = tagWrites(t, frame.id, level.id);
    if (writes.place && !(await saver.create("place", writes.place))) return;
    await saver.create("sighting", writes.sighting);
  });

  const bin = () => once(async () => {
    if (!frame) return;
    const number = view.index + 1;
    const next = stepFrame(view, 1) ?? stepFrame(view, -1);
    // On to the next frame at once; back to this one if the bin did not go through.
    setParams({ frame: next?.id ?? null });
    if (!(await saver.apply("keyframe", frame.id, () => api.deleteKeyframe(frame.id)))) {
      setParams({ frame: frame.id });
      return;
    }
    offerUndo({
      message: `Binned frame ${number}`,
      undone: `Frame ${number} is back`,
      what: `frame ${number}`,
      run: () => api.restoreKeyframe(frame.id),
      refresh: saver.refresh,
    });
  });

  const removeLabel = (label: FrameLabel) => void deleteWithUndo({
    api, saver,
    removals: [{ type: "sighting", id: label.sighting.id, version: label.sighting.version }],
    label: `the tag ${label.place.nameEn}`,
  });

  const moveLabel = (label: FrameLabel, box: Box) =>
    void saver.update("sighting", label.sighting.id, label.sighting.version, { box });

  async function addWalkwayKind(nameEn: string): Promise<string | null> {
    const id = newId("pk");
    const made = await saver.create("pathwayKind", {
      id, nameEn, colorHex: walkwayColour(live(model?.pathwayKinds ?? []).length),
    });
    return made ? id : null;
  }

  useKeys(event => {
    const command = surveyCommand(event.key);
    if (!command) return;
    const grid = read.view === "grid";
    switch (command) {
      case "prev":
      case "next": {
        const to = stepFrame(view, command === "next" ? 1 : -1);
        if (to) setParams({ frame: to.id });
        break;
      }
      case "nextUntagged": {
        const to = nextUntagged(view);
        if (to) setParams({ frame: to.id });
        else if (view.frames.length > 0) toast({ message: "Every frame in this footage has a tag." });
        break;
      }
      case "focusName":
        if (!grid) tagBar.current?.focus();
        break;
      case "tag":
        // In the grid, Enter opens the frame; in Frame view it tags.
        if (grid) setParams({ view: null });
        else tagBar.current?.submit();
        break;
      case "dropBox":
        setDraft(null);
        break;
      case "bin":
        void bin();
        break;
      case "toggleGrid":
        setParams({ view: grid ? null : "grid" });
        break;
    }
    event.preventDefault();
  });

  if (!model) return <p className="p-8 text-sm text-stone-500">Loading the survey…</p>;

  const capture = view.capture;
  const hasFrames = view.frames.length > 0;
  const openFootage = (captureId: string | null) => setFootage({ captureId });

  const unfiled = view.unfiled.map(c => {
    const n = live(model.keyframes).filter(k => k.captureId === c.id).length;
    return (
      <div key={c.id} role="status" className="flex items-center gap-3 border-b border-yours/30 bg-yours-soft px-4 py-2 text-sm">
        <span className="min-w-0 flex-1">
          <strong>{c.filename}</strong> ({n} frame{n === 1 ? "" : "s"}) isn't filed under a floor, so nothing in it counts toward one yet.
        </span>
        <Button size="sm" onClick={() => void saver.update("capture", c.id, c.version, { levelId: level.id })}>
          File under {level.code}
        </Button>
      </div>
    );
  });

  let body: ReactNode;
  if (!capture) {
    body = (
      <Empty>
        <p className="text-base font-medium text-stone-900">No footage on {level.code} yet.</p>
        <p>Add the walkthrough you filmed, and the frames worth tagging are found for you.</p>
        <Button variant="primary" onClick={() => openFootage(null)}>+ Add footage</Button>
      </Empty>
    );
  } else if (!hasFrames) {
    body = (
      <Empty>
        <p className="text-base font-medium text-stone-900">No frames in {capture.filename} yet.</p>
        <Button variant="primary" onClick={() => openFootage(capture.id)}>Find frames</Button>
      </Empty>
    );
  } else if (view.shown.length === 0) {
    body = (
      <Empty>
        <p>
          {view.place
            ? `${view.place.nameEn} isn't seen in this footage.`
            : `No frames here are ${FILTER_LABEL[read.filter].toLowerCase()}.`}
        </p>
      </Empty>
    );
  } else if (read.view === "grid") {
    body = (
      <GridView
        frames={view.shown}
        statuses={view.statuses}
        currentId={frame?.id ?? null}
        thumbUrl={id => api.keyframeFileUrl(id, 240)}
        onOpen={id => setParams({ view: null, frame: id })}
      />
    );
  } else if (frame) {
    body = (
      <FrameView
        api={api}
        frame={frame}
        alt={`Frame ${view.index + 1} of ${view.frames.length}`}
        labels={labels}
        draft={draft}
        onDraft={setDraft}
        onMoveLabel={moveLabel}
        onRemoveLabel={removeLabel}
        tagBar={tagBar}
        candidates={candidates}
        levels={levels}
        levelId={level.id}
        counts={counts}
        walkwayKinds={live(model.pathwayKinds)}
        onTag={t => void tag(t)}
        onAddWalkwayKind={addWalkwayKind}
        strip={{ frames: view.shown, statuses: view.statuses, onPick: id => setParams({ frame: id }) }}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {unfiled}
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-4 py-2">
          {view.captures.length > 1 && (
            <select
              aria-label="Footage"
              className="h-8 rounded border border-stone-300 px-2 text-sm"
              value={capture?.id ?? ""}
              onChange={event => setParams({ capture: event.target.value, frame: null, place: null })}
            >
              {view.captures.map(c => <option key={c.id} value={c.id}>{c.filename}</option>)}
            </select>
          )}
          {frame && (
            <span className="text-sm font-medium">
              Frame {view.index + 1} of {view.frames.length}
              {frame.timeMs !== undefined && <span className="text-stone-500"> · {frameTime(frame.timeMs)}</span>}
            </span>
          )}
          {hasFrames && (
            <div role="group" aria-label="Show frames" className="flex flex-wrap items-center gap-1.5">
              {SURVEY_FILTERS.map(f => (
                <Chip
                  key={f}
                  selected={!view.place && read.filter === f}
                  count={f === "all" ? undefined : view.counts[f]}
                  // The frame in view stays; the strip and the arrows follow the filter.
                  onClick={() => setParams({ filter: f === "all" ? null : f, place: null })}
                >
                  {FILTER_LABEL[f]}
                </Chip>
              ))}
              {view.place && (
                <Chip selected onClick={() => setParams({ place: null, frame: null })}>Seen: {view.place.nameEn} ×</Chip>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {hasFrames && (
              <div role="group" aria-label="View" className="flex overflow-hidden rounded border border-stone-300">
                {(["frame", "grid"] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={read.view === v}
                    className={`px-3 py-1 text-sm ${read.view === v ? "bg-stone-900 text-white" : "bg-white hover:bg-stone-100"}`}
                    onClick={() => setParams({ view: v === "grid" ? "grid" : null })}
                  >
                    {v === "frame" ? "Frame" : <>Grid <Kbd>G</Kbd></>}
                  </button>
                ))}
              </div>
            )}
            {capture && (
              <Button size="sm" variant="ghost" title={`Look through ${capture.filename} again for frames it missed`} onClick={() => openFootage(capture.id)}>
                Find more frames
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={() => openFootage(null)}>+ Add footage</Button>
          </div>
        </div>
        {body}
      </div>
      {hasFrames && (
        <FramePanel
          labels={labels}
          places={floorPlaces}
          counts={counts}
          levelCode={level.code}
          placeFilter={view.place?.id ?? null}
          onRemove={removeLabel}
          onPickPlace={id => setParams({ place: id, frame: null })}
        />
      )}
      {footage && (
        <AddFootageDialog
          key={footage.captureId ?? "new"}
          api={api}
          saver={saver}
          level={level}
          captureId={footage.captureId}
          open
          onOpenChange={open => { if (!open) setFootage(null); }}
          onCapture={id => setParams({ capture: id, frame: null, place: null, filter: null })}
        />
      )}
    </div>
  );
}
