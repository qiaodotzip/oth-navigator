import {
  OBJECT_SIZE_GUESS, TenantCategorySchema, type Box, type PathwayKind, type Place, type TenantCategory,
} from "@oth/model";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { boundToRoom } from "../places/objects";
import { Button } from "../ui/Button";
import { exactPlace, suggestPlaces } from "./suggest";
import { drawnBox, sizeText, type Tag } from "./tagging";

const CATEGORIES = TenantCategorySchema.options;

/** A browser's own suggestion list slows down beyond this, and nobody scrolls that far in it. */
const MAX_SUGGESTIONS = 60;

type What = "place" | "walkway" | "object";

const WHAT_LABEL: Record<What, string> = { place: "Place", walkway: "Walkway", object: "Object" };

const PLACEHOLDER: Record<What, string> = {
  place: "What is this? Type a name…",
  walkway: "Name this walkway…",
  object: "Which object? Like wastebin…",
};

export type TagBarHandle = { focus: () => void; submit: () => void };

/**
 * Directly under the frame: what is in it, and Tag (spec §9).
 *
 * The name links to a place that exists before it makes a new one — naming is
 * the slow step, and without the link the seventh NTUC sighting makes a
 * seventh NTUC. Drawing a box is optional on purpose: it says which of two
 * shops is meant, and the common case is the whole frame.
 */
