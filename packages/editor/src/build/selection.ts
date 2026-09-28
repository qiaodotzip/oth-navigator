import { live, type MapModel } from "@oth/model";
import type { Selection } from "../state/store";

type Selectable = NonNullable<Selection>["type"];

/**
 * The kinds of thing the canvas can select, written out once. Held as strings
 * because what is checked against it arrives as one — the type in `?select=`,
 * say — and must pass here before it is trusted as a `Selection`.
 */
export const SELECTABLE_TYPES: ReadonlySet<string> = new Set<Selectable>(
  ["room", "pathway", "doorway", "entrance", "portalEndpoint", "placement"],
);

/** `room:L1-a` for the address bar. Ids are slugs, so they never contain a colon. */
export function selectParam(selection: Selection): string {
  return selection ? `${selection.type}:${selection.id}` : "";
}

/** The floor a selectable thing is on, if it is still there. */
function levelOf(model: MapModel, type: Selectable, id: string): string | undefined {
  const on = (items: readonly { id: string; levelId: string; deletedAt?: string | null }[]) =>
    live(items).find(x => x.id === id)?.levelId;
  switch (type) {
    case "room": return on(model.rooms);
    case "pathway": return on(model.pathways);
    case "doorway": return on(model.doorways);
    case "entrance": return on(model.entrances);
    case "portalEndpoint": return on(model.portalEndpoints);
    case "placement": return on(model.placements);
  }
}

/**
 * What `?select=` points at, if it is still on this floor. A link to something
 * since deleted, or on another floor, selects nothing rather than something wrong.
 */
export function parseSelectParam(
  value: string | undefined, model: MapModel | null, levelId: string | null,
): Selection {
  if (!value || !model || !levelId) return null;
  const colon = value.indexOf(":");
  if (colon <= 0) return null;
  const type = value.slice(0, colon);
  const id = value.slice(colon + 1);
  if (!id || !SELECTABLE_TYPES.has(type)) return null;
  return levelOf(model, type as Selectable, id) === levelId ? { type: type as Selectable, id } : null;
}
