import {
  TenantCategorySchema, type Box, type Place, type Sighting, type TenantCategory,
} from "@oth/model";
import { useState } from "react";
import type { Api } from "../api/client";
import { FrameCanvas } from "../survey/FrameCanvas";
import type { ProposedPlace } from "../survey/review";
import { Button } from "../ui/Button";
import { Kbd } from "../ui/Kbd";
import { useKeys } from "../ui/keys";
import { reviewCommand } from "./keys";
import type { Evidence } from "./queue";

const CATEGORIES = TenantCategorySchema.options;

/**
 * One proposal: the evidence as large as the space allows, the claim under
 * it, and the decision (spec §10). The agent reads a sign and is sometimes
 * wrong, so the frame it read is the largest thing on screen, with its box on
 * it to correct.
 *
 * Mounted per proposal (keyed by its id), so a correction typed for one never
 * carries over to the next.
 */
export function ProposalFocus({ api, entry, evidence, findSame, onAccept, onReject, onSkip, onMerge, onMoveBox }: {
  api: Pick<Api, "keyframeFileUrl">;
  entry: ProposedPlace;
  evidence: readonly Evidence[];
  /** Places already on this floor with the name as typed now. */
  findSame: (name: string) => Place[];
  onAccept: (fields: { nameEn: string; category: TenantCategory }) => void;
  onReject: () => void;
  onSkip: () => void;
  onMerge: (into: Place) => void;
  onMoveBox: (sighting: Sighting, box: Box) => void;
}) {
  const { place } = entry;
  const [name, setName] = useState(place.nameEn);
  const [category, setCategory] = useState<TenantCategory>(place.category);
  const [shown, setShown] = useState(0);
  const index = Math.min(shown, evidence.length - 1);
  const at = index >= 0 ? evidence[index]! : null;
  const same = findSame(name);
  const canAccept = name.trim() !== "";

  const accept = () => {
    if (canAccept) onAccept({ nameEn: name.trim(), category });
  };
  const step = (by: 1 | -1) => setShown(i => Math.max(0, Math.min(evidence.length - 1, i + by)));

  useKeys(event => {
    const command = reviewCommand(event.key);
    if (command === "accept") accept();
    else if (command === "reject") onReject();
    else if (command === "skip") onSkip();
    else if (command === "prevFrame") step(-1);
    else if (command === "nextFrame") step(1);
    else return;
    event.preventDefault();
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col bg-stone-900 p-3">
        {at ? (
          <FrameCanvas
            imageUrl={api.keyframeFileUrl(at.frame.id, 1600)}
            alt={`Evidence for ${place.nameEn}: frame ${index + 1} of ${evidence.length}`}
            widthPx={at.frame.widthPx}
            heightPx={at.frame.heightPx}
            labels={[{ sighting: at.sighting, place }]}
            onMoveLabel={(label, box) => onMoveBox(label.sighting, box)}
          />
        ) : (
          // Some real proposals have no frame at all. They can still be
          // decided, so say so rather than show a broken image.
          <p className="m-auto max-w-sm text-center text-sm text-stone-300">
            No frame shows this proposal. Decide from its name and the note below.
          </p>
        )}
        {evidence.length > 1 && (
          <div className="mt-2 flex items-center justify-center gap-3 text-sm text-stone-200">
            <Button size="sm" aria-label="Previous frame" disabled={index <= 0} onClick={() => step(-1)}>←</Button>
            <span>Frame {index + 1} of {evidence.length}</span>
            <Button size="sm" aria-label="Next frame" disabled={index >= evidence.length - 1} onClick={() => step(1)}>→</Button>
          </div>
        )}
      </div>

      <div className="border-t border-stone-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* A label you can see (Ruling 14): the name is the claim being checked. */}
          <label className="flex min-w-56 flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-stone-600">Name</span>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              onKeyDown={event => {
                // Letters here are text, so A cannot accept from inside the
                // field; Enter does, as corrected. Esc steps out to the keys.
                if (event.key === "Enter") {
                  event.preventDefault();
                  accept();
                }
                if (event.key === "Escape") event.currentTarget.blur();
              }}
              className="h-9 rounded border border-stone-300 px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-stone-600">Category</span>
            <select
              value={category}
              onChange={event => setCategory(event.target.value as TenantCategory)}
              className="h-9 rounded border border-stone-300 px-2 text-sm"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <Button variant="primary" disabled={!canAccept} onClick={accept}>Accept <Kbd>A</Kbd></Button>
            <Button onClick={onReject}>Reject <Kbd>R</Kbd></Button>
            <Button variant="ghost" onClick={onSkip}>Skip <Kbd>S</Kbd></Button>
          </div>
        </div>
        {same.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-accent-soft px-3 py-2 text-sm">
            <span>Already on the map:</span>
            {same.map(p => (
              <Button key={p.id} size="sm" onClick={() => onMerge(p)}>Same as {p.nameEn}</Button>
            ))}
            <span className="text-xs text-stone-600">Merging moves these frames to it instead of making a second one.</span>
          </div>
        )}
        {place.notes && <p className="mt-2 text-sm text-stone-700">{place.notes}</p>}
        <p className="mt-1 text-xs text-stone-500">
          {place.proposedBy ? `Proposed by ${place.proposedBy}` : "Proposed"} · {entry.sightings.length} frame{entry.sightings.length === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
