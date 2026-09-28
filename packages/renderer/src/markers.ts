import { live, type MapModel, type PortalKind, type Vec2 } from "@oth/model";

export type MarkerKind = "entrance" | PortalKind;
export type Marker = { id: string; kind: MarkerKind; point: Vec2 };
export type MarkerShape = "cone" | "box" | "cylinder" | "octahedron";

/**
 * Each kind has its own shape as well as its own colour, so colour is never
 * the only difference. An entrance is a cone pointing down into the building,
 * a lift is a box, an escalator a drum, and stairs and ramps an octahedron.
 */
export const MARKER_STYLE: Record<MarkerKind, { colour: string; shape: MarkerShape }> = {
  entrance: { colour: "#15803d", shape: "cone" },
  lift: { colour: "#1d4ed8", shape: "box" },
  escalator: { colour: "#b45309", shape: "cylinder" },
  stair: { colour: "#7c3aed", shape: "octahedron" },
  ramp: { colour: "#7c3aed", shape: "octahedron" },
};

/** Spec §7: entrances and lift stops get markers. A stop whose lift is gone gets none. */
export function levelMarkers(model: MapModel, levelId: string): Marker[] {
  const portals = new Map(live(model.portals).map(p => [p.id, p]));
  const markers: Marker[] = [];
  for (const entrance of live(model.entrances)) {
    if (entrance.levelId === levelId) markers.push({ id: entrance.id, kind: "entrance", point: entrance.point });
  }
  for (const stop of live(model.portalEndpoints)) {
    const portal = portals.get(stop.portalId);
    if (stop.levelId === levelId && portal) markers.push({ id: stop.id, kind: portal.kind, point: stop.point });
  }
  return markers;
}
