import { OBJECT_SIZE_GUESS, live, type Level, type MapModel } from "@oth/model";
import { buildObjectKindGlb, objectKindExportName } from "@oth/renderer";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Api } from "../api/client";
import { followLink, href } from "../route";
import type { Saver } from "../state/save";
import { normalName } from "../survey/suggest";
import { kindNamed, sizeText } from "../survey/tagging";
import { Button } from "../ui/Button";
import { reportFailure } from "../ui/failure";
import { toast } from "../ui/toast";
import { BoxedFrame } from "./BoxedFrame";
import { frameSrc, surveyLink } from "./evidence";
import {
  framesText, kindNameProblem, makeObjectWrites, notAnObject, objectCandidates, objectRows, onMapText, parseSize,
  referenceObject, sizeFields, type ObjectRow, type ObjectSize, type SizeText,
} from "./objects";

/** A row's thumbnail: `w-28`, as in the places checklist. */
const THUMB_CSS_PX = 112;

/** Where a new kind's size starts: the guess Survey's Object tag makes kinds at. */
const GUESS: SizeText = sizeFields(OBJECT_SIZE_GUESS);

/** "wast", "wast and Wastebin", "a, b and c". */
function namesText(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** What a place turned into an object is now, and the size it is drawn at. */
function nowText(placeName: string, kind: { nameEn: string; size: ObjectSize }): string {
  return normalName(placeName) === normalName(kind.nameEn)
    ? `${placeName} is an object now (${sizeText(kind.size)}).`
    : `${placeName} is now a ${kind.nameEn} (${sizeText(kind.size)}).`;
}

/** A failure's own words as a sentence: one full stop, whether or not it came with one. */
function sentence(err: unknown): string {
  const words = err instanceof Error ? err.message : String(err);
  return /[.!?]$/.test(words) ? words : `${words}.`;
}

function sameSize(a: ObjectSize, b: ObjectSize): boolean {
  return a.w === b.w && a.d === b.d && a.h === b.h;
}

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

/** Width, depth and height in metres. Read-only shows a kind's size where it can't be changed. */
function SizeFields({ value, onChange }: { value: SizeText; onChange?: (next: SizeText) => void }) {
  const readOnly = !onChange;
  const field = (side: keyof SizeText, label: string) => (
    <label className="text-xs text-stone-600">
      {label}
      <input
        aria-label={`${label} in metres`}
        inputMode="decimal"
        readOnly={readOnly}
        className={`mt-1 block h-8 w-16 rounded border border-stone-300 px-2 text-sm text-stone-900 ${readOnly ? "bg-stone-100" : ""}`}
        value={value[side]}
        onChange={event => onChange?.({ ...value, [side]: event.target.value })}
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
 * frames, with Export for modelling and Upload model, and Not an object
 * while none is on the map. Below the list, "This is an object" turns a
 * place into a kind, or joins it to one (spec §5.1).
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
          To put one on the map, open Build's Dressing step, select a room and use the Objects… button.
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
  const [editing, setEditing] = useState<{ name: string; size: SizeText } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photo = row.best ? surveyLink(model, row.best.frame) : null;
  const frames = framesText(row.frames);
  // The active floor: Objects… on its Dressing step does the rest of the work.
  const placeOnMap = href({ name: "floor", code: level.code, tab: "build", params: { step: "dressing" } });
  // Only while none is on the map: those would be left objects of nothing.
  const canUndo = notAnObject(model, kind.id) !== null;

  async function saveKind(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const parsed = parseSize(editing.size);
    const refused = kindNameProblem(model.objectKinds, kind.id, editing.name) ?? (parsed.ok ? null : parsed.reason);
    if (refused || !parsed.ok) {
      setProblem(refused);
      return;
    }
    setProblem(null);
    const nameEn = editing.name.trim();
    // Only what changed, so the kind's history says what was done.
    const patch = {
      ...(nameEn === kind.nameEn ? {} : { nameEn }),
      ...(sameSize(parsed.size, kind.size) ? {} : { size: parsed.size }),
    };
    if (Object.keys(patch).length === 0) {
      setEditing(null);
      return;
    }
    setBusy(true);
    const saved = await saver.update("objectKind", kind.id, kind.version, patch);
    setBusy(false);
    if (saved) setEditing(null);
  }

  /** The undo for a place made an object by mistake: its places are places again, then the kind goes. */
  async function unmake() {
    const places = notAnObject(model, kind.id);
    if (!places) return;
    setBusy(true);
    try {
      // The places first: a place naming a deleted kind would be an object of nothing.
      for (const place of places) {
        if (!(await saver.update("place", place.id, place.version, { objectKindId: null }))) return;
      }
      if (!(await saver.remove("objectKind", kind.id, kind.version))) return;
      const back = places.length === 0 ? ""
        : ` ${namesText(places.map(p => p.nameEn))} ${places.length === 1 ? "is" : "are"} back among the places.`;
      toast({ message: `${kind.nameEn} is no longer a kind of object.${back}` });
    } finally {
      setBusy(false);
    }
  }

  async function exportForModelling() {
    setBusy(true);
    try {
      // One of its objects lends the file its surroundings: this floor's, else any.
      const at = referenceObject(model, kind.id, level.id);
      const on = (at && live(model.levels).find(l => l.id === at.levelId)) || level;
      download(await buildObjectKindGlb(kind, at, live(model.rooms), on), objectKindExportName(kind));
    } catch (err) {
      toast({ tone: "error", message: `Couldn't make ${kind.nameEn}'s file: ${sentence(err)}` });
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
            aria-label={`Change the name or size of ${kind.nameEn}`}
            onClick={() => {
              setProblem(null);
              setEditing({ name: kind.nameEn, size: sizeFields(kind.size) });
            }}
          >
            Change name or size
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
          <label
            title="Delete the box and the surroundings in Blender before you export, so only your model comes back."
            className="inline-flex h-7 cursor-pointer items-center rounded border border-stone-300 bg-white px-2.5 text-xs font-medium text-stone-900 hover:bg-stone-100"
          >
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
          {canUndo && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              aria-label={`Not an object: ${kind.nameEn}`}
              title="Its places become plain places again, and the kind is deleted. Offered while none is on the map."
              onClick={() => void unmake()}
            >
              Not an object
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <form aria-label={`Name and size of ${kind.nameEn}`} className="flex flex-wrap items-end gap-2" onSubmit={e => void saveKind(e)}>
          <label className="text-xs text-stone-600">
            Name
            <input
              aria-label="Name"
              className="mt-1 block h-8 w-40 rounded border border-stone-300 px-2 text-sm text-stone-900"
              value={editing.name}
              onChange={event => setEditing({ ...editing, name: event.target.value })}
            />
          </label>
          <SizeFields value={editing.size} onChange={size => setEditing({ ...editing, size })} />
          <Button type="submit" size="sm" variant="primary" disabled={busy}>Save</Button>
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
  const kinds = useMemo(
    () => [...live(model.objectKinds)].sort((a, b) => a.nameEn.localeCompare(b.nameEn) || a.id.localeCompare(b.id)),
    [model],
  );
  const place = candidates.find(p => p.id === placeId) ?? null;
  // The kind it becomes: named for the place until you type or choose
  // another. Held with the place it was typed for, so the next place chosen
  // starts from its own name.
  const [typed, setTyped] = useState<{ placeId: string; name: string } | null>(null);
  const kindName = typed && typed.placeId === placeId ? typed.name : place?.nameEn ?? "";
  const joins = place ? kindNamed(kinds, kindName) : undefined;
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
    if (kindName.trim() === "") {
      setProblem("Give the kind a name.");
      return;
    }
    const parsed = parseSize(size);
    if (!joins && !parsed.ok) {
      setProblem(parsed.reason);
      return;
    }
    setProblem(null);
    setBusy(true);
    const asked = parsed.ok ? parsed.size : OBJECT_SIZE_GUESS;
    const writes = makeObjectWrites(place, kindName, asked, model.objectKinds);
    // The kind first: a place naming a kind not yet made would be an object of nothing.
    const kindReady = writes.objectKind ? await saver.create("objectKind", writes.objectKind) : true;
    const done = kindReady && (await saver.update("place", place.id, place.version, { objectKindId: writes.objectKindId }));
    setBusy(false);
    if (!done) return;
    toast({ message: nowText(place.nameEn, joins ?? { nameEn: kindName.trim(), size: asked }) });
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
      {place && (
        <label className="block text-xs text-stone-600">
          Which kind?
          <input
            aria-label="Which kind?"
            list="object-kind-names"
            placeholder="A kind's name, or a new one"
            className="mt-1 block h-9 w-full max-w-sm rounded border border-stone-300 px-2 text-sm text-stone-900"
            value={kindName}
            onChange={event => {
              setProblem(null);
              setTyped({ placeId: place.id, name: event.target.value });
            }}
          />
        </label>
      )}
      {/* The kinds there are, to join one: a place called "wast" is a wastebin. */}
      <datalist id="object-kind-names">
        {kinds.map(k => <option key={k.id} value={k.nameEn} />)}
      </datalist>
      {place && (joins ? (
        <>
          <p className="text-sm text-stone-700">
            {place.nameEn} becomes a {joins.nameEn}, at its size. Change the size on its row above.
          </p>
          <SizeFields value={sizeFields(joins.size)} />
        </>
      ) : (
        <SizeFields value={size} onChange={setSize} />
      ))}
      {problem && <p role="alert" className="text-xs text-danger">{problem}</p>}
      <Button type="submit" variant="primary" disabled={!place || busy}>This is an object</Button>
    </form>
  );
}
