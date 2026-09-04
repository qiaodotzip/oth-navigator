import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export async function createPostgresDb(url: string): Promise<Database> {
  const { Pool } = await import("pg");
  return drizzlePg(new Pool({ connectionString: url }), { schema });
}
