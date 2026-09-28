# @oth/server

The hosted API the team edits the OTH map through. Hono + Drizzle over Postgres.

## What it is for

Three or four non-technical teammates edit one map at the same time, in a
browser, with no git and no terminal. That constraint is why this exists rather
than a local editor writing files.

`@oth/model` owns correctness. This server stores rows, assembles them into a
`MapModel`, and hands that to the model package's validator and bundle builder.
It never re-implements a validation rule, a geometry predicate, or a budget.

## Running locally

```bash
npm install
DATABASE_URL=postgres://... npm run dev --workspace @oth/server
```

Migrations run at boot. Tests need no database at all — they use PGlite, an
embedded Postgres, so `npm test` works with nothing running.

After changing `src/db/schema.ts`:

```bash
npm run db:generate --workspace @oth/server
```

Commit the generated SQL. Migrations are source, not build output.

## Deploying to Railway

One service, built from the root `Dockerfile` (`railway.json` says so), beside
a Postgres database and a volume.

1. Add a **Postgres** database, and on the service set
   `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
2. Add a **volume** mounted at `/data`, and set `DATA_DIR=/data`. Frames,
   plans, models, thumbnails and published bundles live there; without it
   they vanish on every deploy.
3. Set `PORT=3000`, and give the service a domain on port 3000.
4. Set **`TEAM_CODE`** by hand: at least 8 characters (a few words is best),
   and never committed. Everyone types it once per browser, before the
   sign-in list. Without it the server refuses to start in production rather
   than serve the app open. Changing it sends every browser back to the
   team-code page.
5. Deploy with `railway up`. Migrations run at boot. `/api/health` is the
   health check, and the only thing served without the code.

The Dockerfile sets `NODE_ENV=production`, which makes cookies `Secure` and
keeps error details out of responses (they go to the log).

Never enable Railway's CDN (`railway cdn`) for this service. The built editor
and published bundles are served `public, immutable`, so the edge would cache
the gated files and hand them to anyone, code or not.

## Moving the data

```bash
npm run data:export -- <empty folder>
npm run data:import -- <that folder> [--file-under L1]
```

Export writes every row (sessions and locks aside) and every file the rows
name, laid out like a data folder: `export.json`, `assets/`, `published/`.
Run it against a *copy* of a PGlite data folder, never one a running server
holds. Import reads it into an **empty** database; it refuses one with
anything in it. It checks every file before it writes a row, writes all the
rows in one transaction, and compares the counts with the export's.
`--file-under` files footage that has no floor. If the files are already in
the data folder, for instance uploaded straight into the volume, import leaves
them where they are.

## Creating accounts

Add teammates from the app: **Team → Add teammate**, with a name and nothing
else. There are no passwords: people sign in by picking their name from the
list. A name already on the team, case-insensitively, is refused rather than
made twice.

On a server with nobody on it yet, make the first account from a shell on
the service. Moving data from another server? Import the data first, then
invite teammates: once anyone is on the team the database is no longer
empty, and `data:import` refuses it.

```bash
MSYS_NO_PATHCONV=1 railway ssh --service oth-map -- npm --prefix /app run invite -- Wei
```

`railway ssh` joins its arguments into one remote shell line, so the command
names the app folder with `--prefix` rather than a quoted `cd`.
`MSYS_NO_PATHCONV=1` stops Git Bash on Windows rewriting `/app` into a Windows
path; anywhere else it does nothing.

To disable someone's access, set `disabled_at` on their `users` row. Their
existing sessions stop resolving immediately.

## Things worth knowing

- **A stale write returns 409, not a silent overwrite.** Every entity carries a
  `version`; updates are `WHERE id = ? AND version = ?`. The response body
  carries the winner's current state so the editor can show what changed.
- **Deletes are soft.** Nothing issues `DELETE FROM` on an entity table, and
  every mutation writes before/after to `audit_log`. Between them, human error
  is recoverable — which matters most when four people share one model.
- **Locks are advisory.** They stop two people *starting* the same edit. The
  `version` check is the actual guarantee, so an expired lock can never cause a
  lost write.
- **Publishing is a gate.** A model with a validation error is refused and
  nothing is written to disk; a half-written bundle would be worse than none.
  Published versions are immutable and served with a one-year immutable
  cache header.
