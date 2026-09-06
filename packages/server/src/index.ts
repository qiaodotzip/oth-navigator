import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { inviteUser, resetPassword } from "./cli/invite";
import { seedBuilding } from "./cli/seed";
import { tracePlansIntoModel } from "./cli/trace";
import { exportCaptureForLabelling } from "./cli/surveyExport";
import { importProposals } from "./cli/surveyImport";
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

if (command === "reset-password") {
  const email = process.argv[3];
  if (!email) throw new Error("usage: reset-password <email>");
  const { user, password } = await resetPassword(db, email);
  console.log(`reset ${user.email}. New one-time password: ${password}`);
  process.exit(0);
}

if (command === "survey:export") {
  const captureId = process.argv[3];
  const outDir = process.argv[4] ?? "./survey-out";
  if (!captureId) throw new Error("usage: survey:export <captureId> [outDir]");
  const { frames, dir } = await exportCaptureForLabelling(db, config.DATA_DIR, captureId, outDir);
  console.log(`wrote ${frames} frame(s) to ${dir}. Point a Claude Code session at LABELLING.md there.`);
  process.exit(0);
}

if (command === "survey:import") {
  const file = process.argv[3];
  if (!file) throw new Error("usage: survey:import <proposals.json>");
  const r = await importProposals(db, file);
  console.log(
    `imported ${r.sightings} sighting(s): ${r.places} new place(s), ${r.linked} linked to existing`,
  );
  for (const bad of r.rejected) console.log(`  refused #${bad.index}: ${bad.reason}`);
  console.log("All of it is proposed. Review it in the survey tool before it counts.");
  process.exit(0);
}

if (command === "trace") {
  const { created, skipped, recalibrated } = await tracePlansIntoModel(db);
  console.log(
    `traced ${created} zone(s) from the 2020 storey plans` +
    (skipped ? `; left ${skipped} already in the model alone` : "") +
    (recalibrated ? `; recalibrated ${recalibrated} underlay(s) to match` : ""),
  );
  process.exit(0);
}

if (command === "seed") {
  const { created } = await seedBuilding(db);
  console.log(created ? "seeded OTH with 8 levels" : "building already exists; nothing to do");
  process.exit(0);
}

// Log from the listen callback, not before it: binding is asynchronous, so
// logging on the previous line claimed success even when the port was taken.
const server = serve(
  { fetch: createApp({ db }).fetch, port: config.PORT },
  info => console.log(`oth server listening on :${info.port}`),
);

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${config.PORT} is already in use.
` +
        "Stop whatever is holding it, or run with a different port: PORT=3001 npm run dev --workspace @oth/server",
    );
    process.exit(1);
  }
  throw err;
});
