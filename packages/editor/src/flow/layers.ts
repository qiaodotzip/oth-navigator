import type { MapModel } from "@oth/model";

/**
 * The entity kinds the layers panel manages.
 *
 * "area" is a layer group rather than an entity type — an area is a room whose
 * kind is `area` — so this is not simply a subset of EntityType.
 */
export type LayerEntityType =
  | "area" | "room" | "pathway" | "doorway" | "entrance" | "portalEndpoint" | "placement";

/**
 * The entity a layer item actually reads and writes.
 *
 * An area is a room whose kind is `area`, so selecting or saving one is a room
 * operation — only the grouping in this panel differs.
 */
export function layerEntityType(type: LayerEntityType): Exclude<LayerEntityType, "area"> {
  return type === "area" ? "room" : type;
}

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
  area: "Areas",
  room: "Rooms",
  pathway: "Pathways",
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

  for (const r of model.rooms.filter(x => x.levelId === levelId)) {
    // Areas and rooms are drawn with different tools and read differently on
    // the canvas, so they list separately.
    const type: LayerEntityType = r.kind === "area" ? "area" : "room";
    byType.get(type)!.push({
      type,
      id: r.id,
      label: r.nameEn || r.id,
      version: r.version,
      renamable: true,
    });
  }

  for (const p of model.pathways.filter(x => x.levelId === levelId)) {
    byType.get("pathway")!.push({
      type: "pathway",
      id: p.id,
      // Most pathways are anonymous, so the shape is the fallback label — but
      // the ones people say out loud can be named like anything else.
      label: p.nameEn || `${p.polyline.length} points · ${p.widthM} m wide`,
      version: p.version,
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