export const TagBar = forwardRef<TagBarHandle, {
  candidates: readonly Place[];
  levels: ReadonlyMap<string, string | undefined>;
  levelId: string;
  counts: ReadonlyMap<string, number>;
  walkwayKinds: readonly PathwayKind[];
  /** The ids of the rooms on the map: a place bound to one is a unit, and is never made an object. */
  rooms: ReadonlySet<string>;
  box: Box | null;
  /**
   * Whether the tag was taken. One refused — the last change is still
   * saving — keeps its name, to send again rather than lose.
   */
  onTag: (tag: Tag) => boolean;
  /** Makes a walkway type and says its id, or null if it could not. */
  onAddWalkwayKind: (nameEn: string) => Promise<string | null>;
}>(function TagBar({ candidates, levels, levelId, counts, walkwayKinds, rooms, box, onTag, onAddWalkwayKind }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TenantCategory>("retail");
  // What is being boxed: a unit you go into, or a stretch of floor you cross.
  const [what, setWhat] = useState<What>("place");
  const [kindId, setKindId] = useState("");
  const [newKind, setNewKind] = useState<string | null>(null);

  // An object is never a walkway: a walkway of the same name is a different thing.
  const pool = what === "object" ? candidates.filter(p => !p.pathwayKindId) : candidates;
  const exact = exactPlace(pool, levels, levelId, name);
  const suggestions = suggestPlaces(pool, levels, levelId, name, counts).slice(0, MAX_SUGGESTIONS);
  // A place surveyed as a place, about to become a kind of object: every
  // other frame of it goes with it, so the button says so.
  const converting = what === "object" && exact && !exact.objectKindId ? exact : null;
  // The rule "This is an object" in Places follows too.
  const refused = converting && boundToRoom(converting, rooms)
    ? `${converting.nameEn} is a room on the map, so it can't be an object.`
    : null;
  const objectNote = what !== "object" || name.trim() === "" || exact?.objectKindId ? null
    : refused ?? (exact ? `${exact.nameEn} becomes a kind of object.`
      : `A new kind of object. It shows as a ${sizeText(OBJECT_SIZE_GUESS)} box until you set its size in Places.`);

  function submit() {
    const trimmed = name.trim();
    if (trimmed === "") {
      input.current?.focus();
      return;
    }
    if (refused) return;
    const drawn = drawnBox(box);
    const taken = onTag({
      placeId: exact?.id ?? null,
      nameEn: trimmed,
      // A walkway or an object is a piece of the building, not a tenant.
      category: what === "place" ? exact?.category ?? category : "facility",
      ...(what === "walkway" && kindId ? { pathwayKindId: kindId } : {}),
      ...(what === "object" ? { object: true } : {}),
      ...(drawn ? { box: drawn } : {}),
    });
    if (!taken) return;
    setName("");
    // Objects are few and far between. Left on, the mode would make the
    // next shop tagged a kind of object.
    if (what === "object") setWhat("place");
  }

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus(), submit }));

  async function addKind() {
    const typed = newKind?.trim();
    if (!typed) return;
    const id = await onAddWalkwayKind(typed);
    if (id) {
      setKindId(id);
      setNewKind(null);
    }
  }

  return (
    <div className="border-t border-stone-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="What is being tagged" className="flex overflow-hidden rounded border border-stone-300">
          {(["place", "walkway", "object"] as const).map(option => (
            <button
              key={option}
              type="button"
              data-testid={`what-${option}`}
              aria-pressed={what === option}
              className={`px-3 py-1.5 text-sm ${what === option ? "bg-stone-900 text-white" : "bg-white hover:bg-stone-100"}`}
              onClick={() => setWhat(option)}
            >
              {WHAT_LABEL[option]}
            </button>
          ))}
        </div>

        <input
          ref={input}
          aria-label="Place name"
          list="place-suggestions"
          className="h-9 min-w-48 flex-1 rounded border border-stone-300 px-3 text-sm"
          placeholder={PLACEHOLDER[what]}
          value={name}
          onChange={event => setName(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
            // Out of the field, so the workspace's keys work again.
            if (event.key === "Escape") event.currentTarget.blur();
          }}
        />
        <datalist id="place-suggestions">
          {suggestions.map(s => (
            <option
              key={s.place.id}
              value={s.place.nameEn}
              label={`${s.count} frame${s.count === 1 ? "" : "s"}${
                s.place.objectKindId ? " · object" : s.onFloor ? "" : " · no floor yet"
              }`}
            />
          ))}
        </datalist>

        {what === "place" ? (
          <select
            aria-label="Category"
            className="h-9 rounded border border-stone-300 px-2 text-sm"
            // An existing place keeps its category; changing it here would edit
            // every other sighting of it by surprise.
            disabled={Boolean(exact)}
            value={exact?.category ?? category}
            onChange={event => setCategory(event.target.value as TenantCategory)}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : what === "object" ? null : newKind === null ? (
          <>
            <select
              aria-label="Walkway type"
              className="h-9 rounded border border-stone-300 px-2 text-sm"
              value={kindId}
              onChange={event => setKindId(event.target.value)}
            >
              <option value="">Which kind?</option>
              {walkwayKinds.map(k => <option key={k.id} value={k.id}>{k.nameEn}</option>)}
            </select>
            {/* Defining a type mid-tag beats leaving the frame to go and do it. */}
            <Button size="sm" variant="ghost" onClick={() => setNewKind("")}>+ New type</Button>
          </>
        ) : (
          <>
            <input
              aria-label="New walkway type"
              autoFocus
              className="h-9 w-44 rounded border border-stone-300 px-2 text-sm"
              placeholder="e.g. Covered link"
              value={newKind}
              onChange={event => setNewKind(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addKind();
                }
                if (event.key === "Escape") setNewKind(null);
              }}
            />
            <Button size="sm" onClick={() => void addKind()}>Add type</Button>
            <Button size="sm" variant="ghost" onClick={() => setNewKind(null)}>Cancel</Button>
          </>
        )}

        <Button variant="primary" disabled={Boolean(refused)} onClick={submit}>
          {converting ? `Make ${converting.nameEn} an object` : exact ? `Tag as ${exact.nameEn}` : "Tag"}
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-stone-500">
        {drawnBox(box) ? "Tagging the boxed area." : "Tagging the whole frame — drag on it to box something."}
      </p>
      {objectNote && <p className={`mt-1 text-xs ${refused ? "text-danger" : "text-stone-600"}`}>{objectNote}</p>}
    </div>
  );
});
