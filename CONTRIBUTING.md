# Contributing to the OTH map editor

One app in four packages: a Hono API that also serves a React editor, where the
team authors the Our Tampines Hub map together. TypeScript throughout, npm
workspaces, Node 20 or newer (`engines` in `package.json`; the deployed image
runs Node 24). Nothing else to install: no database, no Docker.

---

## 1. Get it running

```bash
npm install
npm run seed                   # the building and its eight levels
npm run invite -- "Your Name"  # your account; there are no passwords
npm run dev                    # API and editor on http://localhost:3000
```

Open <http://localhost:3000> and pick your name from the list. That is the whole
of signing in: an account is a display name and nothing else.

`npm run dev` serves the **built** editor out of `packages/editor/dist`. If you
have never built it, the root of :3000 answers with a short JSON note saying so
and pointing you at the two ways out. While you are working on the UI, run Vite
instead, in a second terminal:

```bash
npm run dev --workspace @oth/editor   # http://localhost:5180, hot reload
```

Vite proxies `/api` and `/mcp` to :3000, so leave `npm run dev` running as well.
To serve the editor from :3000 instead, `npm run build` once.

If :3000 is taken the server says so and exits. Use another port:
`PORT=3001 npm run dev --workspace @oth/server`.

### A `.env` file does nothing

Nothing here loads `.env` — there is no `dotenv` in the tree, and the server
reads `process.env` directly. `.env.example` is the list of variables the
**deployed** service needs, not a local file that gets picked up. Locally, set
what you need in front of the one command:

```bash
DATA_DIR=./scratch-data npm run dev --workspace @oth/server
```

A relative `DATA_DIR` is resolved from `packages/server`, which is where that
command runs, so use an absolute path if you mean somewhere else. The
`VAR=value command` form above is shell syntax, not npm's: in PowerShell set it
first (`$env:DATA_DIR = "..."`), then run the command.

Leave `TEAM_CODE` unset locally: unset means there is no gate, which is what you
want on your own machine.

---

## 2. Run the tests — not with `npm test`

Every run goes through the lock script, from the repository root:

```bash
bash .superpowers/run-tests.sh vitest packages/editor/src/build packages/editor/src/flow
bash .superpowers/run-tests.sh tsc packages/server packages/model
```

Why: two vitest runs at once have frozen the machines on this project, and the
script's own header records the crash it was written after. It takes an atomic
lock so only one run happens at a time in this checkout, and caps vitest at two
worker threads. `npm test`, `npx vitest` and your editor's little "run test"
button all skip the lock — that is exactly how the laptop dies, so don't use
them.

What the script does, so the waiting doesn't look like a hang:

- retries the lock every 15 s, gives up after 20 minutes with exit 3, and takes
  over a lock older than 12 minutes as left behind by a crashed run;
- caps itself at 10 minutes for a vitest run and 5 minutes per `tsc` project;
- the lock is `.superpowers/test.lock`, **per checkout** — it cannot see a run
  going in another clone or worktree on the same machine. If the machine is
  already busy, wait rather than start.

**On Windows, run it from Git Bash.** In PowerShell, `bash` resolves to the WSL
stub and fails with "No such file or directory". From PowerShell, spell it out:

```powershell
& "C:\Program Files\Git\bin\bash.exe" .superpowers/run-tests.sh vitest packages/model
```

The script is committed, and it is the only part of `.superpowers/` that is —
the rest is one machine's planning notes and is gitignored. If you ever find
yourself without it, this is the same thing by hand, one suite at a time and
never while someone else is running theirs:

```bash
npx vitest run packages/model --poolOptions.threads.maxThreads=2
```

### Scope your runs

The suite is about 3,750 tests across 287 files. Measured on a laptop, with the
script's two-thread cap: roughly 12 minutes for all of it, which is *more* than
the script's own ten-minute vitest timeout — a whole-suite run is killed
part-way, with no summary and nothing to distinguish that from a failure. So
folder-scoped runs are not a convenience here, they are how the suite is run.
Pass the folders you touched.

