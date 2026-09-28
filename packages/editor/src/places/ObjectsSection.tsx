import { OBJECT_SIZE_GUESS, live, type Level, type MapModel } from "@oth/model";
import { buildObjectKindGlb, objectKindExportName } from "@oth/renderer";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Api } from "../api/client";
import { followLink, href } from "../route";
import type { Saver } from "../state/save";
import { kindNamed, sizeText } from "../survey/tagging";
import { Button } from "../ui/Button";
import { reportFailure } from "../ui/failure";
import { toast } from "../ui/toast";
import { BoxedFrame } from "./BoxedFrame";
import { frameSrc, surveyLink } from "./evidence";
import {
  framesText, makeObjectWrites, objectCandidates, objectRows, onMapText, parseSize, referenceObject, sizeFields,
  type ObjectRow, type SizeText,
} from "./objects";

/** A row's thumbnail: `w-28`, as in the places checklist. */
const THUMB_CSS_PX = 112;

/** Where a new kind's size starts: the guess Survey's Object tag makes kinds at. */
const GUESS: SizeText = sizeFields(OBJECT_SIZE_GUESS);

function download(bytes: Uint8Array, filename: string): void {
  // Copied into a definite ArrayBuffer: a Uint8Array may be backed by a
  // SharedArrayBuffer as far as the types are concerned, which Blob rejects.
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const url = URL.createObjectURL(new Blob([buf], { type: "model/gltf-binary" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SizeFields({ value, onChange }: { value: SizeText; onChange: (next: SizeText) => void }) {
  const field = (side: keyof SizeText, label: string) => (
    <label className="text-xs text-stone-600">
      {label}
      <input
        aria-label={`${label} in metres`}
        inputMode="decimal"
        className="mt-1 block h-8 w-16 rounded border border-stone-300 px-2 text-sm text-stone-900"
        value={value[side]}
        onChange={event => onChange({ ...value, [side]: event.target.value })}
      />
    </label>
  );
  return (
    <div className="flex items-end gap-2">
      {field("w", "Width")}
      {field("d", "Depth")}
      {field("h", "Height")}
      <span className="pb-2 text-xs text-stone-600">m</span>
    </div>
  );
}

/**
 * The Places tab's Objects section (spec §5.2): each kind with its size,
 * whether it has a model yet, how many are on the map per floor and its
 * frames, with Export for modelling and Upload model. Below the list,
 * "This is an object" turns a place into a kind (spec §5.1).
 */
export function ObjectsSection({ api, saver, model, level, placeId, onPlaceId }: {
  api: Api;
  saver: Saver;
  model: MapModel;
  level: Level;
  /** The place the form is turning into an object, picked there or from a checklist row. */
  placeId: string | null;
  onPlaceId: (placeId: string | null) => void;
}) {
  const rows = useMemo(() => objectRows(model), [model]);
  return (
    <section aria-labelledby="objects-heading" className="space-y-3 pt-4">
      <header className="space-y-1">
        <h2 id="objects-heading" className="text-lg font-semibold">Objects</h2>
        <p className="text-sm text-stone-600">
          Each kind is modelled once. Every one on the map shows its model, or a box of its size until it has one.
        </p>
        <p className="text-sm text-stone-600">
          To put one on the map, select a room in Build's Dressing step and use Objects….
        </p>
      </header>
      {rows.length > 0 ? (
        <ul aria-label="Kinds of object" className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
          {rows.map(row => <ObjectRowItem key={row.kind.id} api={api} saver={saver} model={model} level={level} row={row} />)}
        </ul>
      ) : (
        <p className="text-sm text-stone-600">No objects yet. Tag one in Survey as an Object, or turn a place into one below.</p>
      )}
      <MakeObjectForm model={model} saver={saver} placeId={placeId} onPlaceId={onPlaceId} />
    </section>
  );
}

function ObjectRowItem({ api, saver, model, level, row }: {
  api: Api; saver: Saver; model: MapModel; level: Level; row: ObjectRow;
}) {
  const { kind } = row;
  const [editing, setEditing] = useState<SizeText | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photo = row.best ? surveyLink(model, row.best.frame) : null;
  const frames = framesText(row.frames);
  // The active floor: Objects… on its Dressing step does the rest of the work.
  const placeOnMap = href({ name: "floor", code: level.code, tab: "build", params: { step: "dressing" } });

  async function saveSize(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const parsed = parseSize(editing);
    if (!parsed.ok) {
      setProblem(parsed.reason);
      return;
    }
    setProblem(null);
    setBusy(true);
    const saved = await saver.update("objectKind", kind.id, kind.version, { size: parsed.size });
    setBusy(false);
    if (saved) setEditing(null);
  }

  async function exportForModelling() {
    setBusy(true);
    try {
      // One of its objects lends the file its surroundings: this floor's, else any.
      const at = referenceObject(model, kind.id, level.id);
      const on = (at && live(model.levels).find(l => l.id === at.levelId)) || level;
      download(await buildObjectKindGlb(kind, at, live(model.rooms), on), objectKindExportName(kind));
    } catch (err) {
      toast({ tone: "error", message: `Couldn't make ${kind.nameEn}'s file: ${err instanceof Error ? err.message : String(err)}.` });
    } finally {
      setBusy(false);
    }
  }

  async function uploadModel(file: File) {
    setBusy(true);
    try {
      // The asset pipeline's own checks and limits (5 MB, 150k triangles) apply.
      const asset = await api.uploadAsset(file);
      await saver.update("objectKind", kind.id, kind.version, { assetId: asset.id });
    } catch (err) {
      reportFailure(err, { doing: `upload ${file.name}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li data-testid={`object-row-${kind.id}`} className="space-y-2 p-2">
      <div className="flex items-center gap-3">
        {row.best ? (
          <BoxedFrame
            className="w-28 shrink-0"
            src={frameSrc(api, row.best, THUMB_CSS_PX)}
            frame={row.best.frame}
            box={row.best.sighting.box}
            tone={row.best.sighting.status}
            alt=""
          />
        ) : (
          <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded bg-stone-100 text-xs text-stone-600">No photo</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-900">{kind.nameEn}</p>
          <p className="text-xs text-stone-600">{sizeText(kind.size)} · {row.look}</p>
          <p className="text-xs text-stone-600">{onMapText(row)}</p>
          <p className="text-xs text-stone-600">
            {photo ? <a href={photo} onClick={followLink(photo)} className="underline">{frames}</a> : frames}
          </p>
          <p className="text-xs text-stone-600">
            <a href={placeOnMap} onClick={followLink(placeOnMap)} className="underline">Place one on the map</a>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button
            size="sm"
            aria-label={`Change the size of ${kind.nameEn}`}
            onClick={() => {
              setProblem(null);
              setEditing(sizeFields(kind.size));
            }}
          >
            Change size
          </Button>
          <Button
            size="sm"
            disabled={busy}
            aria-label={`Export ${kind.nameEn} for modelling`}
            title={row.onMap.length > 0
              ? "The box, with the rooms around one of these on the map."
              : "None is on the map yet, so the file has the box alone."}
            onClick={() => void exportForModelling()}
          >
            Export for modelling
          </Button>
          <label className="inline-flex h-7 cursor-pointer items-center rounded border border-stone-300 bg-white px-2.5 text-xs font-medium text-stone-900 hover:bg-stone-100">
            {row.look === "Model" ? "Replace model" : "Upload model"}
            <input
              type="file"
              accept=".glb,model/gltf-binary"
              aria-label={`Upload a model for ${kind.nameEn}`}
              className="sr-only"
              disabled={busy}
              onChange={event => {
                const file = event.target.files?.[0];
                // Cleared, so choosing the same file again after a fix still sends it.
                event.target.value = "";
                if (file) void uploadModel(file);
              }}
            />
          </label>
        </div>
      </div>
      {editing && (
        <form aria-label={`Size of ${kind.nameEn}`} className="flex flex-wrap items-end gap-2" onSubmit={e => void saveSize(e)}>
          <SizeFields value={editing} onChange={setEditing} />
          <Button type="submit" size="sm" variant="primary" disabled={busy}>Save size</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          {problem && <p role="alert" className="w-full text-xs text-danger">{problem}</p>}
        </form>
      )}
    </li>
  );
}

function MakeObjectForm({ model, saver, placeId, onPlaceId }: {
  model: MapModel; saver: Saver; placeId: string | null; onPlaceId: (placeId: string | null) => void;
}) {
  const candidates = useMemo(() => objectCandidates(model), [model]);
  const place = candidates.find(p => p.id === placeId) ?? null;
  const joins = place ? kindNamed(live(model.objectKinds), place.nameEn) : undefined;
  const [size, setSize] = useState<SizeText>(GUESS);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  // Picked from a checklist row, the form comes into view with its place in it.
  useEffect(() => {
    if (placeId) form.current?.scrollIntoView?.({ block: "nearest" });
  }, [placeId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!place) return;
    const parsed = parseSize(size);
    if (!joins && !parsed.ok) {
      setProblem(parsed.reason);
      return;
    }
    setProblem(null);
    setBusy(true);
    const writes = makeObjectWrites(place, parsed.ok ? parsed.size : OBJECT_SIZE_GUESS, model.objectKinds);
    // The kind first: a place naming a kind not yet made would be an object of nothing.
    const kindReady = writes.objectKind ? await saver.create("objectKind", writes.objectKind) : true;
    const done = kindReady && (await saver.update("place", place.id, place.version, { objectKindId: writes.objectKindId }));
    setBusy(false);
    if (!done) return;
    toast({ message: `${place.nameEn} is an object now.` });
    onPlaceId(null);
    setSize(GUESS);
  }

  return (
    <form
      ref={form}
      aria-label="Turn a place into an object"
      className="space-y-2 rounded border border-stone-200 bg-white p-3"
      onSubmit={e => void submit(e)}
    >
      <p className="text-sm font-medium text-stone-900">Is one of the places an object?</p>
      <label className="block text-xs text-stone-600">
        Which place?
        <select
          aria-label="Which place?"
          className="mt-1 block h-9 w-full max-w-sm rounded border border-stone-300 px-2 text-sm text-stone-900"
          value={place?.id ?? ""}
          onChange={event => {
            setProblem(null);
            onPlaceId(event.target.value || null);
          }}
        >
          <option value="">Choose a place…</option>
          {candidates.map(p => (
            <option key={p.id} value={p.id}>{p.nameEn}{p.status === "proposed" ? " (proposed)" : ""}</option>
          ))}
        </select>
      </label>
      {place && (joins ? (
        <p className="text-sm text-stone-700">{place.nameEn} joins the kind {joins.nameEn}, at its size, {sizeText(joins.size)}.</p>
      ) : (
        <SizeFields value={size} onChange={setSize} />
      ))}
      {problem && <p role="alert" className="text-xs text-danger">{problem}</p>}
      <Button type="submit" variant="primary" disabled={!place || busy}>This is an object</Button>
    </form>
  );
}
