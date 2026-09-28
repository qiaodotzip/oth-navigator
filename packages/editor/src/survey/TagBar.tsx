import {
  TenantCategorySchema, type Box, type PathwayKind, type Place, type TenantCategory,
} from "@oth/model";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { exactPlace, suggestPlaces } from "./suggest";
import { drawnBox, type Tag } from "./tagging";

const CATEGORIES = TenantCategorySchema.options;

/** A browser's own suggestion list slows down beyond this, and nobody scrolls that far in it. */
const MAX_SUGGESTIONS = 60;

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
  box: Box | null;
  /**
   * Whether the tag was taken. One refused — the last change is still
   * saving — keeps its name, to send again rather than lose.
   */
  onTag: (tag: Tag) => boolean;
  /** Makes a walkway type and says its id, or null if it could not. */
  onAddWalkwayKind: (nameEn: string) => Promise<string | null>;
}>(function TagBar({ candidates, levels, levelId, counts, walkwayKinds, box, onTag, onAddWalkwayKind }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TenantCategory>("retail");
  // What is being boxed: a unit you go into, or a stretch of floor you cross.
  const [what, setWhat] = useState<"place" | "walkway">("place");
  const [kindId, setKindId] = useState("");
  const [newKind, setNewKind] = useState<string | null>(null);

  const exact = exactPlace(candidates, levels, levelId, name);
  const suggestions = suggestPlaces(candidates, levels, levelId, name, counts).slice(0, MAX_SUGGESTIONS);

  function submit() {
    const trimmed = name.trim();
    if (trimmed === "") {
      input.current?.focus();
      return;
    }
    const drawn = drawnBox(box);
    const taken = onTag({
      placeId: exact?.id ?? null,
      nameEn: trimmed,
      // A walkway is a piece of the building, not a tenant.
      category: what === "walkway" ? "facility" : exact?.category ?? category,
      ...(what === "walkway" && kindId ? { pathwayKindId: kindId } : {}),
      ...(drawn ? { box: drawn } : {}),
    });
    if (taken) setName("");
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
          {(["place", "walkway"] as const).map(option => (
            <button
              key={option}
              type="button"
              data-testid={`what-${option}`}
              aria-pressed={what === option}
              className={`px-3 py-1.5 text-sm ${what === option ? "bg-stone-900 text-white" : "bg-white hover:bg-stone-100"}`}
              onClick={() => setWhat(option)}
            >
              {option === "place" ? "Place" : "Walkway"}
            </button>
          ))}
        </div>

        <input
          ref={input}
          aria-label="Place name"
          list="place-suggestions"
          className="h-9 min-w-48 flex-1 rounded border border-stone-300 px-3 text-sm"
          placeholder={what === "place" ? "What is this? Type a name…" : "Name this walkway…"}
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
              label={`${s.count} frame${s.count === 1 ? "" : "s"}${s.onFloor ? "" : " · no floor yet"}`}
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
        ) : newKind === null ? (
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

        <Button variant="primary" onClick={submit}>{exact ? `Tag as ${exact.nameEn}` : "Tag"}</Button>
      </div>
      <p className="mt-1.5 text-xs text-stone-500">
        {drawnBox(box) ? "Tagging the boxed area." : "Tagging the whole frame — drag on it to box something."}
      </p>
    </div>
  );
});