Vitest runs as two projects (`vitest.workspace.ts`): `node` covers model,
renderer and server (136 files, ~1,780 tests, about 9 minutes), and `editor`
covers the editor, the only one whose tests need a DOM (151 files, ~1,980 tests,
about 3 minutes). Narrow to one with `--project node` or `--project editor` —
but the `node` project alone is close to the cap, so prefer folders.

The compiler is strict — unused locals, unused parameters and unchecked index
access are all errors — so typecheck the packages you touched as well:

```bash
bash .superpowers/run-tests.sh tsc packages/model packages/server
```

**Nothing runs any of this for you.** There is no CI in this repo: no workflow,
no hook. Your branch is checked by you.

---

## 3. The commands

All from the repository root. The ones that act on the model (`seed`, `invite`,
`trace`, `plan:l1`, `plans:one-per-floor`, `survey:*`, `data:*`) are short forms
of `npm run start --workspace @oth/server -- <command>`; they exist because the
long form is easy to mistype, and a mistyped one fails in a way that looks like
a broken app.

| Command | What it does |
|---|---|
| `npm run dev` | the API and the built editor, on :3000 |
| `npm run dev --workspace @oth/editor` | the editor with hot reload, on :5180 |
| `npm run build` | builds the editor into `packages/editor/dist` |
| `npm run seed` | creates the building and its eight levels |
| `npm run invite -- "Name"` | adds a teammate (the Team page does this too) |
| `npm run trace` | traces zones from the 2020 storey plans into the model |
| `npm run plan:l1` | seeds L1's spaces from the 2015 working drawing |
| `npm run plans:one-per-floor` | retires duplicate floor plans — `--dry-run` first |
| `npm run survey:export -- <captureId>` | frames and a brief for labelling |
| `npm run survey:import -- <file.json>` | labelling proposals, for review in the app |
| `npm run survey:tidy` | tidies survey places — `--dry-run` first |
| `npm run data:export -- <empty folder>` | every row and file, for moving a database |
| `npm run data:import -- <folder>` | reads that back into an **empty** database |
| `npm run db:generate --workspace @oth/server` | generates a migration from the schema |
| `npm run typecheck` | `tsc -b` over all four packages plus the e2e config — but it skips the lock, so prefer the script's `tsc` mode |
| `npm run e2e` | the Playwright smoke test, by hand |
| `npm test` | **don't** — see §2 |

---

## 4. The four packages

| Package | What it is | Imports |
|---|---|---|
| `packages/model` | The data model: zod schemas for every entity, geometry helpers, the validation rules, the navigation grid, the published-bundle builder. | nothing |
| `packages/renderer` | The three.js / react-three-fiber meshes that draw a floor, shared by the editor and the viewer to come, plus the Blender context export. | `@oth/model` |
| `packages/server` | The Hono API: entity CRUD, sign-in and sessions, uploads, publish, the `/mcp` endpoint, the CLI commands, and the migrations. Serves the built editor too, so production is one service. | `@oth/model` |
| `packages/editor` | The React app the team authors in — the only package that renders components, and so the only one tested in jsdom. | `@oth/model`, `@oth/renderer` |

Dependencies run one way only: `model ← renderer ← editor`, and `model ←
server`. Nothing imports the editor or the server, and those two never import
each other — they meet over HTTP. The `references` in each package's
`tsconfig.json` say the same thing to the compiler.

`@oth/model` is deliberately I/O-free: no filesystem, no network, no DOM, no
React. It owns correctness, and the server never re-implements a validation rule
or a geometry predicate — so a new rule belongs there and a `fetch` does not.
Its one `node:` import is `node:crypto`, for bundle checksums, in
`src/bundle/`, which is reachable only through the separate `@oth/model/bundle`
entry point that only the server imports. Keep it that way; the editor must not
pull Node APIs into the browser bundle.

### Where things live

- `packages/model/src/schema/` — one file per layer of the model: `structure`
  (rooms), `navigation` (doorways, entrances, portals, pathways), `dressing`
  (`.glb` placements), `semantics` (tenants), `survey` (footage, places,
  sightings).
