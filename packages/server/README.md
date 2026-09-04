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

1. Create a project and point it at this repository. `railway.json` sets the
   start command.
2. Add the **Postgres** plugin. It sets `DATABASE_URL` for you.
3. Add a **Volume** mounted at `/data`, and set `DATA_DIR=/data`. Uploaded `.glb`
   assets and published bundles live there — without a volume they vanish on
   every deploy.
4. Set `NODE_ENV=production`. This is what makes session cookies `Secure`.

## Creating accounts

There is no signup route, by design. Create each teammate's account from a
Railway shell:

```bash
npm run invite --workspace @oth/server -- wei@example.com "Wei"
```

It prints a one-time password **once**. Send it to them over something private;
it is not recoverable afterwards, and re-running `invite` for an existing email
is refused rather than resetting their account.

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
