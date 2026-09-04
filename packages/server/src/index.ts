import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { inviteUser } from "./cli/invite";
import { seedBuilding } from "./cli/seed";
import { loadConfig } from "./config";
import { createPostgresDb } from "./db/client";
import { createDevDb } from "./db/dev";
import { runMigrations } from "./db/migrate";

const config = loadConfig();

if (config.NODE_ENV === "production" && !config.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in production");
}

// Local development falls back to file-backed PGlite so a fresh clone runs with
// nothing installed. Production always uses the real Postgres.
const db = config.DATABASE_URL
  ? await createPostgresDb(config.DATABASE_URL)
  : await createDevDb(config.DATA_DIR);

if (config.DATABASE_URL) await runMigrations(db);

const command = process.argv[2];

if (command === "invite") {
  const email = process.argv[3];
  const displayName = process.argv[4];
  if (!email || !displayName) throw new Error('usage: invite <email> "<display name>"');
  const { password } = await inviteUser(db, email, displayName);
  console.log(`invited ${email}. One-time password: ${password}`);
  process.exit(0);
}

if (command === "seed") {
  const { created } = await seedBuilding(db);
  console.log(created ? "seeded OTH with 8 levels" : "building already exists; nothing to do");
  process.exit(0);
}

serve({ fetch: createApp({ db }).fetch, port: config.PORT });
console.log(`oth server listening on :${config.PORT}`);