- `packages/model/src/validation/rules/` — every rule publish enforces.
- `packages/server/src/db/schema.ts` — the tables.
  `packages/server/drizzle/` — the migrations.
- `packages/server/src/entities/` — generic CRUD over every entity table, plus
  the registry mapping a URL type name to its table and its model schema.
- `packages/server/src/model/assemble.ts` and `src/publish/` — reading the whole
  database into one `MapModel`, and snapshotting it into a bundle.
- `packages/server/src/cli/` — everything behind `npm run seed`, `trace`,
  `invite`, `data:export`, `survey:*`, `plan:l1`.
- `packages/editor/src/api/client.ts` — the one place the editor talks to the
  server.
- `packages/editor/src/{survey,review,build,places}/` — the four floor tabs;
  `setup/` the guided per-floor wizard; `shell/` header, floor switcher and
  publish; `state/` the store and saving; `ui/` the primitives.

---

## 5. Making a change

1. Branch off `main`.
2. Write the test next to the code, named `<thing>.test.ts` or `.test.tsx`.
3. Run the folders you touched through the lock script, and `tsc` for their
   packages.

There is no linter and no formatter configured, so match the file you are in.
The conventions that matter:

- **Server tests use a real database.** `createTestDb()`
  (`packages/server/src/testing/harness.ts`) boots a fresh in-memory PGlite and
  runs the real migrations; tests then drive real HTTP through
  `createApp({ db, … }).request(...)`. The database is not mocked.
- **Editor tests** run in jsdom with Testing Library, and use
  `packages/editor/src/testing/fakeApi.ts` for a server stand-in plus a small
  real-shaped model.
- **Model and renderer tests** are plain unit tests on the node environment.
- Comments in this codebase explain *why*, often at some length. A surprising
  line is expected to carry its reason.

### Adding a field to an entity

The row-to-model conversion is generic (`db/rows.ts`, `model/assemble.ts`), so
there is no mapping layer to update. Four places:

1. the zod schema in `packages/model/src/schema/…`;
2. the column in `packages/server/src/db/schema.ts`;
3. a migration (below);
4. the editor, usually `packages/editor/src/panels/Inspector.tsx`.

---

## 6. Changing the database

```bash
# after editing packages/server/src/db/schema.ts
npm run db:generate --workspace @oth/server
```

Commit everything it writes: `packages/server/drizzle/NNNN_*.sql`,
`drizzle/meta/NNNN_snapshot.json`, and the updated `drizzle/meta/_journal.json`.
Migrations are source, not build output.

**Never edit, reorder or renumber a migration that already exists.** Sixteen are
applied in production, `0000` to `0015`. Drizzle decides what to run by
comparing each journal entry's `when` timestamp against the newest one recorded
in the database's `__drizzle_migrations` table; it never looks at an older
migration again. So:

- editing `0007` changes nothing on a database that already has it, and *does*
  change every fresh one — your production schema and your tests quietly stop
  agreeing, with nothing to say so;
- a migration inserted with a timestamp older than the last applied one never
  runs on production at all, while running everywhere else.

Add a new migration instead. Always.

Every test database is built from `drizzle/` — `createTestDb` runs the
migrations — so a migration that fails takes the whole suite with it, not one
test.

Prefer additive SQL: a new table, a nullable column, a column with a default. Of
the sixteen, fourteen only add; one drops a column and one relaxes a `NOT NULL`.
Dropping or renaming a column that holds data cannot be undone by another
migration.

---

## 7. The local data folder

With no `DATABASE_URL`, the server falls back to a file-backed PGlite database —
the same engine the tests use — so a fresh clone runs with nothing installed. It
lives in `packages/server/data/`, which is gitignored:

| Path | What it holds |
|---|---|
| `dev-db/` | the database itself |
| `assets/` | uploaded `.glb` models, plans, photos, footage frames |
| `published/` | published bundles |
| `thumbs/` | generated thumbnails |

Two rules:

- **One process at a time owns it.** PGlite allows a single writer, and a running
  server holds it. Don't run a CLI command (`trace`, `plan:l1`, `data:import`,
  `data:export`) while `npm run dev` is up: stop the server first, or point
  `DATA_DIR` at a *copy* of the folder. `data:export` in particular is
  documented to run against a copy and never against a folder a live server
  holds.
