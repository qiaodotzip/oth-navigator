import type { MapModel } from "@oth/model";
import type { EntityType } from "../api/client";

/** The entity kinds the layers panel manages. */
export type LayerEntityType = Extract<
  EntityType,
  "room" | "doorway" | "entrance" | "portalEndpoint" | "placement"
>;

export type LayerItem = {
  type: LayerEntityType;
  id: string;
  /** What to show in the list — a name where one exists, otherwise the id. */
  label: string;
  version: number;
  /** Only entities that carry a name can be renamed in place. */
  renamable: boolean;
};

export type LayerGroup = {
  type: LayerEntityType;
  label: string;
  items: LayerItem[];
};

const GROUP_LABELS: Record<LayerEntityType, string> = {
  room: "Rooms",
  doorway: "Doorways",
  entrance: "Entrances",
  portalEndpoint: "Lifts & stairs",
  placement: "Dressing",
};

/**
 * Everything on the active level, grouped by kind.
 *
 * Empty groups are kept rather than dropped: a teammate needs to see that
 * "Doorways (0)" exists before they will think to add one, and a list that
 * silently omits categories reads as though the editor cannot do them.
 */
export function levelLayers(model: MapModel | null, levelId: string | null): LayerGroup[] {
  const empty: LayerGroup[] = (Object.keys(GROUP_LABELS) as LayerEntityType[]).map(type => ({
    type,
    label: GROUP_LABELS[type],
    items: [],
  }));

  if (!model || !levelId) return empty;

  const byType = new Map<LayerEntityType, LayerItem[]>(empty.map(g => [g.type, []]));

  for (const room of model.rooms.filter(r => r.levelId === levelId)) {
    byType.get("room")!.push({
      type: "room",
      id: room.id,
      label: room.nameEn || room.id,
      version: room.version,
      renamable: true,
    });
  }

  const roomName = (id: string) => model.rooms.find(r => r.id === id)?.nameEn || id;

  for (const d of model.doorways.filter(x => x.levelId === levelId)) {
    byType.get("doorway")!.push({
      type: "doorway",
      id: d.id,
      // A doorway has no name of its own; what it connects is what identifies it.
      label: `${roomName(d.roomA)} ↔ ${roomName(d.roomB)}`,
      version: d.version,
      renamable: false,
    });
  }

  for (const e of model.entrances.filter(x => x.levelId === levelId)) {
    byType.get("entrance")!.push({
      type: "entrance",
      id: e.id,
      label: e.nameEn || e.id,
      version: e.version,
      renamable: true,
    });
  }

  for (const ep of model.portalEndpoints.filter(x => x.levelId === levelId)) {
    const portal = model.portals.find(p => p.id === ep.portalId);
    byType.get("portalEndpoint")!.push({
      type: "portalEndpoint",
      id: ep.id,
      label: portal ? portal.nameEn || portal.kind : ep.id,
      version: ep.version,
      renamable: false,
    });
  }

  for (const p of model.placements.filter(x => x.levelId === levelId)) {
    const asset = model.assets.find(a => a.id === p.assetId);
    byType.get("placement")!.push({
      type: "placement",
      id: p.id,
      label: asset?.filename ?? p.assetId,
      version: p.version,
      renamable: false,
    });
  }

  return empty.map(g => ({ ...g, items: byType.get(g.type)! }));
}
