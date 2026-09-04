import type { Vec2 } from "@oth/model";
import type { DxfPolyline } from "./parse";

export type RoomDraft = {
  id: string;
  levelId: string;
  kind: string;
  footprint: Vec2[];
  heightM: number;
  walkable: boolean;
  nameEn: string;
  nameZh: string;
  verification: { status: string; evidence: string[] };
};

export type ToRoomsOptions = {
  levelId: string;
  /** CAD is commonly in millimetres; 0.001 converts. Defaults to 1:1. */
  unitsToMetres?: number;
  /** Only import these layers. Omitted means every layer. */
  layers?: string[];
  kind?: string;
  heightM?: number;
};

export function polylinesToRooms(
  polys: readonly DxfPolyline[], opts: ToRoomsOptions,
): RoomDraft[] {
  const scale = opts.unitsToMetres ?? 1;
  const allowed = opts.layers ? new Set(opts.layers) : null;

  return polys
    // An open polyline is a line, a duct, a dimension — not a room outline.
    .filter(p => p.closed && (!allowed || allowed.has(p.layer)))
    .map((p, index) => ({
      id: `${opts.levelId}-dxf-${index}-${p.layer.replace(/[^A-Za-z0-9_-]/g, "") || "layer"}`,
      levelId: opts.levelId,
      kind: opts.kind ?? "room",
      footprint: p.points.map(([x, y]) => [x * scale, y * scale] as Vec2),
      heightM: opts.heightM ?? 3.5,
      // Walkability is a routing judgement a human makes, not something a CAD
      // layer name can tell us. Imported rooms start non-walkable.
      walkable: false,
      nameEn: "",
      nameZh: "",
      // The geometry genuinely came from a drawing; record that.
      verification: { status: "cad", evidence: [`dxf:layer:${p.layer}`] },
    }));
}
