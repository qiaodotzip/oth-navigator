import { live, placeLevels, type Box, type Capture, type Level } from "@oth/model";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Api } from "../api/client";
import { setParams } from "../route";
import type { Saver } from "../state/save";
import { mapRoomIds } from "../places/objects";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Kbd } from "../ui/Kbd";
import { reportFailure } from "../ui/failure";
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
import { exactPlace, linkablePlaces } from "./suggest";
import { frameTime, nextUntagged, readSurveyParams, stepFrame, surveyView } from "./surveyView";
import type { TagBarHandle } from "./TagBar";
import { newId, tagWrites, walkwayColour, type Tag } from "./tagging";

const FILTER_LABEL: Record<SurveyFilter, string> = {
  all: "All", untagged: "Untagged", proposed: "Proposed", tagged: "Tagged",
};

/**
 * Whether the address names this frame, on the page a bin was made from: a
 * bin's late answer moves you only if you are still where it left you.
 */
function addressShows(page: string, frameId: string | null): boolean {
  return window.location.pathname === page
    && new URLSearchParams(window.location.search).get("frame") === frameId;
}

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
  // A place bound to one of these is a unit, and the tag bar never makes it an object.
  const mapRooms = useMemo(() => (model ? mapRoomIds(model) : new Set<string>()), [model]);
  const frame = view.frame;
  const labels = useMemo(() => (frame ? labelsForFrame(model, frame.id) : []), [model, frame]);
  const [draft, setDraft] = useState<Box | null>(null);
  const [footage, setFootage] = useState<{ captureId: string | null } | null>(null);
  // Footage whose "File under" is on its way: a second click would send the
  // same version again, and its 409 would blame a teammate.
  const [filing, setFiling] = useState<ReadonlySet<string>>(new Set());
  const tagBar = useRef<TagBarHandle>(null);
  // Tags and bins under way. The keys start one at a time: a second Del
  // before the first bin lands would bin the frame that has just come into
  // view, and a second Enter would tag while the first is still making its
  // place. A count, not a flag, because a Retry can run beside another write.
  const writing = useRef(0);
  // The same count, for Bin frame to show itself held. The ref stays the
  // guard: it is current the moment a write starts, before any render.
  const [writes, setWrites] = useState(0);

  // A drawn box belongs to the frame it was drawn on.
  useEffect(() => setDraft(null), [frame?.id]);

  // With no frame in the address, the one on screen is only worked out — the
  // first untagged under the filter — and tagging it, or choosing a filter,
  // works out another. Written into the address, it stays until you move. A
  // frame the address names but this footage lacks, binned or from other
  // footage, gives way the same way, so the address is the frame you see. A
  // replace, as setParams always is, so Back does not step through it.
  const frameId = frame?.id ?? null;
  useEffect(() => {
    if (frameId && read.frame !== frameId) setParams({ frame: frameId });
  }, [frameId, read.frame]);

  async function holding(work: () => Promise<void>): Promise<void> {
    writing.current += 1;
    setWrites(n => n + 1);
    try {
      await work();
    } finally {
      writing.current -= 1;
      setWrites(n => n - 1);
    }
  }

  /**
   * The reload after a tag or bin, whatever its outcome. One that fails after
   * the write landed is said, and its Retry reloads: the screen would not show
   * the tag, and typing it again would make a second place of the same name.
   * After a write that failed, that failure has been said already.
   */
  async function reload(landed: boolean): Promise<void> {
    try {
      await saver.refresh();
    } catch (err) {
      if (!landed) return;
      reportFailure(err, {
        doing: "reload the map after saving",
        retry: async () => {
          await saver.refresh().catch(() => {});
        },
      });
    }
  }

  /** The place a name means in what the server has now. */
  function placeNamed(nameEn: string): string | null {
    const now = useEditorStore.getState().model;
    if (!now) return null;
    const on = placeLevels(now);
    return exactPlace(linkablePlaces(live(now.places), on, level.id), on, level.id, nameEn)?.id ?? null;
  }

  /**
   * Makes the place when the name is new, ties it to the frame, and reloads
   * whatever the outcome. The writes go straight to the API so a failure is
   * said once, with a Retry that sends the whole tag again, after a reload:
   * a place the first try made before its sighting failed is then found by
   * name and linked, never made twice. The saver's own Retry resent just the
   * one write, which left that place orphaned and the frame untagged.
   *
   * `drawn` is the box on screen when the tag was sent. It goes once the tag
   * is saved, so a tag that fails keeps it; one drawn since is left alone.
   */
  function sendTag(t: Tag, frameId: string, drawn: Box | null, again = false): Promise<void> {
    return holding(async () => {
      let landed = false;
      try {
        let placeId = t.placeId;
        if (again) {
          await saver.refresh();
          placeId = placeId ?? placeNamed(t.nameEn);
        }
        // What the server has now: a kind or a place the first try made is
        // reused, never made twice.
        const now = useEditorStore.getState().model;
        const writes = tagWrites({ ...t, placeId }, frameId, level.id, newId, {
          places: live(now?.places ?? []),
          kinds: live(now?.objectKinds ?? []),
        });
        // The kind first: a place naming a kind not yet made would be an object of nothing.
        if (writes.objectKind) await api.createEntity("objectKind", writes.objectKind);
        if (writes.place) await api.createEntity("place", writes.place);
        if (writes.makeObject) {
          const { placeId: id, objectKindId } = writes.makeObject;
          const place = now?.places.find(p => p.id === id);
          if (place) await api.updateEntity("place", id, place.version, { objectKindId });
        }
        await api.createEntity("sighting", writes.sighting);
        landed = true;
        setDraft(d => (d === drawn ? null : d));
      } catch (err) {
        reportFailure(err, {
          doing: `save the tag ${t.nameEn}`,
          retry: () => sendTag(t, frameId, drawn, true),
        });
      } finally {
        await reload(landed);
      }
    });
  }

  /**
   * From the tag bar. While a write is under way the tag is refused out loud
   * rather than dropped, and the bar keeps its name to send again.
   */
  function tag(t: Tag): boolean {
    if (!frame) return false;
    if (writing.current > 0) {
      toast({ message: "Still saving the last change — press Enter again in a moment." });
      return false;
    }
    void sendTag(t, frame.id, draft);
    return true;
  }

  /**
   * Bins a frame and offers Undo, reloading whatever the outcome. A bin that
   * fails comes back to its frame, unless you have moved on from the one it
   * took you to. Its Retry bins it all over again, so a bin that lands on the
   * second try still offers its Undo; the saver's Retry never did.
   */
  function sendBin(target: { id: string; number: number }, movedTo: string | null, page: string): Promise<void> {
    return holding(async () => {
      let landed = false;
      try {
        await api.deleteKeyframe(target.id);
        landed = true;
      } catch (err) {
        if (addressShows(page, movedTo)) setParams({ frame: target.id });
        reportFailure(err, {
          doing: `bin frame ${target.number}`,
          retry: () => {
            // On again from the frame it came back to, as Del did the first time.
            if (addressShows(page, target.id)) setParams({ frame: movedTo });
            return sendBin(target, movedTo, page);
          },
        });
        return;
      } finally {
        await reload(landed);
      }
      offerUndo({
        message: `Binned frame ${target.number}`,
        undone: `Frame ${target.number} is back`,
        what: `frame ${target.number}`,
        run: () => api.restoreKeyframe(target.id),
        refresh: saver.refresh,
      });
    });
  }

  /** From Del or Bin frame: dropped, not queued, while a write is under way. */
  function bin(): void {
    if (!frame || writing.current > 0) return;
    const movedTo = (stepFrame(view, 1) ?? stepFrame(view, -1))?.id ?? null;
    // On to the next frame at once.
    setParams({ frame: movedTo });
    void sendBin({ id: frame.id, number: view.index + 1 }, movedTo, window.location.pathname);
  }

  /**
   * Unfiled footage is offered on every floor, since it belongs to whichever
   * one it was filmed on. So a click on the wrong floor moves all of it, and
   * every place seen in it, there — and nothing else in the app files it back.
   * The Undo is that way back.
   */
  async function fileUnder(capture: Capture): Promise<void> {
    setFiling(s => new Set(s).add(capture.id));
    const filed = await saver.update("capture", capture.id, capture.version, { levelId: level.id });
    setFiling(s => {
      const left = new Set(s);
      left.delete(capture.id);
      return left;
    });
    if (!filed) return;
    offerUndo({
      message: `Filed ${capture.filename} under ${level.code}`,
      undone: `${capture.filename} isn't filed under a floor again`,
      what: capture.filename,
      // An explicit null clears the floor; the filing moved the version on by one.
      run: () => api.updateEntity("capture", capture.id, capture.version + 1, { levelId: null }),
      refresh: saver.refresh,
    });
  }

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
        bin();
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
        <Button size="sm" disabled={filing.has(c.id)} onClick={() => void fileUnder(c)}>
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
        // Box, then name, then Enter (spec §9): the mouse press that drew the
        // box took the focus, and without this the name typed next was read
        // as keys — the G of "Guardian" opened the grid.
        onDrawn={() => tagBar.current?.focus()}
        onMoveLabel={moveLabel}
        onRemoveLabel={removeLabel}
        tagBar={tagBar}
        candidates={candidates}
        levels={levels}
        levelId={level.id}
        counts={counts}
        walkwayKinds={live(model.pathwayKinds)}
        rooms={mapRooms}
        onTag={tag}
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
          {hasFrames && read.view === "frame" && (
            // Beside the frame's number, for teammates who use the mouse; the
            // toast's Undo stands in for a confirmation. Quiet, not a red
            // fill: it is used on frame after frame. The red is on the words,
            // since Tailwind's text-danger loses to the secondary grey.
            <Button
              size="sm"
              aria-keyshortcuts="Delete"
              disabled={!frame || writes > 0}
              // A mouse press leaves focus where it was: left on this button,
              // the next Enter would press it again and bin the frame after.
              // Tab still reaches it, and Enter on it then bins.
              onMouseDown={event => event.preventDefault()}
              onClick={bin}
            >
              <span className="text-danger">Bin frame</span> <Kbd>Del</Kbd>
            </Button>
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
                // Like a filter chip, letting the place go leaves the frame in view.
                <Chip selected onClick={() => setParams({ place: null })}>Seen: {view.place.nameEn} ×</Chip>
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
        {view.noneMatch && (
          // The frame in view stays, alone in the strip, and the arrows have
          // nowhere to go: this says why, where it would otherwise be silence.
          <p role="status" className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-600">
            {view.place
              ? `${view.place.nameEn} isn't seen in any other frame.`
              : `No other frames are ${FILTER_LABEL[read.filter].toLowerCase()}.`}
          </p>
        )}
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
          // A place chosen opens on a frame it is seen in; one let go leaves the frame in view.
          onPickPlace={id => setParams(id ? { place: id, frame: null } : { place: null })}
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
