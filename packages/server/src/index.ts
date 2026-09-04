import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { inviteUser } from "./cli/invite";
import { loadConfig } from "./config";
import { createPostgresDb } from "./db/client";
import { runMigrations } from "./db/migrate";

const config = loadConfig();

if (!config.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const db = await createPostgresDb(config.DATABASE_URL);
await runMigrations(db);

// `npm run invite --workspace @oth/server -- someone@example.com "Their Name"`
if (process.argv[2] === "invite") {
  const email = process.argv[3];
  const displayName = process.argv[4];
  if (!email || !displayName) {
    throw new Error('usage: invite <email> "<display name>"');
  }
  const { password } = await inviteUser(db, email, displayName);
  console.log(`invited ${email}. One-time password: ${password}`);
  process.exit(0);
}

serve({ fetch: createApp({ db }).fetch, port: config.PORT });
console.log(`oth server listening on :${config.PORT}`);
