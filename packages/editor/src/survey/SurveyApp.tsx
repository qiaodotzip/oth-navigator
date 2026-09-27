import type { Box, Capture, Keyframe, Place } from "@oth/model";
import { useEffect, useMemo, useState } from "react";
import type { Api } from "../api/client";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { navigate } from "../route";
import { CaptureVideo } from "./CaptureVideo";
import { frameFilename, orderFrames } from "./frames";
import { PlaceTagger, type Tag } from "./PlaceTagger";
import { labelCounts, labelsForFrame, type FrameLabel } from "./labelled";
import { sightingCounts } from "./places";
import { ReviewPanel } from "./ReviewPanel";
import { reviewProgress } from "./review";

/**
 * The survey tool: footage in, named places and adjacency out.
 *
 * A second route in the editor rather than a second application — same login,
 * same server, same audit log, different job.
 */
export function SurveyApp({ api }: { api: Api }) {
  const saver = useMemo(() => createSaver(api), [api]);
  const model = useEditorStore(s => s.model);
  const status = useEditorStore(s => s.status);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [frameId, setFrameId] = useState<string | null>(null);
  const [tab, setTab] = useState<"places" | "review">("places");
  const [renaming, setRenaming] = useState<string | null>(null);

  useEffect(() => {
    void saver.load();
  }, [saver]);

  // Null means the model has never loaded — almost always a server that is not
  // running. An empty list means it loaded and there is genuinely nothing, and
  // saying "nothing yet" for both has sent someone hunting for lost data twice.
  const loaded = model !== null;
  const captures: Capture[] = model?.captures ?? [];
  const places: Place[] = model?.places ?? [];
  const capture = captures.find(c => c.id === captureId) ?? null;

  const frames: Keyframe[] = useMemo(
    () => orderFrames((model?.keyframes ?? []).filter(k => k.captureId === captureId)),
    [model?.keyframes, captureId],
  );
  const frame = frames.find(f => f.id === frameId) ?? frames[frames.length - 1] ?? null;
  const counts = sightingCounts(model?.sightings ?? []);
  const labelled = labelCounts(model);
  const kinds = model?.pathwayKinds ?? [];
  const unbound = places.filter(p => !p.roomId).length;
  const waiting = reviewProgress(model).proposed;

  async function addCapture() {
    const filename = window.prompt("What is the file called?");
    if (!filename) return;
    const id = `cap_${Date.now()}`;
    if (await saver.create("capture", { id, kind: "video", filename })) setCaptureId(id);
  }

  async function grabFrame(blob: Blob, timeMs: number) {
    if (!capture) return;
    try {
      await api.uploadKeyframe(blob, capture.id, timeMs, frameFilename(capture, timeMs));
      await saver.refresh();
    } catch (err) {
      useEditorStore.getState().setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function renameCapture(capture: Capture, filename: string) {
    setRenaming(null);
    if (filename.trim() === "" || filename === capture.filename) return;
    await saver.update("capture", capture.id, capture.version, { filename: filename.trim() });
  }

  async function removeCapture(capture: Capture) {
    const frames = (model?.keyframes ?? []).filter(k => k.captureId === capture.id).length;
    // Deleting a capture deletes a labelling session, which is hours of work.
    const ok = window.confirm(
      `Delete "${capture.filename}" and its ${frames} frame(s), with everything labelled on them?`,
    );
    if (!ok) return;
    try {
      await api.deleteCapture(capture.id);
      if (captureId === capture.id) {
        setCaptureId(null);
        setFrameId(null);
      }
      await saver.refresh();
    } catch (err) {
      useEditorStore.getState().setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function addWalkwayKind(nameEn: string) {
    const palette = ["#38bdf8", "#f2a33c", "#a78bfa", "#34d399", "#f472b6", "#facc15"];
    await saver.create("pathwayKind", {
      id: `pk-${Date.now()}`,
      nameEn,
      colorHex: palette[kinds.length % palette.length],
    });
  }

  async function removeFrame(id: string) {
    try {
      await api.deleteKeyframe(id);
      if (frameId === id) setFrameId(null);
      await saver.refresh();
    } catch (err) {
      useEditorStore.getState().setStatus(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Takes one tag off one frame.
   *
   * Only the sighting goes: the place stays, and so does every other frame it
   * was seen in. Rejecting the place in Review is the blunt instrument; this is
   * for the common case of one wrong tag among several right ones.
   */
  async function removeLabel(label: FrameLabel) {
    await saver.remove("sighting", label.sighting.id, label.sighting.version);
  }

  /**
   * Corrects where a box sits, after dragging or resizing it.
   *
   * Most boxes that need this came from a proposal, which read the frame well
   * enough to name the place but put the rectangle a little off.
   */
  async function moveLabel(label: FrameLabel, box: Box) {
    await saver.update("sighting", label.sighting.id, label.sighting.version, { box });
  }

  async function tag(t: Tag) {
    if (!frame) return;
    let placeId = t.placeId;
    if (!placeId) {
      placeId = `pl_${Date.now()}`;
      const made = await saver.create("place", {
        id: placeId,
        nameEn: t.nameEn,
        category: t.category,
        ...(t.pathwayKindId ? { pathwayKindId: t.pathwayKindId } : {}),
        ...(capture?.levelId ? { levelId: capture.levelId } : {}),
      });
      if (!made) return;
    }
    await saver.create("sighting", {
      id: `sg_${Date.now()}`,
      placeId,
      keyframeId: frame.id,
      ...(t.box ? { box: t.box } : {}),
    });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">OTH Survey</h1>
        <button className="text-sm text-stone-500 hover:underline" onClick={() => navigate("/")}>
          ← Map editor
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 overflow-auto border-r bg-white p-2 text-sm">
          <h2 className="px-1 py-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Captures
          </h2>
          {!loaded && (
            <p data-testid="captures-unloaded" className="px-1 py-2 text-xs text-amber-700">
              Nothing has loaded yet. If this does not clear, reload the page.
            </p>
          )}
          {loaded && captures.length === 0 && (
            <p className="px-1 py-2 text-xs italic text-stone-400">
              Nothing yet. Add the walkthrough you filmed.
            </p>
          )}
          <ul>
            {captures.map(c => (
              <li key={c.id} className="group flex items-center gap-1">
                {renaming === c.id ? (
                  <input
                    aria-label={`Rename ${c.filename}`}
                    autoFocus
                    defaultValue={c.filename}
                    className="min-w-0 flex-1 rounded border px-1 text-xs text-stone-900"
                    onBlur={e => void renameCapture(c, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <>
                    <button
                      data-testid={`capture-${c.id}`}
                      className={`min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left ${
                        c.id === captureId ? "bg-stone-800 text-white" : "hover:bg-stone-100"
                      }`}
                      onClick={() => {
                        setCaptureId(c.id);
                        setFrameId(null);
                      }}
                    >
                      {c.filename}
                    </button>
                    <button
                      aria-label={`Rename ${c.filename}`}
                      className="shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={() => setRenaming(c.id)}
                    >
                      &#9998;
                    </button>
                    <button
                      aria-label={`Delete ${c.filename}`}
                      className="shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={() => void removeCapture(c)}
                    >
                      &#128465;
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <button className="mt-2 w-full rounded border px-2 py-1 text-xs" onClick={() => void addCapture()}>
            + Add capture
          </button>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto p-3">
          {!capture && <p className="text-sm text-stone-500">Pick a capture to start labelling.</p>}

          {capture && (
            <div className="space-y-3">
              <CaptureVideo filename={capture.filename} onGrab={(b, t) => void grabFrame(b, t)} />

              {frames.length > 0 && (
                <div className="flex gap-1 overflow-x-auto border-t pt-2" data-testid="filmstrip">
                  {frames.map(f => (
                    <div key={f.id} className="group relative shrink-0">
                      <button
                        data-testid={`filmstrip-${f.id}`}
                        className={`h-14 overflow-hidden rounded border-2 ${
                          f.id === frame?.id ? "border-amber-400" : "border-transparent"
                        }`}
                        onClick={() => setFrameId(f.id)}
                      >
                        <img
                          src={api.keyframeFileUrl(f.id, 240)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-full"
                        />
                      </button>
                      {labelled.get(f.id) && (
                        <span
                          data-testid={`labelled-${f.id}`}
                          title={`${labelled.get(f.id)} label(s)`}
                          className="pointer-events-none absolute bottom-0 left-0 rounded-tr bg-emerald-600 px-1 text-xs text-white"
                        >
                          {labelled.get(f.id)}
                        </span>
                      )}
                      <button
                        aria-label={`Remove frame ${f.id}`}
                        title="Remove this frame"
                        // Always visible on the frame being worked on. Hidden
                        // behind hover everywhere it was unfindable.
                        className={`absolute right-0 top-0 rounded bg-stone-900/80 px-1 text-xs text-white ${
                          f.id === frame?.id ? "" : "opacity-0 group-hover:opacity-100"
                        }`}
                        onClick={() => void removeFrame(f.id)}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {frame && (
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  <span className="flex-1">
                    Frame {frames.findIndex(f => f.id === frame.id) + 1} of {frames.length}
                    {frame.timeMs !== undefined
                      ? ` — ${Math.floor(frame.timeMs / 60000)}m${String(Math.floor((frame.timeMs % 60000) / 1000)).padStart(2, "0")}s`
                      : ""}
                  </span>
                  <button
                    className="rounded border px-2 py-1"
                    onClick={() => void removeFrame(frame.id)}
                  >
                    Delete this frame
                  </button>
                </div>
              )}

              {frame && (
                <PlaceTagger
                  keyframe={frame}
                  // Wide enough to read a shop sign; the box is in fractions, so
                  // the size shown does not change what is saved.
                  imageUrl={api.keyframeFileUrl(frame.id, 1600)}
                  places={places}
                  labels={labelsForFrame(model, frame.id)}
                  walkwayKinds={kinds}
                  onTag={t => void tag(t)}
                  onRemoveLabel={l => void removeLabel(l)}
                  onMoveLabel={(l, b) => void moveLabel(l, b)}
                  onAddWalkwayKind={n => void addWalkwayKind(n)}
                />
              )}
            </div>
          )}
        </main>

        <aside className="w-72 overflow-auto border-l bg-white text-sm">
          <div className="flex border-b">
            {(["places", "review"] as const).map(id => (
              <button
                key={id}
                data-testid={`tab-${id}`}
                className={`flex-1 px-2 py-2 text-xs uppercase tracking-wide ${
                  tab === id ? "border-b-2 border-stone-800 font-semibold" : "text-stone-500"
                }`}
                onClick={() => setTab(id)}
              >
                {id === "places" ? `Places (${places.length})` : `Review (${waiting})`}
              </button>
            ))}
          </div>

          {tab === "review" ? <ReviewPanel api={api} saver={saver} /> : (
          <div className="p-2">
          <ul>
            {places.map(p => (
              <li key={p.id} data-testid={`place-${p.id}`} className="flex gap-2 px-1 py-0.5">
                <span className="min-w-0 flex-1 truncate">{p.nameEn}</span>
                <span className="text-xs text-stone-500">×{counts.get(p.id) ?? 0}</span>
              </li>
            ))}
          </ul>
          {places.length > 0 && (
            <p className="px-1 pt-2 text-xs text-stone-500">{unbound} not yet bound to a room</p>
          )}
          </div>
          )}
        </aside>
      </div>

      {status && <footer className="border-t bg-stone-100 px-4 py-1 text-xs">{status}</footer>}
    </div>
  );
}
