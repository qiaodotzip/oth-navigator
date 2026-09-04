import { parseModel, type MapModel } from "@oth/model";
import { isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import type { Row } from "../db/rows";
import { toModelRow } from "../db/rows";
import type { EntityTable } from "../entities/registry";
import * as schema from "../db/schema";

async function liveRows(db: Database, table: EntityTable): Promise<Row[]> {
  const rows = (await db.select().from(table).where(isNull(table.deletedAt))) as Row[];
  return rows.map(toModelRow);
}

/**
 * Reads the whole editing database into one MapModel.
 *
 * Deliberately whole rather than incremental: the model is small (hundreds of
 * rooms across 8 levels), and it means validation and publishing always see a
 * consistent snapshot rather than a half-applied set of edits.
 */
export async function assembleModel(db: Database): Promise<MapModel> {
  const buildingRows = await db.select().from(schema.buildings);
  const building = buildingRows[0];
  if (!building) throw new Error("no building row: the model has not been initialised");

  return parseModel({
    building: toModelRow(building as unknown as Row),
    levels: await liveRows(db, schema.levels as EntityTable),
    rooms: await liveRows(db, schema.rooms as EntityTable),
    doorways: await liveRows(db, schema.doorways as EntityTable),
    entrances: await liveRows(db, schema.entrances as EntityTable),
    portals: await liveRows(db, schema.portals as EntityTable),
    portalEndpoints: await liveRows(db, schema.portalEndpoints as EntityTable),
    navHints: await liveRows(db, schema.navHints as EntityTable),
    assets: await liveRows(db, schema.assets as EntityTable),
    placements: await liveRows(db, schema.placements as EntityTable),
    tenants: await liveRows(db, schema.tenants as EntityTable),
  });
}
