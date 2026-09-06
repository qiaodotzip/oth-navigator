import type { Capture, Keyframe, Place } from "@oth/model";
import { useEffect, useMemo, useState } from "react";
import type { Api } from "../api/client";
import { createSaver } from "../state/save";
import { useEditorStore } from "../state/store";
import { navigate } from "../route";
import { CaptureVideo } from "./CaptureVideo";
import { frameFilename, orderFrames } from "./frames";
import { PlaceTagger, type Tag } from "./PlaceTagger";
import { labelCounts, labelsForFrame } from "./labelled";
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

  useEffect(() => {
    void saver.refresh();
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

  async function removeFrame(id: string) {
    try {
      await api.deleteKeyframe(id);
      if (frameId === id) setFrameId(null);
      await saver.refresh();
    } catch (err) {
      useEditorStore.getState().setStatus(err instanceof Error ? err.message : String(err));
    }
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
              Nothing loaded. If this does not clear, the server is probably not
              running — start it with <code>npm run dev</code>.
            </p>
          )}
          {loaded && captures.length === 0 && (
            <p className="px-1 py-2 text-xs italic text-stone-400">
              Nothing yet. Add the walkthrough you filmed.
            </p>
          )}
          <ul>
            {captures.map(c => (
              <li key={c.id}>
                <button
                  data-testid={`capture-${c.id}`}
                  className={`w-full truncate rounded px-1 py-0.5 text-left ${
                    c.id === captureId ? "bg-stone-800 text-white" : "hover:bg-stone-100"
                  }`}
                  onClick={() => {
                    setCaptureId(c.id);
                    setFrameId(null);
                  }}
                >
                  {c.filename}
                </button>
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
                        <img src={api.keyframeFileUrl(f.id)} alt="" className="h-full" />
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
                        className="absolute right-0 top-0 rounded bg-stone-900/80 px-1 text-xs text-white opacity-0 group-hover:opacity-100"
                        onClick={() => void removeFrame(f.id)}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {frame && (
                <PlaceTagger
                  keyframe={frame}
                  imageUrl={api.keyframeFileUrl(frame.id)}
                  places={places}
                  labels={labelsForFrame(model, frame.id)}
                  onTag={t => void tag(t)}
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
