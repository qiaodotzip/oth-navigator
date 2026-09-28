import type { MapModel } from "@oth/model";
import { layerEntityType, levelLayers } from "../flow/layers";
import { removalsFor, type Removal } from "../flow/removeLayer";
import type { Selection } from "../state/store";

/**
 * What pressing Delete on the selection removes, and what the Undo toast calls
 * it — the same answer the Layers drawer gives for the same thing, so a lift's
 * last stop takes the lift with it either way.
 */
export function selectionRemovals(
  model: MapModel | null, levelId: string | null, selection: Selection,
): { removals: Removal[]; label: string } | null {
  if (!model || !levelId || !selection) return null;
  const item = levelLayers(model, levelId)
    .flatMap(group => group.items)
    .find(i => i.id === selection.id && layerEntityType(i.type) === selection.type);
  return item ? { removals: removalsFor(model, item), label: item.label } : null;
}