- **Don't delete it to start clean.** `seed`, `invite`, `trace` and `plan:l1`
  rebuild the generated part; anything anyone uploaded or drew locally goes with
  it.

In production it is real Postgres over `DATABASE_URL`, with a Railway volume
mounted at `/data`. The server refuses to start when deployed without either —
without the volume, the gate's key and every upload would vanish on the next
deploy.

---

## 8. Don't break these

| Don't | Because |
|---|---|
| run tests outside the lock script | two vitest runs at once have frozen the machine |
| edit, reorder or renumber an existing migration | drizzle never re-reads it, so production and your tests silently diverge |
| run a CLI command against a data folder a server is holding | PGlite allows one writer, and the server has it |
| delete `packages/server/data/` | it is the only copy of anything drawn or uploaded locally |
| commit the team code, a token, a `.env`, or anything under `packages/server/data/` | the team code is the only thing between the deployed app and the internet, and a secret in git stays in git — the repo being private is not a fix, the only remedy is rotating it |
| soften a publish validation error into a warning to get a publish through | publish is the gate that keeps a broken route off the visitor app; nothing is written when it refuses, because a half-written bundle is worse than none |
| add a hard `DELETE` on an entity table, or drop a `WHERE version = ?` | deletes are soft and every write is checked against a version, so a mistake stays recoverable and a concurrent edit gets a 409 instead of silently losing |
| import Node APIs, React or the DOM into `@oth/model` | both apps and the server depend on it, and it has to stay loadable in a browser |
| deploy, or touch the deployed service | a deploy goes out from someone's working tree rather than from a branch, so `railway up` ships whatever you happen to have; leave it to whoever is deploying |
| enable Railway's CDN for the service | the built editor and published bundles are private only because the gate rewrites their `public, immutable` headers — an edge cache in front would hand them to anyone |

`legacy/` is the old hackathon prototype, kept runnable for reference with its
own lockfile. It is not a workspace; don't wire it into anything.

---

## 9. Secrets

Nothing secret is in the repo, and nothing secret may go into it.

- **`TEAM_CODE`** — the one shared code the whole team types once per browser,
  before the sign-in list. Set by hand on the deployed service only, at least 8
  characters; the deployed server refuses to start without it rather than serve
  the app open. Ask the project lead for the value. Leave it unset locally.
- **Claude Code tokens** (the `/mcp` endpoint) — made on the **Team** page,
  shown once, stored only as a hash, good for 90 days, at most five live per
  person, and without publish rights unless the box was ticked. The server
  refuses any request that carries a token in its body, so one can never reach
  the audit trail; don't work around that, and never paste a token into a file,
  a test, or a commit message.
- `.env` is gitignored (and, as above, read by nothing). Treat `.env.example` as
  the checklist of what the service needs, with placeholder values only.

---

## 10. The smoke test, when you want one

Playwright, run by hand, never part of `vitest`:

```bash
npx playwright install chromium   # only if this machine has no Chromium yet
npm run e2e
```

It needs a server to talk to. Point one at a *copy* of the data folder, on its
own port:

```bash
DATA_DIR=<a copy of packages/server/data> PORT=3055 npm run start --workspace @oth/server
```

`E2E_BASE_URL` defaults to `http://localhost:3055` and the test refuses :3000
outright, because that is a live dev server and its database. It signs in as
`E2E_USER` (default `Demo Author`, which has to be an account on that server
already), stamps everything it creates with the run's timestamp, and clears up
after itself — including after an earlier run that failed partway.

---

## Further reading

- `README.md` — what the app is, and why the model has four layers with only
  some of them load-bearing.
- `docs/teammate-note.md` — how the team actually uses the app. Worth ten
  minutes before you change any of it.
- `packages/server/README.md` — the API's own notes: optimistic locking, soft
  deletes, the publish gate, and how the deployed service is wired.
- `docs/design-and-plans/specs/2026-09-04-oth-map-model-design.md` — the data
  model in full.
